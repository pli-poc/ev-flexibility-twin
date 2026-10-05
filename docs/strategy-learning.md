# Learning from six strategies

## User flow

Open `/strategy-training/`, choose 35, 140 or 365 synthetic days and an objective, then start the browser-local Web Worker. Each scenario executes immediate, load balancing, deadline-aware, cheapest, peak-aware and total-cost-aware strategies through the same physical engine, activation window, availability check and exogenous failure. The worker reports progress, latest six-strategy outcomes and teacher label counts. It fits a selector, saves the validated model in browser storage and reports held-out results. Export the selector independently or export the full evidence. Choose a held-out day and replay it in `/flexibility/` with learned strategy selection enabled. The existing `/training/` charging MLP remains a separate single-teacher model.

## Model and leakage boundary

The selector is a supervised, cost-sensitive, distance-weighted nearest-neighbour model. Training examples store the consequences of all six strategies, expressed as per-depot regret above each scenario’s best score. Hindsight winner labels remain for reporting; they no longer drive decisions alone. It selects one strategy for an entire scenario; it does not switch policies within a session and is not reinforcement learning.

Input features contain declared site capacities, seasonal day, regional market, peak target, activation parameters, participation, reserved capacity and declared vehicle demand/stays. Demand features include requested energy, fleet share, required charging power and load-to-capacity ratios. They exclude realized cost, meter feedback, realized departures and the unexpected future failure flag. Synthetic preset failures are evaluated but not exposed as future selector inputs. These synthetic scenario parameters are illustrative pre-decision inputs, not real forecasts.

Whole calendar weeks stay in one split, following the existing week-block train/validation/test scheme. Normalization and neighbour examples use training rows only. Validation selects among neighbour counts, three predeclared feature-weight profiles, shrinkage toward training-average regret and switching margins. The best validation fixed strategy is an explicit fallback candidate: the model must earn a switch on validation score. Predictions estimate per-strategy costs rather than voting only on winners. Internal held-out rows never enter scaling, examples or hyperparameter selection. After fitting, a fresh dataset is generated with seed `(trainingSeed + 104729) % 100001`; every row is evaluated as an external test. The model is frozen before these outcomes are generated. A model package contains training examples and validated numerical parameters. Neighbour winner-label agreement is not calibrated probability and does not drive selection; standardized nearest distance indicates similarity, not a guaranteed out-of-distribution threshold.

## Objective and evaluation

The objective accounts for actual energy cost, capacity/delivery revenue, delivery penalties, aggregator fees, departure shortfall and safety penalties. The flexibility report's net value includes incremental charging cost. The selector therefore subtracts net flexibility from baseline charging cost, avoiding counting the incremental charge twice. Monthly peak-charge estimates remain separate from daily objective costs.

Each fresh benchmark day has outcomes for all six fixed strategies, the learned selection and the hindsight best oracle. The UI reports objective regret, exact label agreement, energy costs, net flexibility value, departure shortfalls, delivery shortfalls and unsafe minutes. The oracle is an evaluation bound, not a deployable policy. No superior performance or class diversity is assumed. Objective weights, thresholds and economics are synthetic assumptions; they can materially change winning labels.

## Physical execution

An optional power-transform hook applies virtual flexibility controls after the actual strategy requests power. It can only reduce allocated power. Classic strategies and optimized strategies both use this hook, so advanced planners continue replanning under their real dispatch logic rather than replaying fabricated policy labels. Unexpected early departure changes the physical departure time; faults disconnect charging and communication failures suppress remote curtailment. Original strategy paths are unchanged when no transform is supplied.

## Boundaries

Pool sites are identical replicas at one connection. Charging decisions use the existing engine's forecast assumptions. This implementation does not train availability probability, SoC forecasting, live-market qualification or subminute FCR control. Generated selector experiments use local congestion and implicit tariff scenarios; other market products remain available as illustrative flexibility profiles, not demonstrated market qualifications. A full synthetic year does not establish real-world effectiveness.

## Checks

GitHub Actions compiles and tests original simulation, ML, replay, flexibility and selector invariants. Selector checks cover real six-strategy outcomes, whole-week splits, training-only scaling/examples, validation-only tuning, no future-failure feature leakage, deterministic seeded outcomes and invalid model rejection. Browser checks exercise worker training, report/model export and held-out replay.

## Recorded seed-42 full-year validation

A local 365-day run with default objective weights completed with 211 training, 77 validation and 77 held-out test days. Validation selected k=9. Held-out exact best-strategy agreement was 67.53%; mean objective regret against the hindsight oracle was 231.12. The learned selector's total weighted objective was 6,084,068.69 versus 6,074,821.27 for the best fixed deadline-aware strategy, so learned selection did not outperform it. These objective units include large illustrative safety/service penalties and are not financial savings. Learned selection recorded 610 import-violation minutes versus 601 for the best fixed strategy. Violations can also reflect uncontrollable building demand. All six strategies received some winning labels over the year. This is verification of the experiment, not a claim of real-world model quality.

## Version 2 independent benchmark

Training/validation seed 42, 365 days, default objective weights; 211 training examples and 77 validation days. Internal test rows were excluded from model fitting and candidate selection. The cost model selected k=9, the demand-focused feature profile, no prior shrinkage and zero switching margin. Validation regret was 86.605 versus 249.403 for the fixed cheapest fallback. Model parameters were frozen before evaluating a separate full year with seed 4770.

On all 365 independent scenarios, the improved model scored 32,368,313.832 objective units, versus 34,932,195.007 for the original winner-voting selector fitted/tuned on the same original training/validation groups (7.34% reduction). The best fixed deadline-aware strategy scored 32,377,336.566; the model’s advantage was 9,022.734 units, about 0.028%. Mean regret versus the hindsight oracle was 199.359 and exact best-label agreement was 45.75%. Lower label agreement did not prevent a better objective: costly errors matter more than exact labels.

The improved model and best fixed strategy both recorded 4,140 import-violation minutes (the original selector recorded 4,871). Building demand can make some violations unavoidable. The improved model had 931,037.897 kWh unmet departure demand versus 930,159.949 for the best fixed strategy, and 3,847.377 kWh flexibility shortfall versus 2,310.231. Energy cost was lower, but service was not identical; this must not be described as equivalent-service savings. The measured result is a modest objective win on one independent synthetic year, not universal AI superiority.

Model packages use `ev-strategy-selector/2` and a separate browser-storage key. Version-1 winner-classifier packages require retraining; existing charging-MLP packages are unaffected. The UI now benchmarks fresh-seed scenarios automatically, exports both datasets and opens replays using the benchmark seed.
