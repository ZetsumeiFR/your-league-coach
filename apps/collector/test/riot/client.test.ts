import { expect, it } from "bun:test";
import { file } from "bun";
import {
  RiotClient,
  type RiotTransport,
  SOLO_LEAGUE_QUEUE,
} from "../../src/riot/client";
import {
  RiotAuthError,
  RiotHttpError,
  RiotPayloadError,
  RiotRateLimitError,
  RiotTransportError,
} from "../../src/riot/errors";
import { RiotRateLimiter } from "../../src/riot/rate-limiter";
import { FakeClock } from "./fake-clock";

const testKey = "test-token";
const matchId = "EUW1_SR";
const fixture = (name: string) =>
  file(new URL(`../fixtures/${name}.json`, import.meta.url)).json();

const recordedMatch: unknown = await fixture(`match-${matchId}`);
const recordedTimeline: unknown = await fixture(`timeline-${matchId}`);

interface Call {
  readonly at: number;
  readonly init: RequestInit;
  readonly url: URL;
}

const ok = (call: Call): Response => {
  const { pathname } = call.url;
  if (pathname.endsWith("/timeline")) {
    return Response.json(recordedTimeline);
  }
  if (pathname.endsWith("/ids")) {
    return Response.json([matchId]);
  }
  if (pathname.startsWith("/lol/match/v5/")) {
    return Response.json(recordedMatch);
  }
  if (pathname.startsWith("/lol/league-exp/")) {
    return Response.json([{ puuid: "puuid-1" }]);
  }
  return Response.json({ entries: [{ puuid: "puuid-1" }] });
};

function setup(respond: (call: Call, count: number) => Response = ok) {
  const clock = new FakeClock();
  const limiter = new RiotRateLimiter(clock);
  const calls: Call[] = [];
  const transport: RiotTransport = (url, init) => {
    const call = { at: clock.now(), url, init };
    calls.push(call);
    return Promise.resolve(respond(call, calls.length));
  };
  const client = () =>
    new RiotClient({
      apiKey: testKey,
      platform: "euw1",
      region: "europe",
      limiter,
      transport,
    });
  return { calls, client, clock };
}

const rateLimited = (scope: string, seconds: string): Response =>
  new Response(null, {
    status: 429,
    headers: { "X-Rate-Limit-Type": scope, "Retry-After": seconds },
  });

const seed = (client: RiotClient) =>
  client.leagueExpEntries(SOLO_LEAGUE_QUEUE, "EMERALD", "I", 1);
const history = (client: RiotClient) =>
  client.matchIdsByPuuid("puuid-1", { queue: 420 });

it("does not retry a 429 until Retry-After's two seconds have elapsed", async () => {
  const { client, clock, calls } = setup((call, n) =>
    n === 1 ? rateLimited("application", "2") : ok(call)
  );
  const pending = history(client());
  await clock.advanceTo(1999);
  expect(calls.map(({ at }) => at)).toEqual([0]);
  await clock.advanceTo(2000);
  await expect(pending).resolves.toEqual([matchId]);
  expect(calls.map(({ at }) => at)).toEqual([0, 2000]);
});

it.each(["application", "", "unknown"])(
  "blocks both platform callers but not the regional host for scope %p",
  async (scope) => {
    const { client, clock, calls } = setup((call, n) =>
      n === 1 ? rateLimited(scope, "5") : ok(call)
    );
    const seeding = seed(client());
    await clock.advanceTo(0); // Observe the first 429 before admitting further work.
    const crawling = client().apexLeague("master");
    const regional = history(client());
    await clock.advanceTo(4999);

    await expect(regional).resolves.toEqual([matchId]);
    expect(calls.map(({ at, url }) => [at, url.hostname])).toEqual([
      [0, "euw1.api.riotgames.com"],
      [0, "europe.api.riotgames.com"],
    ]);
    await clock.advanceTo(5000);
    await Promise.all([seeding, crawling]);
    expect(calls.slice(2).map(({ at }) => at)).toEqual([5000, 5000]);
  }
);

it("blocks only the exhausted method after a method-scope 429", async () => {
  const { client, clock, calls } = setup((call, n) =>
    n === 1 ? rateLimited("method", "5") : ok(call)
  );
  const first = seed(client());
  await clock.advanceTo(0);
  const second = seed(client());
  const other = client().apexLeague("challenger");
  await clock.advanceTo(4999);

  await expect(other).resolves.toHaveProperty("entries.0.puuid", "puuid-1");
  expect(calls.map(({ url }) => url.pathname)).toEqual([
    "/lol/league-exp/v4/entries/RANKED_SOLO_5x5/EMERALD/I",
    "/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5",
  ]);
  await clock.advanceTo(5000);
  await Promise.all([first, second]);
  expect(calls.slice(2).map(({ at }) => at)).toEqual([5000, 5000]);
});

it("holds master but not challenger after a method-scope 429 on master", async () => {
  const { client, clock, calls } = setup((call, n) =>
    n === 1 ? rateLimited("method", "5") : ok(call)
  );
  const master = client().apexLeague("master");
  await clock.advanceTo(0);
  const challenger = client().apexLeague("challenger");
  const regional = history(client());
  await clock.advanceTo(4999);
  expect(calls.map(({ at, url }) => [at, url.pathname])).toEqual([
    [0, "/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5"],
    [0, "/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5"],
    [0, "/lol/match/v5/matches/by-puuid/puuid-1/ids"],
  ]);
  await Promise.all([challenger, regional]);
  await clock.advanceTo(5000);
  await master;
  expect(calls.at(-1)?.at).toBe(5000);
  expect(calls.at(-1)?.url.pathname).toBe(calls[0]?.url.pathname);
});

it("blocks match, timeline and history after a match service 429, but not platform league", async () => {
  const { client, clock, calls } = setup((call, n) =>
    n === 1 ? rateLimited("service", "5") : ok(call)
  );
  const match = client().match(matchId);
  await clock.advanceTo(0);
  const timeline = client().timeline(matchId);
  const ids = history(client());
  const league = seed(client());
  await clock.advanceTo(4999);

  await expect(league).resolves.toHaveLength(1);
  expect(calls.map(({ url }) => url.hostname)).toEqual([
    "europe.api.riotgames.com",
    "euw1.api.riotgames.com",
  ]);
  await clock.advanceTo(5000);
  await Promise.all([match, timeline, ids]);
  expect(calls.slice(2).map(({ at }) => at)).toEqual([5000, 5000, 5000]);
});

it("adopts stricter application and method windows even with malformed header pairs", async () => {
  const { client, clock, calls } = setup((call, n) => {
    if (n !== 1) {
      return ok(call);
    }
    return Response.json([{ puuid: "puuid-1" }], {
      headers: {
        "X-App-Rate-Limit": "bogus,0:120,2:1,99:-1",
        "X-Method-Rate-Limit": "invalid,1:2",
      },
    });
  });
  await seed(client());
  const pending = [
    seed(client()),
    client().apexLeague("master"),
    client().apexLeague("grandmaster"),
  ];
  await clock.advanceTo(999);
  expect(calls.map(({ at }) => at)).toEqual([0, 0]);
  await clock.advanceTo(1999);
  expect(calls.map(({ at }) => at)).toEqual([0, 0, 1000]);
  await clock.advanceTo(2000);
  await Promise.all(pending);
  expect(calls.map(({ at }) => at)).toEqual([0, 0, 1000, 2000]);
});

it("backs off 1, 2 and 4 seconds before surfacing a persistent 5xx", async () => {
  const { client, clock, calls } = setup(
    () => new Response(null, { status: 503 })
  );
  const failed = history(client()).catch((error: unknown) => error);
  await clock.advanceTo(7000);
  expect(await failed).toBeInstanceOf(RiotHttpError);
  expect(calls.map(({ at }) => at)).toEqual([0, 1000, 3000, 7000]);
});

it("throws RiotRateLimitError after three 429 retries with malformed Retry-After", async () => {
  const { client, clock, calls } = setup(() =>
    rateLimited("application", "bad")
  );
  const failed = history(client()).catch((error: unknown) => error);
  await clock.advanceTo(3000);
  expect(await failed).toBeInstanceOf(RiotRateLimitError);
  expect(calls.map(({ at }) => at)).toEqual([0, 1000, 2000, 3000]);
});

it.each([401, 403])(
  "does not retry HTTP %i or include the response body",
  async (status) => {
    const { client, calls } = setup(() => new Response(testKey, { status }));
    const pending = seed(client());
    await expect(pending).rejects.toBeInstanceOf(RiotAuthError);
    await expect(pending).rejects.toThrow(`HTTP ${status})`);
    await expect(pending).rejects.not.toThrow(testKey);
    expect(calls).toHaveLength(1);
  }
);

it("rejects malformed match data without exposing response contents", async () => {
  const { client, calls } = setup(() =>
    Response.json({ metadata: { matchId }, info: { gameVersion: testKey } })
  );
  const pending = client().match(matchId);
  await expect(pending).rejects.toBeInstanceOf(RiotPayloadError);
  await expect(pending).rejects.not.toThrow(testKey);
  expect(calls).toHaveLength(1);
});

it("resolves legacy summoner IDs through the platform and sends the key only as a header", async () => {
  const { client, calls } = setup((_, n) =>
    n === 1
      ? Response.json([{ summonerId: "legacy/id" }, { puuid: "puuid-2" }])
      : Response.json({ puuid: "puuid-1" })
  );
  await expect(seed(client())).resolves.toEqual([
    { puuid: "puuid-1" },
    { puuid: "puuid-2" },
  ]);
  expect(calls[1]?.url.href).toBe(
    "https://euw1.api.riotgames.com/lol/summoner/v4/summoners/legacy%2Fid"
  );
  for (const { url, init } of calls) {
    expect(url.href).not.toContain(testKey);
    expect(new Headers(init.headers).get("X-Riot-Token")).toBe(testKey);
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  }
});

it("cancels an in-flight fetch on the caller deadline without exposing its abort reason", async () => {
  const deadline = new AbortController();
  const { promise: started, resolve: start } = Promise.withResolvers<void>();
  const client = new RiotClient({
    apiKey: testKey,
    platform: "euw1",
    region: "europe",
    signal: deadline.signal,
    limiter: new RiotRateLimiter(new FakeClock()),
    transport: (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
        start();
      }),
  });
  const pending = seed(client);
  const failed = pending.catch((error: unknown) => error);
  await started;
  deadline.abort(new Error(testKey));
  expect(await failed).toBeInstanceOf(RiotTransportError);
  await expect(pending).rejects.not.toThrow(testKey);
});

it("resolves a large apex roster without recursive stack growth", async () => {
  const entries = Array.from({ length: 25_000 }, (_, i) => ({
    puuid: `seed-${i}`,
  }));
  const { client, calls } = setup(() => Response.json({ entries }));
  expect((await client().apexLeague("master")).entries).toEqual(entries);
  expect(calls).toHaveLength(1);
});
