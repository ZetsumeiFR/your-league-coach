# Your League Coach

A desktop companion for League of Legends champ select and in-game item choices. It watches the League client on its own (no manual input), then suggests bans, picks, a full build (runes, summoner spells, skill order, items) and the next items to buy in game, based on current-patch Emerald+ match data. Recommendations can be imported into the client in one click.

- **Desktop app** (Tauri, Windows and macOS): talks to the local League client and to your server.
- **Server** (Hono + oRPC): serves recommendations, protected by one shared access key.
- **Collector**: crawls the Riot API, aggregates stats per patch, keeps retention.
- **PostgreSQL**, **Caddy** (automatic HTTPS) and a one-shot `migrate` job complete the stack.

The app only uses the Riot API, the League client API (LCU) and the Live Client Data API. It never shows other players' names in champ select and offers no dodge help.

## Data caveat: Emerald+ seed tier

Players are seeded from the Emerald+ ladders (EMERALD and DIAMOND via league-exp-v4, plus master, grandmaster and challenger via league-v4). Only matches from those players' histories are collected. For normal draft, flex and ARAM matches the seed player is Emerald+, but the **other nine participants' ranks are unknown**, so those queues are not strictly Emerald+ samples.

## Riot personal product key

1. Sign in at <https://developer.riotgames.com> and register a **Personal** product (describe the app honestly; no commercial use).
2. Once approved, copy the production API key. It is tied to your account: keep it secret and never commit it.
3. Put it in `apps/collector/.env` as `RIOT_API_KEY` (see below). Run **exactly one collector per Riot key** at any time (also never run a local collector against the same key while the VPS one runs).

The personal key allows about 72,000 requests per day (20 per second, 100 per 2 minutes); the collector enforces these limits itself and stops on HTTP 401/403.

## Environment

Each app owns an `.env.schema` (validated by [Varlock](https://varlock.dev)); real values live in git-ignored `.env` files. Copy the values you need:

| File | Variables |
| --- | --- |
| `.env` (repo root, read by Docker Compose) | `POSTGRES_PASSWORD` (required, no default), `COACH_DOMAIN` (required), optional `CADDY_HTTP_PORT` / `CADDY_HTTPS_PORT` (default 80 / 443), dev only `POSTGRES_HOST_PORT` (default 5432). Template: `.env.example`. |
| `apps/collector/.env` | `RIOT_API_KEY`, `RIOT_PLATFORM` (default `euw1`), `RIOT_REGION` (default `europe`), `DATABASE_URL` (overridden by Compose), optional `DDRAGON_BASE_URL`. |
| `apps/server/.env` | `COACH_ACCESS_KEY` (shared key, at least 32 characters), `CORS_ORIGIN`, `DATABASE_URL` (overridden by Compose). |
| `apps/web/.env` | Web/desktop public settings. |

A collector started without `RIOT_API_KEY` exits immediately with a Varlock validation error.

## Deploy on a VPS

1. Point a DNS record (`COACH_DOMAIN`) at the VPS and open ports 80 and 443.
2. Create `.env` (root) and the three app `.env` files above. Generate the shared key with `openssl rand -hex 32`.
3. Start everything:

```bash
bun run docker:up
```

This builds the images, starts Postgres, runs migrations (`migrate`, one-shot), then the server, the collector and Caddy, which obtains a certificate for `COACH_DOMAIN` automatically. Only Caddy publishes ports; Postgres and the server are reachable inside the Compose network only.

Other commands: `bun run docker:logs`, `bun run docker:down`, `bun run docker:build`. Check with `docker compose ps` (postgres and server healthy, `migrate` exited 0) and `docker compose logs collector` (patch detected, crawl started).

Quick check from anywhere:

```bash
curl -s -X POST https://<COACH_DOMAIN>/rpc/coach/meta -H 'Authorization: Bearer <key>' -H 'content-type: application/json' -d '{}'
```

A request without the header returns 401.

## Friends: connect the app

Install the desktop app (see Desktop Installers), open **Settings**, and enter the server URL (`https://<COACH_DOMAIN>`) and the shared access key you were given. No account is needed. `http://` URLs are accepted only for `localhost` / `127.0.0.1`.

## Local development

```bash
bun install
bun run db:start        # Postgres on 127.0.0.1:${POSTGRES_HOST_PORT:-5432} (loopback only)
bun run dev:server      # API on http://localhost:3000
bun run dev:collector   # collector (uses the real Riot key)
bun run dev:web         # web UI
```

`db:start`, `db:watch`, `db:stop` and `db:down` use `compose.dev.yml`, which publishes Postgres on loopback only. Set `POSTGRES_HOST_PORT` if 5432 is already taken. `bun run docker:up:dev` starts the full stack the same way (Postgres reachable from the host).

Apply migrations manually with `bun run --cwd packages/db db:migrate:deploy`.

Collector CLI (`apps/collector`): `bun run src/index.ts` runs all loops; `--no-crawl` keeps patch, aggregation and retention only; `--once patch|seed|crawl|aggregate|retention` runs a single job (`--limit N` only with `seed` or `crawl`).

## Scripts

- `bun run check` / `bun run fix`: lint and format (Ultracite)
- `bun run check-types`: type-check all workspaces
- `bun run db:generate | db:migrate | db:push | db:studio`: Drizzle tooling
- `cd apps/web && bun run desktop:dev` / `desktop:build`: run or build the Tauri app for the current OS (not defined at the repo root)

## Building the desktop app

The installer is built per OS (Tauri does not cross-compile): run `cd apps/web && bun run desktop:build` on Windows (MSI and NSIS `.exe`) and on macOS (`.dmg`). CI does this on both OS for every push.

## Desktop Installers

CI builds the desktop app on every push. Download the installers from the GitHub Actions run page, under Artifacts: `installer-windows` (`.msi` and `.exe`) and `installer-macos` (`.dmg`).

The installers are unsigned by design (no code signing), so the OS warns on first launch:

- **Windows (SmartScreen):** "Windows protected your PC" appears. Click **More info**, then **Run anyway**.
- **macOS (Gatekeeper):** the first launch is blocked.
  1. macOS 15 Sequoia and later: open the app once (it is blocked), then go to **System Settings > Privacy & Security**, scroll to **Security**, click **Open Anyway** next to "Your League Coach", and confirm with your password.
  2. macOS 14 and earlier: Control-click the app, then **Open**, then **Open**.
  3. Any version, from a terminal: `xattr -dr com.apple.quarantine "/Applications/Your League Coach.app"`.

## Riot Games legal notice

Your League Coach isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc. See the [Riot Games policies](https://developer.riotgames.com/policies/general).
