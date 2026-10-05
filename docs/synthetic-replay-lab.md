# Synthetic EMS replay lab

**Route:** `/replay/`  
**Status:** deterministic synthetic reference, not a live EMS or conformance test.

## Run it

Open the simulator development roadmap and choose **Run synthetic replay**, or visit `/replay/` in the hosted static site. Select a fixture, event quality, assessment mode, virtual charger response, meter quality and seed, then run the replay. The clock is fixed for each scenario so the same seed and inputs reproduce the same snapshot.

## What the slice exercises

1. A versioned input snapshot records synthetic grid power and limit, building demand, PV power, EVSE power, tariff, storage energy and connected-session count. Each observation keeps a value, unit, event time, recorded time, quality, validity and synthetic source.
2. The event reducer normalizes UTC timestamps; ignores revisions not yet received at the snapshot clock; selects the highest received revision; suppresses duplicate deliveries; applies cancellation tombstones; and reports stale, invalid, conflicting, not-yet-valid and expired inputs. Inputs more than 30 minutes old are not dispatched. Conflicting payloads with the same source ID and revision have no winner.
3. A replaceable `SignalAssessor` boundary returns structured event impact, urgency, estimated flexible power, confidence and strategy. The deterministic rules implementation is available now. An unavailable, malformed or below-0.5-confidence result selects local Load balancing.
4. The existing Energy Twin simulates the whole day with the selected strategy. A separate validator checks site power balance, import capacity, session state and vehicle power before making command intents.
5. Protocol-neutral intents include plan, EVSE, session, correlation ID, requested power and expiry. The virtual fixture returns accepted, rejected, delayed, duplicate or missing acknowledgements; meter telemetry can independently be current, stale or missing.
6. Virtual meter feedback reports measured power and interval energy independently. Reconciliation records requested, accepted and measured values; an acknowledgement alone never counts as delivered energy, and stale or missing telemetry cannot confirm delivery.

## Included scenario fixtures

| Fixture | Existing simulator case | Evidence |
| --- | --- | --- |
| Grid import limit | Restricted connection, 50 kW fixture | Event response and constrained setpoints |
| Solar forecast shortfall | Cloud reduction, 20% output fixture | Recomputed plan and remaining service shortfall |
| Charger fault | Two simulated bays unavailable | Dispatch with a shared fault model and restoration event |
| Remote connection loss | Local Load balancing | Remote intent withheld and link recovery event |
| Infeasible demand | High requests and short stays | Feasibility and visible departure shortfall |

The fixture profile is intentionally small and uses locally generated simulator values. It does not encode OCPP wire messages, connect to OpenADR, use live weather or market services, or claim standards conformance. The 50 kW and 20% values are explicit demo fixtures, not configurable provider contracts.

## Remaining review and implementation

The site/equipment coverage sign-off remains open. Review the ontology coverage register, asset inventory, source ownership, meter interpretation, service policy and exact adapter profiles before treating this prototype as complete for a target site. The replay runs a single deterministic plan from a snapshot; it does not continuously replan or authorize control of equipment. Live, shadow and production operation remain out of scope.

## CI checks

GitHub Actions compiles `lib/twin/replay.ts`, runs `tests/replay.cjs`, builds the static site, and checks the roadmap link and replay behavior in Chromium at mobile width.
