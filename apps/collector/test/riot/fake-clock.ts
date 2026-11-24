import { setImmediate as yieldTurn } from "node:timers/promises";
import type { RiotClock } from "../../src/riot/rate-limiter";

export class FakeClock implements RiotClock {
  #now = 0;
  readonly #sleepers: { readonly at: number; readonly wake: () => void }[] = [];

  now(): number {
    return this.#now;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((wake) => {
      this.#sleepers.push({ at: this.#now + ms, wake });
    });
  }

  async advanceTo(target: number): Promise<void> {
    await yieldTurn();
    const next = Math.min(...this.#sleepers.map(({ at }) => at));
    if (next > target) {
      this.#now = target;
      return;
    }
    this.#now = next;
    for (let index = this.#sleepers.length - 1; index >= 0; index -= 1) {
      const sleeper = this.#sleepers[index];
      if (sleeper?.at === next) {
        this.#sleepers.splice(index, 1);
        sleeper.wake();
      }
    }
    await this.advanceTo(target);
  }
}
