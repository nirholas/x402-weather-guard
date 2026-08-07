# API reference — x402-weather-guard

Base URL: `http://localhost:4024` in development.
Machine-readable: [`openapi.json`](https://github.com/nirholas/x402-weather-guard/blob/main/openapi.json) (OpenAPI 3.1).

All paid routes return the purchased artifact in the **200 response body**.

## Payment

Every paid route answers an unpaid request with **402** and an `accepts` array
holding both rails:

| Rail | Network | Asset | payTo |
|------|---------|-------|-------|
| EVM | `base-sepolia` (`base` on mainnet) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (`solana-devnet` on devnet) | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Prices are quoted in USDC base units (6 decimals) as `maxAmountRequired`.
On success the response carries `X-PAYMENT-RESPONSE`: base64 JSON with
`{ success, rail, network, transaction, payer, amount, asset }`.

---

## `GET /forecast`

**$0.001** — Hourly forecast for a point and window, plus active alerts

### Parameters

| Param | In | Required | Type | Description |
|-------|----|----------|------|-------------|
| `lat` | query | yes | number | Latitude, -90…90. |
| `lon` | query | yes | number | Longitude, -180…180. |
| `hours` | query | no | integer | Length of the window in hours, 1–168. Default 24. |
| `start` | query | no | string | ISO-8601 start of the window. Default: now. |

### Example request

```bash
curl -s -H "X-PAYMENT: <base64 payload>" "http://localhost:4024/forecast?lat=47.6062&lon=-122.3321&hours=6"
```

### Response `200 application/json`

`location.resolved` is the grid point Open-Meteo actually used, which can sit a kilometre or so from what you asked for — check `elevationM` if terrain matters. Times are always UTC, at the top of the hour. `alertStatus` distinguishes "NWS answered and there is nothing active" from "NWS could not be reached"; outside US jurisdictions it is always the former.

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

### Errors

| HTTP | `error` | When |
|------|---------|------|
| 400 | `invalid_latitude` | `lat` missing or outside -90…90. Nothing settled. |
| 400 | `invalid_longitude` | `lon` missing or outside -180…180. Nothing settled. |
| 400 | `invalid_hours` | `hours` outside 1…168. Nothing settled. |
| 502 | `upstream_error` | Open-Meteo failed or timed out. Nothing settled. |
| 402 | — | No or invalid `X-PAYMENT`. Body carries `accepts` with both rails. |
| 502 | `upstream_error` | The upstream data source failed or timed out. |

---

## `POST /decision`

**$0.002** — Go / risky / no-go verdict for a plan, with reasoning and alternative windows

### Parameters

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

### Example request

```bash
curl -s -H "X-PAYMENT: <base64 payload>" -X POST "http://localhost:4024/decision" \
  -H 'content-type: application/json' \
  -d '{"lat":47.6062,"lon":-122.3321,"start":"2026-08-07T23:00:00Z","end":"2026-08-08T02:00:00Z","activity":"drone-flight"}'
```

### Response `200 application/json`

One `blocking` breach is enough for **no-go**; several `marginal` ones, or any active alert, make it **risky**; a clean window is **go**. `alternativeWindows` never overlaps the window you asked about, so every suggestion is a reschedule you can actually propose. `thresholds` echoes exactly what the verdict was measured against — including any fields you overrode.

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

### Errors

| HTTP | `error` | When |
|------|---------|------|
| 400 | `invalid_latitude` | `lat` missing or outside -90…90. Nothing settled. |
| 400 | `unknown_activity` | `activity` is not a built-in profile. Nothing settled. |
| 400 | `invalid_window` | `end` is not after `start`. Nothing settled. |
| 400 | `window_too_long` | Window exceeds 72 hours. Nothing settled. |
| 502 | `upstream_error` | Open-Meteo failed or timed out. Nothing settled. |
| 402 | — | No or invalid `X-PAYMENT`. Body carries `accepts` with both rails. |
| 502 | `upstream_error` | The upstream data source failed or timed out. |


---

## Free routes

### `GET /`

Service metadata: description, live prices, active payment rails, data-source
status, and docs links.

### `GET /health`

```json
{ "status": "ok", "uptime": 12.5 }
```

### `GET /.well-known/x402`

The discovery manifest — every resource with its price, output schema, and both
accepted rails. See [agents.md](agents.md).
