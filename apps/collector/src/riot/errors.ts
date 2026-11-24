export class RiotHttpError extends Error {
  readonly status: number;

  constructor(status: number, message = `Riot API HTTP ${status}`) {
    super(message);
    this.status = status;
    this.name = new.target.name;
  }
}

export class RiotAuthError extends RiotHttpError {
  constructor(status: 401 | 403) {
    super(status, `Riot API authentication failed (HTTP ${status})`);
  }
}

export class RiotRateLimitError extends RiotHttpError {
  constructor() {
    super(429, "Riot API rate limit exhausted (HTTP 429)");
  }
}

export class RiotPayloadError extends Error {
  readonly method: string;

  constructor(method: string) {
    super(`Invalid Riot API payload for ${method}`);
    this.method = method;
    this.name = "RiotPayloadError";
  }
}

export class RiotTransportError extends Error {
  readonly reason: "timeout" | "aborted" | "network";

  constructor(reason: "timeout" | "aborted" | "network") {
    super(`Riot API request failed (${reason})`);
    this.reason = reason;
    this.name = "RiotTransportError";
  }
}
