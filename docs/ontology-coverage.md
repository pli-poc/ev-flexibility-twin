# AI EMS ontology coverage register

This register is the Phase 1 completion checklist. It describes the domain surface that must be modeled and tested before site-specific EMS runtime or live adapters start. A row passes only when the named terms, SHACL rules, positive and negative fixtures, and an acceptance scenario are present. Provider-specific wire fields belong in a versioned adapter profile or preserved source evidence, not in the canonical vocabulary by default.

**Current evidence:** the synthetic reference lab in [`docs/synthetic-replay-lab.md`](synthetic-replay-lab.md) exercises a selected event-to-feedback path for contract review. It does not satisfy site-owner sign-off, provider-specific profile review or the full coverage criteria in this register.

| Domain slice | Canonical concepts and fields | Required semantic/conformance checks |
| --- | --- | --- |
| Site topology | Site, grid connection, meter, assets, EVSE, connectors, building loads; stable identifiers and site membership | Identity uniqueness in a scenario, topology links, source of authority, valid asset states |
| Weather observations | Temperature, humidity, wind speed/direction, precipitation, cloud cover, global/direct/diffuse irradiance; sensor/location, quantity, UCUM unit, event/record time, quality | Physical ranges, missing/stale/estimated handling, source and event-time provenance |
| Weather and energy forecasts | PV, weather, building load, price and grid forecast; product, issue time, valid interval, horizon, member/ensemble, confidence | Forecast issue time differs from target valid time; revision/correction and stale-policy behavior |
| PV and inverter | AC/DC output, available power, curtailment, power factor, operating state, limits, capability and dispatch | No command outside declared capability; measurement distinct from requested dispatch |
| Grid and meter | Import/export envelope, measured active/reactive power, voltage/current/frequency, connection state, meter register, direction and interval | Explicit import/export semantics, authority and precedence, timestamped cumulative/interval readings |
| Building and controllable loads | Total/flexible load, HVAC or other controllable load, schedule, comfort/operating constraint, authorized writable points | Control authority and comfort bounds; unavailable point is unknown rather than zero |
| Tariff and market | Import/export price, currency, price basis, tariff component, interval, source, revision and forecast | Currency separate from UCUM; no ambiguous price period or import/export direction |
| Stationary storage | SOC, energy, usable capacity, reserve, charge/discharge power, efficiencies, operating mode, availability and limits | SOC/efficiency bounds, mutually valid charge/discharge direction, reserve and capability enforcement |
| Vehicle and charging service | Pseudonymous vehicle/session, arrival/departure, requested energy or target SOC, minimum departure energy, priority and consent | Privacy-minimal identifiers, reachable target/shortfall outcome, consent status and temporal ordering |
| EVSE and connector capability | Availability, status, connector format, phase mode/count, current/voltage/power bounds, smart-charging functions and freshness | Per-connector/device limit, unsupported/unknown capability behavior, command range checks |
| External flexibility event | OpenADR identity, signal/target, priority, interval, revision, update/cancel, requested reduction and site applicability | Active/update/cancel lifecycle, duplicates, out-of-order/revision handling, overlapping events |
| Plan and response | Assessment, explanation/confidence, objective/strategy, allocations, asset dispatch, flexibility response, expected cost/energy/service outcome | Every decision points to immutable input snapshot and model/rule version; hard constraints remain deterministic |
| Command lifecycle | Neutral intent, target asset/connector/session, action/setpoint, units/direction, issue/expiry, correlation, attempt, retry, ack/NACK/unknown and lifecycle state | Accepted does not imply delivered; duplicate/idempotent retry, expiry, cancellation and late ack handling |
| Charger/device feedback | Status/state changes, faults/severity, availability, power, meter values, connector state, session linkage, optional vehicle SOC, communication state | Feedback source and event/record time, quality/freshness, session/transaction correlation, faults trigger safe replan |
| Reconciliation and fallback | Planned vs acknowledged vs measured values, delivered energy, deviation, tolerance, reason, local protection/fallback mode | Requested/accepted/delivered values stay distinct; safe behavior for missing inputs and communication loss |
| Standards and adapters | Adapter boundary/mode, standard reference/version/edition, profile subset/revision, canonical mappings, declared capability, exchange evidence and conformance result | Independent per-component selection for virtual/replay/shadow/live; unsupported fields are preserved or explicitly rejected |
| Replay and provenance | Input snapshot, scenario fingerprint, clock, seed, PRNG/simulator/profile versions, source payload digest, exchanges and outputs | Identical pinned inputs reproduce normalized events and decisions; replay records identify every profile used |

## Canonical ontology anchors

These are the primary OWL anchors for the coverage rows above. Datatype properties use explicit quantity-kind, unit/direction, time, quality, provenance, and lifecycle terms where relevant.

| Surface | Primary ontology terms |
| --- | --- |
| Topology and assets | `Site`, `EnergyAsset`, `GridConnection`, `GridMeter`, `PVArray`, `Inverter`, `StationaryBattery`, `BuildingLoad`, `ControllableLoad`, `EVSE`, `Connector`, `Vehicle`, `ChargingSession`, `Sensor`, `SpatialLocation` |
| Inputs and forecasts | `Observation`, `WeatherObservation`, `WeatherForecast`, `EnergyObservation`, `PVObservation`, `BuildingLoadObservation`, `GridObservation`, `BatteryObservation`, `EVSEObservation`, `PriceInterval`, `ExternalSignal`, `OpenADRSignal`, `GridConstraintSignal` |
| Requirements and limits | `OperatingConstraint`, `PowerLimit`, `EnergyTarget`, `DepartureDeadline`, `ComfortConstraint`, `CustomerServiceRequirement`, `ConsentPolicy`, `AvailabilityWindow`, `SiteProtectionState`, `CapabilityDeclaration`, `OperatingSchedule` |
| EMS outputs | `EventAssessment`, `FlexibilityAssessment`, `FlexibilityResponse`, `StrategyRecommendation`, `EMSPlan`, `PowerAllocation`, `AssetDispatch`, `ServiceOutcome` |
| Control and observed result | `CommandIntent`, `CommandLifecycleEvent`, `CommandAcknowledgement`, `ChargerFeedback`, `OperationalStateEvent`, `FaultEvent`, `MeterReading`, `Reconciliation` |
| Interoperability evidence | `BoundaryAdapter`, `VirtualAdapter`, `LiveAdapter`, `AdapterProfile`, `StandardReference`, `ProtocolExchange`, `ConformanceScenario`, `ConformanceResult`, `SimulationRun` |

The principal property groups include stable/source/correlation identifiers; issue, event, valid, observed, recorded and acknowledged times; numeric values and UCUM units; grid direction; specific weather, grid, PV, building, battery and EVSE quantities; service target/SOC/departure fields; capability, availability, fault and command lifecycle state; planned/acknowledged/measured power and delivered energy; and adapter standard/profile/run evidence.

## Gate evidence

For each row, the review records links to ontology terms, SHACL shapes, fixture paths and CI checks. “Not applicable” requires a reason and an explicit site profile assumption. Passing RDF/SHACL parsing alone does not pass this register. The Phase 1 gate is complete only when the whole register has evidence and reviewers sign off on unresolved provider-specific mappings.

## Current model evidence

Ontology v0.2 gives every current canonical input/output surface a named OWL term and has SHACL checks for weather and forecast semantics, prices, grid/site topology, physical ranges, service constraints, EVSE capability, command support, acknowledgement correlation, meter intervals, faults, reconciliation, standard/profile metadata and deterministic runs. The combined fixture covers weather, PV, building/load control, prices, grid, storage, vehicle/session, EVSE, a versioned virtual OCPP adapter, protocol exchange, assessment, plan, allocation, asset dispatch, acknowledgement, telemetry, fault, service outcome and reconciliation. CI deliberately breaks value, time, range, capability, profile, correlation and reconciliation rules and verifies that each invalid fixture is rejected.

This completes the repository's provider-neutral ontology baseline for the currently defined EMS scope. The completion gate still requires the scope owner to review the register against the actual intended site and equipment requirements; an uncovered site requirement must be modeled before EMS runtime work starts. Wire-level sequencing and recovery evidence belongs to the profile-specific adapter conformance suite and must be completed before each adapter is treated as ready. No EMS runtime, interface or ChargeWeave integration is part of this ontology change.
