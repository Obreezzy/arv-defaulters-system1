# backend/ml_api/app.py
import os
from flask import Flask, request, jsonify
from arv_inference import ArvDefaultPredictor, InferenceConfig
from arv_inference.dtos import PredictRequest

app = Flask(__name__)

# Load model once at startup
# arv_inference automatically finds the model inside arv_inference/model/
predictor = ArvDefaultPredictor(
    InferenceConfig(threshold_by="catchment_type")  # group-aware thresholds
)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status":  "healthy",
        "model":   "arv_inference_loaded",
        "version": "2.0.0"
    }), 200

@app.route('/predict', methods=['POST'])
def predict():
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"error": "Missing request body"}), 400

        predict_request = PredictRequest.from_dict(payload)
        response       = predictor.predict(predict_request)

        return jsonify({
            "default_probability": float(response.default_probability),
            "predicted_default":   bool(response.predicted_default),
            "risk_tier":           str(response.risk_tier.value),   # "low"/"medium"/"high"
            "threshold_used":      float(response.threshold_used),
            "threshold_source":    str(response.threshold_source),
            "index_visit_date":    str(response.index_visit_date) if response.index_visit_date else None,
            "n_visits_used":       response.n_visits_used,
            "warnings":            response.warnings or [],
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)