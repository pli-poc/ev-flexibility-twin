# Uncertain EV demand forecasting

The standalone `/forecasting/` lab compares a season-and-day-type historical average with a nearest-neighbour regression and a perfect-forecast reference. It preserves the existing EMS, single-teacher MLP and six-strategy learning demos. No ChargeWeave connection is needed.

## Model and observation boundary

Each synthetic depot day has uncertain arriving energy in 15-minute slots. Calendar, pre-day temperature and a noisy booking signal are observable features. Independent attendance and energy noise are hidden. Real arriving requests become observable at arrival; requests have four-hour charging deadlines. Individual departure uncertainty, state of charge, charger counts and reserve settlement are outside this first experiment.

The regression stores training examples and averages the nearest profiles. Validation selects 3, 7, 15 or 31 neighbours by mean absolute error, then calibrates a pooled 90% absolute-error interval across operating slots (06:00–18:00). In the initial controller the interval was diagnostic; the extension below uses it to size a future-demand reserve. MAE in the comparison averages all 96 slots, including zero overnight demand.

Training seed is user-selected; validation uses seed + 7919; the independent benchmark uses seed + 104729. All sets span the same calendar range but have independent synthetic realizations. This is an independent-noise test, not evidence of generalisation to another depot or an unseen seasonal regime. Test outcomes never tune the model.

## Common controller

All methods use one rolling capacity-reservation heuristic. Future predicted arrivals reserve cheap capacity; observed requests then allocate remaining capacity by deadline and price. Only actual arrivals at or before the current slot enter dispatch. Actual future energy is supplied only to the perfect-forecast reference. Prices and available site capacity are identical and known across methods. The reference is not a global optimiser or a guaranteed cost lower bound.

## Reproducible first benchmark

365 training days, seed 42; validation seed 7961; frozen k = 7; 365 benchmark days, seed 104771:

| Forecast | MAE kWh/slot | Cost € | Unmet energy kWh | Capacity violations |
|---|---:|---:|---:|---:|
| Historical average | 1.402806 | 10579.66 | 0 | 0 |
| Learned | 1.324842 | 10591.57 | 0 | 0 |
| Perfect reference | 0 | 10585.85 | 0 | 0 |

Learned MAE improves 5.56%; nominal 90% range achieves 90.50% coverage. All methods deliver 90673.56 kWh. Learned dispatch costs €11.91 more than the average forecast. This demonstrates forecast accuracy improvement, not cost savings. More accurate forecasts do not automatically improve a reservation heuristic. An uncertainty-aware controller and constrained-depot stress tests are subsequent work, not implemented claims.

Export contains the frozen model and all paired day-level inputs, predictions and dispatch traces. Tests enforce future-demand isolation, identical-controller behaviour, determinism, energy conservation and capacity limits. Browser tests exercise training, evidence export and mobile layout.

## Uncertainty-aware controller extension

The controller now adds a validation-selected fraction of the calibrated error radius to future operating-slot reservations. It also applies a feasibility guard: observed deadline requests must charge now when remaining future physical capacity cannot cover them. The guard uses only already-arrived requests. Compare five policies: historical means, learned means, learned means with guard, uncertainty with guard, and perfect forecasts with guard. The guarded-mean ablation separates the value of the buffer from the guard. All policies share physical capacity and tariffs.

A separate 35-day controller-validation set (seed + 15401) chooses one buffer from 0, 0.25, 0.5 and 1. The objective is charging cost + €20 per unmet kWh; this is an illustrative service preference. Tuning includes 100%, 65% and 45% capacity. One buffer is frozen across all limits. The new benchmark uses seed + 209759, distinct from the previous forecasting benchmark. Demand forecasts and controller settings are frozen before generating it. The public UI switches capacity and shows both forecast and dispatch traces; exported evidence contains all three limits and five policies.

### New independent benchmark

365-day predictor, seed 42; controller validation seed 15443; selected buffer 1; 365 fresh paired days, seed 209801:

| Headroom | Mean + guard unmet kWh | Uncertainty unmet kWh | Reduction | Mean + guard cost € | Uncertainty cost € |
|---|---:|---:|---:|---:|---:|
| 100% | 0 | 0 | None | 11036.39 | 11461.32 |
| 65% | 418.49 | 326.23 | 22.0% | 12492.63 | 12836.37 |
| 45% | 4870.23 | 4183.22 | 14.1% | 13610.66 | 13837.22 |

All runs have zero capacity violations. At 65%, uncertainty delivers 92.25 additional kWh at €343.74 higher cost. At 45%, it delivers 687.00 additional kWh at €226.55 higher cost. Thus this experiment demonstrates improved deadline service under constrained capacity, not cheaper charging. At full headroom the reserve is unnecessary and raises cost by €424.94. The uniform buffer intentionally exposes that tradeoff. Forecast interval coverage is 89.77%; learned MAE is 1.354718 versus 1.408973 for historical means on this new test.

Uncertainty is a conservative planning allowance, not a probabilistic guarantee of joint future demand. Perfect forecasts still use a heuristic and can be outperformed on service by an inflated reserve. Grid limits do not remove infeasibility; unmet demand remains visible. Individual charger/session dynamics and flexibility settlement remain outside this aggregate experiment.

## Adaptive activation

An additional adaptive policy activates the uncertainty reserve only when pre-day forecast pressure exceeds a validation-selected threshold. Pressure is the maximum four-hour forecast arriving energy divided by physical energy headroom over the same window. It uses the frozen forecast and known capacity, not actual future arrivals. It is a heuristic pressure indicator, not proof of infeasibility. When inactive, dispatch is exactly the guarded mean controller.

Controller validation jointly selects buffer and threshold from buffers [0, 0.25, 0.5, 1] and thresholds [0, 0.5, 0.65, 0.8, 1, 2]. The fixed reserve remains a separate ablation. Predictor and policy are frozen before a new independent benchmark, seed + 314159. Seed 42 selects buffer 1 and pressure threshold 1 on controller validation seed 15443.

365 fresh days, benchmark seed 314201:

| Headroom | Mean unmet kWh | Fixed/adaptive unmet kWh | Fixed cost € | Adaptive cost € | Active reserve days |
|---|---:|---:|---:|---:|---:|
| 100% | 0 | 0 | 11355.62 | 10950.04 | 8 |
| 65% | 349.04 | 246.48 | 12694.05 | 12371.58 | 135 |
| 45% | 4770.40 | 4003.32 | 13732.10 | 13628.95 | 271 |

All policies respect capacity. Adaptive and fixed reserve achieve the same aggregate deadline service on this benchmark; adaptive saves €322.47 and €103.15 at the constrained levels. Relative to guarded mean forecasts, adaptive reduces unmet demand 29.4% and 16.1%, with extra charging cost €7.79 and €126.63. At full headroom guarded mean cost is €10945.49, so adaptive retains €4.55 extra cost versus €410.13 for the fixed reserve. Activation substantially reduces unnecessary reserve cost; it does not eliminate false-positive pressure days. These are synthetic, aggregate-depot results, not production or market-revenue evidence.
