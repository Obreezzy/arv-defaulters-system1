"""
Configuration for the ARV-refill default inference package.

Everything tunable lives here. The package is self-contained: it does NOT import
from the training `src/` package. The feature SPEC and the decision THRESHOLD are
read from the model artifact by default (so dropping in a newly trained model
adapts automatically), but can be overridden here.

Constants below MUST match how the model was trained, otherwise the engineered
features will not line up with what the model expects (train/serve skew).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

_PKG_DIR = Path(__file__).resolve().parent


def _default_model_path() -> str:
    """Auto-discover the bundled winner_*.joblib in arv_inference/model/."""
    model_dir = _PKG_DIR / "model"
    candidates = sorted(model_dir.glob("winner_*.joblib")) + sorted(model_dir.glob("*.joblib")) \
        + sorted(model_dir.glob("*.pkl")) + sorted(model_dir.glob("*.pickle"))
    return str(candidates[0]) if candidates else str(model_dir / "winner_hist_gradient_boosting.joblib")


def _default_card_path() -> str:
    return str(_PKG_DIR / "model" / "model_card.json")


@dataclass
class InferenceConfig:
    # --- model artifact + card ---
    model_path: str = field(default_factory=_default_model_path)
    model_format: str = "auto"          # auto | joblib | pickle
    model_card_path: str | None = field(default_factory=_default_card_path)
    # If the artifact lacks them, these are used; otherwise the artifact wins
    # unless the corresponding override below is set.
    threshold_override: float | None = None      # None -> use artifact's tuned threshold
    feature_spec_override: dict | None = None     # None -> use artifact's spec

    # --- group-aware thresholds ---
    # Set threshold_by (e.g. "catchment_type") to use per-group operating points
    # from threshold_map (or the model card's group_thresholds). Fixes the urban
    # under-flagging found in the fairness audit.
    threshold_by: str | None = None
    threshold_map: dict | None = None

    # --- explanations ---
    explain_default: bool = False       # attach reason_codes to every prediction
    explain_top_k: int = 6

    # --- risk tiering (probabilities -> LOW / MEDIUM / HIGH) ---
    # "threshold_anchored" (default): zones are relative to the (group-aware)
    #   action threshold -> HIGH: p >= threshold; MEDIUM: frac*threshold <= p <
    #   threshold; LOW below. Consistent with where you actually intervene and
    #   group-aware for free.
    # "fixed": absolute calibrated-risk cutoffs (risk_band_low_max / high_min).
    risk_tier_strategy: str = "threshold_anchored"
    risk_tier_medium_fraction: float = 0.5   # MEDIUM/LOW boundary = frac * high_cut
    risk_band_low_max: float = 0.20     # (fixed strategy) p < this  -> LOW
    risk_band_high_min: float = 0.50    # (fixed strategy) p >= this -> HIGH

    # --- feature-engineering constants (MUST match training) ---
    grace_days: int = 28                # >= this many days late on a gap == a prior default
    vl_suppressed_threshold: int = 1000  # copies/mL
    youth_age_max: int = 24
    rainy_months: tuple = (11, 12, 1, 2, 3)
    months_per_unit: float = 30.44      # days -> "months" conversion used in training

    # --- cleaning bounds (MUST match training) ---
    valid_dispense_days: tuple = (30, 60, 90, 180)
    weight_kg_range: tuple = (2.0, 200.0)
    height_cm_range: tuple = (40.0, 220.0)
    baseline_cd4_range: tuple = (1.0, 2000.0)
    travel_time_min_range: tuple = (0.0, 1440.0)
    default_days_dispensed: int = 30    # fallback when missing & no scheduled date

    # --- behaviour ---
    strict: bool = False                # if True, raise on validation issues instead of warning
    sklearn_version_expected: str = "1.8.0"   # for an unpickle-compatibility warning
