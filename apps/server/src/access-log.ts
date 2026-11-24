import { createMiddleware } from "hono/factory";

/**
 * Access log without the query string, headers or body: clients may put
 * player identity in any of them (`?puuid=...`, oRPC `?data=...`), and the
 * Authorization header carries the shared key.
 */
export const accessLog = (
  print: (line: string) => void = (line) => console.log(line)
) =>
  createMiddleware(async (c, next) => {
    const startedAt = performance.now();
    await next();
    const { pathname } = new URL(c.req.url);
    const durationMs = Math.round(performance.now() - startedAt);
    print(`${c.req.method} ${pathname} ${c.res.status} ${durationMs}ms`);
  });
