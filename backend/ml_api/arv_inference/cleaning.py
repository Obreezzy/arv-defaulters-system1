"""
Self-contained data cleaning (mirrors the training cleaning step).

Sanitises raw values BEFORE feature extraction: clips impossible measurements,
voids out-of-range dispensing intervals, and sorts/dedupes the visit history.
Returns a cleaned copy of the request plus a list of human-readable warnings.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import replace

from .config import InferenceConfig
from .dtos import PredictRequest


def _date(s):
    if not s:
        return None
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def _clip(value, lo, hi):
    if value is None:
        return None, False
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None, True
    if v < lo or v > hi:
        return None, True
    return v, False


def clean_request(req: PredictRequest, cfg: InferenceConfig) -> tuple[PredictRequest, list[str]]:
    warnings: list[str] = []
    p = req.patient

    cd4, bad = _clip(p.baseline_cd4, *cfg.baseline_cd4_range)
    if bad:
        warnings.append("baseline_cd4 out of range -> treated as missing")
    travel, bad = _clip(p.self_reported_travel_time_min, *cfg.travel_time_min_range)
    if bad:
        warnings.append("self_reported_travel_time_min out of range -> treated as missing")
    patient = replace(p, baseline_cd4=cd4, self_reported_travel_time_min=travel)

    cleaned_visits = []
    for v in req.visits:
        w, bw = _clip(v.weight_kg, *cfg.weight_kg_range)
        h, bh = _clip(v.height_cm, *cfg.height_cm_range)
        dd = v.days_dispensed
        if dd is not None and int(dd) not in cfg.valid_dispense_days:
            warnings.append(f"days_dispensed={dd} not in {cfg.valid_dispense_days} -> treated as missing")
            dd = None
        cleaned_visits.append(replace(v, weight_kg=w, height_cm=h, days_dispensed=dd))

    # sort chronologically and drop duplicate dates (keep first)
    cleaned_visits = [v for v in cleaned_visits if _date(v.visit_date) is not None]
    cleaned_visits.sort(key=lambda v: _date(v.visit_date))
    deduped, seen = [], set()
    for v in cleaned_visits:
        key = str(v.visit_date)[:10]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(v)

    if not deduped:
        warnings.append("no valid visits supplied")
    if _date(patient.art_start_date) is None:
        warnings.append("art_start_date missing/invalid -> months_on_art cannot be computed")

    return replace(req, patient=patient, visits=deduped), warnings
