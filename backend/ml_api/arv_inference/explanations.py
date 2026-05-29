"""
Per-prediction (local) explanations.

Method: reference-occlusion. For each feature we replace the patient's value with
a baseline (the training median / mode shipped in the model card) and re-score.
The change in the calibrated probability is that feature's contribution:

    contribution(f) = P(default | patient) - P(default | patient with f set to baseline)

A positive contribution means the patient's actual value PUSHED RISK UP relative
to a typical patient. This is model-agnostic and exact w.r.t. the calibrated
probability (no SHAP dependency). If `shap` is installed it could be swapped in,
but this gives clinically readable "reason codes" out of the box.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def explain_local(model, base_row: pd.DataFrame, feature_cols, numeric_cols,
                  reference: dict, base_prob: float, top_k: int = 6) -> list[dict]:
    if not reference:
        return []
    numeric = set(numeric_cols)

    rep = pd.concat([base_row] * len(feature_cols), ignore_index=True)
    for i, f in enumerate(feature_cols):
        ref_val = reference.get(f)
        if f in numeric:
            rep.at[i, f] = np.nan if ref_val is None else float(ref_val)
        else:
            rep.at[i, f] = ref_val
    occ_prob = model.predict_proba(rep)[:, 1]

    rows = []
    for i, f in enumerate(feature_cols):
        contrib = float(base_prob - occ_prob[i])
        if abs(contrib) < 1e-6:
            continue
        val = base_row.iloc[0][f]
        rows.append({
            "feature": f,
            "value": (None if (isinstance(val, float) and np.isnan(val)) else
                      (round(float(val), 4) if f in numeric else str(val))),
            "contribution": round(contrib, 4),
            "direction": "increases_risk" if contrib > 0 else "decreases_risk",
        })
    rows.sort(key=lambda r: abs(r["contribution"]), reverse=True)
    return rows[:top_k]
