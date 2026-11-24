import { setTimeout as delay } from "node:timers/promises";
import { RiotTransportError } from "./errors";
import {
  DEFAULT_RETRY_AFTER_MS,
  PERSONAL_LIMITS,
  SECOND_MS,
  TWO_MINUTES_MS,
} from "./limits";

export interface RiotClock {
  readonly now: () => number;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const systemClock: RiotClock = {
  now: () => Date.now(),
  sleep: (ms, signal) => delay(ms, undefined, { signal }),
};

export interface RiotRoute {
  readonly host: string;
  readonly method: string;
  readonly path: string;
}

interface Bucket {
  readonly limits: Map<number, number>;
  pausedUntil: number;
  sent: number[];
}

interface HostState {
  readonly application: Bucket;
  readonly methods: Map<string, Bucket>;
  readonly services: Map<string, Bucket>;
}

const SERVICE_PREFIXES = [
  "/lol/match/v5",
  "/lol/league-exp/v4",
  "/lol/league/v4",
  "/lol/summoner/v4",
] as const;
const LIMIT_PAIR = /^(\d+):(\d+)$/;
const DELAY_SECONDS = /^\d+$/;
const HTTP_DATE =
  /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
const MAX_TIMER_MS = 2_147_483_647;

const createBucket = (limits = new Map<number, number>()): Bucket => ({
  limits,
  sent: [],
  pausedUntil: 0,
});

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const value = create();
  map.set(key, value);
  return value;
}

function adoptLimits(bucket: Bucket, header: string | null): void {
  for (const pair of header?.split(",") ?? []) {
    const match = LIMIT_PAIR.exec(pair.trim());
    if (!match) {
      continue;
    }
    const max = Number(match[1]);
    const ms = Number(match[2]) * SECOND_MS;
    if (
      Number.isSafeInteger(max) &&
      max > 0 &&
      Number.isSafeInteger(ms) &&
      ms > 0
    ) {
      bucket.limits.set(ms, Math.min(max, bucket.limits.get(ms) ?? max));
    }
  }
}

function retryAfterMs(header: string | null, now: number): number {
  const value = header?.trim() ?? "";
  if (DELAY_SECONDS.test(value)) {
    const ms = Number(value) * SECOND_MS;
    return Number.isSafeInteger(now + ms) ? ms : DEFAULT_RETRY_AFTER_MS;
  }
  if (HTTP_DATE.test(value)) {
    const deadline = Date.parse(value);
    if (Number.isFinite(deadline)) {
      return Math.max(0, deadline - now);
    }
  }
  return DEFAULT_RETRY_AFTER_MS;
}

function availableAt(bucket: Bucket, now: number): number {
  const horizon = Math.max(TWO_MINUTES_MS, ...bucket.limits.keys());
  bucket.sent = bucket.sent.filter((at) => at > now - horizon);
  let ready = bucket.pausedUntil;
  for (const [ms, max] of bucket.limits) {
    // The max-th newest request must expire before there is room for one more.
    const oldestBlocking = bucket.sent.at(-max);
    if (oldestBlocking !== undefined) {
      ready = Math.max(ready, oldestBlocking + ms);
    }
  }
  return ready;
}

/** Share one instance across all Riot callers in the same collector process. */
export class RiotRateLimiter {
  readonly #hosts = new Map<string, HostState>();
  readonly #clock: RiotClock;

  constructor(clock: RiotClock = systemClock) {
    this.#clock = clock;
  }

  async acquire(route: RiotRoute, signal?: AbortSignal): Promise<void> {
    const { application, method, service } = this.#buckets(route);
    if (signal?.aborted) {
      throw new RiotTransportError("aborted");
    }
    const now = this.#clock.now();
    const ready = Math.max(
      availableAt(application, now),
      availableAt(method, now),
      service?.pausedUntil ?? 0
    );
    if (ready > now) {
      await this.wait(ready - now, signal);
      return await this.acquire(route, signal);
    }
    // Check and book both budgets synchronously so waking callers cannot oversubscribe.
    application.sent.push(now);
    method.sent.push(now);
  }

  async wait(ms: number, signal?: AbortSignal): Promise<void> {
    const completed = await this.#clock
      .sleep(Math.min(ms, MAX_TIMER_MS), signal)
      .then(
        () => true,
        () => false
      );
    if (!completed) {
      throw new RiotTransportError(signal?.aborted ? "aborted" : "network");
    }
  }

  observe(route: RiotRoute, status: number, headers: Headers): void {
    const { application, method, service } = this.#buckets(route);
    adoptLimits(application, headers.get("X-App-Rate-Limit"));
    adoptLimits(method, headers.get("X-Method-Rate-Limit"));
    if (status !== 429) {
      return;
    }
    const scope = headers.get("X-Rate-Limit-Type")?.trim().toLowerCase();
    let bucket = application;
    if (scope === "method") {
      bucket = method;
    } else if (scope === "service" && service) {
      bucket = service;
    }
    const now = this.#clock.now();
    bucket.pausedUntil = Math.max(
      bucket.pausedUntil,
      now + retryAfterMs(headers.get("Retry-After"), now)
    );
  }

  #buckets({ host, method, path }: RiotRoute) {
    const state = getOrCreate(this.#hosts, host, () => ({
      application: createBucket(
        new Map([
          [SECOND_MS, PERSONAL_LIMITS.perSecond],
          [TWO_MINUTES_MS, PERSONAL_LIMITS.perTwoMinutes],
        ])
      ),
      methods: new Map<string, Bucket>(),
      services: new Map<string, Bucket>(),
    }));
    const prefix = SERVICE_PREFIXES.find((value) =>
      path.startsWith(`${value}/`)
    );
    return {
      application: state.application,
      method: getOrCreate(state.methods, method, createBucket),
      service: prefix
        ? getOrCreate(state.services, prefix, createBucket)
        : undefined,
    };
  }
}
