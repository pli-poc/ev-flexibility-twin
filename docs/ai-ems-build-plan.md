# AI EMS build plan

**Status:** Ontology v0.2 is the semantic baseline. A synthetic reference lab now exercises deterministic event replay through virtual command, meter feedback and reconciliation. The Phase 1 target-site scope review remains open; the lab supports contract review and does not authorize site-specific, live or production dispatch work.

## Goal

Extend the existing EV Energy Twin optimizer into an explainable, closed-loop energy management system. It will consume grid, market, site, solar, storage, vehicle, session and charger information; assess incoming flexibility signals; produce a feasible charging plan; issue charger commands through a protocol adapter; and reconcile acknowledgements and measured charger behavior back into the twin.

The first implementation stays in `ev-energy-twin-ai-ems`. Its ontology and interfaces should be portable later, but there is no ChargeWeave dependency or integration in this phase. A visual modeling surface is not a prerequisite: the first deliverables are the semantic model, validated data contracts, simulation behavior and evidence from tests.

## Operating boundary

The AI layer interprets and prioritizes context. It may classify a grid event, explain its impact, estimate the flexibility that could be offered, and recommend one of the existing strategies. A deterministic planner then computes power allocations against hard physical, contractual, customer and equipment limits. A final command validator checks those allocations before the protocol adapter sends them.

The AI model must not issue charger commands, invent measurements, override a safety limit, or claim that a requested response was delivered. The system records each decision, its input snapshot and model/rule version, each command and acknowledgement, and the feedback used to assess the actual result. A local safe charging mode remains available if the EMS connection, signal feed or AI component is unavailable.

## Closed-loop behavior

1. Receive source events and measurements, preserving the source, event time, recorded time, validity window, unit and quality.
2. Normalize them into a time-stamped EMS input snapshot. Reject invalid values and explicitly mark missing, stale or estimated inputs.
3. Reconcile the snapshot with the twin's site assets, active sessions, vehicle energy requests, departure times, charger capabilities and current measured state.
4. Assess OpenADR or other flexibility events. Produce a structured impact, urgency, flexibility estimate, confidence, explanation and recommended strategy. An unavailable or low-confidence AI assessment falls back to deterministic rules.
5. Run the selected charging strategy through the existing physical engine. Preserve Immediate, Load balancing, Deadline-aware, Cheapest, Peak-aware and Total-cost-aware as comparable strategies; the AI selects or explains a strategy but does not replace their shared safety and physics model.
6. Validate the resulting plan against import/export limits, EVSE and connector limits, session deadlines, minimum service policy, storage limits, event duration and command freshness.
7. Convert validated allocations into protocol-neutral command intents, then encode them through a versioned OCPP adapter. Record correlation IDs and expiry times before sending.
8. Ingest charger acknowledgements and subsequent status, meter, power and (when available) vehicle state feedback. Correlate every response with the command, EVSE, connector and charging session.
9. Compare requested limits with acknowledged limits and measured delivery. Update the twin, explain deviations, and replan on material changes, new events, stale forecasts, device faults or a configured interval.
10. On communication loss or unsafe/incomplete inputs, stop dispatching new remote commands, record the fallback reason and let the configured local charger/site protection policy govern operation.

## Inputs and outputs to model

| Area | Inputs the EMS must represent | Outputs or evidence |
| --- | --- | --- |
| Grid and flexibility | OpenADR event identity, event/signal type, start and end, priority, requested reduction or operating target, cancellation/update, grid import/export envelope, connection state and quality | Event assessment, affected site assets, urgency, feasible response range, accepted/rejected/partial response and reason |
| Energy and market | Import and export price, currency, price period, tariff provenance, forecast horizon, validity and revision | Selected objective, expected import/export and cost per interval; assumptions and forecast version |
| Site and building | Site identity, grid connection, import/export limits, measured building load, flexible building load, site policy and local protection state | Interval headroom, constraint checks, planned site power, limit margin and violation/fallback records |
| Generation and storage | PV measurement and forecast, curtailment, battery power/energy/SOC, usable capacity, charge/discharge limits, reserve and availability | PV allocation/curtailment estimate, battery dispatch request and expected state; actual feedback remains distinct |
| EV and charging service | Pseudonymous vehicle/session reference, arrival/connection/departure, requested energy or target SOC, measured delivered energy/SOC where available, customer/service priority and consent/policy constraints | Per-session energy/power allocation, readiness estimate, expected shortfall and reason; no unsupported promise of target completion |
| Charging equipment | EVSE/connector identity, availability, operational status, rated/min/max power, supported phases/current, power factor if supplied, protocol/version, capability and freshness | Protocol-neutral command intent, encoded command, expiry, correlation ID, delivery result and command history |
| Charger feedback | Accepted/rejected/unknown acknowledgement, status notifications, measured active power, meter start/stop/interval readings, cumulative energy, connector state, faults, availability, optional SOC, event/receipt time and quality | Reconciliation of requested versus acknowledged versus measured behavior, deviations, state updates, replanning trigger and audit trail |
| Weather and renewable inputs | Observed and forecast ambient temperature, relative humidity, wind speed/direction, precipitation, cloud cover, global/direct/diffuse irradiance; PV AC/DC power, available power and curtailment; forecast issue time, target valid interval, horizon, member and confidence | Weather/solar forecast error, revised schedule and the reason for a replan |

Every observation uses a quantity kind, value, UCUM unit, `observedAt`, `recordedAt`, source, quality and, where relevant, `validFrom`/`validUntil`. A forecast records issue time separately from target valid time/window, horizon and confidence. Event time must not be confused with ingestion time. Session and asset identifiers are stable within a scenario but vehicle identity should be pseudonymous; the EMS model does not need names or account details.

## Initial semantic model

The independent v0.2 vocabulary in `ontology/ai-ems.ttl` starts to cover:

- Site, grid connection, PV, stationary storage, EVSE, connector, vehicle and charging session.
- External signal, OpenADR signal, price signal, grid constraint, observation, forecast and data source.
- Operating constraint, site policy, AI event/flexibility assessment and strategy recommendation.
- EMS plan, per-session power allocation, protocol-neutral command intent, command acknowledgement, charger feedback, meter reading and delivery reconciliation.
- Provenance, quality, validity, command correlation and temporal properties needed to reproduce a decision and explain divergence from reality.
- Typed environmental/energy observations and forecasts, plus adapter profiles, standards references, protocol exchanges, conformance evidence and deterministic simulation-run metadata.

`ontology/shapes.ttl` defines the first SHACL checks. The closed-loop example in `ontology/examples/` demonstrates the minimum trace from a grid signal through assessment and allocation to command, acknowledgement and measured feedback. OWL supplies shared types and relationships; SHACL validates required fields and invariants at data boundaries. Neither is used as a substitute for the deterministic optimizer.

The ontology uses neutral EMS terms and protocol adapter boundaries so it can be mapped or reused later. It deliberately does not import ChargeWeave classes or define CPO/eMSP, roaming, settlement, customer billing or site onboarding processes.

## Delivery phases and exit criteria

### Phase 0 — Establish the AI EMS fork

- Give the repository its own package name, metadata, documentation and GitHub Pages base path.
- Keep the cloned twin and six strategies as the initial baseline; retain the existing deterministic tests.
- Ensure all workflows, static asset paths and browser tests address `ev-energy-twin-ai-ems`.

**Exit:** app builds under its own base path and existing strategy behavior remains unchanged.

### Phase 1 — Complete and freeze the domain model (gate before EMS build)

- Complete the canonical domain surface for site/grid connection, weather observations and forecasts, PV, tariffs/prices, grid/flexibility signals, building/flexible load, storage, vehicles/sessions, EVSE/connectors/capabilities, plans, service outcomes, dispatch, command lifecycle, acknowledgements, telemetry, faults, reconciliation and fallback.
- Define every quantity's meaning, direction, unit convention, event/valid/recorded time, quality, source/provenance, uncertainty and missing/unknown behavior. Use UCUM-coded units and explicit import/export direction.
- Complete the adapter ontology and profile registry: standards authority and exact version/edition, module/feature subset, canonical mappings, profile revisions, supported capabilities, exchange evidence, virtual/replay/shadow/live mode and conformance results. Keep wire payload classes outside the canonical business vocabulary.
- Maintain a requirements-to-model coverage matrix. Every required input, output, state, capability, error and feedback field links to an ontology term, SHACL rule, positive fixture, deliberate negative fixture, adapter profile (or a documented provider-neutral boundary) and acceptance scenario.
- Pin standards profiles and exclusions in `docs/standards-and-adapters.md`; validate representative weather, inverter/storage, building, grid-event, tariff, OCPP and optional roaming/vehicle-side boundaries. Track ontology evidence against [`docs/ontology-coverage.md`](ontology-coverage.md); a passing parser or single example is not the completeness gate.
- Add end-to-end semantic examples for normal behavior and invalid/missing/stale/revised input. Validate Turtle, JSON contracts, SHACL shapes and semantic fixtures in CI. Sequencing, duplicate, late, timeout, retry and recovery behavior is assigned to the specific adapter profile and must pass before that adapter is treated as ready.
- Define replay/run metadata (scenario fingerprint, fixed clock, seed, PRNG and simulator/profile versions), correlation and identifier/privacy policy, and schema/version migration rules.

**Exit gate:** no required domain input/output, physical capability, lifecycle state, error, feedback or provenance field is unexplained in the coverage register; each external boundary has a canonical contract and pinned standard/data profile or a reviewed reason to remain provider-neutral; all positive and negative fixtures pass. The synthetic replay lab below is a bounded contract-review artifact; site-specific runtime, external adapters and dispatch integration remain gated on this sign-off.

### Phase 2 — Build a deterministic input and event pipeline

- Add normalized internal contracts and adapters for synthetic data first: OpenADR-like events, prices, grid/site limits, PV, building load, battery, session lifecycle and charger telemetry.
- Feed normalized observations into a versioned input snapshot for the existing simulator.
- Add event revisions/cancellations, out-of-order delivery handling, stale-data policy and provenance.

**Exit:** a fixed scenario and event stream reproduce the same input snapshot and outcome; updates and cancellations change only the affected validity windows.

### Phase 3 — Add the assessment and safe optimization boundary

- Define a replaceable `SignalAssessor` contract: deterministic rules first, then a small local/browser or hosted model behind the same structured result.
- Have the assessor classify urgency, impact, flexibility and confidence and recommend a strategy with a concise explanation.
- Route recommendations into existing strategies; use the optimizer for schedule construction and a separate deterministic validator for all hard limits.
- Record the model/rule version, evidence snapshot, recommendation and validator result.

**Exit:** identical inputs are reproducible in rules-only mode; malformed, low-confidence or unavailable AI results fall back safely; no assessment can produce an out-of-bounds allocation.

### Phase 4 — Simulate protocol commands and charger feedback

- Add protocol-neutral command intents, lifecycle states, correlation and expiry.
- Implement a simulated OCPP 2.1 Edition 2 adapter profile for a deliberately selected fixture subset; test accepted, rejected, delayed, duplicated and missing acknowledgements against the declared OCA/IEC release artifacts.
- Simulate measured power, meter energy, status, faults, cable/connector state and optional SOC separately from requested command values.
- Reconcile intent → acknowledgement → observed behavior and feed residuals back to the twin.

**Exit:** every command is traceable to a plan and every feedback event to a device/session; the twin never treats a requested or accepted limit as proof of delivered energy.

### Phase 5 — Close the control loop and prove resilience

- Replan on new or changed signals, active-set/session changes, material forecast error, device faults and missed command/telemetry deadlines.
- Add safe fallback for stale OpenADR/site data, unavailable AI, lost EMS connectivity and charger communication faults.
- Test the existing six strategies against the same scenario and compare service, feasibility, limits, costs and delivered energy; keep all claims tied to scenario evidence.

**Exit:** scenario playback demonstrates normal operation, event-driven response, recovery, communication loss and infeasible demand without violating hard constraints or hiding shortfall.

### Phase 6 — Prepare portable boundaries, later

- Package stable domain vocabulary, JSON contracts, SHACL shapes and neutral event/decision APIs as independently versioned components.
- Only after this standalone EMS model has stabilized, assess which concepts should map to ChargeWeave and define explicit mapping/version ownership.

**Exit:** this phase produces a reviewed integration proposal only; it does not make the EMS repository depend on or modify ChargeWeave.

## Synthetic reference slice (delivered 2026-09-30)

The route `/replay/` and `lib/twin/replay.ts` implement a bounded, deterministic demonstration using the existing Energy Twin as the physical engine. The reference trace covers a normalized synthetic event, a versioned snapshot, a deterministic assessment, a separately validated plan, a protocol-neutral intent, a virtual response, measured charger feedback and reconciliation.

The fixture set covers a 50 kW import-limit event, a solar shortfall, charger fault and recovery, remote-link loss and recovery, and infeasible vehicle demand. Event replay keeps event time, receipt time, validity, source, quality and revision; duplicate, conflicting, stale, out-of-order, revised and cancelled events have explicit outcomes. Rules-only recommendations can fall back when the assessor is unavailable or malformed. The planner still passes through the physical simulator and an independent site/session validator. Virtual charger fixtures exercise accepted, rejected, delayed, duplicated and missing acknowledgements; measured power and meter energy remain separate from requested and acknowledged values.

**This does not close Phase 1 or complete production-ready Phases 2–5.** The reference profile covers selected synthetic cases only; the OCPP-shaped response is not a wire adapter or conformance test, and a replay does not demonstrate continuous or automatic replanning. Review the target site, equipment, source authority, signal profile, meter semantics and service policy before adding site-specific behavior. There is no live feed, real charger connection, control authorization or ChargeWeave dependency.

**CI evidence:** the replay invariants run in `tests/replay.cjs`; the route and its mobile controls run in the GitHub Actions browser suite.

## Decision points before a real charger connection

- Exact OCPP version and supported charging-profile/control subset.
- OpenADR profile and source ownership for event updates/cancellations.
- Site import/export authority and precedence when source limits conflict.
- Required telemetry freshness, acceptable meter granularity and authoritative energy counter.
- Safe local behavior and command expiry for each charger family.
- Whether/when an operator approves dispatch; the simulation never implies production authorization.
