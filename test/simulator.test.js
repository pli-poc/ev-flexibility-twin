import test from "node:test";
import assert from "node:assert/strict";
import { buildForecast, calculateSimulation } from "../src/simulator.js";

test("forecast produces a full-day synthetic demand and flexibility series", () => {
  const forecast = buildForecast({ connected: 42, congestion: "normal" });
  assert.equal(forecast.length, 13);
  assert.equal(forecast[0].hour, 0);
  assert.equal(forecast.at(-1).hour, 24);
  assert.ok(forecast.some((point) => point.demand > 300));
  assert.ok(forecast.every((point) => point.flexibility > 0));
});

test("congestion and market strategy change available flexibility", () => {
  const normal = calculateSimulation({ connected: 42, congestion: "normal" });
  const constrained = calculateSimulation({ connected: 42, congestion: "feeder" });
  const gridSupportive = calculateSimulation({ connected: 42, strategy: "grid" });
  assert.ok(normal.availableFlex > constrained.availableFlex);
  assert.ok(gridSupportive.availableFlex > normal.availableFlex);
  assert.equal(constrained.gridStatus, "Constrained");
});

test("delivery assessment distinguishes achievable and risky dispatch targets", () => {
  const ready = calculateSimulation({ connected: 42, target: 250 });
  const atRisk = calculateSimulation({ connected: 8, target: 600 });
  assert.equal(ready.isDeliverable, true);
  assert.equal(ready.deliveryScore, 100);
  assert.equal(atRisk.isDeliverable, false);
  assert.ok(atRisk.delivered < atRisk.target);
});

test("forecast range and unknown scenario values safely fall back", () => {
  const today = buildForecast({ connected: 20 });
  const tomorrow = buildForecast({ connected: 20, range: "Tomorrow" });
  const unknown = calculateSimulation({ connected: 20, congestion: "unexpected", strategy: "unexpected" });
  assert.ok(tomorrow[5].demand < today[5].demand);
  assert.equal(unknown.gridStatus, "Healthy");
  assert.ok(unknown.availableFlex > 0);
});
