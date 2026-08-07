# Tutorial — x402-weather-guard

From a clean checkout to a paid API call, on either payment rail.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-weather-guard
cd x402-weather-guard
npm install
```

Node 18 or newer.

## 2. Configure (optional)

```bash
cp .env.example .env
```

Nothing is required. Out of the box the server:

- listens on port `4024`,
- accepts USDC on **Base Sepolia** and on **Solana**, paying out to the suite's
  public receive addresses,
- queries Open-Meteo and NWS live — no keys needed, nothing to configure.

To be paid yourself, change these two lines:

```bash
PAY_TO_ADDRESS=0xYourEvmAddress
SOLANA_PAY_TO_ADDRESS=YourSolanaAddress
```

Nothing here requires a key. One variable is worth setting before you run this
anywhere public:

```bash
CONTACT_EMAIL=you@example.com
```

NWS [asks every automated caller](https://www.weather.gov/documentation/services-web-api)
to identify itself with a contact address in the User-Agent. Unset, the service
falls back to the suite's address — fine for a local try, impolite in
production. Open-Meteo asks for nothing at all.

## 3. Run the server

```bash
npm run dev
```

```
x402-weather-guard v0.1.0 listening on :4024
  payment rails:
    EVM     base-sepolia  USDC → 0x40252CFDF8B20Ed757D61ff157719F33Ec332402
    Solana  solana         USDC → WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
  facilitator: https://x402.org/facilitator
  paid routes:
    GET /forecast                $0.001
    POST /decision               $0.002
  free routes: GET /, GET /health, GET /.well-known/x402
```

Check it is alive:

```bash
curl -s http://localhost:4024/health
# {"status":"ok","uptime":1.2}
```

## 4. Your first 402

```bash
curl -s "http://localhost:4024/forecast?lat=47.6062&lon=-122.3321&hours=6" | jq
```

You get HTTP **402** and a challenge listing **both** rails:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "1000",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
    { "scheme": "exact", "network": "solana", "maxAmountRequired": "1000",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }
  ]
}
```

That is the whole price negotiation: no key, no signup, no account. The price
is `1000` USDC base units (6 decimals) = **$0.001**.

## 5. Pay for real

Get a Base Sepolia test wallet and fund it with test USDC from
<https://faucet.circle.com>. Then:

```bash
PRIVATE_KEY=0xYourTestKey npm run client
```

[`examples/agent-client.ts`](../examples/agent-client.ts) does the full flow:

1. Calls the route unpaid and prints both rails from the 402.
2. Signs an EIP-3009 USDC authorization for exactly $0.001.
3. Retries with the `X-PAYMENT` header.
4. Prints the artifact and decodes the `X-PAYMENT-RESPONSE` receipt.

Prefer Solana? The bottom of that file shows the equivalent flow — the server
needs no changes, since the same 402 already advertises the `solana` rail.

## 6. Read the artifact

The 200 body **is** the purchase:

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

For `/decision`, read `verdict` first and `reasoning` second. Each breach names
the factor, the hour it happens, what was forecast, what the limit was, and
whether it is *blocking* (one is enough for a no-go) or *marginal* (several
together make it risky). `alertStatus` tells you whether the alert lookup
actually ran — outside the US it reads `ok (no active alerts)` because NWS has
no jurisdiction there, not because the sky is clear.

`alternativeWindows` never overlaps the window you asked about, so every entry
is a real reschedule you could propose. `confidence` drops with forecast lead
time and with how close the call was, so a `risky` verdict seven days out is
appropriately less certain than a `no-go` two hours out.

The thresholds a verdict was measured against are echoed in `thresholds` — and
you can see every built-in profile for free at `GET /profiles` before spending
anything.

Full field-by-field reference: [api.md](api.md).

## 7. Going to mainnet

```bash
# EVM: Base mainnet
NETWORK=base
PAY_TO_ADDRESS=0xYourRealAddress

# Solana: mainnet (this is already the default)
SOLANA_NETWORK=mainnet-beta
SOLANA_PAY_TO_ADDRESS=YourRealSolanaAddress
SOLANA_RPC_URL=https://your-dedicated-rpc.example.com

# A facilitator that settles on the networks you accept
FACILITATOR_URL=https://x402.org/facilitator
```

Then run `npm run build && npm start`. Nothing else changes: the same routes,
the same prices, real USDC.

> Use a dedicated Solana RPC in production. The public endpoint is heavily
> rate-limited.

## Where to go next

- [api.md](api.md) — every endpoint, parameter, and error
- [agents.md](agents.md) — discovery, MCP, and listing your instance
- [../skill.md](https://github.com/nirholas/x402-weather-guard/blob/main/skill.md) — the agent-facing skill file
- [../examples/curl.md](https://github.com/nirholas/x402-weather-guard/blob/main/examples/curl.md) — the same flow in raw curl
