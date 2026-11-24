import { expect, test } from "bun:test";
import {
  collectorState,
  matches,
  seedPlayers,
  seedQueueProgress,
} from "@your-league-coach/db/schema/lol";
import { crawlWindow } from "../src/crawl";
import { checkPatches } from "../src/patch";
import { RiotClient } from "../src/riot/client";
import { RiotPayloadError, RiotTransportError } from "../src/riot/errors";
import { RiotRateLimiter } from "../src/riot/rate-limiter";
import { seedPlayersForKey } from "../src/seed";
import { exampleItems, recorded } from "./match-fixtures";
import { FakeClock } from "./riot/fake-clock";
import { withTestDatabase } from "./test-database";

const setupRiot = (
  transport: ConstructorParameters<typeof RiotClient>[0]["transport"],
  signal?: AbortSignal
) =>
  new RiotClient({
    apiKey: "test-token",
    platform: "euw1",
    region: "europe",
    limiter: new RiotRateLimiter(new FakeClock()),
    signal,
    transport,
  });

test.skipIf(!process.env.DATABASE_URL)(
  "backfills per queue and resumes a cancelled window without advancing incomplete progress",
  async () => {
    await withTestDatabase(async (db) => {
      const sr = await recorded("SR");
      const aram = await recorded("ARAM");
      const current = () => Date.UTC(2026, 10, 24);
      const later = () => current() + 60_000;
      const controller = new AbortController();
      const srId = sr.match.metadata.matchId;
      const aramId = aram.match.metadata.matchId;
      await db
        .insert(seedPlayers)
        .values({ puuid: "fake-seed", tier: "EMERALD" });
      await checkPatches(db, async () => ["16.22.1", "16.5.1"], current);
      const history: URLSearchParams[] = [];
      const matchFetches: string[] = [];
      const transport =
        (soloHistory: string[], interrupt?: AbortController) => (url: URL) => {
          if (url.pathname.endsWith("/ids")) {
            history.push(url.searchParams);
            if (url.searchParams.get("queue") === "450") {
              return Promise.resolve(Response.json([aramId]));
            }
            return Promise.resolve(Response.json(soloHistory));
          }
          const id = url.pathname.split("/").at(-1);
          if (id === "timeline") {
            const matchId = url.pathname.split("/").at(-2);
            const fixture = matchId === aramId ? aram : sr;
            return Promise.resolve(
              Response.json({ ...fixture.timeline, metadata: { matchId } })
            );
          }
          if (id === "old" || id === "remake") {
            return Promise.resolve(
              Response.json({
                ...sr.match,
                metadata: { matchId: id },
                info: {
                  ...sr.match.info,
                  gameVersion: id === "old" ? "16.4.1.1" : "16.99.1.1",
                  gameDuration:
                    id === "remake" ? 299 : sr.match.info.gameDuration,
                },
              })
            );
          }
          if (id === "new" || id === "committed") {
            matchFetches.push(id);
            if (id === "new" && interrupt) {
              interrupt.abort();
              return Promise.reject(new TypeError("cancelled transport"));
            }
            return Promise.resolve(
              Response.json({ ...sr.match, metadata: { matchId: id } })
            );
          }
          return Promise.resolve(
            Response.json(id === aramId ? aram.match : sr.match)
          );
        };
      const loadItems = async () => exampleItems;
      const initial = {
        db,
        riot: setupRiot(transport([srId])),
        now: current,
        loadItems,
      };
      expect(await crawlWindow(initial, 420)).toMatchObject({
        inserted: 1,
        complete: true,
      });
      expect(await crawlWindow(initial, 450)).toMatchObject({
        inserted: 1,
        complete: true,
      });
      expect(
        history.map((call) => [call.get("queue"), call.get("startTime")])
      ).toEqual([
        ["420", String(Date.UTC(2026, 9, 27) / 1000)],
        ["450", String(Date.UTC(2026, 9, 27) / 1000)],
      ]);
      expect(await db.$count(matches)).toBe(2);
      const laterHistory = [srId, "old", "remake", "committed", "new"];
      await expect(
        crawlWindow(
          {
            ...initial,
            now: later,
            signal: controller.signal,
            riot: setupRiot(
              transport(laterHistory, controller),
              controller.signal
            ),
          },
          420
        )
      ).rejects.toBeInstanceOf(RiotTransportError);
      expect(await db.select().from(seedQueueProgress)).toMatchObject([
        { queueId: 420, crawledUntil: new Date(current()) },
        { queueId: 450, crawledUntil: new Date(current()) },
      ]);
      expect(await db.$count(matches)).toBe(3);
      expect(
        await crawlWindow(
          { ...initial, now: later, riot: setupRiot(transport(laterHistory)) },
          420
        )
      ).toMatchObject({
        inserted: 1,
        complete: true,
      });
      expect(history.slice(2).map((call) => call.get("startTime"))).toEqual([
        String(current() / 1000),
        String(current() / 1000),
      ]);
      expect(matchFetches).toEqual(["committed", "new", "new"]);
      expect(await db.$count(matches)).toBe(4);
      const malformed = setupRiot((url) =>
        Promise.resolve(
          Response.json(
            url.pathname.endsWith("/ids")
              ? ["malformed"]
              : { info: { gameVersion: "<untrusted>" } }
          )
        )
      );
      await expect(
        crawlWindow({ ...initial, now: later, riot: malformed }, 420)
      ).rejects.toBeInstanceOf(RiotPayloadError);
      expect(await db.$count(matches)).toBe(4);
    });
  }
);

test.skipIf(!process.env.DATABASE_URL)(
  "changing the key discards old seed identities and queue progress",
  async () => {
    await withTestDatabase(async (db) => {
      let calls = 0;
      const riot = setupRiot(() => {
        calls += 1;
        return Promise.resolve(Response.json([{ puuid: `seed-${calls}` }]));
      });
      await seedPlayersForKey(db, riot, "key-one", { sample: true });
      expect(
        await seedPlayersForKey(db, riot, "key-one", { sample: true })
      ).toBe(0);
      const [prior] = await db.select().from(collectorState);
      const [seed] = await db.select().from(seedPlayers);
      if (!seed) {
        throw new TypeError("Expected a seed");
      }
      await db.insert(seedQueueProgress).values({
        seedPlayerId: seed.id,
        queueId: 420,
        crawledUntil: new Date(0),
      });
      await seedPlayersForKey(db, riot, "key-two", { sample: true });
      const [next] = await db.select().from(collectorState);
      expect(next?.apiKeyFingerprint).toHaveLength(64);
      expect(next?.apiKeyFingerprint).not.toBe(prior?.apiKeyFingerprint);
      expect(await db.select().from(seedPlayers)).toMatchObject([
        { puuid: "seed-2", tier: "EMERALD" },
      ]);
      expect(await db.$count(seedQueueProgress)).toBe(0);
    });
  }
);
