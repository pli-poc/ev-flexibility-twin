# Departure and building/solar experiment

The departure and building/solar specialists reduce unmet energy by **25.58%** and complete **320 more vehicles** than the same planner without learning. Against the stronger deadline-aware EMS, they reduce unmet energy by **1.87%** and weighted loss by **1.60%**, while completing **62 fewer vehicles** and spending EUR 54.72 more. This supports their forecasting value; the service trade-off prevents an overall superiority claim. The validation-selected default remains EMS.

This follow-up tests the two uncertainty specialists that showed the clearest contribution in the [four-specialist experiment](specialised-ai-controller.md). It reuses the saved models and existing deterministic controller.

## Frozen evaluation

The [protocol](../experiments/uncertainty-only.json) fixes the model SHA-256, controller settings, five calendar dates, ten new seeds, all five operating conditions, six comparison arms and bootstrap method before execution. Model weights, validation residuals and controller settings come from the existing 140-day training run with seed 42 and independent validation seed 15443. The model package is frozen at SHA-256 `85d92e2e5ba79cb61abcdcc6d6cba8319c7cb8fc0437810a9d1569ddcf487d19`.

The evaluation crosses every date and seed with normal, saturated capacity, charger fault, remote offline and stale telemetry cases: **250 paired scenarios and 4,500 vehicle visits per arm**. Test seeds do not overlap training, validation or the previous 30-scenario benchmark. The same physical case, observed current energy requests, tariffs, charger count, grid connection and fallback behaviour apply to every arm.

| Arm | Learned departure | Learned building/solar | Controller |
|---|---|---|---|
| Neither specialist | Off | Off | Existing common planner |
| Departure only | On | Off | Same common planner |
| Building/solar only | Off | On | Same common planner |
| Both uncertainty specialists | On | On | Same common planner |
| Deadline-aware EMS reference | Off | Off | Existing strongest fixed EMS |
| Full system reference | On | On | Common planner with all four networks |

Arrival and energy networks are completely disabled in the four factorial arms. Those arms retain identical published booking counts and static arriving-energy estimates. The two-model case uses the existing settings: departure risk quantile 0.02, competition weight 0.08, weather uncertainty multiplier 0.5. The unlearned deadline margin remains the validation-selected zero minutes. Settings were previously selected for the full system; they are not retuned for the two-model variant.

The primary causal comparison is **both versus neither on the common planner**. The fixed EMS is an additional stronger reference; it has a different allocation algorithm, so this experiment does not establish the effect of injecting forecasts into that exact fixed EMS algorithm.

The frozen objective remains site energy EUR + 20 × unmet battery kWh + 1,000 × grid-violation minutes. Fully charged departures and cost are reported separately. The objective does not reward the number of fully charged vehicles directly, so fewer unmet kWh can coexist with fewer completed vehicles.

Intervals resample **whole seeds**, keeping all their dates, operating conditions and paired policies together, with 5,000 deterministic bootstrap resamples. Only ten synthetic seed clusters exist. Intervals are exploratory; new noise and dates within this deliberately learnable fixture do not establish generalisation to real sites or unseen driver populations.

The five dates are 70 days apart, so they all share the fixture's weekday index (`day % 7 = 1`). They cover seasons but do not exercise the Friday-specific departure shift. The protocol was fixed before this run; these results therefore have limited weekday coverage, and a broader calendar test would require a separately frozen evaluation.

## Results

| Controller | Site energy EUR | Unmet battery kWh | Fully ready / 4,500 | Grid violations (minutes) | Weighted loss |
|---|---:|---:|---:|---:|---:|
| Common planner, neither specialist | 43,010.14 | 18,274.92 | 2,461 | 0 | 408,508.49 |
| Common planner, departure only | 43,939.15 | 14,704.35 | 2,648 | 0 | 338,026.11 |
| Common planner, building/solar only | 43,692.03 | 15,629.11 | 2,604 | 0 | 356,274.28 |
| Common planner, both specialists | 44,212.64 | 13,600.77 | 2,781 | 0 | 316,227.97 |
| Deadline-aware EMS reference | 44,157.92 | 13,859.92 | 2,843 | 0 | 321,356.33 |
| Full four-specialist reference | 44,218.74 | 13,582.57 | 2,824 | 0 | 315,870.12 |

Adding both specialists to the common planner delivers **4,674.15 additional battery kWh**, reduces weighted loss by **22.59%**, and raises fully ready departures from **54.69% to 61.80%**. Site energy cost increases by EUR 1,202.50 alongside the additional charging delivered. This is a service improvement with higher expenditure; it is not equivalent-service cost savings.

Both models contribute when the other is already enabled:

| Comparison favouring both specialists | Mean weighted-loss advantage / scenario | 95% seed-cluster interval | Extra fully ready vehicles |
|---|---:|---:|---:|
| Both versus neither | 369.12 | [312.45, 427.80] | +320 |
| Add departure to building/solar only | 160.19 | [118.74, 203.99] | +177 |
| Add building/solar to departure only | 87.19 | [53.73, 127.38] | +133 |
| Both versus fixed EMS | 20.51 | [10.03, 33.98] | -62 |
| Both versus full four-model system | -1.43 | [-2.96, -0.28] | -43 |

The larger, condition-balanced experiment gives a positive weighted-loss advantage over fixed EMS within the synthetic seed bootstrap. Its unmet-energy advantage averages 1.04 kWh/scenario, with interval [0.51, 1.72]. However, the fully ready advantage is **negative** at -0.248 vehicles/scenario, with interval [-0.468, -0.012]. Weighted-loss wins/losses/ties against EMS are **120/127/3**. Improvements in aggregate energy do not mean every scenario improves or more drivers finish fully charged.

The reduced pair retains **99.61% of the full system's weighted-loss improvement over the unlearned planner**, but the full system completes **43 more vehicles** and has 18.20 kWh less unmet energy. This is a useful complexity reduction for a focused forecasting demo, with a measurable completion cost. This experiment adds arrivals and energy together in the full-system reference, so it cannot attribute that difference to either model individually.

## Operating-condition slices

Each condition contains 50 scenarios and 900 visits. All arms keep zero grid-violation minutes.

| Condition | Pair unmet kWh | EMS unmet kWh | Pair fully ready | EMS fully ready |
|---|---:|---:|---:|---:|
| Normal | 934.95 | 1,000.10 | 669 | 699 |
| Saturated capacity | 9,554.77 | 9,561.78 | 146 | 59 |
| Charger faults | 1,146.61 | 1,174.31 | 629 | 685 |
| Remote offline | 1,023.86 | 1,100.29 | 667 | 703 |
| Stale telemetry | 940.58 | 1,023.45 | 670 | 697 |

The pair has lower total unmet energy in each aggregate condition. Saturated capacity still dominates unmet energy, and the ready-vehicle outcome depends strongly on the condition. Remote loss activates the same local load-balancing logic; results can differ during those windows because earlier charging changes each vehicle's remaining need.

## Prediction quality and decision

Departure MAE is **18.17 minutes** versus 103.91 for the declared schedule. Combined building/solar output MAE is **1.43 kW** versus 4.51 for the published forecast. Marginal residual-interval coverage is **89.56%** for departures and **88.41%** for building/solar, against the 90% validation target. These empirical uncertainty ranges need further calibration before operational use.

Focus the AI demonstration on predicting departure and building/solar uncertainty, with deterministic EMS allocation and physical limiting. Preserve the full-system reference so the completion trade-off remains inspectable. The next controller decision depends on the service goal: minimising total missed kWh favours the forecast-informed planner here; maximising fully charged departures favours fixed EMS among these six variants. Freeze any revised service objective and select its settings on validation before using another fresh test population.

The default is retained from validation rather than switched to a test winner. The original 30-scenario reference still has its earlier inconclusive weighted comparison; the new result concerns this separate 250-scenario population, with a better-balanced condition matrix and seed-cluster intervals.

## Reproduce and verify

From the repository root:

```sh
npx tsc lib/twin/specialist-controller.ts --target es2022 --module commonjs --strict --skipLibCheck --outDir .test-build
node --test tests/uncertainty.cjs
node scripts/benchmark-uncertainty.cjs
node scripts/benchmark-uncertainty.cjs --verify
```

The first benchmark command writes [the evidence JSON](../public/models/uncertainty-evidence.json); `--verify` reruns all scenarios and requires an exact match to the saved evidence. The CLI evaluates contiguous seed groups in up to four worker threads, preserving the original sequential row and summation order. The model hash check rejects silently changed weights or settings. Five additional tests verify disabled-model isolation, exact baseline equivalence, shared physical limits and local fallback, seed isolation and immutable evaluation, and seed-cluster bootstrap direction. GitHub Actions runs these tests and reproduces the entire evidence package before the existing static build and browser checks.

Validation for implementation commit `36a3a57`: all five new local tests passed, and the parallel CLI reproduced the sequential evidence exactly on Node 24. GitHub's [simulation tests, exact Node 22 reproduction, production build and browser checks](https://github.com/pli-poc/ev-flexibility-twin/actions/runs/37392178350) passed. The [Pages deployment](https://github.com/pli-poc/ev-flexibility-twin/actions/runs/37392178412) succeeded, and the [live evidence JSON](https://pli-poc.github.io/ev-flexibility-twin/models/uncertainty-evidence.json) returned HTTP 200 with bytes identical to the committed file.
