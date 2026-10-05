# Complete EMS optimisation plan

This work adds several specialised learned predictors to one physical charging controller. The original twin, imitation network, strategy selector and forecast experiments remain available. ChargeWeaver and real chargers are not connected.

## Why this step is needed

The previous physical benchmark selected a forecast weight of zero. Its improvement came from scheduling, not AI. About 94% of missed energy in that fixture was explained by vehicle dwell limits, occupied parking bays and outages. More neural networks cannot remove those physical constraints.

The new experiment therefore keeps that fixture and adds a named **recurring-pattern synthetic scenario**. It has learnable driver, booking and weather signals, independent random variation, and both normal and saturated connections. Every comparator receives exactly the same vehicles, weather, tariffs, parking policy and outages. Results from this fixture must not be presented as results from real chargers or from the original random fixture.

## Execution checklist

1. [x] Define the scenario and observation boundary. Actual future arrivals, departures and weather belong only to the simulator and evaluation. Control can read declared bookings, historical driver descriptors, the published weather forecast and currently connected vehicles. Add independent training, validation and test seeds.
2. [x] Implement a reusable small neural network trainer with deterministic initialisation, feature scaling, validation checkpoint selection, bounded predictions and model import validation.
3. [x] Train four separate specialists: departure timing; arrival counts; requested energy per arrival; building and solar power. Calibrate prediction intervals using validation residuals. Display each specialist's error against an unlearned baseline, training curve and uncertainty coverage.
4. [x] Build one receding-horizon planner shared by every ablation. Learned departures adjust risk deadlines; arrival and energy forecasts price future competition for headroom; building/solar forecasts estimate future headroom. Current measured power, site capacity, vehicle power, remaining energy and communication fallback remain physical constraints.
5. [x] Select controller risk settings on validation scenarios only. Freeze weights, calibration and settings before generating the test scenarios. Compare the full controller with the same planner without learning, each specialist removed, each fixed strategy and validation-selected fallback. Report service, cost, weighted objective, violations, paired uncertainty, feasibility bounds and normal/stress slices.
6. [x] Add a standalone specialists lab with worker-based training, model inspection, model import/export, fresh-seed benchmark, per-vehicle service results and contribution table. Preserve the shared dark/mint style and existing demos.
7. [x] Integrate the trained bundle into the main 3D twin through an explicit replay handoff. Keep the original scenario selectable and make the new fixture and active controller visible.
8. [x] Test leakage boundaries, all ablations, deterministic training, invalid model rejection, physical caps, offline/stale fallback and frozen test isolation. Run existing tests, production build and browser/mobile replay checks.
9. [ ] Save a reproducible report with actual results and limitations, update project documentation, commit to the repository, run GitHub validation and verify Pages deployment.

## Evaluation rules

- Train neural weights on training data only. Use independent validation data for early stopping, interval calibration and controller settings. No test selection or retraining after seeing test results.
- Use several unseen seeds spanning seasons. Pair every policy on identical actual scenarios. Include normal capacity, saturated capacity, charger outages, early unplugging and communication loss.
- Compare to all fixed strategies and identify the best admissible fixed strategy on validation before testing. Also show the best fixed test score as a descriptive comparison, not a selection rule.
- Objective: electricity cost + EUR 20 per unmet kWh + EUR 1,000 per import-limit violation minute. Publish its weights and the separate physical metrics; a better weighted score does not automatically mean cheaper charging.
- A learned specialist has demonstrated control value only if removing it from the frozen controller makes the paired held-out objective worse. Prediction accuracy alone is insufficient. Report neutral or harmful specialists explicitly.
- Report paired bootstrap intervals and per-scenario win counts. Report fixed-site infeasibility bounds separately from avoidable scheduling loss. Bounds are evaluation diagnostics, never controller inputs.
- Use the validation-selected fallback if learning is unhelpful or a model is unavailable. Report both the full experimental AI controller and the selected operating policy so the fallback cannot conceal an unsuccessful AI experiment.
- Keep AC minimum-current and start/stop decisions in the physical guard. A local controller enforces present headroom when cloud telemetry is unavailable. Synthetic forecasts cannot establish real-time market prequalification, settlement baselines or real-world battery degradation.

## Completion criteria

The implementation is complete when all nine steps are checked, every specialist has its own trained weights and measured accuracy, all comparisons use the common physical engine and planner, model handoff and standalone demos work, and automated validation plus deployment have passed. No gain is assumed in advance. Any claim of improvement must quote the frozen test population and comparator.

## Execution evidence

The implementation and frozen 30-scenario report are in [specialised-ai-controller.md](specialised-ai-controller.md). Four independent neural predictors, the shared constrained planner, ablations, validation-selected fallback, standalone worker training, reference experiment, import/export and explicit 3D replay are implemented. All 65 simulation tests and the production static build pass. Full browser checks passed: worker training, strict import/export, all ablations, mobile layout, 3D replay and restoration of the original six-strategy demo. GitHub publication and deployment are recorded separately. The full controller improves service against the unlearned planner; it does not establish a reliable advantage over the strongest fixed EMS.
