"""
Portable usage example for the arv_inference package. Depends ONLY on the
package itself + the bundled model (no project src/, no dataset).

    python -m arv_inference.example_usage
"""

from __future__ import annotations

import json
from pathlib import Path

from . import ArvDefaultPredictor, InferenceConfig
from .dtos import BatchPredictRequest, PredictRequest

HERE = Path(__file__).resolve().parent


def main():
    # group-aware thresholds (per catchment) + explanations on every prediction
    cfg = InferenceConfig(threshold_by="catchment_type", explain_default=True)
    predictor = ArvDefaultPredictor(cfg)           # loads the bundled model + card

    payload = json.loads((HERE / "example_request.json").read_text())
    request = PredictRequest.from_dict(payload)

    response = predictor.predict(request)
    print("Single prediction (group-aware threshold + reason codes):")
    print(json.dumps(response.to_dict(), indent=2))

    card = predictor.get_model_card()
    if card:
        print("\nModel card (excerpt):")
        print(json.dumps({"model_version": card["model_version"],
                          "holdout_metrics": card["holdout_metrics"],
                          "group_thresholds": card["group_thresholds"],
                          "limitations": card["limitations"]}, indent=2))

    # batch: same patient scored at its last two visits
    payload_prev = dict(payload, index=len(payload["visits"]) - 2)
    batch = BatchPredictRequest(requests=[
        PredictRequest.from_dict(payload),
        PredictRequest.from_dict(payload_prev),
    ])
    result = predictor.predict_batch(batch)
    print("\nBatch summary:")
    print(json.dumps(result.summary, indent=2))


if __name__ == "__main__":
    main()
