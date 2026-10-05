# Strategy comparison — comparison-1.0.0

This release changes only the isolated `ev-energy-twin-ai-ems` repository. The V1 campus renderer and layout remain in place.

## One physical engine, six controllers

Immediate charging, load balancing, deadline-aware EMS, cheapest energy, peak-aware and total-cost-aware each receive an independent result object. Selecting a row replays that result; it never substitutes it under another label.

All runs share the arrival seed, fleet, requests, hardware, synthetic weather, building demand, tariff profile, charging efficiency, battery starting state and local storage policy. The same engine applies parking queues, two-minute parking time, faults, sleeping vehicles, communications-loss fallback, restricted import allowances and the export ceiling.

Immediate charging deliberately remains an uncontrolled reference: it can exceed the import allowance. Such a result is visibly unsafe, not a valid savings winner. Managed controllers cannot add to an unavoidable building-only overload. Total-cost-aware is a heuristic, not a globally optimal solution or complete invoice optimizer. Different strategies can legitimately tie.

## Tariffs and accounting

All six controllers use the selected synthetic weekday price in EUR/kWh. The price stays constant within each quarter-hour. The profiles demonstrate time-of-use shapes; they are not current EPEX observations, verified regional tariffs or supplier invoices. VAT, fixed charges, actual supplier formulas, calendars, holidays, DST days, battery degradation and flexibility settlement are not modeled.

Daily site energy expenditure is import expenditure minus export credit. It includes the whole building, not EV charging alone. Export credit uses EUR 0.07/kWh. One-minute maximum import and the highest aligned quarter-hour average import are separate metrics.

Optional monthly sensitivity = max(0, highest quarter-hour import this day minus user-entered existing monthly peak) times user-entered EUR/kW/month. Rate zero disables the estimate. The preferred scheduling peak is not the billing baseline. Monthly exposure is never added to daily energy cost. No tariff floors, historical averaging or full regulated billing model are implied.

## Service before savings

Compare readiness, requested/delivered energy, shortfall, import-limit violations and terminal battery energy alongside expenditure. Equivalent service requires matching delivered energy for every vehicle (within 0.05 kWh), equal readiness count, matching end storage and zero import-limit violations in both runs. Equal delivery does not mean every target was met. When this check fails the business-case panel does not annualise a savings claim.

## Forecast and scheduling limits

Advanced controllers replan connected vehicles at quarter-hour boundaries, active-set changes and reduced immediate headroom. They rank quarter-hour slots and allocate power on the shared minute grid, including partial first/last intervals. They use perfect synthetic building/PV forecasts and scripted outage windows, not measured or probabilistic forecasts. Future battery discharge is not presumed. The existing local battery controller operates identically across strategies.

Current planned energy is checked before presenting a forecast-feasibility message. A forecast is not a guaranteed departure outcome. Unexpected real-world conditions and charging protocols require a separate production implementation.

## Reproduce and export

Set the scenario, seed, tariff, preferred peak and hardware; then open Strategy comparison. Replay retains the same clock position. CSV exports all six numeric results with units and billing periods. Evidence JSON includes assumptions, model version and scenario fingerprint. Scenario export and browser save also include optimizer mode/settings; old schema-1 scenario files remain accepted. Browser storage uses an optimizer-specific key.

For article figures, use these exports rather than the unverified example numbers in earlier image/video drafts. Store the scenario JSON alongside each chart.

## Tests

```
npm ci
npx tsc lib/twin/engine.ts lib/twin/optimizer.ts lib/twin/comparison.ts --target es2022 --module commonjs --strict --skipLibCheck --outDir .test-build
node --test tests/comparison.cjs
NEXT_PUBLIC_BASE_PATH=/ev-energy-twin-ai-ems npm run build:pages
```

PR validation additionally runs Chromium against the static export and checks all six replay labels, reference stability, chart switching, EUR exports, browser restore, shared tariff controls and mobile replay. Screenshots are retained as a CI artifact.
