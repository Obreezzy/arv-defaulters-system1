"""
Model-card loader. The card (model/model_card.json) is the right home for
information that belongs to the MODEL but is not in the pickle: headline metrics,
calibration quality, fairness disparities, intended use / limitations, the
reference profile used for explanations, and per-group operating thresholds.

Fairness is a population property, not a per-request output -- so it is surfaced
here, via `predictor.get_model_card()`, rather than in each prediction.
"""

from __future__ import annotations

import json
from pathlib import Path


def load_model_card(path: str | Path | None) -> dict | None:
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None
