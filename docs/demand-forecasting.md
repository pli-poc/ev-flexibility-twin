# Uncertain EV demand forecasting

The standalone `/forecasting/` lab compares a season-and-day-type historical average with a nearest-neighbour regression and a perfect-forecast reference. It preserves the existing EMS, single-teacher MLP and six-strategy learning demos. No ChargeWeave connection is needed.

## Model and observation boundary

Each synthetic depot day has uncertain arriving energy in 15-minute slots. Calendar, pre-day temperature and a noisy booking signal are observable features. Independent attendance and energy noise are hidden. Real arriving requests become observable at arrival; requests have four-hour charging deadlines. Individual departure uncertainty, state of charge, charger counts and reserve settlement are outside this first experiment.

The regression stores training examples and averages the nearest profiles. Validation selects 3, 7, 15 or 31 neighbours by mean absolute error, then calibrates a pooled 90% absolute-error interval across operating slots (06:00–18:00). The interval is diagnostic, not an input to dispatch. MAE in the comparison averages all 96 slots, including zero overnight demand.

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
