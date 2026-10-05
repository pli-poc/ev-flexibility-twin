# FlexGrid — EV flexibility simulator

An interactive demonstration of EV charging flexibility, AI-inspired forecasting, virtual energy markets, grid congestion scenarios, and dispatch delivery assessment. The simulator uses deterministic synthetic data; it does not connect to vehicles, grid operators, or energy markets.

## Run locally

Requires Node.js and Python 3 (for the built-in static file server). From the project directory:

```sh
npm start
```

Open [http://localhost:4173](http://localhost:4173). Change the connected fleet, congestion scenario, and bidding strategy to see forecasts and delivery readiness update. Use the dispatch target slider to assess whether the fleet can fulfill a requested delivery.

## Test

```sh
npm test
```