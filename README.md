# EV Flexibility Twin — AI & Market Simulation

Standalone synthetic EV charging, AI training and virtual flexibility markets. The new [specialised AI lab](https://pli-poc.github.io/ev-flexibility-twin/specialists/) trains four separate neural predictors, evaluates shared-controller ablations and replays the same scenario in the 3D twin. Choose **Load reference experiment** for the saved 30-scenario run. [Full optimisation plan](docs/complete-optimisation-plan.md) · [results and limitations](docs/specialised-ai-controller.md). AI reduces unmet energy by 23.25% against the same planner without learning on the new recurring-pattern fixture; its advantage over the best fixed EMS is inconclusive, so the validation-selected default remains EMS. Open `/flexibility/` for the market lab, `/strategy-training/` for cost-sensitive learning across all six strategies with a fresh-seed benchmark, and `/training/` for the independent single-teacher charging MLP. See [flexibility model and limitations](docs/flexibility-markets.md) and [six-strategy learning](docs/strategy-learning.md).

# EV Energy Twin AI EMS

A standalone AI EMS prototype built on the EV Energy Twin optimizer. The twin remains the deterministic physical simulator. A synthetic replay lab now demonstrates versioned event handling, rules-based recommendations, safe dispatch validation, virtual charger responses and feedback reconciliation. The wider AI EMS and any live adapters remain gated by target-site review in [the build plan](docs/ai-ems-build-plan.md). The domain model is in [ontology/](ontology/); this repository has no ChargeWeave dependency.

## See the EMS demo

Open the [hosted simulation](https://pli-poc.github.io/ev-flexibility-twin/), choose a scenario and strategy, then use the timeline chart selector to switch between **Site power**, **Delivered energy**, **Selected tariff**, **Compare regions**, and **Environment**. All views follow the same simulation clock. The regional tariff curves and weather drivers are synthetic and labeled as such. Select **EMS control loop** below the chart to inspect how the selected time flows through signal assessment and dispatch to the virtual charger boundary and feedback stages. Try **EMS connection lost** around 10:00 to inspect a withheld remote command and local fallback, or **Restricted connection** around 09:00 to inspect a constrained dispatch.

Open the [synthetic replay lab](https://pli-poc.github.io/ev-flexibility-twin/replay/) to replay grid, solar, charger, connection-loss and infeasible-service fixtures. It records normalized events, rule assessments, command intent, virtual acknowledgement, separate meter feedback and reconciliation. It does not connect external feeds or send OCPP messages to equipment; its fixture subset is not a conformance test.

## Train and compare a learned policy

Open the [ML training lab](https://pli-poc.github.io/ev-flexibility-twin/training/) to generate a seeded, full-year synthetic dataset from the same Energy Twin simulator. It carries the selected scenario's charging and battery settings into the lab, varies seasonal demand and weather, and includes arrival and departure schedules, tariff profiles, user preferences, charger constraints, and battery state. Training and evaluation use week-grouped splits to reduce leakage between nearby days.

The lab fits a compact neural policy in a browser worker, reports held-out test metrics, and lets you save the model locally or export/import its JSON package. Returning to the twin makes the learned policy available as a seventh strategy alongside the six baselines; it remains subject to the simulator's physical safety limits. All generated data and results are illustrative and synthetic. A trained package stays in that browser's local storage unless exported, and this prototype does not train on operational charging data or deploy a live controller.


## Simulator development roadmap

Open the [interactive development roadmap](https://pli-poc.github.io/ev-flexibility-twin/roadmap/) for the current simulator capabilities, the ontology scope review gate, and the evidence-based sequence from deterministic synthetic event replay through safe recommendations, virtual charger feedback, resilience testing and later portability. The roadmap distinguishes today’s synthetic demonstrations from future EMS runtime and real-device work.
