import { describe, expect, it } from "bun:test";
import type { DraftState } from "@your-league-coach/lol-data/types";

import type { GameflowPhase } from "../src/lib/desktop/events";
import {
  initialDesktopState,
  reduceDesktopState,
} from "../src/lib/desktop/store";

const draft: DraftState = {
  queueId: 420,
  localPlayerCellId: 0,
  myTeam: [],
  theirTeam: [],
  bans: { myTeamBans: [], theirTeamBans: [] },
  currentAction: "none",
  isLocalPlayersTurn: false,
  pickableChampionIds: [],
  localPick: { championId: 0, completed: false },
};

type Action = Parameters<typeof reduceDesktopState>[1];

const phase = (value: GameflowPhase): Action => ({
  name: "lcu://gameflow",
  payload: { phase: value },
});
const snapshot: Action = { name: "lcu://champ-select", payload: draft };

const after = (...actions: Action[]) =>
  actions.reduce(reduceDesktopState, initialDesktopState);

describe("champion select snapshot", () => {
  it("is kept during champion select, whichever of the phase and the snapshot comes first", () => {
    expect(after(phase("ChampSelect"), snapshot).champSelect).toBe(draft);
    expect(
      after(phase("ReadyCheck"), snapshot, phase("ChampSelect")).champSelect
    ).toBe(draft);
  });

  it("is kept through the game that follows", () => {
    const inGame = after(
      phase("ChampSelect"),
      snapshot,
      phase("GameStart"),
      phase("InProgress"),
      phase("Reconnect")
    );
    expect(inGame.champSelect).toBe(draft);
  });

  it("is dropped once the game is over, so the next champion select starts without it", () => {
    const played = [phase("ChampSelect"), snapshot, phase("InProgress")];
    expect(after(...played, phase("EndOfGame")).champSelect).toBeNull();
    const nextSelect = after(
      ...played,
      phase("EndOfGame"),
      phase("ChampSelect")
    );
    expect(nextSelect.phase).toBe("ChampSelect");
    expect(nextSelect.champSelect).toBeNull();
  });

  it("is dropped when the champion select is left without a game", () => {
    const requeued = after(
      phase("ChampSelect"),
      snapshot,
      phase("Matchmaking")
    );
    expect(requeued.champSelect).toBeNull();
  });

  it("is dropped when it arrives late, once that game is over", () => {
    const lobby = after(
      phase("ChampSelect"),
      phase("InProgress"),
      snapshot,
      phase("Lobby")
    );
    expect(lobby.champSelect).toBeNull();
  });

  it("tells the phase when none was reported yet", () => {
    expect(after(snapshot).phase).toBe("ChampSelect");
  });
});
