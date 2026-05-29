"""
REST API for the inference package (Flask; lazy-imported so the core package
does not require Flask).

    python -m arv_inference.api            # dev server on :8000

Endpoints:
    GET  /health        -> {status, model_name, model_version}
    GET  /model-card    -> the bundled model card (metrics, fairness, limitations)
    POST /predict       -> body = one PredictRequest dict  -> PredictionResponse
    POST /predict-batch -> body = {"requests": [...]}       -> BatchPredictionResponse

For production use a WSGI server (e.g. `waitress-serve --port=8000
'arv_inference.api:create_app()'` or gunicorn).
"""

from __future__ import annotations

from .config import InferenceConfig
from .dtos import BatchPredictRequest, PredictRequest
from .predictor import ArvDefaultPredictor


def create_app(config: InferenceConfig | None = None):
    try:
        from flask import Flask, jsonify, request
    except ImportError as e:  # pragma: no cover
        raise ImportError("Flask is required for the REST API: pip install flask") from e

    app = Flask(__name__)
    predictor = ArvDefaultPredictor(config)

    @app.get("/health")
    def health():
        return jsonify(status="ok", model_name=predictor.model_name,
                       model_version=predictor.model_version)

    @app.get("/model-card")
    def model_card():
        card = predictor.get_model_card()
        return (jsonify(card), 200) if card else (jsonify(error="no model card bundled"), 404)

    @app.post("/predict")
    def predict():
        try:
            req = PredictRequest.from_dict(request.get_json(force=True))
            return jsonify(predictor.predict(req).to_dict())
        except (KeyError, ValueError) as e:
            return jsonify(error=str(e)), 400

    @app.post("/predict-batch")
    def predict_batch():
        try:
            batch = BatchPredictRequest.from_dict(request.get_json(force=True))
            return jsonify(predictor.predict_batch(batch).to_dict())
        except (KeyError, ValueError) as e:
            return jsonify(error=str(e)), 400

    return app


def main():
    create_app().run(host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
