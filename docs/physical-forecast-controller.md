# Forecast control in the physical twin

`/forecast-controller/` trains arrival-energy forecasts from the existing minute-level twin’s own vehicle generator, then tests per-vehicle dispatch. The original standalone aggregate forecast lab and compact imitation-ML lab remain separate. The main 3D twin exposes a saved physical forecast model as an additional controller, with a toggle and comparison row. A selected disturbed benchmark scenario can be replayed in 3D.

## Model and planner

Historical examples record 15-minute arriving AC energy (requested battery energy / 0.9). Observable features are calendar, depot type and building-demand setting. Calendar season is represented by sine/cosine. Training does not reuse the aggregate lab’s booking-signal model: that signal has no equivalent in this generator.

Validation on independent seed + 7919 selects 3, 7 or 15 neighbours and estimates a pooled 90% operating-slot absolute-error radius. A separate 12-scenario controller validation set (seed + 15401) selects buffer 0, 0.5 or 1 using site energy cost + 20 × unmet kWh + 1000 × violation minutes. The pressure threshold is a fixed illustrative rule of 1. The model is frozen before three independent benchmark seed streams are generated. Test seeds are (seed + 104729), (seed + 130363), and (seed + 155921), each modulo 100001. Calendar days overlap training; the test measures independent noise and failures, not unseen-depot or unseen-season generalisation.

The planner uses connected requests and declared departures. A learned forecast reserves future capacity; remaining physical capacity is scheduled for connected vehicles by urgency and price. It rebuilds each quarter-hour or when charger availability changes. Minute-level urgency protects vehicles that cannot defer further. Individual maximum power, requested energy, parking delay, queue, site headroom and the existing battery model are enforced by the common engine. Future building/PV is a perfect synthetic forecast; future battery support is not assumed. The main twin honours its selected regional tariff.

Forecast reservations use a two-hour dwell assumption and a six-hour planning horizon. The algorithm is a heuristic, not an optimal controller. Vehicle minimum AC current, charging curves, measured telemetry noise and protocol deadlines are not added by this integration.

## Unexpected events and observation boundary

Early unplugging moves actual departure 90 minutes earlier for every fifth vehicle, with a minimum 30-minute dwell. Late arrivals move actual arrival 45 minutes later, retaining at least 30 minutes before departure. These transformations do not rewrite declared departure times. Built-in and advanced comparators receive declared observations too, preventing advance knowledge of early unplugging.

Fault scenarios use the engine’s charger 03/04 outage. Offline control uses its local fallback. Stale telemetry is an explicit simulated communication-unavailable window from 11:00 to 11:30; all policies use local load balancing then. It does not simulate a telemetry-age detector or OCPP communication. Protocol feedback and acknowledgements remain in the existing replay lab.

The controller ignores the engine’s future vehicle list and only looks up nominal request metadata for connected IDs. Tests alter the supplied actual vehicle metadata and confirm unchanged planner output. No future actual arrivals or surprise departure times enter the AI plan. The physically enforced current budget is always available to local control.

## First extended physical benchmark

140 training days; seed 42; k = 15; validation forecast MAE 4.8575 kWh/slot versus historical 4.9838; selected buffer 0.5. Frozen model tested on 14 days per independent seed 4770, 30404 and 55962 (42 paired scenarios), with all six disturbance types and six existing strategies plus three forecast policies:

| Policy | Site energy € | Unmet battery kWh | Ready / departed | Violation minutes | Weighted score |
|---|---:|---:|---:|---:|---:|
| Load balancing | 7031.96 | 11428.47 | 681 / 1491 | 0 | 235601.34 |
| Deadline-aware | 7075.12 | 11272.68 | 662 / 1491 | 0 | 232528.77 |
| Cheapest | 6827.73 | 11280.97 | 694 / 1491 | 0 | 232447.20 |
| Learned mean | 6978.10 | 11292.37 | 671 / 1491 | 0 | 232825.44 |
| AI forecast | 6978.09 | 11292.37 | 671 / 1491 | 0 | 232825.43 |

The forecast controller is safe in this benchmark, but does not outperform the best fixed controller (cheapest). It costs €150.36 more, has 11.39 additional unmet kWh, and 23 fewer completed departures. Its uncertainty reserve has negligible aggregate effect versus learned mean. The aggregate lab’s earlier gains therefore have not been established in the detailed physical twin. The UI reports this rather than claiming transferred savings.

The underlying vehicle generator includes requests that exceed the maximum energy deliverable during a vehicle’s dwell. These are preserved across policies; the lab shows a per-vehicle physical lower bound on unmet energy, excluding queue and fault losses. Cost differences cannot be claimed as equivalent-service savings without checking individual delivery and terminal battery energy. The main comparison retains its vehicle-level equivalence checks.

## Validation and evidence

Physical tests verify maximum power and requested-energy caps, departure/arrival behaviour, grid safety under disturbances, energy conservation, hidden-future isolation, blocked remote dispatch during stale telemetry and identical disturbed vehicle schedules across comparisons. Browser tests train, export, inspect a disturbed scenario, check mobile layout, and hand it to the selected forecast row in the 3D twin. Evidence exports include the model, seed streams, paired metrics and inspected physical frames. Main comparison exports include disturbance and model identity in the scenario fingerprint.
