"""
ArvDefaultPredictor: load the trained model artifact and turn raw patient data
into a calibrated default-risk prediction.

Pipeline per request:  clean -> engineer features -> assemble feature frame ->
model.predict_proba -> threshold + risk band -> response.

The model artifact is a dict: {'model', 'spec', 'threshold', 'winner'}. The
sklearn preprocessing (impute/scale/one-hot) lives INSIDE 'model', so this class
only reproduces the bespoke cleaning + feature engineering, then hands the raw
feature frame to the loaded pipeline.
"""

from __future__ import annotations

import pickle
import warnings as _warnings
from pathlib import Path

import numpy as np
import pandas as pd

from . import cleaning, explanations, features, model_card, thresholds
from .config import InferenceConfig
from .dtos import (BatchPredictionResponse, BatchPredictRequest, PredictionResponse,
                   PredictRequest, RiskTier)


class ArvDefaultPredictor:
    def __init__(self, config: InferenceConfig | None = None):
        self.config = config or InferenceConfig()
        artifact = self._load_artifact(self.config.model_path, self.config.model_format)
        self.model = artifact["model"]
        self.spec = self.config.feature_spec_override or artifact["spec"]
        self.global_threshold = (self.config.threshold_override
                                 if self.config.threshold_override is not None
                                 else artifact.get("threshold", 0.5))
        self.model_name = artifact.get("winner", type(self.model).__name__)
        self._feature_cols = list(self.spec["features"])
        self._numeric = set(self.spec["numeric"])

        self.card = model_card.load_model_card(self.config.model_card_path)
        self.model_version = (self.card or {}).get("model_version")
        self._reference = (self.card or {}).get("reference_profile")
        self._check_sklearn_version()

    def get_model_card(self) -> dict | None:
        """The model card: metrics, calibration, fairness, intended use, limitations."""
        return self.card

    # ----------------------------------------------------------------- load
    @staticmethod
    def _load_artifact(path: str, fmt: str):
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"model artifact not found: {p}")
        use_joblib = fmt == "joblib" or (fmt == "auto" and p.suffix == ".joblib")
        if use_joblib:
            import joblib
            return joblib.load(p)
        with open(p, "rb") as fh:
            return pickle.load(fh)

    def _check_sklearn_version(self):
        try:
            import sklearn
            if sklearn.__version__ != self.config.sklearn_version_expected:
                _warnings.warn(
                    f"sklearn {sklearn.__version__} != trained {self.config.sklearn_version_expected}; "
                    "unpickled model may behave differently.")
        except Exception:
            pass

    # -------------------------------------------------------------- helpers
    def _risk_tier(self, p: float, high_cut: float) -> tuple[RiskTier, dict]:
        """Three-zone triage tier. Anchored to the (group-aware) action threshold
        by default; or absolute fixed cutoffs if configured."""
        if self.config.risk_tier_strategy == "fixed":
            low_cut, high = self.config.risk_band_low_max, self.config.risk_band_high_min
        else:  # threshold_anchored
            high = float(high_cut)
            low_cut = self.config.risk_tier_medium_fraction * high
        if p >= high:
            tier = RiskTier.HIGH
        elif p >= low_cut:
            tier = RiskTier.MEDIUM
        else:
            tier = RiskTier.LOW
        bounds = {"low_cut": round(float(low_cut), 4), "high_cut": round(float(high), 4),
                  "strategy": self.config.risk_tier_strategy}
        return tier, bounds

    def _rows_to_frame(self, rows: list[dict]) -> pd.DataFrame:
        missing = set(self._feature_cols) - set(rows[0].keys())
        if missing:
            raise RuntimeError(f"feature drift: model expects features not produced: {sorted(missing)}")
        df = pd.DataFrame(rows).reindex(columns=self._feature_cols)
        for c in self._feature_cols:
            if c in self._numeric:
                df[c] = pd.to_numeric(df[c], errors="coerce")
            else:
                df[c] = df[c].astype(object).where(df[c].notna(), np.nan)
        return df

    def _probabilities(self, frame: pd.DataFrame) -> np.ndarray:
        return self.model.predict_proba(frame)[:, 1]

    # --------------------------------------------------------------- public
    def predict(self, request: PredictRequest) -> PredictionResponse:
        return self.predict_batch(BatchPredictRequest(requests=[request])).predictions[0]

    def predict_batch(self, batch: BatchPredictRequest) -> BatchPredictionResponse:
        rows, metas = [], []
        for req in batch.requests:
            cleaned, warns = cleaning.clean_request(req, self.config)
            row, fwarns, iv_date, n_used = features.build_feature_row(cleaned, self.config)
            rows.append(row)
            metas.append((req, warns + fwarns, iv_date, n_used, row))

        frame = self._rows_to_frame(rows)
        probs = self._probabilities(frame)
        preds = []
        for i, (prob, (req, warns, iv_date, n_used, row)) in enumerate(zip(probs, metas)):
            prob = float(prob)
            thr, source = thresholds.resolve_threshold(self.config, self.card, req, self.global_threshold)
            tier, bounds = self._risk_tier(prob, thr)
            reason_codes = []
            if (req.explain or self.config.explain_default) and self._reference:
                reason_codes = explanations.explain_local(
                    self.model, frame.iloc[[i]], self._feature_cols, self._numeric,
                    self._reference, prob, self.config.explain_top_k)
            preds.append(PredictionResponse(
                patient_id=req.patient.patient_id,
                default_probability=round(prob, 4),
                predicted_default=bool(prob >= thr),
                risk_tier=tier,
                risk_tier_bounds=bounds,
                threshold_used=round(float(thr), 4),
                threshold_source=source,
                index_visit_date=str(iv_date)[:10] if iv_date else None,
                n_visits_used=n_used,
                model_name=self.model_name,
                model_version=self.model_version,
                reason_codes=reason_codes,
                warnings=warns,
                features=row if req.include_features else None,
            ))
        summary = {
            "n": len(preds),
            "n_predicted_default": int(sum(p.predicted_default for p in preds)),
            "n_high_risk": int(sum(1 for p in preds if p.risk_tier == RiskTier.HIGH)),
            "n_medium_risk": int(sum(1 for p in preds if p.risk_tier == RiskTier.MEDIUM)),
            "n_low_risk": int(sum(1 for p in preds if p.risk_tier == RiskTier.LOW)),
            "mean_probability": round(float(np.mean([p.default_probability for p in preds])), 4) if preds else None,
            "model_name": self.model_name,
            "model_version": self.model_version,
            "threshold_by": self.config.threshold_by or "global",
        }
        return BatchPredictionResponse(predictions=preds, summary=summary)

    def predict_from_features(self, feature_rows) -> list[PredictionResponse]:
        """Low-level path: caller supplies already-engineered feature dict(s)."""
        if isinstance(feature_rows, dict):
            feature_rows = [feature_rows]
        probs = self._probabilities(self._rows_to_frame(list(feature_rows)))
        out = []
        for prob, row in zip(probs, feature_rows):
            prob = float(prob)
            tier, bounds = self._risk_tier(prob, self.global_threshold)
            out.append(PredictionResponse(
                patient_id=str(row.get("patient_id", "")),
                default_probability=round(prob, 4),
                predicted_default=bool(prob >= self.global_threshold),
                risk_tier=tier,
                risk_tier_bounds=bounds,
                threshold_used=round(float(self.global_threshold), 4),
                threshold_source="global",
                model_name=self.model_name,
                model_version=self.model_version,
            ))
        return out
