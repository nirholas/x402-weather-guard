# Raw HTTP walkthrough — 402 → pay → 200

Everything below is plain `curl`. No SDK required.

## 0. Start the server

```bash
npm install
npm run dev      # http://localhost:4024
```

## 1. Free routes need no payment

```bash
curl -s http://localhost:4024/health
curl -s http://localhost:4024/ | jq
curl -s http://localhost:4024/.well-known/x402 | jq
```

## 2. Call a paid route with no payment → 402, both rails

```bash
curl -s -i "http://localhost:4024/forecast?lat=47.6062&lon=-122.3321&hours=6"
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
```

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "hint": "Pay in USDC on Base or Solana — your client picks the rail. See /.well-known/x402",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4024/forecast",
      "description": "Hourly forecast for a point and window, plus active alerts",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 120,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" }
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "1000",
      "resource": "http://localhost:4024/forecast",
      "description": "Hourly forecast for a point and window, plus active alerts",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 120,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": { "name": "USDC", "decimals": 6, "feePayer": "<facilitator sponsor>" }
    }
  ]
}
```

`maxAmountRequired` is in USDC base units (6 decimals): `1000` = $0.001.

## 3. Build the payment

Pick **one** entry from `accepts`.

**EVM (Base):** sign an EIP-3009 `transferWithAuthorization` for
`maxAmountRequired` USDC to `payTo`. No gas needed from you — the facilitator
submits it.

**Solana:** build an SPL `transferChecked` of `maxAmountRequired` USDC to
`payTo`, with `extra.feePayer` as the transaction fee payer, and sign it. You
need USDC only — the facilitator sponsors the SOL fee.

Either way, base64-encode the x402 payload:

```json
{ "x402Version": 1, "scheme": "exact", "network": "<the rail you picked>", "payload": { … } }
```

In practice, let a library do it:

```bash
PRIVATE_KEY=0xYourTestKey npm run client
```

## 4. Repeat the request with the header → 200 + artifact

```bash
curl -s -i -H "X-PAYMENT: <base64 payload>" "http://localhost:4024/forecast?lat=47.6062&lon=-122.3321&hours=6"
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJyYWlsIjoiZXZtIiwi…
```

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

Decode the receipt:

```bash
echo '<X-PAYMENT-RESPONSE value>' | base64 -d | jq
# { "success": true, "rail": "evm", "network": "base-sepolia",
#   "transaction": "0x…", "payer": "0x…", "amount": "1000", "asset": "USDC" }
```

The artifact is in the body of that same 200. There is nothing else to fetch.

## All paid routes

### `GET /forecast` — $0.001

```bash
curl -s -H "X-PAYMENT: <payload>" "http://localhost:4024/forecast?lat=47.6062&lon=-122.3321&hours=6"
```

### `POST /decision` — $0.002

```bash
curl -s -H "X-PAYMENT: <payload>" -X POST "http://localhost:4024/decision" \
  -H 'content-type: application/json' \
  -d '{"lat":47.6062,"lon":-122.3321,"start":"2026-08-07T23:00:00Z","end":"2026-08-08T02:00:00Z","activity":"drone-flight"}'
```
