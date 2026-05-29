import os
import joblib
import pandas as pd
from flask import Flask, request, jsonify
import traceback

app = Flask(__name__)

# 1. Load the new Histogram Gradient Boosting model
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'winner_hist_gradient_boosting.joblib')
model = joblib.load(MODEL_PATH)

# 2. THE GREEN LIGHT: Health Check Route
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "online",
        "message": "ML Risk Engine is running and model is loaded."
    }), 200

# 3. The Prediction Route
@app.route('/predict/defaulters', methods=['POST'])
def predict_defaulters():
    try:
        incoming_data = request.json
        if not incoming_data or not isinstance(incoming_data, list):
            return jsonify({"error": "Payload must be a JSON array of patient records"}), 400

        df = pd.DataFrame(incoming_data)
        patient_ids = df.pop('patient_id') if 'patient_id' in df.columns else range(len(df))

        predictions = model.predict(df)
        probabilities = model.predict_proba(df)[:, 1]

        results = []
        for pid, pred, prob in zip(patient_ids, predictions, probabilities):
            results.append({
                "patient_id": pid,
                "will_default": bool(pred),
                "risk_score": round(float(prob), 4)
            })

        return jsonify({
            "status": "success", 
            "total_processed": len(results),
            "predictions": results
        }), 200

    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)