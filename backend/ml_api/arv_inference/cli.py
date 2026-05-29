"""
Command-line interface for the inference package.

    # single request
    python -m arv_inference.cli --input example_request.json

    # batch (file with {"requests":[...]} or a JSON list), group-aware thresholds,
    # explanations, and a fixed outreach budget of 100 per facility
    python -m arv_inference.cli --input batch.json --threshold-by catchment_type \
        --explain --capacity 100 --by-facility

Reads JSON from a file (or '-' for stdin), prints JSON predictions to stdout.
"""

from __future__ import annotations

import argparse
import json
import sys

from .config import InferenceConfig
from .dtos import BatchPredictRequest, PredictRequest
from .predictor import ArvDefaultPredictor
from .thresholds import select_top_n


def _load(payload_text: str):
    data = json.loads(payload_text)
    if isinstance(data, list):
        return BatchPredictRequest(requests=[PredictRequest.from_dict(d) for d in data]), True
    if "requests" in data:
        return BatchPredictRequest.from_dict(data), True
    return PredictRequest.from_dict(data), False


def main(argv=None):
    ap = argparse.ArgumentParser(description="ARV default-risk inference")
    ap.add_argument("--input", "-i", required=True, help="JSON file path or '-' for stdin")
    ap.add_argument("--model", help="override model artifact path")
    ap.add_argument("--threshold", type=float, help="override decision threshold")
    ap.add_argument("--threshold-by", help="group-aware thresholds by this field (e.g. catchment_type)")
    ap.add_argument("--explain", action="store_true", help="attach reason codes")
    ap.add_argument("--capacity", type=int, help="flag only the top-N highest risk (batch)")
    ap.add_argument("--by-facility", action="store_true", help="apply --capacity within each facility")
    ap.add_argument("--pretty", action="store_true")
    args = ap.parse_args(argv)

    cfg = InferenceConfig(explain_default=args.explain, threshold_by=args.threshold_by)
    if args.model:
        cfg.model_path = args.model
    if args.threshold is not None:
        cfg.threshold_override = args.threshold

    predictor = ArvDefaultPredictor(cfg)
    text = sys.stdin.read() if args.input == "-" else open(args.input).read()
    request, is_batch = _load(text)

    if is_batch:
        result = predictor.predict_batch(request)
        out = result.to_dict()
        if args.capacity:
            items = [{"patient_id": p.patient_id, "probability": p.default_probability,
                      "facility_id": getattr(r.facility, "facility_id", None)}
                     for p, r in zip(result.predictions, request.requests)]
            chosen = select_top_n(items, args.capacity, by_facility=args.by_facility)
            for p in out["predictions"]:
                p["selected_for_outreach"] = p["patient_id"] in chosen
            out["summary"]["capacity"] = args.capacity
            out["summary"]["n_selected"] = len(chosen)
    else:
        out = predictor.predict(request).to_dict()

    print(json.dumps(out, indent=2 if args.pretty else None))


if __name__ == "__main__":
    main()
