import { expect, it } from "bun:test";
import { RiotRateLimiter } from "../../src/riot/rate-limiter";
import { FakeClock } from "./fake-clock";

const route = {
  host: "europe.api.riotgames.com",
  method: "match",
  path: "/lol/match/v5/matches/test",
};

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
