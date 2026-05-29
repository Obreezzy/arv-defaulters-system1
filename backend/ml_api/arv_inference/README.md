# arv_inference

Self-contained inference package for **ARV-refill default prediction**. Hand it
raw patient data (demographics + facility + visit history) and it returns a
calibrated default-risk probability, a thresholded decision and a risk band.

It is **independent of the training code** (`src/`): clone/copy this folder,
`pip install -r requirements.txt`, and it runs anywhere. The trained model ships
inside `model/`.

## Install

```bash
pip install -r requirements.txt    # scikit-learn pinned to the training version
```

> The model is a pickled scikit-learn pipeline, so `scikit-learn` / `pandas` /
> `numpy` / `joblib` are required to load and run it. "Self-contained" means it
> imports no project code — not that it has zero dependencies. Keep the pinned
> sklearn version or unpickling may warn / misbehave.

## Use

```python
from arv_inference import ArvDefaultPredictor
from arv_inference.dtos import PredictRequest

predictor = ArvDefaultPredictor()                 # loads the bundled model
request = PredictRequest.from_dict(payload_dict)   # payload = raw patient JSON
resp = predictor.predict(request)
print(resp.default_probability, resp.risk_tier, resp.predicted_default)
```

Run the bundled demo:

```bash
python -m arv_inference.example_usage
```

### What it does internally (same steps as training)
1. **Clean** the records (clip impossible values, void bad dispensing intervals, sort/dedupe visits).
2. **Engineer features** at the index visit — distance from GPS, age, months-on-ART, carried-forward viral load, facility stockout at the index month, and the causal behavioural-history features (`prior_default_rate`, `last_gap_days_late`, ...). Uses PAST visits only.
3. **Predict** — the bundled sklearn pipeline applies its own imputation / scaling / one-hot encoding, then the calibrated model outputs a probability; the tuned threshold and risk bands are applied.

## Input (DTOs)

`PredictRequest` = `PatientRecord` + `FacilityRecord` + ordered `list[VisitRecord]`
+ `stockout_months` (`['YYYY-MM', ...]` the facility was stocked out) + `index`
(which visit is the prediction point; default `-1` = latest). The prediction
answers: *"will this patient default on their NEXT pickup after the index visit?"*

Missing fields are fine — they are imputed by the model pipeline and noted in
`response.warnings`. Unknown categorical values are ignored by the encoder.

## Output

`PredictionResponse`: `default_probability` (calibrated), `predicted_default`,
`risk_tier` (`RiskTier` enum: low/medium/high), `risk_tier_bounds`,
`threshold_used`, `threshold_source`, `index_visit_date`, `n_visits_used`,
`model_name`, `model_version`, `reason_codes` (local explanation), `warnings`,
and (optionally) the engineered `features`. `predict_batch` returns
`BatchPredictionResponse` with a `summary` (counts per tier).

## Risk tiers (low / medium / high)

`risk_tier` is a `RiskTier` enum. By default zones are **anchored to the
(group-aware) action threshold** (probabilities are calibrated, so this is
meaningful):

- **HIGH**: `p >= threshold` (the model recommends outreach; == `predicted_default`)
- **MEDIUM**: `0.5 * threshold <= p < threshold` (elevated -> watch / light touch)
- **LOW**: `p < 0.5 * threshold` (routine)

Because the high cut is the action threshold, tiers shift correctly per subgroup
when `threshold_by` is set (e.g. urban 0.21 vs rural 0.48). `risk_tier_bounds`
reports the exact cuts used. Set `risk_tier_strategy="fixed"` for absolute
calibrated-risk zones (`risk_band_low_max` / `risk_band_high_min`), or tune
`risk_tier_medium_fraction`.

## Explanations (per prediction)

Set `explain=True` on the request (or `explain_default=True` in config) to get
`reason_codes`: the top features pushing this patient's risk up/down, via
reference-occlusion against the training baseline (model-agnostic, exact w.r.t.
the calibrated probability). Example:

```json
"reason_codes": [
  {"feature": "days_dispensed", "value": 90.0, "contribution": -0.19, "direction": "decreases_risk"},
  {"feature": "catchment_type", "value": "rural", "contribution": 0.17, "direction": "increases_risk"}
]
```

## Group-aware thresholds (fairness fix)

The audit found urban defaulters are under-flagged at one global threshold. Set
`threshold_by="catchment_type"` to apply per-group operating points (from the
model card's `group_thresholds`, e.g. rural 0.48 / peri-urban 0.25 / urban 0.21).
`threshold_source` in the response records which threshold was used. For a fixed
outreach budget instead of a threshold, use `thresholds.select_top_n(...)` (or
`--capacity N [--by-facility]` in the CLI).

## Model card (where fairness lives)

`predictor.get_model_card()` returns `model/model_card.json`: holdout metrics,
calibration, fairness disparities, intended use and limitations. Fairness is a
population property, so it is surfaced here rather than per request.

## Serving: REST API & CLI

```bash
# REST API (needs: pip install flask)
python -m arv_inference.api          # GET /health /model-card ; POST /predict /predict-batch

# CLI
python -m arv_inference.cli --input example_request.json --threshold-by catchment_type --explain --pretty
python -m arv_inference.cli --input batch.json --capacity 100 --by-facility   # outreach budget
```

### Low-level path
If you already have the engineered features, skip cleaning/extraction:

```python
predictor.predict_from_features({"sex": "F", "age": 34.0, ...})
```

## Configuration

Everything tunable is in `config.py` (`InferenceConfig`): model path/format,
threshold override (defaults to the artifact's tuned value), risk-band cutoffs,
the feature-engineering constants, and cleaning bounds.

```python
from arv_inference import ArvDefaultPredictor, InferenceConfig
cfg = InferenceConfig(model_path="/path/to/model.joblib", threshold_override=0.30,
                      risk_band_high_min=0.45)
predictor = ArvDefaultPredictor(cfg)
```

The feature spec + threshold are read from the model artifact, so dropping in a
newly trained `winner_*.joblib` (same feature contract) works without code changes.

## Maintenance note (train/serve skew)

Because the package is independent, the cleaning + feature logic here is a
**copy** of the training logic. If `src/feature_engineering.py` or
`src/cleaning.py` change, update `features.py` / `cleaning.py` here in lockstep.
The predictor raises on **feature drift** (if the model expects a feature the
package does not produce).
```
arv_inference/
  config.py        InferenceConfig (model path, thresholds, explanations, cleaning bounds)
  dtos.py          request/response dataclasses
  cleaning.py      raw-value sanitation
  features.py      index-visit feature extraction
  explanations.py  per-prediction reason codes (reference-occlusion)
  thresholds.py    group-aware threshold resolution + capacity selection
  model_card.py    model-card loader
  predictor.py     ArvDefaultPredictor (load + predict + batch + explain)
  api.py           Flask REST API
  cli.py           command-line interface
  model/           bundled trained pipeline + model_card.json
```
