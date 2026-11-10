---
name: weather-go-no-go
description: Run the x402-weather-guard service and call its hourly forecast and go, risky or no-go decision endpoints, including the free profile and discovery routes. Use when asked whether weather allows an outdoor plan, drone flight, ride or job site, or to stand up a pay-per-call weather API.
---

# Weather go/no-go decisions

x402-weather-guard is an Express service that answers weather questions for a point and a time window from two keyless live sources: Open-Meteo for forecasts and the US National Weather Service for active alerts. Paid routes use the x402 protocol. The repo has no hosted instance. You run it from a clone.

## Run it

```bash
git clone https://github.com/nirholas/x402-weather-guard
cd x402-weather-guard
npm install
npm run dev        # tsx src/server.ts, listens on PORT (default 4024)
```

Do not run it from a directory you do not trust. Review `.env.example` first. Every value has a working default. The relevant variables are `PORT`, `PAY_TO_ADDRESS` (EVM receive address), `SOLANA_PAY_TO_ADDRESS`, `NETWORK` (`base-sepolia` default, or `base`), `SOLANA_NETWORK` (`mainnet-beta` default, or `devnet`), `FACILITATOR_URL` (default `https://x402.org/facilitator`), `PUBLIC_BASE_URL` and `CONTACT_EMAIL` (sent to NWS in the User-Agent). The shipped receive addresses are the owner's, so replace them to be paid yourself.

## Free routes (no payment)

- `GET /` service metadata and live prices.
- `GET /health` liveness.
- `GET /profiles` every activity threshold profile. The profiles are `outdoor-event` (the default), `drone-flight`, `cycling`, `construction`, `photography` and `generic`. Read these before paying for a decision, so the user knows the bar being applied.
- `GET /.well-known/x402` discovery manifest, `GET /skill.md` and `GET /openapi.json`.

## Paid routes

Called with no `X-PAYMENT` header, each returns HTTP 402 with an `accepts` array that lists both rails (USDC on Base and on Solana). Calling without payment is safe and shows the price.

- `GET /forecast`, $0.001. Query: `lat` (-90 to 90), `lon` (-180 to 180), `hours` (1-168, default 24), `start` (ISO-8601, default now). Returns hourly temperature, feels-like, precipitation probability and amount, wind, gusts, cloud cover, visibility, conditions and any active alerts.
- `POST /decision`, $0.002. JSON body: `lat`, `lon`, `start`, `end` (default start plus 3 hours, at most 72 hours long), `activity` (a profile name), `thresholds` (overrides such as `maxWindKph`, `maxGustKph`, `maxPrecipProbabilityPct`, `maxPrecipMm`, `minTempC`, `maxTempC`, `minVisibilityM`) and `lookaheadHours` (up to 160, default 48). Returns `verdict` (`go`, `risky` or `no-go`), `summary`, `reasoning`, `worstHour`, `alerts` and up to five `alternativeWindows`.

Errors: 400 with `invalid_latitude`, `invalid_longitude`, `invalid_hours`, `unknown_activity`, `invalid_start`, `invalid_window` or `window_too_long`; 502 `upstream_error` when Open-Meteo fails (nothing settles); 500 `no_payment_rail_configured`.

## Paying

A paid call spends real USDC. Before sending a payment, show the user the route, price, network and `payTo` address, and wait for an explicit yes. The client signs the 402 challenge and retries with the base64 payload in `X-PAYMENT`. The 200 body is the result, and the settlement receipt is in the `X-PAYMENT-RESPONSE` header. The repo's `examples/agent-client.ts` (`npm run client`, needs `PRIVATE_KEY`) shows an `x402-fetch` client on Base Sepolia. Never print or store a private key.

## Worked example

Request: "Can I fly a drone at 47.6, -122.33 tomorrow 4 to 7 pm UTC?"

1. `curl http://localhost:4024/profiles` and read the `drone-flight` limits.
2. POST `/decision` with `{ "lat": 47.6062, "lon": -122.3321, "start": "<ISO start>", "end": "<ISO end>", "activity": "drone-flight" }` through an x402 client, after the user approves the $0.002 price.
3. Report `verdict`, the breaches in `reasoning`, and the best entry in `alternativeWindows`.
