import { buildForecast, calculateSimulation } from "./simulator.js";

const elements = Object.fromEntries(
  [
    "connected-slider",
    "connected-control",
    "connected-value",
    "congestion-select",
    "strategy-select",
    "dispatch-slider",
    "dispatch-control",
    "flex-value",
    "revenue-value",
    "grid-status",
    "grid-headroom",
    "grid-track",
    "forecast-chart",
    "chart-labels",
    "demand-summary",
    "capacity-summary",
    "delivery-score",
    "delivery-ring",
    "assessment-status",
    "delivery-title",
    "delivery-description",
    "target-readout",
    "delivery-readout",
    "toast",
  ].map((id) => [id, document.getElementById(id)]),
);

let selectedRange = "Today";

function getInputs() {
  return {
    connected: Number(elements["connected-slider"].value),
    congestion: elements["congestion-select"].value,
    strategy: elements["strategy-select"].value,
    target: Number(elements["dispatch-slider"].value),
  };
}

function updateChart(inputs) {
  const points = buildForecast({ connected: inputs.connected, congestion: inputs.congestion, range: selectedRange });
  const width = 760;
  const height = 200;
  const x = (index) => (index / (points.length - 1)) * width;
  const y = (value) => height - (Math.min(value, 500) / 500) * height;
  const line = (key) => points.map((point, index) => `${index ? "L" : "M"} ${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`).join(" ");
  const demandLine = line("demand");
  const capacityLine = line("flexibility");
  const area = `${capacityLine} L ${width} ${height} L 0 ${height} Z`;

  elements["forecast-chart"].innerHTML = `
    <defs>
      <linearGradient id="capacity-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#53b995" stop-opacity=".2"/>
        <stop offset="100%" stop-color="#53b995" stop-opacity=".015"/>
      </linearGradient>
    </defs>
    ${[0, 1, 2, 3, 4, 5].map((row) => `<line class="chart-gridline" x1="0" y1="${row * 40}" x2="${width}" y2="${row * 40}"/>`).join("")}
    <path class="capacity-area" d="${area}"/>
    <path class="demand-line" d="${demandLine}"/>
    <path class="capacity-line" d="${capacityLine}"/>
    <circle class="chart-point" cx="${x(10)}" cy="${y(points[10].demand)}" r="4"/>
    <circle class="chart-point capacity-point" cx="${x(10)}" cy="${y(points[10].flexibility)}" r="4"/>
  `;
  const peak = points[10];
  elements["demand-summary"].innerHTML = `${peak.demand} <small>kW</small>`;
  elements["capacity-summary"].innerHTML = `${peak.flexibility} <small>kW</small>`;
  elements["chart-labels"].innerHTML = (selectedRange === "Week"
    ? ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    : ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"])
    .map((label) => `<span>${label}</span>`).join("");
}

function updateSimulation() {
  const inputs = getInputs();
  const result = calculateSimulation(inputs);
  elements["connected-control"].textContent = inputs.connected;
  elements["connected-value"].textContent = inputs.connected;
  elements["dispatch-control"].textContent = inputs.target;
  elements["flex-value"].textContent = result.availableFlex;
  elements["revenue-value"].textContent = `€${(1284 + result.revenue - 303).toLocaleString("en-US")}`;
  elements["grid-status"].textContent = result.gridStatus;
  elements["grid-headroom"].textContent = `${result.gridHeadroom}% headroom`;
  elements["grid-track"].style.width = `${result.gridHeadroom * 2.5}%`;
  elements["grid-track"].className = inputs.congestion === "peak" ? "critical" : inputs.congestion === "feeder" ? "warning" : "";
  elements["delivery-score"].textContent = result.deliveryScore;
  elements["delivery-ring"].style.setProperty("--score", `${result.deliveryScore * 3.6}deg`);
  elements["assessment-status"].textContent = result.isDeliverable ? "ON TRACK" : "AT RISK";
  elements["assessment-status"].className = `assessment-status ${result.isDeliverable ? "" : "at-risk"}`;
  elements["delivery-title"].textContent = result.isDeliverable ? "Ready to deliver" : "Target at risk";
  elements["delivery-description"].textContent = result.isDeliverable
    ? "Your portfolio can meet the requested dispatch target."
    : `Increase connected vehicles or lower the target by ${result.target - result.delivered} kW.`;
  elements["target-readout"].textContent = `${inputs.target} kW`;
  elements["delivery-readout"].textContent = `${result.delivered} kW`;
  updateChart(inputs);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

elements["connected-slider"].addEventListener("input", updateSimulation);
elements["dispatch-slider"].addEventListener("input", updateSimulation);
elements["congestion-select"].addEventListener("change", updateSimulation);
elements["strategy-select"].addEventListener("change", updateSimulation);
document.querySelectorAll(".range-button").forEach((button) => {
  button.addEventListener("click", () => {
    selectedRange = button.dataset.range;
    document.querySelector(".range-button.active").classList.remove("active");
    button.classList.add("active");
    updateSimulation();
  });
});
document.getElementById("simulate-button").addEventListener("click", () => {
  updateSimulation();
  showToast("Simulation complete — forecast and delivery assessment updated.");
});
document.getElementById("assess-button").addEventListener("click", () => {
  const result = calculateSimulation(getInputs());
  showToast(result.isDeliverable ? "Delivery assessment passed. Portfolio is ready." : "Delivery risk detected. Adjust your scenario inputs.");
});
document.getElementById("reset-button").addEventListener("click", () => {
  elements["connected-slider"].value = 42;
  elements["congestion-select"].value = "normal";
  elements["strategy-select"].value = "balanced";
  elements["dispatch-slider"].value = 250;
  selectedRange = "Today";
  document.querySelector(".range-button.active").classList.remove("active");
  document.querySelector('[data-range="Today"]').classList.add("active");
  updateSimulation();
  showToast("Simulation reset to the default scenario.");
});

updateSimulation();
