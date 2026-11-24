import { describe, expect, test } from "bun:test";

import { call, ORPCError } from "@orpc/server";
import { createDb } from "@your-league-coach/db";

import { readBearerToken } from "../src/access-key";
import type { Context } from "../src/context";
import { coachProcedure } from "../src/index";
import { appRouter } from "../src/routers/index";

const EXPECTED_KEY = "k".repeat(40);

const db = createDb({
  DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
});

const contextWith = (accessKey: string | null): Context => ({
  db,
  accessKey,
  expectedAccessKey: EXPECTED_KEY,
});

const protectedPing = coachProcedure.handler(() => "pong");

const expectUnauthorized = async (accessKey: string | null): Promise<void> => {
  const error = await call(protectedPing, undefined, {
    context: contextWith(accessKey),
  }).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ORPCError);
  expect(error).toMatchObject({ code: "UNAUTHORIZED" });
};

test("healthCheck stays public", async () => {
  expect(
    await call(appRouter.healthCheck, undefined, { context: contextWith(null) })
  ).toBe("OK");
});

test("coachProcedure accepts the configured key", async () => {
  expect(
    await call(protectedPing, undefined, { context: contextWith(EXPECTED_KEY) })
  ).toBe("pong");
});

test("a well-formed Bearer header yields the key that is accepted", async () => {
  const accessKey = readBearerToken(`Bearer ${EXPECTED_KEY}`);
  expect(accessKey).toBe(EXPECTED_KEY);
  expect(
    await call(protectedPing, undefined, { context: contextWith(accessKey) })
  ).toBe("pong");
});

describe("coachProcedure rejects the Authorization header", () => {
  test.each<[string, string | undefined]>([
    ["absent", undefined],
    ["'Bearer' with no token", "Bearer"],
    ["'Bearer ' with a blank token", "Bearer    "],
    ["lowercase scheme 'bearer x'", `bearer ${EXPECTED_KEY}`],
    ["Basic scheme", "Basic dXNlcjpwYXNz"],
    ["raw key without scheme", EXPECTED_KEY],
    ["Bearer key of a different length", `Bearer ${EXPECTED_KEY.slice(3)}`],
    [
      "Bearer wrong key of the same length",
      `Bearer ${"x".repeat(EXPECTED_KEY.length)}`,
    ],
  ])("%s", async (_label, authorization) => {
    await expectUnauthorized(readBearerToken(authorization));
  });
});

describe("coachProcedure rejects", () => {
  test.each<[string, string | null]>([
    ["a missing key", null],
    ["an empty key", ""],
    ["a wrong key of the same length", "x".repeat(EXPECTED_KEY.length)],
    ["a shorter key", EXPECTED_KEY.slice(1)],
    ["a longer key", `${EXPECTED_KEY}k`],
    ["the whole 'Bearer <key>' header value", `Bearer ${EXPECTED_KEY}`],
    ["a Basic credential", "Basic dXNlcjpwYXNz"],
    [
      "a multi-byte key with the same character count",
      "é".repeat(EXPECTED_KEY.length),
    ],
  ])("%s", async (_label, accessKey) => {
    await expectUnauthorized(accessKey);
  });
});
