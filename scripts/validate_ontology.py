from pathlib import Path

from pyshacl import validate
from rdflib import Graph, Literal, Namespace, RDF

ROOT = Path(__file__).resolve().parents[1]
AIEMS = Namespace("https://w3id.org/ev-energy-twin/ai-ems#")
EX = Namespace("https://example.org/ai-ems/demo#")


def load(path: Path) -> Graph:
    graph = Graph()
    graph.parse(path, format="turtle")
    return graph


ontology = load(ROOT / "ontology/ai-ems.ttl")
shapes = load(ROOT / "ontology/shapes.ttl")
example = load(ROOT / "ontology/examples/closed-loop.ttl")

required_example_classes = {
    AIEMS.WeatherObservation,
    AIEMS.WeatherForecast,
    AIEMS.PVObservation,
    AIEMS.BuildingLoadObservation,
    AIEMS.GridObservation,
    AIEMS.BatteryObservation,
    AIEMS.EVSEObservation,
    AIEMS.CustomerServiceRequirement,
    AIEMS.CapabilityDeclaration,
    AIEMS.AdapterProfile,
    AIEMS.VirtualAdapter,
    AIEMS.ProtocolExchange,
    AIEMS.SimulationRun,
    AIEMS.AssetDispatch,
    AIEMS.ServiceOutcome,
    AIEMS.FaultEvent,
    AIEMS.OperationalStateEvent,
    AIEMS.SpatialLocation,
    AIEMS.ConformanceScenario,
    AIEMS.ConformanceResult,
}
missing_classes = required_example_classes - set(example.objects(None, RDF.type))
if missing_classes:
    raise SystemExit(f"Closed-loop fixture is missing required domain slices: {sorted(map(str, missing_classes))}")

conforms, _, report = validate(
    example,
    shacl_graph=shapes,
    ont_graph=ontology,
    inference="rdfs",
    advanced=True,
)
if not conforms:
    raise SystemExit(f"Closed-loop example did not conform to the EMS shapes:\n{report}")

# Prove that a required control field is actually enforced by the shapes.
invalid = Graph()
for triple in example:
    invalid.add(triple)
command = next(invalid.subjects(RDF.type, AIEMS.CommandIntent))
invalid.remove((command, AIEMS.commandLimitKw, None))
invalid_conforms, _, invalid_report = validate(
    invalid,
    shacl_graph=shapes,
    ont_graph=ontology,
    inference="rdfs",
    advanced=True,
)
if invalid_conforms:
    raise SystemExit("SHACL accepted a charger command without a power limit.")

# Missing data is explicit and has no numeric value; a supposedly good
# observation without a value is invalid.
missing_value = Graph()
for triple in example:
    missing_value.add(triple)
observation = EX["pv-observation"]
missing_value.remove((observation, AIEMS.numericValue, None))
missing_value.remove((observation, AIEMS.dataQuality, None))
missing_value.add((observation, AIEMS.dataQuality, Literal("missing")))
missing_conforms, _, _ = validate(
    missing_value,
    shacl_graph=shapes,
    ont_graph=ontology,
    inference="rdfs",
    advanced=True,
)
if not missing_conforms:
    raise SystemExit("SHACL rejected an explicitly marked missing observation.")

bad_observation = Graph()
for triple in example:
    bad_observation.add(triple)
good_observation = EX["pv-observation"]
bad_observation.remove((good_observation, AIEMS.numericValue, None))
bad_conforms, _, _ = validate(
    bad_observation,
    shacl_graph=shapes,
    ont_graph=ontology,
    inference="rdfs",
    advanced=True,
)
if bad_conforms:
    raise SystemExit("SHACL accepted an observation with good quality but no value.")

# Weather data stays typed and distinguishes a forecast's issue and target times.
weather_forecast = next(example.subjects(RDF.type, AIEMS.WeatherForecast))
bad_forecast = Graph()
for triple in example:
    bad_forecast.add(triple)
bad_forecast.remove((weather_forecast, AIEMS.forecastFor, None))
bad_forecast_conforms, _, _ = validate(
    bad_forecast,
    shacl_graph=shapes,
    ont_graph=ontology,
    inference="rdfs",
    advanced=True,
)
if bad_forecast_conforms:
    raise SystemExit("SHACL accepted a weather forecast without its target valid time.")

# A versioned protocol boundary must identify the tested feature subset.
profile = next(example.subjects(RDF.type, AIEMS.AdapterProfile))
bad_profile = Graph()
for triple in example:
    bad_profile.add(triple)
bad_profile.remove((profile, AIEMS.profileSubset, None))
bad_profile_conforms, _, _ = validate(
    bad_profile,
    shacl_graph=shapes,
    ont_graph=ontology,
    inference="rdfs",
    advanced=True,
)
if bad_profile_conforms:
    raise SystemExit("SHACL accepted an adapter profile without a declared subset.")

# Physical ranges and declared capabilities constrain dispatch.
weather = EX["weather-temperature"]
bad_weather = Graph()
for triple in example:
    bad_weather.add(triple)
bad_weather.remove((weather, AIEMS.relativeHumidityPercent, None))
bad_weather.add((weather, AIEMS.relativeHumidityPercent, Literal(120.0)))
bad_weather_conforms, _, _ = validate(
    bad_weather,
    shacl_graph=shapes,
    ont_graph=ontology,
    inference="rdfs",
    advanced=True,
)
if bad_weather_conforms:
    raise SystemExit("SHACL accepted relative humidity above 100 percent.")

capability = EX["smart-charging-capability"]
unsupported_capability = Graph()
for triple in example:
    unsupported_capability.add(triple)
unsupported_capability.remove((capability, AIEMS.capabilityStatus, None))
unsupported_capability.add((capability, AIEMS.capabilityStatus, Literal("unsupported")))
unsupported_conforms, _, _ = validate(
    unsupported_capability,
    shacl_graph=shapes,
    ont_graph=ontology,
    inference="rdfs",
    advanced=True,
)
if unsupported_conforms:
    raise SystemExit("SHACL accepted a smart-charging command for an unsupported EVSE capability.")

acknowledgement = EX["ack-001"]
bad_ack_correlation = Graph()
for triple in example:
    bad_ack_correlation.add(triple)
bad_ack_correlation.remove((acknowledgement, AIEMS.correlationId, None))
bad_ack_correlation.add((acknowledgement, AIEMS.correlationId, Literal("wrong-correlation")))
bad_ack_conforms, _, _ = validate(
    bad_ack_correlation,
    shacl_graph=shapes,
    ont_graph=ontology,
    inference="rdfs",
    advanced=True,
)
if bad_ack_conforms:
    raise SystemExit("SHACL accepted an acknowledgement with a mismatched correlation ID.")

reconciliation = EX["reconciliation-001"]
bad_reconciliation = Graph()
for triple in example:
    bad_reconciliation.add(triple)
bad_reconciliation.remove((reconciliation, AIEMS.acknowledgedPowerKw, None))
bad_reconciliation.add((reconciliation, AIEMS.acknowledgedPowerKw, Literal(5.0)))
bad_reconciliation_conforms, _, _ = validate(
    bad_reconciliation,
    shacl_graph=shapes,
    ont_graph=ontology,
    inference="rdfs",
    advanced=True,
)
if bad_reconciliation_conforms:
    raise SystemExit("SHACL accepted reconciliation power that differs from the command acknowledgement.")

print("PASS: ontology and SHACL parse; full-domain fixture conforms; value, time, range, capability, correlation and reconciliation violations are rejected.")
