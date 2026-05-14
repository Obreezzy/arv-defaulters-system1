from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import json
import os
import warnings
warnings.filterwarnings('ignore')

app  = Flask(__name__)
CORS(app)

# ── Load saved models ─────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, 'arv_model_output')

print('Loading models...')
lr           = joblib.load(os.path.join(MODEL_DIR, 'logistic_regression.pkl'))
rf           = joblib.load(os.path.join(MODEL_DIR, 'random_forest.pkl'))
meta_learner = joblib.load(os.path.join(MODEL_DIR, 'meta_learner.pkl'))
scaler       = joblib.load(os.path.join(MODEL_DIR, 'scaler.pkl'))

with open(os.path.join(MODEL_DIR, 'model_config.json')) as f:
    config = json.load(f)

FEATURES  = config['features']
THRESHOLD = config['threshold']
print(f'Models loaded! Threshold: {THRESHOLD:.2f}')


# ── Build feature vector as plain Python list ─────────────────────
def build_feature_vector(patient: dict) -> list:
    """
    Converts patient dict to an ordered list matching FEATURES.
    Uses only plain Python — no pandas, no numpy needed.
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

    # Build feature dict matching exact order from notebook
    feat = {
        'days_overdue'            : days,
        'overdue_critical'        : int(days > 30),
        'overdue_high'            : int(14 < days <= 30),
        'overdue_moderate'        : int(3 < days <= 13),
        'overdue_flag'            : int(days >= 3),
        'age'                     : age,
        'age_high_risk'           : int(18 <= age <= 24),
        'age_senior'              : int(age > 65),
        'is_male'                 : int(gender.upper() == 'M'),
        'distance_from_clinic_km' : dist,
        'distance_risk'           : min(dist / 50, 1.0),
        'is_far'                  : int(dist > 20),
        'past_defaults'           : past_def,
        'default_rate'            : past_def / tot_appt,
        'is_chronic_defaulter'    : int(past_def > 2),
        'total_appointments'      : tot_appt,
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
        'treatment_supporter'     : supporter,
        'is_single'               : int(marital.lower() == 'single'),
        'is_married'              : int(marital.lower() == 'married'),
        'on_legacy_regimen'       : int(regimen.upper() == 'AZT/3TC/NVP'),
        'on_tld'                  : int(regimen.upper() == 'TLD'),
        'years_on_art'            : years_art,
    }

    # Return as ordered list matching FEATURES
    return [feat[f] for f in FEATURES]


# ── Risk label ────────────────────────────────────────────────────
def get_label(score: int) -> str:
    if score >= 75: return 'High'
    if score >= 40: return 'Medium'
    return 'Low'


# ── Build human-readable risk factors ────────────────────────────
def build_factors(feat_dict: dict) -> list:
    risk_increasing = []
    risk_reducing   = []

    if feat_dict['overdue_critical']:
        risk_increasing.append('Critically overdue (>30 days)')
    elif feat_dict['overdue_high']:
        risk_increasing.append('Significantly overdue (14-30 days)')
    elif feat_dict['overdue_moderate']:
        risk_increasing.append('Moderately overdue (3-13 days)')

    if feat_dict['is_chronic_defaulter']:
        risk_increasing.append('Chronic defaulter history (3+ past defaults)')
    elif feat_dict['past_defaults'] > 0:
        risk_increasing.append(f'Previous default record ({int(feat_dict["past_defaults"])} times)')

    if feat_dict['is_far']:
        risk_increasing.append(f'Far from clinic ({feat_dict["distance_from_clinic_km"]:.0f}km)')

    if feat_dict['age_high_risk']:
        risk_increasing.append('High-risk age group (18-24 years)')

    if feat_dict['is_single']:
        risk_increasing.append('Single — limited household support')

    if not feat_dict['treatment_supporter']:
        risk_increasing.append('No treatment supporter assigned')

    if feat_dict['has_tb']:
        risk_increasing.append('Tuberculosis comorbidity')
    if feat_dict['has_htn']:
        risk_increasing.append('Hypertension comorbidity')
    if feat_dict['has_diabetes']:
        risk_increasing.append('Diabetes comorbidity')

    if feat_dict['on_legacy_regimen']:
        risk_increasing.append('On legacy ARV regimen (AZT/3TC/NVP)')

    if feat_dict['treatment_supporter']:
        risk_reducing.append('Has treatment supporter')
    if feat_dict['is_married']:
        risk_reducing.append('Married — household support available')
    if feat_dict['on_tld']:
        risk_reducing.append('On TLD regimen (well tolerated)')
    if feat_dict['years_on_art'] > 3:
        risk_reducing.append(f'Established on ART ({feat_dict["years_on_art"]:.1f} years)')

    all_factors = (
        [f'↑ {f}' for f in risk_increasing[:4]] +
        [f'↓ {f}' for f in risk_reducing[:2]]
    )
    return all_factors or ['Insufficient data to determine specific factors']


# ── Helper: patient dict to feature dict ─────────────────────────
def build_feat_dict(patient: dict) -> dict:
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

    return {
        'days_overdue'            : days,
        'overdue_critical'        : int(days > 30),
        'overdue_high'            : int(14 < days <= 30),
        'overdue_moderate'        : int(3 < days <= 13),
        'overdue_flag'            : int(days >= 3),
        'age'                     : age,
        'age_high_risk'           : int(18 <= age <= 24),
        'age_senior'              : int(age > 65),
        'is_male'                 : int(gender.upper() == 'M'),
        'distance_from_clinic_km' : dist,
        'distance_risk'           : min(dist / 50, 1.0),
        'is_far'                  : int(dist > 20),
        'past_defaults'           : past_def,
        'default_rate'            : past_def / tot_appt,
        'is_chronic_defaulter'    : int(past_def > 2),
        'total_appointments'      : tot_appt,
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
        'treatment_supporter'     : supporter,
        'is_single'               : int(marital.lower() == 'single'),
        'is_married'              : int(marital.lower() == 'married'),
        'on_legacy_regimen'       : int(regimen.upper() == 'AZT/3TC/NVP'),
        'on_tld'                  : int(regimen.upper() == 'TLD'),
        'years_on_art'            : years_art,
    }


# ── /predict endpoint ─────────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    try:
        import traceback
        patient = request.get_json()
        if not patient:
            return jsonify({'error': 'No patient data provided'}), 400

        # Build ordered feature list
        X_raw   = build_feature_vector(patient)
        X_sc    = scaler.transform([X_raw])

        # Predict
        p_lr    = lr.predict_proba(X_sc)[0][1]
        p_rf    = rf.predict_proba([X_raw])[0][1]
        prob    = meta_learner.predict_proba([[p_lr, p_rf]])[0][1]

        score   = round(float(prob) * 100)
        label   = get_label(score)
        factors = build_factors(build_feat_dict(patient))

        return jsonify({
            'score'      : score,
            'label'      : label,
            'factors'    : factors,
            'probability': round(float(prob), 4),
            'model'      : 'LR+RF Ensemble v1.0.0',
            'threshold'  : THRESHOLD
        })

    except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"PREDICT ERROR: {error_details}")
            return jsonify({'error': str(e), 'details': error_details}), 500


# ── /health endpoint ──────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status'  : 'ok',
        'model'   : 'ARV Defaulter Prediction v1.0.0',
        'dataset' : 'Chinyamukwakwa Clinic',
        'features': len(FEATURES)
    })


# ── /batch endpoint ───────────────────────────────────────────────
@app.route('/batch', methods=['POST'])
def batch_predict():
    try:
        data     = request.get_json()
        patients = data.get('patients', [])
        if not patients:
            return jsonify({'error': 'No patients provided'}), 400

        results = []
        for patient in patients:
            X_raw = build_feature_vector(patient)
            X_sc  = scaler.transform([X_raw])
            p_lr  = lr.predict_proba(X_sc)[0][1]
            p_rf  = rf.predict_proba([X_raw])[0][1]
            prob  = meta_learner.predict_proba([[p_lr, p_rf]])[0][1]
            score = round(float(prob) * 100)
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
    print(f' ARV ML API running on port {port}')
    app.run(host='0.0.0.0', port=port, debug=False)
