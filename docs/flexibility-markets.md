# EV Flexibility Twin

Forked from pli-poc/ev-energy-twin-ai-ems. The EMS simulator, annual synthetic data generation, compact MLP training, strategy comparison and replay lab remain independently accessible. No ChargeWeave runtime dependency or connection.

## Implemented

The /flexibility/ route models implicit tariff scheduling, congestion and illustrative aFRR/FCR/mFRR product profiles. It represents market roles, virtual qualification, grid location, driver participation, reserved capacity, baseline load, activation delay, faults, early departures, remote control failure, measured reduction and illustrative settlement. Exports use ev-flexibility-report/1 and include policy identity, model dataset fingerprint, assumptions, minute evidence and audit states.

The pool is identical depot replicas at one connection, not geographically diverse depots. Driver eligibility is seeded and stable. A conservative minimum baseline power across the entire window determines reduction capacity; previously reserved power is subtracted. Runtime energy guards can reduce delivery to protect scheduled departures. Unannounced early departures are applied to physical vehicle departure times and can still produce unmet energy demand. Cloud outages stop remote curtailment and expose delivery shortfalls.

ML comparison uses the actual compact MLP from the training lab or an imported validated model; no invented AI improvement. Each policy uses its own no-activation counterfactual. The baseline is frozen before activation and kept distinct from a configurable settlement baseline bias. The existing MLP learns charging decisions; it does not forecast plug-in probability or probabilistic pool availability.

## Product assumptions and limits

All market profiles are illustrative and unverified. They are not live TenneT/GOPACS eligibility definitions. FCR is explicitly rejected because the physical engine's 60-second sampling cannot verify 30-second response; local frequency capability alone does not remedy that. mFRR variants must not be treated as interchangeable. Real availability blocks, dynamic reserve signals, qualification evidence, authoritative baseline methods, multi-location pools, price datasets, reserve recovery and V2G remain further work. Capacity prices are EUR/MW/hour, energy and penalties EUR/MWh. Capacity revenue is prorated over this single simulated commitment; actual contracts may pay differently.

## Validation

GitHub Actions compiles the simulation and runs existing strategy, annual ML, replay and new flexibility invariants. Static production build and browser checks cover desktop/mobile navigation, the Flexibility Lab, rejection controls and evidence export. Ontology validation remains in a separate workflow.

## Future connection

A versioned JSON delivery report is the initial boundary for future ChargeWeave import. No live APIs, market bids or external settlement are performed. Forecast→offer→commitment→activation→measurement→settlement remains entirely virtual.
