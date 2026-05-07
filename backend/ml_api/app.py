"""
🏥 ARV Defaulter Prediction — Flask ML API
Author : Obriel Makamanzi | University of Zimbabwe
Purpose: Wraps the trained LR + RF ensemble model and exposes
         a /predict endpoint that replaces riskEngine.js
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import joblib
import json
import os
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)  # Allow requests from Node.js backend

# ── Load saved models ─────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR  = os.path.join(BASE_DIR, 'arv_model_output')

print('Loading models...')
lr           = joblib.load(os.path.join(MODEL_DIR, 'logistic_regression.pkl'))
rf           = joblib.load(os.path.join(MODEL_DIR, 'random_forest.pkl'))
meta_learner = joblib.load(os.path.join(MODEL_DIR, 'meta_learner.pkl'))
scaler       = joblib.load(os.path.join(MODEL_DIR, 'scaler.pkl'))

with open(os.path.join(MODEL_DIR, 'model_config.json')) as f:
    config = json.load(f)

FEATURES   = config['features']
THRESHOLD  = config['threshold']
print(f'✅ Models loaded! Threshold: {THRESHOLD:.2f}')


# ── Feature engineering ───────────────────────────────────────────
def build_features(patient: dict) -> pd.DataFrame:
    """
    Converts a raw patient dict (from your Node.js backend)
    into the feature vector the model expects.
    Matches exactly what engineer_features() does in the notebook.
    """
    days      = float(patient.get('days_overdue', 0))
    age       = float(patient.get('age', 30))
    dist      = float(patient.get('distance_from_clinic_km', 10))
    past_def  = float(patient.get('past_defaults', 0))
    tot_appt  = max(float(patient.get('total_appointments', 1)), 1)
    chronic   = str(patient.get('chronic_conditions', ''))
    years_art = float(patient.get('years_on_art', 2.0))
    regimen   = str(patient.get('regimen', 'TLD'))
    supporter = int(patient.get('treatment_supporter', 1))
    marital   = str(patient.get('marital_status', 'Married'))
    who       = float(patient.get('who_clinical_stage', 2))
    gender    = str(patient.get('gender', 'F'))

    features = {
        # Lateness — 3-day system threshold
        'days_overdue'            : days,
        'overdue_critical'        : int(days > 30),
        'overdue_high'            : int(14 < days <= 30),
        'overdue_moderate'        : int(3 < days <= 13),
        'overdue_flag'            : int(days >= 3),

        # Age / demographics
        'age'                     : age,
        'age_high_risk'           : int(18 <= age <= 24),
        'age_senior'              : int(age > 65),
        'is_male'                 : int(gender.upper() == 'M'),

        # Distance
        'distance_from_clinic_km' : dist,
        'distance_risk'           : min(dist / 50, 1.0),
        'is_far'                  : int(dist > 20),

        # Past behaviour — strongest predictor
        'past_defaults'           : past_def,
        'default_rate'            : past_def / tot_appt,
        'is_chronic_defaulter'    : int(past_def > 2),
        'total_appointments'      : tot_appt,

        # Clinical
        'who_clinical_stage'      : who,
        'has_chronic'             : int(chronic.strip() != ''),
        'has_tb'                  : int('tuberculosis' in chronic.lower()),
        'has_htn'                 : int('hypertension' in chronic.lower()),
        'has_diabetes'            : int('diabetes' in chronic.lower()),
        'chronic_count'           : sum([
                                        int('tuberculosis' in chronic.lower()),
                                        int('hypertension' in chronic.lower()),
                                        int('diabetes'     in chronic.lower())
                                    ]),

        # Social support — uniquely Zimbabwean
        'treatment_supporter'     : supporter,
        'is_single'               : int(marital.lower() == 'single'),
        'is_married'              : int(marital.lower() == 'married'),

        # Regimen
        'on_legacy_regimen'       : int(regimen.upper() == 'AZT/3TC/NVP'),
        'on_tld'                  : int(regimen.upper() == 'TLD'),
        'years_on_art'            : years_art,
    }

    return pd.DataFrame([features])[FEATURES]


# ── Risk label ────────────────────────────────────────────────────
def get_label(score: int) -> str:
    if score >= 75: return 'High'
    if score >= 40: return 'Medium'
    return 'Low'


# ── /predict endpoint ─────────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    """
    Accepts patient JSON from Node.js backend.
    Returns { score, label, factors, probability }
    — exact same shape as calculateRiskScore() in riskEngine.js
    """
    try:
        patient = request.get_json()
        if not patient:
            return jsonify({'error': 'No patient data provided'}), 400

        # Build feature vector
        X_in    = build_features(patient)
        X_in_sc = scaler.transform(X_in)

        # Get predictions from both models
        p_lr = lr.predict_proba(X_in_sc)[:, 1][0]
        p_rf = rf.predict_proba(X_in.values)[:, 1][0]

        # Stack through meta-learner
        probability = meta_learner.predict_proba(
            np.array([[p_lr, p_rf]])
        )[:, 1][0]

        score = round(float(probability) * 100)
        label = get_label(score)

        # Risk factors — which features deviate most from average
        feat_means = X_in.iloc[0]
        risk_factors = []

        # Map feature names to human-readable labels
        factor_labels = {
            'days_overdue'            : 'Days overdue',
            'overdue_critical'        : 'Critically overdue (>30 days)',
            'overdue_high'            : 'Significantly overdue (14-30 days)',
            'overdue_moderate'        : 'Moderately overdue (3-13 days)',
            'overdue_flag'            : 'Flagged (3+ days overdue)',
            'age_high_risk'           : 'High-risk age group (18-24)',
            'age_senior'              : 'Elderly patient (>65)',
            'distance_from_clinic_km' : f'Distance from clinic ({feat_means["distance_from_clinic_km"]:.0f}km)',
            'is_far'                  : 'Long distance from clinic (>20km)',
            'is_very_far'             : 'Very far from clinic (>30km)',
            'default_rate'            : 'High historical default rate',
            'is_chronic_defaulter'    : 'Chronic defaulter (3+ past defaults)',
            'has_chronic'             : 'Has chronic condition',
            'has_tb'                  : 'Tuberculosis comorbidity',
            'has_htn'                 : 'Hypertension comorbidity',
            'has_diabetes'            : 'Diabetes comorbidity',
            'treatment_supporter'     : 'Has treatment supporter',
            'is_single'               : 'Single (no household support)',
            'on_legacy_regimen'       : 'Legacy regimen (AZT/3TC/NVP)',
            'who_clinical_stage'      : f'WHO Clinical Stage {int(feat_means["who_clinical_stage"])}',
        }

        # Determine top risk factors based on feature values
        risk_increasing = []
        risk_reducing   = []

        # Check each key risk flag
        if feat_means['overdue_critical']:
            risk_increasing.append('Critically overdue (>30 days)')
        elif feat_means['overdue_high']:
            risk_increasing.append('Significantly overdue (14-30 days)')
        elif feat_means['overdue_moderate']:
            risk_increasing.append('Moderately overdue (3-13 days)')

        if feat_means['is_chronic_defaulter']:
            risk_increasing.append('Chronic defaulter history (3+ past defaults)')
        elif feat_means['past_defaults'] > 0:
            risk_increasing.append(f'Previous default record ({int(feat_means["past_defaults"])} times)')

        if feat_means['is_far']:
            risk_increasing.append(f'Far from clinic ({feat_means["distance_from_clinic_km"]:.0f}km)')

        if feat_means['age_high_risk']:
            risk_increasing.append('High-risk age group (18-24 years)')

        if feat_means['is_single']:
            risk_increasing.append('Single — limited household support')

        if not feat_means['treatment_supporter']:
            risk_increasing.append('No treatment supporter assigned')

        if feat_means['has_tb']:
            risk_increasing.append('Tuberculosis comorbidity')
        if feat_means['has_htn']:
            risk_increasing.append('Hypertension comorbidity')
        if feat_means['has_diabetes']:
            risk_increasing.append('Diabetes comorbidity')

        if feat_means['on_legacy_regimen']:
            risk_increasing.append('On legacy ARV regimen (AZT/3TC/NVP)')

        # Protective factors
        if feat_means['treatment_supporter']:
            risk_reducing.append('Has treatment supporter')
        if feat_means['is_married']:
            risk_reducing.append('Married — household support available')
        if feat_means['on_tld']:
            risk_reducing.append('On TLD regimen (well tolerated)')
        if feat_means['years_on_art'] > 3:
            risk_reducing.append(f'Established on ART ({feat_means["years_on_art"]:.1f} years)')

        # Combine — risk increasing first, then reducing
        all_factors = (
            [f'↑ {f}' for f in risk_increasing[:4]] +
            [f'↓ {f}' for f in risk_reducing[:2]]
        ) or ['Insufficient data to determine specific factors']

        return jsonify({
            'score'       : score,
            'label'       : label,
            'factors'     : all_factors,
            'probability' : round(float(probability), 4),
            'model'       : 'LR+RF Ensemble v1.0.0',
            'threshold'   : THRESHOLD
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── /health endpoint ──────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status'  : 'ok',
        'model'   : 'ARV Defaulter Prediction v1.0.0',
        'dataset' : 'Chikore Mission Hospital, Chipinge',
        'features': len(FEATURES)
    })


# ── /batch endpoint — predict multiple patients at once ───────────
@app.route('/batch', methods=['POST'])
def batch_predict():
    """
    Accepts a list of patients and returns predictions for all.
    Useful for dashboard bulk risk assessment.
    """
    try:
        data     = request.get_json()
        patients = data.get('patients', [])
        if not patients:
            return jsonify({'error': 'No patients provided'}), 400

        results = []
        for patient in patients:
            X_in    = build_features(patient)
            X_in_sc = scaler.transform(X_in)
            p_lr    = lr.predict_proba(X_in_sc)[:, 1][0]
            p_rf    = rf.predict_proba(X_in.values)[:, 1][0]
            prob    = meta_learner.predict_proba(np.array([[p_lr, p_rf]]))[:, 1][0]
            score   = round(float(prob) * 100)
            results.append({
                'patient_id' : patient.get('patient_id', 'unknown'),
                'score'      : score,
                'label'      : get_label(score),
                'probability': round(float(prob), 4)
            })

        return jsonify({'predictions': results, 'count': len(results)})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f'🚀 ARV ML API running on port {port}')
    app.run(host='0.0.0.0', port=port, debug=False)
