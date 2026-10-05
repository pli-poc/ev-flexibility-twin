const congestionFactors = {
  normal: { capacity: 1, headroom: 18, label: "Healthy" },
  feeder: { capacity: 0.72, headroom: 9, label: "Constrained" },
  peak: { capacity: 0.48, headroom: 3, label: "Critical" },
};

const strategyFactors = {
  balanced: { revenue: 1, capacity: 1 },
  revenue: { revenue: 1.24, capacity: 0.9 },
  grid: { revenue: 0.86, capacity: 1.08 },
};

export function buildForecast({ connected = 42, congestion = "normal", range = "Today" } = {}) {
  const multiplier = range === "Tomorrow" ? 0.94 : range === "Week" ? 0.86 : 1;
  const congestionFactor = congestionFactors[congestion]?.capacity ?? 1;
  const demand = Array.from({ length: 13 }, (_, index) => {
    const morningPeak = Math.exp(-((index - 5) ** 2) / 7) * 0.72;
    const eveningPeak = Math.exp(-((index - 10) ** 2) / 5) * 0.9;
    const demandKw = (125 + morningPeak * 215 + eveningPeak * 260) * multiplier;
    const flexibilityKw = Math.max(35, connected * 8.15 * congestionFactor * (0.72 + Math.sin((index / 12) * Math.PI) * 0.28));
    return {
      hour: index * 2,
      demand: Math.round(demandKw),
      flexibility: Math.round(flexibilityKw),
    };
  });
  return demand;
}

export function calculateSimulation({ connected = 42, congestion = "normal", strategy = "balanced", target = 250 } = {}) {
  const grid = congestionFactors[congestion] ?? congestionFactors.normal;
  const market = strategyFactors[strategy] ?? strategyFactors.balanced;
  const availableFlex = Math.round(connected * 8.15 * grid.capacity * market.capacity);
  const delivered = Math.min(target, availableFlex);
  const deliveryScore = target === 0 ? 100 : Math.round((delivered / target) * 100);
  const baseRevenue = Math.round(delivered * 1.21 * market.revenue);
  return {
    connected,
    availableFlex,
    target,
    delivered,
    deliveryScore,
    revenue: baseRevenue,
    gridStatus: grid.label,
    gridHeadroom: grid.headroom,
    isDeliverable: delivered >= target,
  };
}
