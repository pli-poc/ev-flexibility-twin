# Standards and virtual-adapter policy

**Status:** domain-boundary baseline for completing the EMS ontology before adding EMS runtime behavior. Standards checked 2026-09-29. A named standard is a versioned adapter contract, not a claim of certification or universal device support.

## Design rule

Keep the EMS domain vocabulary canonical and independent of wire formats. A standard-shaped adapter translates a pinned external profile to and from canonical EMS concepts. A virtual adapter implements the same asynchronous boundary and profile as a future live adapter; it is selected per component, not by swapping the whole simulation for one monolith.

Each profile records the standards body, identifier, version/edition/revision, supported modules and message/feature subset, units and encodings, state transitions, error mapping, idempotency behavior, timeout/retry behavior and positive/negative conformance fixtures. Unsupported fields are preserved as raw evidence or surfaced as explicit unsupported data; they are never silently given a guessed business meaning. Conformance means passing the declared subset tests, not protocol certification.

## Boundary registry

| Boundary | Standard/profile baseline | Canonical concepts | Boundary rules |
| --- | --- | --- | --- |
| Charge point control and feedback | **OCPP 2.1 Edition 2**, aligned with IEC 63584-210:2026 (IEC second edition published 2026-09-22). Pin the OCA Edition 2 artifact and its 2026-06 errata. Name the exact smart-charging, status, transaction/event and meter-value fixture subset before implementing it. | EVSE, connector, charging session, charging profile, power limit, command intent, acknowledgement, status and meter observation | OCPP is the charge-point ↔ CSMS/EMS protocol boundary. Map protocol transaction IDs separately from canonical session IDs. Test profile install/update/clear, expiry, unsupported capability, rejected command, delayed response, duplicate/out-of-order messages and meter/event linkage. Use the OCA test cases where licensed/available; our declared fixture subset is not certification. |
| Grid flexibility event ingress | **OpenADR 3.0** for the new API-style event profile; maintain a separate **OpenADR 2.0b** profile when an upstream utility/aggregator requires it. OpenADR 3 supplements rather than replaces 2.0a/b. | External signal, flexibility event, event revision/cancellation, site constraint, assessment and flexibility response | Normalize event identity, signal meaning, event interval, priority, target/reduction, units and update/cancel state. Preserve original payload and revision. Test expired, updated, cancelled, duplicate and overlapping events. The normative OADR 3 reference is the Alliance's OpenAPI YAML. |
| Roaming/CPMS session edge (optional) | EVRoaming currently identifies **OCPI 2.2.1** as the official release. Keep a distinct **OCPI 2.3.0** profile only when a partner or fixture needs it, and label it as a candidate/CENELEC-transition profile until the Foundation marks it official. Explicitly select the modules needed (for example Sessions and Commands). It is not direct charger control. | External session reference, authorization/session context and command request/result | Keep roaming/session exchange distinct from OCPP electrical control. Do not import CDR settlement or billing concepts into the EMS core. Pin exact release branch/status and module schemas used by fixtures. |
| Weather and environmental observations | **OGC SensorThings API Part 1: Sensing 1.1** for sensor/observation service profiles. | Weather observation, sensor, location, observation time, result, unit and quality | Map Thing/Location/Sensor/Datastream/Observation meaning explicitly. Include ambient temperature, humidity, wind, precipitation and solar irradiance as observed quantities where supplied. Do not require every source to provide every phenomenon. |
| Weather/renewable/load forecast retrieval | **OGC API – Environmental Data Retrieval 1.1.0** for spatiotemporal forecast queries, when supported by the provider; use a provider's documented product profile for the meteorological encoding. | Forecast, issue time, target time/window, horizon, variable, unit, ensemble/member and quality/confidence | Forecast product and encoding remain a provider profile. Preserve issue time and valid time separately; never treat a weather forecast as a measurement. |
| Inverter and storage device data/control | **Modbus Application Protocol 1.1b3** as the protocol profile plus a versioned **SunSpec Modbus Information Model** package/model subset for devices that implement it. | PV array/inverter, battery, capability, measurement, operating limit and asset dispatch | Record transport (TCP or serial), register/model map, access mode, scale factor, signedness, register epoch, writable range and device capability. Modbus alone supplies transport/register semantics; the selected SunSpec model or vendor map supplies point meaning. Never assume an arbitrary register map is SunSpec. |
| Building energy and controllable loads | **ANSI/ASHRAE Standard 135-2024 (BACnet)** baseline where supported; identify the controller's protocol revision, objects, properties and services actually supported. | Building load, HVAC/flexible load, comfort constraint, operating schedule, measurement and dispatch | Keep building-control ownership separate from the site import limit. Model only exposed and authorized points. Missing BACnet support does not block a meter/PV/EVSE-only site profile. |
| Tariff and wholesale price ingress | Provider-specific versioned API/schema, with an **ENTSO-E Transparency Platform** profile for EU wholesale market data when that is the actual source. There is no single assumed universal tariff payload for every EMS/site. | Import/export price interval, tariff component, currency, revision, source and validity | Preserve provider source and original interval/currency; normalize quantity and time without claiming ENTSO-E is a retail tariff format. |
| Units and measured quantities | **UCUM** unit codes in canonical measurement values; publish the quantity-kind vocabulary and conversion policy alongside them. | Quantity kind, numeric result, UCUM unit, direction, uncertainty, quality and time | Import and export direction are explicit semantics, not inferred from a negative power value. Currency is modeled separately from UCUM energy/power units. Validate conversions and preserve original value/unit as source evidence. |
| EV-side data (optional) | **ISO 15118** profile only when the simulator explicitly models the EV ↔ EVSE communication boundary or uses vehicle-originated data unavailable through the charge-point profile. | Vehicle capability/intent and EV-side communication session | Do not assume an independent vehicle adapter when data arrives through OCPP or a CPMS. Pin the ISO 15118 part/edition and feature subset before using it. |

### Evidence links

- Open Charge Alliance: [OCPP 2.1 Edition 2 release and test cases](https://openchargealliance.org/new-editions-of-the-ocpp-2-1-and-2-0-1-now-available/) and [current OCPP download/errata page](https://openchargealliance.org/my-oca/ocpp/); IEC: [IEC 63584-210:2026, Edition 2.0](https://webstore.iec.ch/en/publication/111422), which replaces the 2025 first edition.
- OpenADR Alliance: [OpenADR 3.0 normative reference and relationship to 2.0a/b](https://www.openadr.org/openadr-3-0) and [specification downloads](https://www.openadr.org/specification).
- EVRoaming Foundation: [OCPI release downloads](https://evroaming.org/ocpi-downloads/) and [OCPI overview/release status](https://evroaming.org/ocpi/).
- OGC: [SensorThings API Part 1: Sensing 1.1](https://docs.ogc.org/is/18-088/18-088.html) and [OGC API – EDR standards page](https://ogcapi.ogc.org/edr/) (published standard 1.1.0; later drafts are not treated as normative).
- Modbus Organization: [Modbus specifications](https://www.modbus.org/modbus-specifications), including the [Application Protocol Specification 1.1b3](https://modbus.org/docs/Modbus_Application_Protocol_V1_1b3.pdf).
- SunSpec Alliance: [SunSpec specifications](https://sunspec.org/specifications/) and [Modbus models](https://sunspec.org/modbus/).
- ASHRAE: [Standard 135-2024 status](https://www.ashrae.org/technical-resources/standards-and-guidelines/titles-purposes-and-scopes) and [BACnet resources](https://data.ashrae.org/bacnet/).
- UCUM: [UCUM specification](https://ucum.org/ucum).

## Virtual-adapter contract

The ontology and future TypeScript port contract must make these selections independent:

1. Weather observation and weather forecast source/profile.
2. PV inverter source/profile and any curtailment capability.
3. Battery source/profile and charge/discharge capability.
4. Building load/controllable-load source/profile.
5. Site/grid meter and import/export constraint source/profile.
6. Price/tariff provider profile.
7. Building automation/load controller profile.
8. EVSE/charger protocol profile.
9. Optional CPMS/eMSP or vehicle-side edge profile.

Each adapter uses the same domain-facing asynchronous operations regardless of mode. The initial deployment is browser-local synthetic hardware; later choices may be virtual, replay, shadow or live per boundary. An adapter cannot bypass ontology validation, the deterministic constraint validator or command lifecycle checks.

Every simulation run records the scenario fingerprint, virtual clock/start, deterministic seed and PRNG version, simulator/profile versions, selected adapter composition, input snapshot IDs and emitted protocol exchanges. Replaying that record must reproduce the same normalized input sequence and decisions. Shadow mode compares a live source/response with the simulated/canonical result without dispatching commands; live dispatch is a separate, explicitly gated mode.

## Adapter conformance set

For each standards profile, CI must cover:

- valid message exchange and exact canonical mapping;
- wrong version, unsupported feature and invalid enum/quantity;
- protocol minimum/maximum/boundary values and unit conversion;
- state-machine ordering and session/transaction correlation;
- duplicate, late, out-of-order, corrected and cancelled messages;
- timeout, negative acknowledgement, communication recovery and idempotent retry;
- missing/stale/untrusted measurements and preserved source provenance;
- write/setpoint safety range and no write where capability is unknown.

These are adapter-profile tests and semantic invariants, not a claim to implement or certify every feature of a named protocol.

## Version governance

The profile manifest is the authority for each simulated boundary. It pins an exact artifact or source release, module/feature subset, mapping version, test fixture version and known exclusions. A standard update creates a new profile revision and compatibility tests; it must not silently reinterpret stored observations or old scenario exports. Reconfirm release status and permitted spec artifacts at the point each adapter is implemented.
