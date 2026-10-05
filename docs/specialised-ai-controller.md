# Four-specialist EMS experiment

The [standalone lab](https://pli-poc.github.io/ev-flexibility-twin/specialists/) trains four separate neural predictors and evaluates their combined charging controller. Choose **Load reference experiment** for a reproducible saved run without waiting for training, or train a new seed. The original random physical fixture and every earlier lab remain available.

## Implemented system

Each predictor is a separately trained 16-unit tanh MLP with Adam, validation checkpoint selection and bounded inference. Building and solar share one two-output network; the other three networks have one output each. This is supervised learning of uncertainty, not reinforcement learning or imitation of six dispatch strategies.

| Specialist | Observed inputs | Target | Control use |
|---|---|---|---|
| Departure | Declared schedule, historical habit descriptor, weekday shift, group, season | Actual departure minute | Conditional unplugging probabilities for 15/30/60 minutes; a calibrated risk deadline |
| Arrival | Time, known adjacent bookings, activity hint, season | Arrivals per quarter-hour | Expected future competition for headroom |
| Energy | Booked trip distance, fleet share, visit window, activity, season | Mean requested battery energy per booking | Expected arriving energy; actual request replaces prediction on arrival |
| Building/solar | Published forecasts, cloud/activity hints, time, season | Building and solar kW | Future site headroom and uncertainty allowance |

The named `recurring-patterns/1` fixture has 18 visits/day with recurring habits, imperfect bookings/weather forecasts and independent arrival, departure, load and weather noise. Normal cases have 20 chargers and an 85 kW connection; saturated cases have 12 chargers and 55 kW. Other cases retain normal equipment and introduce charger faults or remote-control loss. Saturation changes the equipment for **every comparator**, never only for AI.

`PublicDay` contains declared bookings and ex-ante signals. The planner cannot access `SpecialistCase.actual`, actual future weather or hindsight loss bounds. The engine reveals actual requested energy and observed arrival on arrival, preserving declared future departure. Replanning uses the connected set, frozen predictions and present headroom. Departure probabilities condition the validation residual distribution on continued connection; they are empirical estimates, not separately calibrated classification networks.

One receding-horizon heuristic serves full AI, no learning and every leave-one-out ablation. It uses risk deadlines, quarter-hour cost ranking, soft forecast competition, individual deadline urgency and a shared capacity guard. The engine enforces present import headroom, charger power, requested energy, availability and 90% charging efficiency. AC charging below 1.4 kW is stopped unless the partial final minute completes the request. Cloud loss or stale telemetry bypasses remote planning and uses local load balancing. Parking bays remain occupied until departure even after charging finishes.

The measured building/PV fixture overrides the original thermal model's aggregate power. Its underlying HVAC component values are illustrative, not a calibrated decomposition of those observations. This experiment does not optimise thermal comfort, battery degradation, V2G, reserve bids or real protocol timing. Those earlier synthetic demos remain separate.

## Train, validate, freeze, test

Reference: 140 training calendar days with seed 42; 70 independently generated validation days with seed 15443. Validation supplies checkpoint selection and residual interval calibration. Controller selection uses ten validation scenarios across all five conditions and seasons, evaluating 24 AI settings, three unlearned deadline margins and five admissible fixed strategies.

Selected AI settings: departure quantile 0.02, competition weight 0.08, weather uncertainty multiplier 0.5. The unlearned comparator selects a zero-minute deadline margin. The objective is site energy cost + EUR 20 × unmet battery kWh + EUR 1,000 × violation minutes. Validation selects **deadline-aware EMS** as the operating policy. The experimental full AI controller remains independently inspectable and replayable; fallback does not conceal its result.

Only after selection are model weights, intervals and settings frozen. Test seeds 74804, 98532 and 25063 cover ten calendar days each, for 30 paired scenarios and 540 vehicle visits. Thirteen policies run on identical actual events. The benchmark rejects training/validation seeds and does not mutate the model. Intervals use 600 bootstrap resamples of paired scenario differences; these synthetic scenarios have correlations within seeds, so the intervals are exploratory, not evidence of real-world statistical significance.

## Frozen reference results

| Controller | Site energy EUR | Unmet kWh | Fully ready / visits | Violations (minutes) | Weighted loss |
|---|---:|---:|---:|---:|---:|
| Common planner without learning | 5093.90 | 1979.66 | 300 / 540 | 0 | 44687.09 |
| Full four-specialist AI | 5211.35 | 1519.48 | 340 / 540 | 0 | 35600.94 |
| Deadline-aware EMS (selected fixed/fallback) | 5208.19 | 1541.07 | 358 / 540 | 0 | 36029.63 |
| Load balancing | 5197.84 | 1580.47 | 372 / 540 | 0 | 36807.31 |
| Cheapest energy | 4906.59 | 2685.83 | 222 / 540 | 0 | 58623.26 |

Relative to the same planner without learning, AI reduces unmet energy by **23.25%** (460.18 kWh), completes 40 more vehicles and improves weighted loss by **20.33%**. It spends EUR 117.46 more, largely while delivering more charging energy. This is a service improvement, not equivalent-service cost savings.

Relative to the validation-selected fixed EMS, AI has 21.59 kWh less unmet energy and 1.19% lower weighted loss, but spends EUR 3.17 more and completes **18 fewer vehicles**. Its mean paired loss advantage is 14.29 per scenario, with a 95% scenario-bootstrap interval of **[-2.04, 36.40]**, and wins/losses of 15/15. A reliable advantage over the strongest fixed EMS is therefore **not established**. The validation-selected operating policy remains EMS.

Most saturated-case unmet energy comes from physical capacity. The learned models cannot create a charging bay, extend a stay or increase the connection. Availability bounds are evaluated using actual bay assignment, dwell, charger power and faults; their residual still includes site grid constraints. Bounds never enter control.

| Removed specialist | Mean loss increase per scenario | 95% paired interval | Interpretation |
|---|---:|---:|---|
| Departure | 98.88 | [48.59, 156.07] | Positive control contribution on this fixture |
| Arrivals | 2.53 | [0.39, 5.46] | Small positive aggregate contribution; many scenarios are neutral or worse |
| Energy | -0.0006 | [-0.0032, 0.0014] | Negligible/inconclusive control contribution |
| Building/solar | 54.29 | [22.75, 98.17] | Positive control contribution on this fixture |

Prediction accuracy alone does not establish control value. Test departure MAE is 18.73 minutes versus 107.00 for the declared schedule. Energy MAE is 1.08 versus 3.77 kWh. Combined building/solar MAE is 1.13 versus 4.26 kW. Arrival MAE is **worse** (0.192 versus 0.171 vehicles/slot), while its RMSE improves (0.395 versus 0.455); both metrics are visible. Test interval coverage is 90.0%, 90.3%, 89.0% and 93.6%, respectively. These are marginal residual intervals, not simultaneous guarantees over a whole day.

An initial narrower validation search used departure quantiles 0.1/0.2/0.5 and a fixed weather multiplier of 0.5. It also selected EMS as fallback. The final search added a lower risk quantile and explicit weather allowances based on validation behaviour. The final report retains the same test populations; the observed near-tie against EMS is not used to select a test-winning operating policy. The core conclusion is unchanged.

## Demo, persistence and reproducibility

The standalone lab runs training and validation in a browser worker, supports stop, strict model import, model/evidence export, a frozen-model rerun and all four training curves. Results include every ablation, capacity/failure slices and per-vehicle requested/delivered energy. **Replay specialist system in 3D** hands off the exact fixture, configuration and model. The main twin identifies the fixture, exposes full AI and the validation-selected policy as separate rows, preserves model/scenario provenance in exports and can return to the original workplace.

Models remain in browser storage unless exported. The saved reference experiment is committed in `public/models/specialist-reference.json`; it is not customer data or a live model update. Reproduce it from the repository root:

```sh
npx tsc lib/twin/specialist-controller.ts --target es2022 --module commonjs --strict --skipLibCheck --outDir .test-build
node scripts/benchmark-specialists.cjs 140 42
```

The original 53 tests plus 12 specialist tests cover deterministic training, hidden-future isolation, observed-request boundaries, invalid imports, all ablations, physical caps, minimum current, energy conservation, remote fallback, validation selection, test seed isolation and main comparison provenance. Browser checks additionally train four models, import/export them, inspect uncertainty and ablations, verify mobile layout, replay the fixture in 3D and restore the original six-strategy demo. GitHub validation runs these checks alongside the production static build.

The previous GitHub Actions jobs failed before checkout with “The job was not acquired by Runner of type hosted even after multiple attempts.” Workflows are pinned to Ubuntu 22.04 for reproducible execution and to retry allocation on a different image. Local checks passed independently; remote deployment status is verified after publication.
