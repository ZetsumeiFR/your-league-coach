const QA_TIMEOUT_MS = 180_000;
const deadline = new AbortController();
const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);

AbortSignal.timeout = (ms) =>
  ms === QA_TIMEOUT_MS ? deadline.signal : nativeTimeout(ms);

// Fire the QA deadline on the first request, with no network or wall-clock wait.
globalThis.fetch = Object.assign(
  (_input: string | URL | Request, init?: RequestInit) => {
    deadline.abort(new Error("untrusted timeout details"));
    return Promise.reject(init?.signal?.reason);
  },
  { preconnect: fetch.preconnect }
);
