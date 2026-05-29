"""
Self-contained feature extraction (mirrors training feature engineering EXACTLY).

Given a (cleaned) request, build the single index-visit feature row the model
expects: patient/clinical fields, access/geography, the index-visit fields,
carried-forward viral load, facility stockout at the index month, and the
causal behavioural-history features (computed from PAST visits only).

The index visit is the prediction point (default: the patient's latest visit);
the model then predicts default on the NEXT, future pickup.

IMPORTANT: if the training feature logic in src/feature_engineering.py changes,
this file must be updated in lockstep (the package is intentionally independent).
"""

from __future__ import annotations

import datetime as dt
import math

from .config import InferenceConfig
from .dtos import PredictRequest

NAN = float("nan")
_EARTH_KM = 6371.0


def _date(s):
    if not s:
        return None
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def _haversine_km(lat1, lon1, lat2, lon2):
    r1, n1, r2, n2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat, dlon = r2 - r1, n2 - n1
    a = math.sin(dlat / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dlon / 2) ** 2
    return 2 * _EARTH_KM * math.asin(math.sqrt(min(1.0, max(0.0, a))))


def _trailing_months(year: int, month: int, n: int) -> list[str]:
    out = []
    for k in range(n):
        m, y = month - k, year
        while m <= 0:
            m += 12
            y -= 1
        out.append(f"{y:04d}-{m:02d}")
    return out


def _days_dispensed(visit, cfg: InferenceConfig) -> int:
    dd = visit.days_dispensed
    if dd is not None and int(dd) in cfg.valid_dispense_days:
        return int(dd)
    sd, vd = _date(visit.scheduled_next_appt_date), _date(visit.visit_date)
    if sd and vd:
        return (sd - vd).days
    return cfg.default_days_dispensed


def build_feature_row(req: PredictRequest, cfg: InferenceConfig) -> tuple[dict, list[str], str, int]:
    warns: list[str] = []
    visits = req.visits
    if not visits:
        raise ValueError("cannot build features: no visits supplied")

    idx = req.index if req.index >= 0 else len(visits) - 1
    idx = max(0, min(idx, len(visits) - 1))
    hist = visits[: idx + 1]                 # causal: only up to and including the index visit
    iv = visits[idx]
    iv_date = _date(iv.visit_date)
    p, fac = req.patient, req.facility
    art_start = _date(p.art_start_date)
    dob = _date(p.date_of_birth)

    # --- distance (raw GPS -> haversine; often unavailable) ---
    if None not in (p.residence_gps_lat, p.residence_gps_lon, fac.gps_lat, fac.gps_lon):
        distance_km = _haversine_km(p.residence_gps_lat, p.residence_gps_lon,
                                    fac.gps_lat, fac.gps_lon)
    else:
        distance_km = NAN
        warns.append("distance_km unavailable (missing residence or facility GPS)")

    # --- viral load carried forward over the history ---
    last_vl, last_vl_date, ever_unsup = NAN, None, 0
    for v in hist:
        if v.viral_load_result is not None:
            last_vl = float(v.viral_load_result)
            last_vl_date = _date(v.viral_load_date) or _date(v.visit_date)
            if last_vl >= cfg.vl_suppressed_threshold:
                ever_unsup = 1

    # --- behavioural history: gaps between consecutive PAST visits ---
    days_late_hist = []
    for j in range(len(hist) - 1):
        exp_ret = _date(hist[j].visit_date) + dt.timedelta(days=_days_dispensed(hist[j], cfg))
        days_late_hist.append((_date(hist[j + 1].visit_date) - exp_ret).days)
    prior_gaps = len(days_late_hist)
    prior_defaults = sum(1 for d in days_late_hist if d >= cfg.grace_days)
    prior_default_rate = (prior_defaults / prior_gaps) if prior_gaps else NAN
    prior_avg = (sum(days_late_hist) / len(days_late_hist)) if days_late_hist else NAN
    prior_max = max(days_late_hist) if days_late_hist else NAN
    last_gap = days_late_hist[-1] if days_late_hist else NAN
    last_was_late = float(last_gap >= cfg.grace_days) if days_late_hist else NAN

    # --- index-visit fields ---
    dd_index = _days_dispensed(iv, cfg)
    months_on = (iv_date - art_start).days / cfg.months_per_unit if art_start else NAN
    age = (iv_date - dob).days / 365.25 if dob else NAN
    is_youth = float(15 <= age <= cfg.youth_age_max) if age == age else NAN
    visit_month = iv_date.month
    ym = f"{iv_date.year:04d}-{iv_date.month:02d}"
    stock = set(req.stockout_months or [])
    stockout_this = float(ym in stock)
    stockout_trailing3 = float(sum(1 for t in _trailing_months(iv_date.year, iv_date.month, 3) if t in stock))
    months_since_vl = (iv_date - last_vl_date).days / cfg.months_per_unit if last_vl_date else NAN

    row = {
        # patient / clinical
        "sex": p.sex,
        "age": age,
        "baseline_cd4": p.baseline_cd4,
        "who_stage": p.who_stage_at_enrolment,
        "marital_status": p.marital_status,
        "education_level": p.education_level,
        "occupation": p.occupation,
        "disclosure_status": p.disclosure_status,
        "phone_available": p.phone_available,
        # access / geography
        "distance_km": distance_km,
        "travel_time_min": p.self_reported_travel_time_min,
        "catchment_type": fac.catchment_type,
        "facility_type": fac.facility_type,
        "province": fac.province,
        # index visit
        "months_on_art": months_on,
        "days_dispensed": float(dd_index),
        "dsd_model": iv.dsd_model,
        "regimen": iv.regimen,
        "weight_kg": iv.weight_kg,
        "visit_month": float(visit_month),
        "is_youth": is_youth,
        "rainy_season": float(visit_month in cfg.rainy_months),
        # viral load (carried forward)
        "last_vl": last_vl,
        "last_vl_unsuppressed": float(last_vl >= cfg.vl_suppressed_threshold) if last_vl == last_vl else NAN,
        "ever_unsuppressed": float(ever_unsup),
        "months_since_vl": months_since_vl,
        # facility stockout known at index time
        "stockout_this_month": stockout_this,
        "stockout_trailing3": stockout_trailing3,
        # behavioural history (Tier-1)
        "prior_gaps": float(prior_gaps),
        "prior_defaults": float(prior_defaults),
        "prior_default_rate": prior_default_rate,
        "prior_avg_days_late": prior_avg,
        "prior_max_days_late": float(prior_max) if prior_max == prior_max else NAN,
        "last_gap_days_late": float(last_gap) if last_gap == last_gap else NAN,
        "last_was_late": last_was_late,
    }
    return row, warns, iv.visit_date, len(hist)
