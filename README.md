# x402-weather-guard

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![x402](https://img.shields.io/badge/payments-x402-0052ff.svg)](https://x402.org)
[![USDC on Base](https://img.shields.io/badge/USDC-Base-0052ff.svg)](https://base.org)
[![USDC on Solana](https://img.shields.io/badge/USDC-Solana-14f195.svg)](https://solana.com)

**Go/no-go weather decisions for plans — forecasts and verdicts from
Open-Meteo and NWS, keyless and live.** One HTTP call, USDC on Base *or*
Solana, and the answer comes back in the response body: an hourly forecast, or a
verdict with its reasoning and the next windows that would work instead.

Docs site: **https://nirholas.github.io/x402-weather-guard/**

## Why x402 for this

An agent scheduling something outdoors does not want a weather subscription; it
wants one answer, now, about one place and one window. Weather APIs sell tiers
and keys, which is the wrong unit and the wrong onboarding for software that
appears, decides, and leaves. x402 prices the decision itself: $0.001 for the
raw hourly forecast, $0.002 for the verdict with reasoning and alternatives,
paid in USDC on whichever chain the agent holds funds on. Both upstreams are
free and keyless, so the price buys the thresholds, the breach analysis, and the
alternative-window search, not a resold feed.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-weather-guard
cd x402-weather-guard
npm install
npm run dev            # http://localhost:4024 — no configuration needed
```

See the price with no wallet at all:

```bash
curl -s "http://localhost:4024/forecast?lat=47.6062&lon=-122.3321&hours=6" | jq
# 402 + accepts: [ USDC on Base, USDC on Solana ]
```

Then buy it, from an agent (wallet funded with Base Sepolia USDC —
https://faucet.circle.com):

```bash
PRIVATE_KEY=0xYourTestKey npm run client
```

## API

| Route | Price | What you get back |
|-------|-------|-------------------|
| `GET /forecast` | **$0.001** | Hour-by-hour temperature, feels-like, precipitation probability and amount, wind, gusts, cloud, visibility, and plain-English conditions, with any active NWS alerts |
| `POST /decision` | **$0.002** | A verdict, the threshold breaches behind it, the worst hour, active alerts, and up to five non-overlapping alternative windows that would clear the same bar |
| `GET /` | free | Service metadata, live prices, active payment rails, activity profiles |
| `GET /health` | free | Liveness probe |
| `GET /profiles` | free | Every built-in activity threshold profile, so you can see the bar before paying |
| `GET /.well-known/x402` | free | Machine-readable discovery manifest |
| `GET /skill.md` | free | This agent skill card |
| `GET /openapi.json` | free | OpenAPI 3.1 spec |

Full reference: [docs/api.md](docs/api.md) · [openapi.json](openapi.json)

## How x402 works

**Pay in USDC on Base or Solana — your client picks the rail.**

1. **402** — the route, called without payment, replies HTTP 402 with an
   `accepts` array holding **both** rails: exact price
   ($0.001 → `1000` USDC base units), asset, and `payTo`.
2. **Sign** — on Base, the client signs an EIP-3009 USDC authorization (no gas
   from the payer). On Solana, it signs an SPL `transferChecked` whose fee payer
   is the facilitator's sponsor account (so the buyer needs USDC only, no SOL).
3. **Settle** — the server hands the payload to the facilitator
   (`https://x402.org/facilitator`), which verifies and settles on the chosen chain.
4. **200** — the same request returns the artifact in the body, with the
   settlement receipt in the `X-PAYMENT-RESPONSE` header.

| Rail | Network | Asset | payTo |
|------|---------|-------|-------|
| EVM | `base-sepolia` (`base` on mainnet) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (`solana-devnet` on devnet) | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

Those are the suite's public receive addresses and the server's defaults. Set
`PAY_TO_ADDRESS` / `SOLANA_PAY_TO_ADDRESS` to be paid yourself.

Walkthroughs: [examples/curl.md](examples/curl.md) ·
[examples/agent-client.ts](examples/agent-client.ts) ·
[docs/tutorial.md](docs/tutorial.md)

## Real backend / API keys

| Env | Effect |
|-----|--------|
| *(nothing)* | Both upstreams are keyless and called live out of the box. `npm install && npm run dev` returns real forecasts for anywhere on Earth. |
| `CONTACT_EMAIL` | Goes into the User-Agent sent to NWS, which [asks every automated caller to identify itself](https://www.weather.gov/documentation/services-web-api). Set it to your own address before running this anywhere public. |

All variables: [.env.example](.env.example)

## For AI agents

- **[skill.md](skill.md)** — agent-facing skill file: endpoints, prices,
  schemas, both payment rails. Point your agent at it.
- **`GET /.well-known/x402`** — discovery manifest listing every resource with
  both networks. Indexable by [x402scan.com](https://x402scan.com), the x402
  Bazaar, and [agentic.market](https://agentic.market).
- **MCP** — [examples/mcp-tool.md](examples/mcp-tool.md) exposes these routes as
  Claude MCP tools, with per-wallet spend caps and a
  `claude_desktop_config.json` example.
- More: [docs/agents.md](docs/agents.md)

## Docs

- Landing: https://nirholas.github.io/x402-weather-guard/
- [Tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [For AI agents](docs/agents.md)

## Support

Questions, bugs, or a listing request: **nichxbt@gmail.com** ·
[open an issue](https://github.com/nirholas/x402-weather-guard/issues)

## License

Apache-2.0. Part of the [x402 Suite](https://github.com/nirholas/x402-suite).
