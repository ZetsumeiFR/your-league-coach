import { expect, it } from "bun:test";
import { RiotClient } from "../../src/riot/client";
import { RiotRateLimiter } from "../../src/riot/rate-limiter";
import { FakeClock } from "./fake-clock";

const route = {
  host: "europe.api.riotgames.com",
  method: "match",
  path: "/lol/match/v5/matches/test",
};

it.each(["X-App-Rate-Limit", "X-Method-Rate-Limit"])(
  "enforces a newly learned 300-second %s window over earlier sends",
  async (header) => {
    const clock = new FakeClock();
    const sent: number[] = [];
    const client = new RiotClient({
      apiKey: "test-token",
      limiter: new RiotRateLimiter(clock),
      platform: "euw1",
      region: "europe",
      transport: () => {
        sent.push(clock.now());
        return Promise.resolve(
          Response.json([], {
            headers: sent.length === 3 ? { [header]: "3:300" } : {},
          })
        );
      },
    });
    const send = () => client.matchIdsByPuuid("placeholder", { queue: 420 });
    await send();
    await send();
    await clock.advanceTo(121_000);
    await send();
    const fourth = send();
    await clock.advanceTo(299_999);
    expect(sent).toEqual([0, 0, 121_000]);
    await clock.advanceTo(300_000);
    await fourth;
    expect(sent).toEqual([0, 0, 121_000, 300_000]);
  }
);

it("does not undercount a learned limit larger than retained timestamp history", async () => {
  const clock = new FakeClock();
  const limiter = new RiotRateLimiter(clock);
  const pending = Promise.all(
    Array.from({ length: 1001 }, () => limiter.acquire(route))
  );
  await clock.advanceTo(1_200_000);
  await pending;
  limiter.observe(route, 200, new Headers({ "X-App-Rate-Limit": "1001:2000" }));

  const sent: number[] = [];
  const next = limiter.acquire(route).then(() => sent.push(clock.now()));
  await clock.advanceTo(1_999_999);
  expect(sent).toEqual([]);
  await clock.advanceTo(2_000_000);
  expect(await next).toBe(1);
  expect(sent).toEqual([2_000_000]);
});

it("keeps 250 queued requests inside both personal-key sliding windows", async () => {
  const clock = new FakeClock();
  const limiter = new RiotRateLimiter(clock);
  const sent: number[] = [];
  const pending = Array.from({ length: 250 }, async () => {
    await limiter.acquire(route);
    sent.push(clock.now());
  });

  await clock.advanceTo(250_000);
  expect(sent).toHaveLength(250);
  await Promise.all(pending);

  for (const at of sent) {
    expect(
      sent.filter((time) => time > at - 1000 && time <= at).length
    ).toBeLessThanOrEqual(20);
    expect(
      sent.filter((time) => time > at - 120_000 && time <= at).length
    ).toBeLessThanOrEqual(100);
  }
});
