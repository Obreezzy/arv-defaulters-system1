"""
Data Transfer Objects (plain dataclasses, no third-party deps).

Request side mirrors the RAW data a clinic system holds (patient + facility +
the patient's visit history). The package engineers the model features from
these internally. Response side returns a calibrated default probability,
a thresholded decision, a risk band and any data-quality warnings.

All DTOs support `.from_dict()` (ignores unknown keys, so callers can pass extra
fields) and `.to_dict()` for easy JSON interchange.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields
from enum import Enum
from typing import Any, Optional


class RiskTier(str, Enum):
    """Triage tier. A str-Enum so it serialises straight to JSON ('low'/'medium'/'high')."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


def _known(cls, data: dict) -> dict:
    names = {f.name for f in fields(cls)}
    return {k: v for k, v in (data or {}).items() if k in names}


# --------------------------------------------------------------------------- #
# Request side
# --------------------------------------------------------------------------- #
@dataclass
class VisitRecord:
    visit_date: str                                  # ISO 'YYYY-MM-DD' (required)
    days_dispensed: Optional[int] = None             # 30 / 90 / 180 (MMD interval)
    scheduled_next_appt_date: Optional[str] = None
    viral_load_result: Optional[float] = None
    viral_load_date: Optional[str] = None
    dsd_model: Optional[str] = None
    regimen: Optional[str] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    tb_screen_result: Optional[str] = None
    pregnancy_status: Optional[str] = None
    functional_status: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict) -> "VisitRecord":
        return cls(**_known(cls, d))


@dataclass
class PatientRecord:
    patient_id: str
    art_start_date: str                              # ISO (required for months-on-ART)
    sex: Optional[str] = None
    date_of_birth: Optional[str] = None
    baseline_cd4: Optional[float] = None
    who_stage_at_enrolment: Optional[float] = None
    residence_gps_lat: Optional[float] = None
    residence_gps_lon: Optional[float] = None
    self_reported_travel_time_min: Optional[float] = None
    phone_available: Optional[str] = None
    marital_status: Optional[str] = None
    education_level: Optional[str] = None
    occupation: Optional[str] = None
    disclosure_status: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict) -> "PatientRecord":
        return cls(**_known(cls, d))


@dataclass
class FacilityRecord:
    facility_id: Optional[str] = None
    gps_lat: Optional[float] = None
    gps_lon: Optional[float] = None
    catchment_type: Optional[str] = None
    facility_type: Optional[str] = None
    province: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict) -> "FacilityRecord":
        return cls(**_known(cls, d))


@dataclass
class PredictRequest:
    patient: PatientRecord
    facility: FacilityRecord
    visits: list[VisitRecord]
    stockout_months: list[str] = field(default_factory=list)  # ['YYYY-MM', ...] facility stocked out
    index: int = -1                                  # which visit is the prediction point (default: latest)
    include_features: bool = False                   # echo the engineered feature row in the response
    explain: bool = False                            # attach per-prediction reason_codes

    @classmethod
    def from_dict(cls, d: dict) -> "PredictRequest":
        return cls(
            patient=PatientRecord.from_dict(d["patient"]),
            facility=FacilityRecord.from_dict(d.get("facility", {})),
            visits=[VisitRecord.from_dict(v) for v in d.get("visits", [])],
            stockout_months=list(d.get("stockout_months", [])),
            index=int(d.get("index", -1)),
            include_features=bool(d.get("include_features", False)),
            explain=bool(d.get("explain", False)),
        )


@dataclass
class BatchPredictRequest:
    requests: list[PredictRequest]

    @classmethod
    def from_dict(cls, d: dict) -> "BatchPredictRequest":
        return cls(requests=[PredictRequest.from_dict(r) for r in d.get("requests", [])])


# --------------------------------------------------------------------------- #
# Response side
# --------------------------------------------------------------------------- #
@dataclass
class PredictionResponse:
    patient_id: str
    default_probability: float
    predicted_default: bool
    risk_tier: RiskTier                              # LOW | MEDIUM | HIGH
    threshold_used: float
    risk_tier_bounds: Optional[dict[str, Any]] = None  # {low_cut, high_cut, strategy} used
    threshold_source: Optional[str] = None           # global | override | "catchment_type=rural" ...
    index_visit_date: Optional[str] = None
    n_visits_used: int = 0
    model_name: Optional[str] = None
    model_version: Optional[str] = None
    reason_codes: list[dict[str, Any]] = field(default_factory=list)  # local explanation
    warnings: list[str] = field(default_factory=list)
    features: Optional[dict[str, Any]] = None        # populated if include_features=True

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class BatchPredictionResponse:
    predictions: list[PredictionResponse]
    summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {"predictions": [p.to_dict() for p in self.predictions], "summary": self.summary}
