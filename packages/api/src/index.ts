import { timingSafeEqual } from "node:crypto";

import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const isAccessKeyValid = (
  provided: string | null,
  expected: string
): boolean => {
  if (provided === null || expected.length === 0) {
    return false;
  }
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
};

const requireAccessKey = o.middleware(({ context, next }) => {
  if (!isAccessKeyValid(context.accessKey, context.expectedAccessKey)) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next();
});

export const coachProcedure = publicProcedure.use(requireAccessKey);
