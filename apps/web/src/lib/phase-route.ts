import type { GameflowPhase } from "./desktop/events";

export const routeForPhase = (phase: GameflowPhase | null) => {
  if (phase === "ChampSelect") {
    return "/draft";
  }
  if (phase === "InProgress") {
    return "/in-game";
  }
  return "/";
};
