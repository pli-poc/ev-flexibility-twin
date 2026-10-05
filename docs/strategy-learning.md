# Learning from six strategies

## User flow

Open `/strategy-training/`, choose 35, 140 or 365 synthetic days and an objective, then start the browser-local Web Worker. Each scenario executes immediate, load balancing, deadline-aware, cheapest, peak-aware and total-cost-aware strategies through the same physical engine, activation window, availability check and exogenous failure. The worker reports progress, latest six-strategy outcomes and teacher label counts. It fits a selector, saves the validated model in browser storage and reports held-out results. Export the selector independently or export the full evidence. Choose a held-out day and replay it in `/flexibility/` with learned strategy selection enabled. The existing `/training/` charging MLP remains a separate single-teacher model.

## Model and leakage boundary

The selector is a supervised, standardized, distance-weighted nearest-neighbour classifier. Teacher labels are the lowest scored strategy for each scenario, determined in hindsight by running all six. It selects one strategy for an entire scenario; it does not switch policies within a session and is not reinforcement learning.

Input features contain declared site capacities, seasonal day, regional market, peak target, activation parameters, participation and already reserved capacity. They exclude realized cost, meter feedback, realized departures and the unexpected future failure flag. Synthetic preset failures are evaluated but not exposed as future selector inputs. These synthetic scenario parameters are illustrative pre-decision inputs, not real forecasts.

Whole calendar weeks stay in one split, following the existing week-block train/validation/test scheme. Normalization and neighbour examples use training rows only. Candidate k values 1, 3, 5, 7 and 9 are scored using mean regret on validation rows. Held-out test rows never enter scaling, examples or hyperparameter selection. A model package contains training examples and validated numerical parameters. Weighted vote share is not calibrated probability; standardized nearest distance indicates similarity, not a guaranteed out-of-distribution threshold.

## Objective and evaluation

The objective accounts for actual energy cost, capacity/delivery revenue, delivery penalties, aggregator fees, departure shortfall and safety penalties. The flexibility report's net value includes incremental charging cost. The selector therefore subtracts net flexibility from baseline charging cost, avoiding counting the incremental charge twice. Monthly peak-charge estimates remain separate from daily objective costs.

Each test day has outcomes for all six fixed strategies, the learned selection and the hindsight best oracle. The UI reports objective regret, exact label agreement, energy costs, net flexibility value, departure shortfalls, delivery shortfalls and unsafe minutes. The oracle is an evaluation bound, not a deployable policy. No superior performance or class diversity is assumed. Objective weights, thresholds and economics are synthetic assumptions; they can materially change winning labels.

## Physical execution

An optional power-transform hook applies virtual flexibility controls after the actual strategy requests power. It can only reduce allocated power. Classic strategies and optimized strategies both use this hook, so advanced planners continue replanning under their real dispatch logic rather than replaying fabricated policy labels. Unexpected early departure changes the physical departure time; faults disconnect charging and communication failures suppress remote curtailment. Original strategy paths are unchanged when no transform is supplied.

## Boundaries

Pool sites are identical replicas at one connection. Charging decisions use the existing engine's forecast assumptions. This implementation does not train availability probability, SoC forecasting, live-market qualification or subminute FCR control. Generated selector experiments use local congestion and implicit tariff scenarios; other market products remain available as illustrative flexibility profiles, not demonstrated market qualifications. A full synthetic year does not establish real-world effectiveness.

## Checks

GitHub Actions compiles and tests original simulation, ML, replay, flexibility and selector invariants. Selector checks cover real six-strategy outcomes, whole-week splits, training-only scaling/examples, validation-only tuning, no future-failure feature leakage, deterministic seeded outcomes and invalid model rejection. Browser checks exercise worker training, report/model export and held-out replay.
