# Departure forecasts in a service-focused EMS hybrid

The departure predictor has useful control value in this synthetic twin. In the final frozen test, enabling it in the **identical hybrid** produced **708 more fully ready departures and 5.62% less unmet energy**, with zero grid violations. This comparison holds the dispatch rules and controller settings fixed, so it isolates the effect of the forecast.

The hybrid has **not passed the overall improvement gate**. Compared with validation-selected load balancing, it completed 746 more charges, but its 0.085% unmet-energy advantage was inconclusive. Normal and stale-telemetry conditions had more unmet energy. Under tight capacity, an independently tuned unlearned hybrid completed more charges. The existing validation-selected EMS operating default is retained.

The valuable component demonstrated here is departure forecasting for constrained charging. These results do not establish commercial savings, superiority on real sites, or the need for several active neural networks.

## What changed

`lib/twin/service-hybrid.ts` adds an experimental controller alongside the existing controllers. It uses a conditional departure quantile: when a vehicle is still connected, it removes calibrated departure residuals implying that it already left. The controller estimates charging time from the current requested energy, delivered energy, efficiency and charger power.

It prioritises feasible near-finished requests, then other feasible requests by urgency, then best-effort completion of infeasible targets. The final refinement first reserves a fair share of measured available power, water-filling among active requests and respecting charger/request caps. The remaining budget follows the completion priorities. It retains the existing price-related deferral rule.

The shared physical simulator still caps dispatch by current headroom, charger rating and remaining energy. Charging has a 1.4 kW minimum with start/stop, allowing a final partial minute to finish a request. A three-kW import buffer is retained. Unavailable communication and stale telemetry use local load balancing. Synthetic stale telemetry is modelled as a blocked remote-control interval, not corrupted sensor values or a complete communications stack.

Future actual departures and weather do not cross the controller boundary. Actual arrival and requested energy become observed on connection; known bookings and published forecasts are available beforehand. Full vehicles occupy their bay until departure. Hindsight is used only to evaluate outcomes and compute the no-EV billing counterfactual.

The frozen bundle still contains four separately trained 16-hidden-unit tanh networks. Training used 140 days, seed 42, with 70 independent validation days, seed 15443. **Only the departure network is active in the selected service hybrid.** Building/solar planning was tested in the first validation grid and was not selected. Arrival and requested-energy predictions are excluded from both service experiments. The earlier four-specialist lab and two-specialist uncertainty experiment remain available separately.

Canonical model SHA-256, using JavaScript `JSON.stringify(model)`:

`85d92e2e5ba79cb61abcdcc6d6cba8319c7cb8fc0437810a9d1569ddcf487d19`

## Frozen selection and evaluation

Both rounds used the same controller-validation population: days 21–27 and 203–209, seeds 15443 and 90214, crossed with normal, tight-capacity, charger-fault, offline and stale conditions. That gives 140 scenarios and 2,520 visits. Controller settings were written to a validation artifact before each test was executed. No model weights were retrained.

The fixed reference was chosen by grid safety, then most fully ready departures, then least unmet energy, then incremental EV bill. **Load balancing** was selected. The older experiments selected EMS using a different weighted cost/unmet objective; the completion objective here deliberately tests another service goal.

Learned candidates first had to achieve at least one percentage point more ready departures, lower unmet energy, zero grid violations and no more than 1% higher incremental cost per delivered battery kWh against that fixed reference on validation. Qualifying candidates were ranked by ready departures, unmet energy and incremental bill. If none qualified, the best candidate would remain an explicitly unaccepted experiment. The unlearned hybrid was tuned independently by readiness-first ranking.

| Round | Candidate grid | Frozen learned settings | Frozen unlearned settings | Fresh test matrix |
|---|---|---|---|---|
| Initial service hybrid | AI quantile 0.1/0.5/0.8 or static margin 0/60/180 min; headroom weight 0/1; slack/completion modes | Quantile 0.8, completion, headroom 0, no fair-share reservation | Static margin 180 min, completion, headroom 0 | Days 28–34, 119–125, 210–216, 301–307; eight new seeds |
| Final fair-share refinement | AI quantile 0.1/0.5/0.8 or static margin 0/60/180 min; completion mode; fair share 25%/50%/75% | Quantile 0.5, completion, headroom 0, fair share 25% | Static margin 180 min, completion, headroom 0, fair share 25% | Days 35–41, 126–132, 217–223, 308–314; another eight new seeds |

Initial test seeds: 13579, 24680, 35791, 46802, 57913, 68124, 79235, 86420.

Final test seeds: 12203, 23317, 34429, 45541, 56657, 67771, 78883, 89989.

Each test crossed eight seeds, 28 days and five conditions: **1,120 paired scenarios, 20,160 visits, all seven weekdays and four seasonal windows**. Each seed represents a recurring synthetic driver population; the condition variants reuse its day/vehicle draws. These are repeated synthetic visits, not 20,160 independent real drivers. Test seeds are disjoint from training, controller validation and the earlier evaluations. Final test dates are disjoint from controller validation and the initial service test.

Uncertainty uses 5,000 paired bootstrap resamples of **whole seeds**, rather than treating repeated days and conditions as independent populations. There are eight independent seed clusters per round. These intervals describe this generator, not deployment performance.

The initial test failed its overall gate. The fair-share refinement was developed on the existing validation population after that failure, then tested on a new matrix. The first failed result is preserved. The final settings have not been tuned against the final test results.

## Final test results

| Controller | Ready / 20,160 | Unmet kWh | Site energy € | Incremental EV cents / battery kWh | Grid violation minutes |
|---|---:|---:|---:|---:|---:|
| Immediate, uncontrolled | 16,710 | 20,252.81 | 207,698.04 | 25.131 | 171,926 |
| Load balancing | 13,385 | 62,565.79 | 196,818.93 | 25.057 | 0 |
| Deadline-aware EMS | 12,920 | 61,503.03 | 197,098.72 | 25.061 | 0 |
| Cheapest energy | 8,235 | 105,666.07 | 185,510.14 | 24.878 | 0 |
| Peak-aware | 3,962 | 125,591.01 | 180,837.10 | 24.985 | 0 |
| Total-cost-aware | 7,509 | 112,515.94 | 183,842.55 | 24.891 | 0 |
| Forecast-informed hybrid | **14,131** | **62,512.50** | 196,827.56 | 25.055 | 0 |
| Independently tuned hybrid without AI | 13,785 | 67,487.69 | 195,557.62 | 25.048 | 0 |
| Same hybrid, AI switched off | 13,423 | 66,238.30 | 195,885.12 | 25.052 | 0 |

Uncontrolled charging is shown for context and excluded as a safe reference. Lower bills from delivering less energy are not sufficient evidence of a better EMS.

| AI comparison | Extra ready departures | Ready-rate gain | Unmet-energy reduction | Unit-cost change | Strict comparison gate |
|---|---:|---:|---:|---:|---|
| Same hybrid, AI switched off | +708 | +3.512 percentage points | 3,725.81 kWh / 5.625% | +0.011% | Passed |
| Independently tuned hybrid without AI | +346 | +1.716 percentage points | 4,975.19 kWh / 7.372% | +0.029% | Failed: tight-capacity readiness regression |
| Load balancing | +746 | +3.700 percentage points | 53.30 kWh / 0.085% | −0.006% | Failed: condition regressions and inconclusive energy interval |

Paired 95% intervals, expressed as AI advantage per scenario:

| Reference | Completed departures, mean [95% interval] | Unmet kWh avoided, mean [95% interval] |
|---|---:|---:|
| Same hybrid, AI switched off | 0.632 [0.585, 0.682] | 3.327 [3.108, 3.559] |
| Independently tuned hybrid without AI | 0.309 [0.254, 0.359] | 4.442 [4.279, 4.600] |
| Load balancing | 0.666 [0.620, 0.712] | 0.048 [−0.185, 0.325] |

The departure predictor passes the causal comparison on both service metrics and all five condition aggregates. The stronger practical comparisons still expose tradeoffs. Deadline-aware EMS also delivers more total energy than the learned hybrid despite completing fewer vehicles.

Condition results against load balancing:

| Condition, 4,032 visits each | AI ready | Balanced ready | AI unmet kWh | Balanced unmet kWh |
|---|---:|---:|---:|---:|
| Normal | 3,372 | 3,222 | 5,171.10 | 4,840.39 |
| Tight capacity | 797 | 587 | 42,599.83 | 42,724.84 |
| Charger fault | 3,261 | 3,132 | 5,227.94 | 5,319.79 |
| Offline | 3,334 | 3,222 | 4,484.76 | 4,840.39 |
| Stale telemetry | 3,367 | 3,222 | 5,028.87 | 4,840.39 |

Under tight capacity, the independently tuned unlearned hybrid completes **995** targets versus AI's **797**, but leaves 534.01 kWh more unmet. Prioritising complete visits and maximising total delivered energy can conflict when capacity is insufficient.

## Preserved initial test

The initial service hybrid had 14,079 ready departures versus 13,509 for load balancing, but left 123.72 kWh more unmet. It failed the overall gate. Enabling its departure predictor in the identical hybrid still produced 502 more ready departures and 6.346% less unmet energy. Against the independently tuned unlearned hybrid it gained only 174 ready departures, below the one-percentage-point threshold, and regressed on tight-capacity readiness.

Initial and final tests use different seeds/dates. Their raw totals are not a paired estimate of the benefit of adding fair share. The final test answers whether the refined, validation-selected candidate works on its own new population.

## Cost, admission and product decision

Incremental EV bill is the actual site bill minus a same-weather no-EV counterfactual with the same export cap and tariff. All test fixtures have battery storage disabled. Dividing this bill by delivered battery kWh makes service volume visible but does **not** prove savings at equivalent driver outcomes.

The final AI costs €942.44 more than its identical unlearned version while delivering 3,725.81 additional battery kWh and completing 708 more visits. Against load balancing, its site bill is €8.64 higher. Its unit costs are nearly unchanged. The value demonstrated is improved service through forecasts, not a large electricity saving.

Overall admission requires all three references to pass: zero grid violations; at least one percentage point more ready departures; lower unmet energy; at most 1% higher incremental unit cost; no ready/unmet regression in any condition; and positive lower bootstrap bounds for both service metrics. The final experiment remains **unaccepted overall**. The same-controller ablation passes; that does not override the failed practical comparisons.

Keep the predictor and hybrid as an inspectable experiment in the standalone AI lab. Keep the existing operating default. The next meaningful evidence is a read-only replay of real charging sessions, held out by time and site, with departure/request observations restricted to what was known at each decision. That replay should compare forecasting against calibrated non-neural estimates and compare service, fairness and cost at agreed operational targets. More synthetic tuning cannot establish that site value.

ChargeWeaver, live chargers and market settlement are not connected. This experiment does not establish reserve-product eligibility, dispatch latency, baseline accuracy or realised flexibility revenue.

## Reproduce and inspect

Open [the standalone AI lab](https://pli-poc.github.io/ev-flexibility-twin/specialists/). The service section loads a small summary derived directly from the full frozen result. It compares references, exposes every acceptance check and condition, downloads the full evidence and replays any test day with the matching model. The replay verifies the model's SHA-256 and does not change the original training experiment or browser operating default.

Artifacts:

- Initial protocol, selection and full rows: `experiments/service-hybrid.json`, `public/models/service-hybrid-validation.json`, `public/models/service-hybrid-evidence.json`.
- Final protocol, selection and full rows: `experiments/service-balanced.json`, `public/models/service-balanced-validation.json`, `public/models/service-balanced-evidence.json`.
- Demo summary, including full-result SHA-256: `public/models/service-proof.json`.

```sh
npm ci --no-audit --no-fund
npx tsc lib/twin/service-hybrid.ts --target es2022 --module commonjs --strict --skipLibCheck --outDir .test-build
node --test tests/service-hybrid.cjs tests/service-evidence.cjs
node scripts/benchmark-service.cjs --verify
node scripts/benchmark-service.cjs --balanced --verify
```

For development, `--validate` selects and writes settings for the initial protocol; `--balanced --validate` does the same for the final protocol. Verification intentionally loads those frozen files instead of reselecting settings. GitHub Actions verifies both full JSON results byte for byte, checks the demo summary, runs the simulator regression suite, builds the static application and exercises the browser replay/download paths.

Local verification passed: 81 simulator/model tests, exact reproduction of both service results and the demo summary, production static build, and the full desktop/mobile browser suite. The new browser checks download the exact full-result hash and reproduce normal/tight paired days against all three practical references. The original training, six-strategy comparison, 3D handoff and replay flows also pass.
