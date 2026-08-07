# x402-weather-guard — agent skill

Decide whether the weather will cooperate. `/forecast` returns the hourly
forecast for a point and window — temperature, feels-like, precipitation
probability and amount, sustained wind, gusts, cloud cover, visibility, and
plain-English conditions — plus any active US watches or warnings.
`/decision` goes further: give it a point, a window, and an activity, and it
returns **go**, **risky**, or **no-go**, the specific threshold breaches behind
that call, the worst hour in the window, and up to five alternative windows in
the next 48 hours that would clear the same bar. Global coverage via Open-Meteo;
alerts via NWS inside US jurisdictions. Both keyless, both queried live.

**Base URL:** `{BASE_URL}` (local default `http://localhost:4024`)

Every paid call returns the purchased artifact **in the 200 response body**.
There is nothing to poll and nothing to collect later.

## Payment

This service speaks **x402** (HTTP 402 Payment Required, <https://x402.org>).

**Pay in USDC on Base or Solana — your client picks the rail.**

| Rail | Network | Asset | payTo |
|------|---------|-------|-------|
| EVM | `base-sepolia` (`base` on mainnet) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (`solana-devnet` on devnet) | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Facilitator: `https://x402.org/facilitator` (verifies and settles both rails).

Flow:

1. Call the endpoint with no `X-PAYMENT` header. You get **402** with an
   `accepts` array holding **both** rails.
2. Pick a rail, sign the payment, and put the base64 payload in `X-PAYMENT`.
3. Repeat the request. You get **200** with the artifact, and a settlement
   receipt in the `X-PAYMENT-RESPONSE` header (base64 JSON:
   `{ success, rail, network, transaction, payer, amount, asset }`).

Use `x402-fetch` (EVM), a Solana x402 client, or any x402-aware HTTP client —
the wire format is the standard one.

```ts
import { wrapFetchWithPayment, createSigner } from "x402-fetch";
const signer = await createSigner("base-sepolia", process.env.PRIVATE_KEY!);
const pay = wrapFetchWithPayment(fetch, signer);
const res = await pay("{BASE_URL}/forecast?lat=47.6062&lon=-122.3321&hours=6");
const artifact = await res.json();
```

## Endpoints

### `GET /forecast` — $0.001

Hourly forecast for a point and window, plus active alerts

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `lat` | query | yes | number | Latitude, -90…90. |
| `lon` | query | yes | number | Longitude, -180…180. |
| `hours` | query | no | integer | Length of the window in hours, 1–168. Default 24. |
| `start` | query | no | string | ISO-8601 start of the window. Default: now. |

**Returns** (`200 application/json`) — Hour-by-hour temperature, feels-like, precipitation probability and amount, wind, gusts, cloud, visibility, and plain-English conditions, with any active NWS alerts

```json
{
  "source": {
    "forecast": "open-meteo",
    "alerts": "nws"
  },
  "location": {
    "requested": {
      "latitude": 47.6062,
      "longitude": -122.3321
    },
    "resolved": {
      "latitude": 47.595562,
      "longitude": -122.32443,
      "elevationM": 59
    },
    "timezone": "UTC"
  },
  "window": {
    "start": "2026-08-07T03:00:00.000Z",
    "end": "2026-08-07T09:00:00.000Z",
    "hours": 6
  },
  "units": {
    "temperatureC": "°C",
    "precipitationMm": "mm",
    "precipitationProbabilityPct": "%",
    "windKph": "km/h",
    "gustKph": "km/h",
    "visibilityM": "m"
  },
  "hourly": [
    {
      "time": "2026-08-07T03:00:00.000Z",
      "temperatureC": 23.2,
      "feelsLikeC": 22.7,
      "humidityPct": 50,
      "precipitationProbabilityPct": 0,
      "precipitationMm": 0,
      "windKph": 8.3,
      "gustKph": 18.7,
      "cloudCoverPct": 0,
      "visibilityM": 39500,
      "weatherCode": 0,
      "conditions": "clear sky"
    },
    {
      "time": "2026-08-07T04:00:00.000Z",
      "temperatureC": 22.1,
      "feelsLikeC": 21.8,
      "humidityPct": 54,
      "precipitationProbabilityPct": 0,
      "precipitationMm": 0,
      "windKph": 7.6,
      "gustKph": 16.2,
      "cloudCoverPct": 3,
      "visibilityM": 41200,
      "weatherCode": 0,
      "conditions": "clear sky"
    },
    {
      "time": "2026-08-07T05:00:00.000Z",
      "temperatureC": 21,
      "feelsLikeC": 20.9,
      "humidityPct": 58,
      "precipitationProbabilityPct": 0,
      "precipitationMm": 0,
      "windKph": 6.9,
      "gustKph": 14.4,
      "cloudCoverPct": 11,
      "visibilityM": 42800,
      "weatherCode": 1,
      "conditions": "mainly clear"
    }
  ],
  "alerts": [
    {
      "event": "Heat Advisory",
      "severity": "Moderate",
      "urgency": "Expected",
      "certainty": "Likely",
      "onset": "2026-08-07T11:00:00-07:00",
      "ends": "2026-08-08T21:00:00-07:00",
      "headline": "Heat Advisory issued August 6 at 2:11PM PDT by NWS Seattle WA",
      "areaDesc": "King, WA; Pierce, WA; Snohomish, WA"
    }
  ],
  "alertStatus": "ok",
  "retrievedAt": "2026-08-07T03:04:11.882Z"
}
```

---

### `POST /decision` — $0.002

Go / risky / no-go verdict for a plan, with reasoning and alternative windows

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `lat` | body | yes | number | Latitude, -90…90. |
| `lon` | body | yes | number | Longitude, -180…180. |
| `start` | body | no | string | ISO-8601 start of the plan. Default: now. |
| `end` | body | no | string | ISO-8601 end of the plan. Default: three hours after `start`. Max 72 hours long. |
| `activity` | body | no | string | Which threshold profile to judge against. Default `outdoor-event`. See `GET /profiles` (free) for the exact numbers. |
| `thresholds` | body | no | object | Override any individual threshold from the chosen profile — `maxPrecipProbabilityPct`, `maxPrecipMm`, `maxWindKph`, `maxGustKph`, `minTempC`, `maxTempC`, `minVisibilityM`. |
| `lookaheadHours` | body | no | integer | How far past the window to search for alternatives, up to 160. Default 48. |

**Request body** (`application/json`)

```json
{
  "lat": 47.6062,
  "lon": -122.3321,
  "start": "2026-08-07T23:00:00Z",
  "end": "2026-08-08T02:00:00Z",
  "activity": "drone-flight"
}
```

**Returns** (`200 application/json`) — A verdict, the threshold breaches behind it, the worst hour, active alerts, and up to five non-overlapping alternative windows that would clear the same bar

```json
{
  "verdict": "risky",
  "summary": "Risky. 1 active alert for this area (Heat Advisory) — none disqualifying on its own. Proceed with a contingency. 5 alternative windows below would clear the same bar.",
  "confidence": 0.63,
  "activity": "drone-flight",
  "thresholds": {
    "maxPrecipProbabilityPct": 20,
    "maxPrecipMm": 0.1,
    "maxWindKph": 24,
    "maxGustKph": 32,
    "minTempC": -5,
    "maxTempC": 40,
    "minVisibilityM": 5000
  },
  "location": {
    "requested": {
      "latitude": 47.6062,
      "longitude": -122.3321
    },
    "resolved": {
      "latitude": 47.595562,
      "longitude": -122.32443,
      "elevationM": 59
    },
    "timezone": "UTC"
  },
  "window": {
    "start": "2026-08-07T23:00:00.000Z",
    "end": "2026-08-08T02:00:00.000Z",
    "hours": 3
  },
  "reasoning": [],
  "hoursEvaluated": 3,
  "worstHour": {
    "time": "2026-08-08T00:00:00.000Z",
    "temperatureC": 27.5,
    "feelsLikeC": 28.1,
    "humidityPct": 46,
    "precipitationProbabilityPct": 0,
    "precipitationMm": 0,
    "windKph": 9.4,
    "gustKph": 10.8,
    "cloudCoverPct": 0,
    "visibilityM": 43300,
    "weatherCode": 0,
    "conditions": "clear sky"
  },
  "alerts": [
    {
      "event": "Heat Advisory",
      "severity": "Moderate",
      "urgency": "Expected",
      "certainty": "Likely",
      "onset": "2026-08-07T11:00:00-07:00",
      "ends": "2026-08-08T21:00:00-07:00",
      "headline": "Heat Advisory issued August 6 at 2:11PM PDT by NWS Seattle WA",
      "areaDesc": "King, WA; Pierce, WA; Snohomish, WA"
    }
  ],
  "alertStatus": "ok",
  "alternativeWindows": [
    {
      "start": "2026-08-08T02:00:00.000Z",
      "end": "2026-08-08T05:00:00.000Z",
      "verdict": "go",
      "worstMarginPct": 9,
      "summary": "clear sky, 25.6°C, wind 11.9 km/h — clears every drone-flight threshold."
    },
    {
      "start": "2026-08-08T09:00:00.000Z",
      "end": "2026-08-08T12:00:00.000Z",
      "verdict": "go",
      "worstMarginPct": 41,
      "summary": "mainly clear, 18.2°C, wind 5.4 km/h — clears every drone-flight threshold."
    }
  ],
  "hourly": [
    {
      "time": "2026-08-07T23:00:00.000Z",
      "temperatureC": 26.8,
      "feelsLikeC": 27.2,
      "humidityPct": 44,
      "precipitationProbabilityPct": 0,
      "precipitationMm": 0,
      "windKph": 10.1,
      "gustKph": 13.6,
      "cloudCoverPct": 0,
      "visibilityM": 44100,
      "weatherCode": 0,
      "conditions": "clear sky"
    },
    {
      "time": "2026-08-08T00:00:00.000Z",
      "temperatureC": 27.5,
      "feelsLikeC": 28.1,
      "humidityPct": 46,
      "precipitationProbabilityPct": 0,
      "precipitationMm": 0,
      "windKph": 9.4,
      "gustKph": 10.8,
      "cloudCoverPct": 0,
      "visibilityM": 43300,
      "weatherCode": 0,
      "conditions": "clear sky"
    },
    {
      "time": "2026-08-08T01:00:00.000Z",
      "temperatureC": 26.9,
      "feelsLikeC": 27.4,
      "humidityPct": 49,
      "precipitationProbabilityPct": 0,
      "precipitationMm": 0,
      "windKph": 10.6,
      "gustKph": 12.2,
      "cloudCoverPct": 2,
      "visibilityM": 43900,
      "weatherCode": 0,
      "conditions": "clear sky"
    }
  ],
  "source": {
    "forecast": "open-meteo",
    "alerts": "nws"
  },
  "retrievedAt": "2026-08-07T03:05:44.201Z"
}
```


## Free endpoints

- `GET /` — Service metadata, live prices, active payment rails, activity profiles
- `GET /health` — Liveness probe
- `GET /profiles` — Every built-in activity threshold profile, so you can see the bar before paying
- `GET /.well-known/x402` — Machine-readable discovery manifest
- `GET /skill.md` — This agent skill card
- `GET /openapi.json` — OpenAPI 3.1 spec

## Error codes

| HTTP | `error` | Meaning |
|------|---------|---------|
| 400 | `invalid_latitude` | `lat` missing or outside -90…90. |
| 400 | `invalid_longitude` | `lon` missing or outside -180…180. |
| 400 | `invalid_hours` | `hours` outside 1…168. |
| 400 | `unknown_activity` | `activity` is not one of the built-in profiles. |
| 400 | `invalid_start` | `start` is not an ISO-8601 timestamp. |
| 400 | `invalid_window` | `end` is not after `start`. |
| 400 | `window_too_long` | The decision window exceeds 72 hours. |
| 502 | `upstream_error` | Open-Meteo failed or timed out. Nothing settled. |
| 402 | — | Payment required or rejected. Body carries `accepts` (both rails) and an `error` reason. |
| 500 | `no_payment_rail_configured` | Server has neither a valid EVM nor Solana payTo. |

## Data source

Two live, keyless upstreams:

- **[Open-Meteo](https://open-meteo.com)** — global hourly forecast, no key, no attribution requirement. This is the forecast of record: every temperature, wind, precipitation, and visibility figure comes from here.
- **[NWS / api.weather.gov](https://www.weather.gov/documentation/services-web-api)** — active watches, warnings, and advisories. Free, no key. NWS only covers US jurisdictions; outside them the alert set is simply empty and `alertStatus` says so.

Both are called in parallel on every request, each with a 12-second timeout and
one retry on a transport blip. An NWS failure never fails the request — the
forecast is still delivered and `alertStatus` carries the reason. There are no
fixtures in this repo: every response is live data.

## Discovery

Machine-readable manifest: **`GET /.well-known/x402`**
(also at <https://github.com/nirholas/x402-weather-guard/blob/main/public/.well-known/x402>).
Indexed by [x402scan.com](https://x402scan.com), the x402 Bazaar, and
[agentic.market](https://agentic.market).

OpenAPI 3.1: [`openapi.json`](https://github.com/nirholas/x402-weather-guard/blob/main/openapi.json)

## Contact

nichxbt@gmail.com · <https://github.com/nirholas/x402-weather-guard>
