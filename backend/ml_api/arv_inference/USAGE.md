# arv_inference — Usage & Configuration

`arv_inference` is a **self-contained** package that turns raw patient data into
a calibrated ARV-refill default prediction with a risk tier and an explanation.
It imports **no project code** (`src/` is not required) and ships the trained
model inside `model/`, so you can copy the folder anywhere and run it.

- Quick reference / API summary: `arv_inference/README.md`
- This file: the **detailed** how-to-use and how-to-configure guide.

---

## 1. Install

```bash
pip install -r arv_inference/requirements.txt   # scikit-learn (pinned), numpy, pandas, joblib
# optional, only for the REST API:
pip install flask
```

> "Self-contained" means no dependency on this project's `src/`. The model is a
> pickled scikit-learn pipeline, so scikit-learn/pandas/numpy/joblib are still
> required. **Keep the pinned scikit-learn version** (the loader warns on
> mismatch — unpickling across versions can change behaviour).

---

## 2. Quick start (library)

```python
from arv_inference import ArvDefaultPredictor, InferenceConfig
from arv_inference.dtos import PredictRequest

predictor = ArvDefaultPredictor()                  # loads the bundled model + card
resp = predictor.predict(PredictRequest.from_dict(payload))   # payload = dict below

print(resp.default_probability)   # 0.2031   (calibrated)
print(resp.risk_tier)             # RiskTier.LOW   (serialises to "low")
print(resp.predicted_default, resp.threshold_used, resp.threshold_source)
print(resp.reason_codes)          # populated if explain requested
print(resp.to_dict())             # JSON-ready dict
```

---

## 3. What happens to a request (lifecycle)

1. **Clean** (`cleaning.py`) — clip impossible values (cd4/weight/height/travel),
   void invalid `days_dispensed`, sort + dedupe visits. Data issues are recorded
   in `response.warnings`.
2. **Engineer features** (`features.py`) — at the **index visit** (default: the
   latest visit), build the ~35 features the model expects: distance from GPS,
   age, months-on-ART, carried-forward viral load, facility stockout at the index
   month, and causal behavioural-history features (`prior_default_rate`,
   `last_gap_days_late`, …). Uses **past visits only**.
3. **Predict** — the bundled pipeline applies impute → scale → one-hot, runs the
   model, and **isotonic calibration** maps to a calibrated probability.
4. **Threshold + tier** — resolve the operating threshold (global, per-group, or
   override) and assign a `RiskTier`.
5. **Explain** (optional) — attach `reason_codes`.

The prediction answers: *"will this patient default on the NEXT pickup after the
index visit?"*

---

## 4. Building a request (input DTOs)

All DTOs are plain dataclasses with `.from_dict()` (ignores unknown keys, so you
can pass extra fields) and `.to_dict()`.

### `PredictRequest`
| field | type | notes |
|---|---|---|
| `patient` | `PatientRecord` | required |
| `facility` | `FacilityRecord` | required (drives distance, catchment, group threshold) |
| `visits` | `list[VisitRecord]` | ordered history; the **last** is the prediction point by default |
| `stockout_months` | `list[str]` | `['YYYY-MM', …]` the facility was stocked out |
| `index` | int | which visit is the prediction point (default `-1` = latest) |
| `include_features` | bool | echo the engineered feature row in the response |
| `explain` | bool | attach `reason_codes` |

### `PatientRecord`
`patient_id` (req), `art_start_date` (req, ISO) , `sex`, `date_of_birth`,
`baseline_cd4`, `who_stage_at_enrolment`, `residence_gps_lat`,
`residence_gps_lon`, `self_reported_travel_time_min`, `phone_available`,
`marital_status`, `education_level`, `occupation`, `disclosure_status`.

### `FacilityRecord`
`facility_id`, `gps_lat`, `gps_lon`, `catchment_type`, `facility_type`,
`province`.

### `VisitRecord`
`visit_date` (req, ISO), `days_dispensed`, `scheduled_next_appt_date`,
`viral_load_result`, `viral_load_date`, `dsd_model`, `regimen`, `weight_kg`,
`height_cm`, `tb_screen_result`, `pregnancy_status`, `functional_status`.

**Missing fields are fine** — they are imputed by the model pipeline and noted in
`warnings`. Unknown categorical values are ignored by the encoder.

### Example payload (JSON)
```json
{
  "patient": {"patient_id":"PT_0001","art_start_date":"2022-03-15","sex":"F",
              "residence_gps_lat":-18.97,"residence_gps_lon":32.67,
              "self_reported_travel_time_min":75,"phone_available":"Yes"},
  "facility": {"facility_id":"FAC_12","gps_lat":-18.95,"gps_lon":32.62,
               "catchment_type":"rural","facility_type":"Rural Health Centre","province":"Manicaland"},
  "visits": [
    {"visit_date":"2024-09-10","days_dispensed":90,"viral_load_result":0,"dsd_model":"CARG"},
    {"visit_date":"2025-06-25","days_dispensed":90,"viral_load_result":850,"dsd_model":"facility"}
  ],
  "stockout_months": ["2025-09"],
  "index": -1, "explain": true
}
```

---

## 5. The response (output DTOs)

### `PredictionResponse`
| field | type | notes |
|---|---|---|
| `patient_id` | str | |
| `default_probability` | float | calibrated probability of defaulting next pickup |
| `predicted_default` | bool | `prob >= threshold_used` |
| `risk_tier` | `RiskTier` | LOW / MEDIUM / HIGH (serialises to a string) |
| `risk_tier_bounds` | dict | `{low_cut, high_cut, strategy}` actually used |
| `threshold_used` | float | the operating threshold applied |
| `threshold_source` | str | `global` / `override` / `catchment_type=rural` … |
| `index_visit_date` | str | the prediction point |
| `n_visits_used` | int | history length used |
| `model_name`, `model_version` | str | provenance |
| `reason_codes` | list | local explanation (if requested) |
| `warnings` | list | data-quality notes |
| `features` | dict / null | engineered row (if `include_features`) |

### `BatchPredictionResponse`
`predictions: list[PredictionResponse]` + `summary` (counts of
predicted-default and per-tier `n_high_risk` / `n_medium_risk` / `n_low_risk`,
`mean_probability`, model info).

---

## 6. Risk tiers (LOW / MEDIUM / HIGH)

`risk_tier` is a `RiskTier` enum. **Default strategy = `threshold_anchored`** —
zones are relative to the (group-aware) action threshold; since probabilities are
calibrated this is meaningful:

- **HIGH**: `p >= threshold` (model recommends outreach; equals `predicted_default`)
- **MEDIUM**: `risk_tier_medium_fraction * threshold <= p < threshold`
- **LOW**: below

Because the high cut is the action threshold, tiers shift correctly per subgroup
when group-aware thresholds are on. Switch to absolute zones with
`risk_tier_strategy="fixed"` (`risk_band_low_max` / `risk_band_high_min`), or
tune `risk_tier_medium_fraction`.

---

## 7. Configuration reference (`InferenceConfig`)

```python
from arv_inference import InferenceConfig, ArvDefaultPredictor
cfg = InferenceConfig(threshold_by="catchment_type", explain_default=True)
predictor = ArvDefaultPredictor(cfg)
```

| field | default | purpose |
|---|---|---|
| `model_path` | bundled `model/winner_*.joblib` | model artifact to load |
| `model_format` | `"auto"` | `auto` / `joblib` / `pickle` |
| `model_card_path` | bundled `model/model_card.json` | metrics/fairness/limits + reference profile + group thresholds |
| `threshold_override` | `None` | force a single decision threshold (else artifact's tuned value) |
| `feature_spec_override` | `None` | override the feature spec (else read from artifact) |
| `threshold_by` | `None` | enable group-aware thresholds by this field, e.g. `"catchment_type"` |
| `threshold_map` | `None` | explicit `{group: threshold}` (else the card's `group_thresholds`) |
| `explain_default` | `False` | attach `reason_codes` to every prediction |
| `explain_top_k` | `6` | number of reason codes |
| `risk_tier_strategy` | `"threshold_anchored"` | `threshold_anchored` or `fixed` |
| `risk_tier_medium_fraction` | `0.5` | MEDIUM/LOW boundary = fraction × high cut |
| `risk_band_low_max` / `risk_band_high_min` | `0.20` / `0.50` | absolute cuts (fixed strategy) |
| `grace_days` | `28` | days late counting as a prior default in history features |
| `vl_suppressed_threshold` | `1000` | copies/mL |
| `youth_age_max` | `24` | youth band upper age |
| `rainy_months` | `(11,12,1,2,3)` | seasonal flag |
| `months_per_unit` | `30.44` | days→months conversion (must match training) |
| `valid_dispense_days` | `(30,60,90,180)` | allowed MMD intervals |
| `weight_kg_range` / `height_cm_range` / `baseline_cd4_range` / `travel_time_min_range` | — | cleaning clip bounds |
| `default_days_dispensed` | `30` | fallback when missing & no scheduled date |
| `strict` | `False` | raise on validation issues instead of warning |
| `sklearn_version_expected` | `"1.8.0"` | unpickle-compatibility warning |

> Constants like `grace_days`, `vl_suppressed_threshold`, `months_per_unit` and
> the cleaning bounds **must match training** or the engineered features won't
> line up with what the model expects.

---

## 8. Group-aware thresholds & capacity

A single global threshold under-flags low-base-rate subgroups (e.g. urban). Use
per-group operating points:

```python
cfg = InferenceConfig(threshold_by="catchment_type")   # uses the card's group_thresholds
```
The response's `threshold_source` records which threshold was applied
(e.g. `catchment_type=rural`). Supply your own with `threshold_map={...}`.

**Capacity (fixed outreach budget)** — flag only the top-N highest risk instead
of thresholding:

```python
from arv_inference.thresholds import select_top_n
result = predictor.predict_batch(batch)
items = [{"patient_id": p.patient_id, "probability": p.default_probability,
          "facility_id": r.facility.facility_id}
         for p, r in zip(result.predictions, batch.requests)]
chosen = select_top_n(items, n=50, by_facility=True)    # set of patient_ids
```
(Or `--capacity 50 --by-facility` in the CLI.)

---

## 9. Explanations (reason codes)

Set `explain=True` (per request) or `explain_default=True` (config). Each
prediction then carries `reason_codes`: the features pushing this patient's risk
up/down, computed by **reference-occlusion** against the training baseline
(model-agnostic, exact w.r.t. the calibrated probability — no SHAP needed). If
`shap` is installed it is used automatically where applicable.

```json
"reason_codes": [
  {"feature":"days_dispensed","value":90.0,"contribution":-0.19,"direction":"decreases_risk"},
  {"feature":"catchment_type","value":"rural","contribution":0.17,"direction":"increases_risk"}
]
```

---

## 10. Model card

```python
card = predictor.get_model_card()    # model/model_card.json
card["holdout_metrics"]; card["fairness_disparities"]; card["limitations"]
```
The card carries headline metrics, calibration quality, fairness disparities,
intended use, limitations, the reference profile (for explanations) and the
per-group thresholds. Fairness is a population property, so it lives here rather
than in each prediction.

---

## 11. CLI

```bash
# single (reads a JSON file or '-' for stdin; prints JSON)
python -m arv_inference.cli --input example_request.json --explain --pretty

# group-aware thresholds
python -m arv_inference.cli --input batch.json --threshold-by catchment_type

# fixed outreach budget of 100 per facility
python -m arv_inference.cli --input batch.json --capacity 100 --by-facility

# override threshold / model
python -m arv_inference.cli --input req.json --threshold 0.30 --model /path/model.joblib
```
Input may be a single request object, a JSON list, or `{"requests":[...]}`.

---

## 12. REST API (Flask)

```bash
pip install flask
python -m arv_inference.api           # dev server on :8000
```
| method & path | body | returns |
|---|---|---|
| `GET /health` | — | `{status, model_name, model_version}` |
| `GET /model-card` | — | the model card |
| `POST /predict` | one `PredictRequest` | `PredictionResponse` |
| `POST /predict-batch` | `{"requests":[...]}` | `BatchPredictionResponse` |

```python
import requests
requests.post("http://localhost:8000/predict", json=payload).json()
```
For production use a WSGI server, e.g.
`waitress-serve --port=8000 "arv_inference.api:create_app()"` or gunicorn.

---

## 13. Low-level path (pre-engineered features)

If you already have the ~35 engineered features, skip cleaning/extraction:

```python
predictor.predict_from_features({"sex":"F","age":34.0,"distance_km":5.2, ...})
```
Returns `PredictionResponse`(s) using the global threshold.

---

## 14. Troubleshooting & maintenance

- **`feature drift` error** — the model expects a feature the package didn't
  produce. This guard catches train/serve skew; align `features.py` with the
  model's `spec`.
- **sklearn version warning** — install the pinned `scikit-learn` version
  (`requirements.txt`) used to train the bundled model.
- **All predictions look low / wrong** — check `warnings`; missing GPS,
  `art_start_date`, or visit history weakens features. New patients with no
  history get weaker (but valid) predictions.
- **Updating the model** — drop a new `winner_*.joblib` in `model/` and
  regenerate `model_card.json` (feature spec + threshold are read from the
  artifact, so no code change is needed for the same feature contract).
- **Train/serve skew (important)** — the cleaning + feature logic here is an
  intentional **copy** of the training logic (the package is independent). If
  `src/feature_engineering.py` or `src/cleaning.py` change, update
  `features.py` / `cleaning.py` here in lockstep.
