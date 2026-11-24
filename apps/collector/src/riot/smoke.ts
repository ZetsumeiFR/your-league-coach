import { QUEUES } from "@your-league-coach/lol-data/queues";
import { RiotClient, SOLO_LEAGUE_QUEUE } from "./client";
import { RiotAuthError, RiotHttpError, RiotTransportError } from "./errors";
import { SECOND_MS } from "./limits";
import { RiotRateLimiter } from "./rate-limiter";

const SMOKE_TIMEOUT_MS = 45 * SECOND_MS;

async function smoke(): Promise<void> {
  // Bun loads the collector's .env. This Riot-only probe must not require a database.
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    process.stderr.write("RIOT_API_KEY is required\n");
    process.exitCode = 1;
    return;
  }
  const client = new RiotClient({
    apiKey,
    platform: process.env.RIOT_PLATFORM ?? "euw1",
    region: process.env.RIOT_REGION ?? "europe",
    limiter: new RiotRateLimiter(),
    signal: AbortSignal.timeout(SMOKE_TIMEOUT_MS),
  });
  const entries = await client.leagueExpEntries(
    SOLO_LEAGUE_QUEUE,
    "EMERALD",
    "I",
    1
  );
  const candidates = await Promise.all(
    entries.slice(0, 3).map(({ puuid }) =>
      client.matchIdsByPuuid(puuid, {
        queue: QUEUES.RANKED_SOLO,
        count: 1,
      })
    )
  );
  const matchId = candidates.find((ids) => ids.length > 0)?.[0];
  if (matchId !== undefined) {
    const [match, timeline] = await Promise.all([
      client.match(matchId),
      client.timeline(matchId),
    ]);
    if (
      match.metadata.matchId === matchId &&
      match.info.queueId === QUEUES.RANKED_SOLO &&
      timeline.metadata.matchId === matchId
    ) {
      process.stdout.write(
        `queueId=${match.info.queueId} gameVersion=${match.info.gameVersion}\n`
      );
      return;
    }
  }
  process.stderr.write("Riot smoke failed: no matching match and timeline\n");
  process.exitCode = 1;
}

try {
  await smoke();
} catch (error) {
  const known =
    error instanceof RiotAuthError ||
    error instanceof RiotHttpError ||
    error instanceof RiotTransportError;
  process.stderr.write(`${known ? error.message : "Riot smoke failed"}\n`);
  process.exitCode = 1;
}
