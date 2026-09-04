# Corro API

A self-hosted research agent behind an HTTP API that is deliberately smaller than a
model-provider SDK. No accounts, no OAuth, no API keys for callers: the server
recognises the device and keeps that device's sessions itself.

```bash
pnpm install
pnpm tokenizers:prepare && pnpm tokenizers:calibrate   # once, ~6 MB of tokenizer ranks
pnpm dev
```

No API key is needed to run it: the default model is served by a free, keyless
endpoint. Fast mode is opt-in and needs Modal credentials.

## The one-line version

```bash
curl -N -X POST localhost:8787/say -d "who won the 2019 Nobel prize in physics?"
```

Plain text in, streaming plain text out. No JSON envelope, no message array, no
`role: "user"`, no SSE parsing. The reply streams as it is generated, and the
session id comes back in the `X-Corro-Session` header so the next question can
continue the conversation:

```bash
curl -N -X POST "localhost:8787/say?session=ses_..." -d "and who else was nominated?"
```

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| `POST` | `/say` | plain text in, streaming plain text out |
| `POST` | `/chat` | full agent run; JSON by default, SSE with `"stream": true` |
| `GET` | `/sessions` | this device's sessions, with token totals |
| `GET` | `/sessions/:id` | one session: messages, tool calls, context usage |
| `PATCH` | `/sessions/:id` | rename |
| `DELETE` | `/sessions/:id` | forget |
| `GET` | `/device` | which device the server thinks you are |
| `GET` | `/models`, `/models/:key` | live model cards + tokenizer status |
| `GET` | `/tools`, `POST /tools/:name` | the toolbelt, and running one tool with no model |
| `GET` | `/prompt` | the system prompt as the agent receives it |
| `POST` | `/tokens` | token counting, optionally with prompt and tools included |
| `GET` | `/test` | end-to-end smoke test |
| `GET` | `/` | the control console |

### POST /chat

```jsonc
{
  "message": "what changed in the EU AI Act in 2025?",  // or "messages": [...]
  "session": "ses_...",      // omit to start one, null for the same, remember:false for none
  "stream": true,            // or send Accept: text/event-stream
  "model": "kimi-k3",        // or "kimi-k3-fast" / "fast"
  "tools": ["web_search"],   // omit for all, [] for none
  "maxSteps": 8,
  "temperature": 0.2,
  "region": "AM",           // overrides what the headers implied
  "systemExtra": "Prefer primary legal sources."
}
```

Streaming sends server-sent events: `session`, `start` (carries the context
budget before generation), `text`, `reasoning`, `tool-call`, `tool-result`,
`usage`, `done`, `error`.

## Tools

| Name | What it does |
| --- | --- |
| `calculator` | exact arithmetic, no model in the loop |
| `currency_convert` | live currency conversion, ~200 currencies including AMD and RUB |
| `web_search` | ranked results with a snippet each (Tavily) |
| `web_extract` | full text of specific URLs, batched |
| `web_crawl` | follow links from a page and read what they contain |
| `web_map` | list a site's URLs without reading any of them |
| `yerevan_city_search`, `parma_search`, `sas_search` | search a supermarket catalogue: live AMD prices and discounts |
| `yerevan_city_product`, `parma_product`, `sas_product` | one product in full: description, origin, photos |
| `yerevan_city_categories`, `parma_categories`, `sas_categories` | walk a shop's category tree |
| `amazon_search`, `walmart_search` | search a US marketplace: live USD prices, ratings, current deals |
| `amazon_product`, `walmart_product` | one product in full: description, brand, stock, photos |
| `apple_search` | every current colour/storage price for an iPhone or iPad line |
| `apple_product` | the same, unfiltered, plus a description and photo |

The web tools are Tavily. Every response is trimmed before the model sees it:
tracking parameters stripped from URLs, markup and image links removed, results
deduped by URL, and page text fitted to a `maxChars` budget that is shared out
across results so one long page cannot eat the whole context. Each tool takes its
own `maxChars`, so a cheap orienting search and a deep read cost what they should.

Keys are pooled: any `TAVILY_*_KEY` in the environment joins a rotation, and a key
that returns 401/403/429/432 is put on a one-minute cooldown while the request
retries on the next key. Tools never throw at the model — a failure comes back as
`{ ok: false, error }` so the run can recover or report the gap honestly.

Run one without a model to see its shape:

```bash
curl -s localhost:8787/tools/web_search -H 'content-type: application/json' -d '{"query":"EU AI Act 2025 changes","maxResults":3}'
```

## Currency

`currency_convert` reads [fawazahmed0/currency-api](https://github.com/fawazahmed0/currency-api),
an open-source mirror of daily exchange rates — no key, no request limit, ~200 currencies
including AMD and RUB, plus the major cryptocurrencies. "Unlimited" here means what a free
source can honestly promise: refreshed once a day upstream, not tick-by-tick — there is no
free, keyless, real-time forex API, so daily is the ceiling, not a corner cut. Two mirrors
of the same JSON are tried in order (`src/agent/tools/currency/client.ts`), and each base
currency's rate table is cached in memory for 30 minutes so a multi-step conversion in one
run doesn't refetch on every call.

```bash
curl -s localhost:8787/tools/currency_convert -H 'content-type: application/json' \
  -d '{"description":"Converting dollars to dram","amount":100,"from":"usd","to":["amd","rub"]}'
```

Give one `to` for a single conversion or several to compare against multiple currencies at
once. Both `from` and every `to` are checked against the service's own currency list first,
so a typo'd code comes back as a clear error rather than a confusing "no rate" failure.

## Supermarkets

Three Armenian chains are readable live, each with the same three tools — search,
product detail, category tree. Every one returns prices as a single figure the shopper
actually pays plus what it was, a normalised unit price (per kilo, per litre) so the
chains can be compared on the same basis, product photos, and a storefront URL on every
row so a claim about a price can be checked. Prices are AMD and are never converted.

```bash
curl -s localhost:8787/tools/parma_search -H 'content-type: application/json' \
  -d '{"description":"Checking coffee prices","query":"coffee","maxResults":3}'
```

None of them needs an API key, but they are reached three different ways.

**Yerevan City** ([yerevan-city.am](https://yerevan-city.am)) is an Angular app with
nothing in its HTML, so the tools talk to the JSON API its own front end uses. The shop
registers every visiting browser as a guest and so does this — one guest per language,
because translation comes from the guest's stored language and *not* from the
`content-language` header; an unauthenticated call gets Armenian names back whatever the
header says. `YEREVAN_CITY_DEVICE_ID` pins the guest identity across restarts.

**Parma** ([parma.am](https://parma.am), Yii) and **SAS** ([sas.am](https://www.sas.am),
Bitrix) render server-side and publish no API, so those tools read the same HTML a
shopper's browser gets and parse the handful of stable selectors each card uses. Nothing
is authenticated or bypassed; `src/agent/tools/shops/scrape.ts` holds the shared
fetching and extraction, and each shop's `parse.ts` holds only its own selectors — which
is the file to look at first when a chain redesigns.

Language is `en`, `ru` or `hy` on every tool. Parma switches on a path segment
(`/en/…`), SAS on a prefix with Armenian as the bare default, Yerevan City on the guest.

Search always needs something to narrow by — a query, a category, or the discount shelf.
The catalogues run to six figures and will not be listed whole.

## Marketplaces

**Amazon** and **Walmart** have a search and a product-detail tool each, no category tree
— a generalist marketplace has no neat aisle taxonomy the way a supermarket does. Prices
are USD, ratings and review counts come through where the shop has them, and
`amazon_product` takes ASINs while `walmart_product` takes the URLs `walmart_search`
already returned.

Neither site publishes an API, and both actively rate-limit automated traffic harder than
the Armenian supermarkets do: a plain, correctly-headed request gets a bot-check page
regardless of what it claims to be. What actually clears it is a *session* — one request
to the homepage first, so the site hands over the cookies a real visit would already have,
then the real request sent with those cookies and a referer. Nothing here is spoofed or
solved; it's a genuine two-step navigation, the same one a browser makes without thinking
about it. `src/agent/tools/shops/session.ts` holds this, one persistent session per shop
for the life of the process, re-warmed automatically if a response ever comes back
blocked. Even so, a request occasionally fails past a second try — the tool reports that
as an honest `{ ok: false, error }` rather than pretending the product doesn't exist, and
`AMAZON_TOOL_NAMES` / `WALMART_TOOL_NAMES` cost nothing to retry a moment later.

Walmart renders as a Next.js app and ships the whole page's state as one
`__NEXT_DATA__` JSON blob, so `walmart/parse.ts` reads that directly rather than the
markup. Amazon has no such blob, so `amazon/parse.ts` reads the page's own accessibility
labels — "$141.99 with 25 percent savings" is one string Amazon writes for screen
readers, and a far more stable target across the site's constant page-template
experiments than any single visual price widget would be.

**Apple** is narrower on purpose: `apple_search` and `apple_product` cover iPhone and
iPad only. Apple's storefront is not one catalogue but several incompatible configurator
engines — iPhone and iPad share a simple colour/storage picker whose data is uniform and
easy to read; Mac is a build-to-order system with its own price-key indirection, and Watch
a two-stage case-then-band picker with a third. Rather than half-parse three different
schemas, only the two that are uniform are read. Apple also has no site-wide product
search the way a marketplace does — `apple_search` matches a query against a small,
hand-kept directory of the current buy pages (`PRODUCT_LINES` in `apple/parse.ts`, a
handful of entries that change on Apple's own release cycle) rather than querying Apple's
own search, which mixes shop, support and marketing results. Unlike Amazon and Walmart,
Apple's buy pages serve a plain first request with no session needed — Apple sets one
price for everyone, so there's nothing here worth rate-limiting.

## Region

Some tools only make sense in one country, and the model writes a better answer when it
knows more than a country code. The server infers where the caller is, in the same
spirit as the device id — `X-Corro-Region`, then `?region=`, then a geolocation lookup on
the caller's IP (`src/http/geoip.ts`, city/subdivision/timezone via ip-api.com, cached per
IP), then `cf-ipcountry` from a proxy when the lookup has nothing, then the region subtag
of `accept-language` (`hy-AM`; a bare `hy` implies `AM`) as the last resort — and puts it
in the system prompt as `<user_region>`, e.g. `Yerevan, Yerevan, Armenia (timezone:
Asia/Yerevan)`. An explicit header or query override is taken at face value and skips the
geolocation lookup entirely — a traveller knows better than an IP where they consider
themselves to be. When the (country-level) region has local sources, the prompt names
them as the first thing to reach for on product, price and availability questions, so
`POST /say` from an Armenian browser answers "how much is X" from a shop's own live data
instead of from a web search, and "where is it cheapest" by pricing it at all three.
`POST /chat` takes `"region": "AM"` to override the guess, and `GET /device` reports what
was detected and how.

## Models

`kimi-k3` and `kimi-k3-fast` are the same model; they differ only in where they run.
`deepseek-v4-pro` is a separate model on the same free endpoint.

| Key | Endpoint | Speed | Cost | Modalities |
| --- | --- | --- | --- | --- |
| `kimi-k3` *(default)* | `unified-nvidia-api.vercel.app` | variable — sometimes fast, sometimes ~3-10 tok/s | free, keyless, unlimited | text, image, video in → text out |
| `kimi-k3-fast` | your Modal deployment | fast and steady | spends Modal credits | text, image, video in → text out |
| `deepseek-v4-pro` | `unified-nvidia-api.vercel.app` | variable, very slow cold starts | free, keyless, unlimited | text only |

`deepseek-v4-pro` has a 1M token context window and shares Kimi's reasoning-effort
range — `none`, `low`, `high`, `max`, default `high` — set with `"reasoningEffort"`
on `/chat`. `/models` always reports the live set for whichever model answered, so
a client should read `reasoningEfforts` rather than assume one scale fits every
model.

Pick one per request with `"model": "kimi-k3-fast"`, or just ask for fast mode:

```jsonc
{ "message": "...", "fast": true }     // POST /chat
```

```bash
curl -N -X POST "localhost:8787/say?fast=true" -d "..."
```

`fast` and `free` also work as model names, so `?model=fast` is the same thing.
`CORRO_DEFAULT_MODEL` and `CORRO_FAST_MODEL` change what those two mean.

If Modal is not configured, fast mode is simply reported as unreachable by
`/models` and requests naming it fail with that message. The free endpoint keeps
working on its own.

Because the two endpoints wrap the same model in slightly different chat
scaffolding, they are calibrated separately: the free one costs 75 tokens of
fixed overhead per request, Modal's 74. Both reproduce their server's
`prompt_tokens` exactly on every held-out case (`pnpm tokenizers:check`).

## Sessions live in the API

The server stores every session as a JSON file under `data/sessions/<device>/`,
so a client never has to hold the transcript or replay it on each turn. Sending
`session` is enough; history is prepended server-side.

Each session records, per turn: the messages, their token counts, the tool calls
with their inputs and outputs, the server-reported usage, and a running total.

## Context usage, by kind

Every session (and every `start` / `done` event) carries a breakdown of what is
actually occupying the context window:

```json
{
  "used": 1093,
  "contextLength": 1000000,
  "percentUsed": 0.1,
  "exact": false,
  "method": "per-role",
  "breakdown": { "system": 770, "tools": 203, "history": 93, "input": 0, "overhead": 26 },
  "share":     { "system": 70.5, "tools": 18.6, "history": 8.5, "input": 0, "overhead": 2.4 }
}
```

- `system` — the system prompt
- `tools` — serialised tool schemas, which are re-sent on every request
- `history` — earlier turns in this session
- `input` — the current question
- `overhead` — chat scaffolding the server wraps around the messages

`exact` is only true when the count is verified to reproduce the server's own
number to the token. With tools bound the tool schemas are reconstructed rather
than observed, so the figure is very close but not guaranteed; `toolsMeasured`
says whether they were counted at all.

## Devices instead of accounts

There are no accounts. A device is identified in this order:

1. `X-Corro-Device` header
2. `corro_device` cookie (set automatically on first response)
3. `?device=` query parameter
4. a fingerprint of user agent, language, platform and address

Step 4 is what makes `curl` work with no setup at all: the same machine keeps
landing on the same device id and sees its own sessions. Once you have that id,
send it as `X-Corro-Device` to carry sessions between clients. The id is the only
credential, so treat it like one.

## Client

`src/client/corro.ts` is a dependency-free client for browsers and Node.

```ts
import { corro } from './client/corro.js'

const client = corro({ baseUrl: 'http://localhost:8787' })

console.log(await client.text('what is 19 * 23?'))

for await (const chunk of client.stream('summarise the EU AI Act')) {
  process.stdout.write(chunk)
}

const chat = client.session()
await chat.ask('who won the 2019 Nobel in physics?')
await chat.ask('and what did they actually measure?')
console.log(chat.id, chat.context?.percentUsed)
```

## Layout

Each concern is one place to edit:

| Path | Concern |
| --- | --- |
| `src/agent/prompt.ts` | the system prompt (XML-tagged sections) |
| `src/agent/tools/` | the toolbelt; register new tools in `index.ts` |
| `src/agent/tools/shops/scrape.ts` | shared HTML reading for the shops with no API |
| `src/agent/tools/shops/session.ts` | the cookie-jar warm-up Amazon and Walmart need |
| `src/agent/tools/apple/parse.ts` | the iPhone/iPad product-line directory and page parsing |
| `src/agent/tools/currency/client.ts` | the exchange-rate mirror, its fallback and cache |
| `src/http/region.ts` | where the caller is, inferred from what they already send |
| `src/http/geoip.ts` | city/region/timezone from the caller's IP, cached |
| `src/agent/run.ts` | the model loop, `runAgent` and `streamAgent` |
| `src/chat/service.ts` | wiring a run to a session |
| `src/sessions/store.ts` | session persistence (JSON files) |
| `src/sessions/device.ts` | device identity |
| `src/context/usage.ts` | context-window accounting |
| `src/routes/` | the HTTP surface, one file per group |
| `src/models/registry.ts` | endpoints and live model cards |
| `src/tokenizer/specs.ts` | which models exist, and which tokenizer each uses |
| `src/tokenizer/` | exact BPE token counting |
| `src/client/corro.ts` | the client |
| `src/config.ts` | port, default model, body limit |

## Environment

See `.env.example`. `CORRO_DATA_DIR` overrides where sessions are written, `CORRO_DEFAULT_MODEL`
and `CORRO_FAST_MODEL` which model each route picks, `PORT` the port. Only fast
mode needs credentials (`KIMI_BASE_URL` + `MODAL_API_KEY`).

## No authentication

Deliberate, for an internal tool. Anything that can reach this port can spend
your model credits and read every session on it. Do not leave a tunnel open to
the public.
