"""
arv_inference: self-contained inference package for ARV-refill default
prediction. Independent of the training `src/` package.

    from arv_inference import ArvDefaultPredictor, InferenceConfig
    from arv_inference.dtos import PredictRequest

    predictor = ArvDefaultPredictor()                  # loads the bundled model
    response = predictor.predict(PredictRequest.from_dict(payload))
"""

from .config import InferenceConfig
from .dtos import (BatchPredictionResponse, BatchPredictRequest, FacilityRecord,
                   PatientRecord, PredictionResponse, PredictRequest, RiskTier,
                   VisitRecord)
from .predictor import ArvDefaultPredictor

__all__ = [
    "ArvDefaultPredictor", "InferenceConfig",
    "PredictRequest", "BatchPredictRequest", "PredictionResponse", "BatchPredictionResponse",
    "PatientRecord", "FacilityRecord", "VisitRecord", "RiskTier",
    "create_app",
]


def create_app(config: InferenceConfig | None = None):
    """Build the Flask REST app (imported lazily; needs `pip install flask`)."""
    from .api import create_app as _create_app
    return _create_app(config)
