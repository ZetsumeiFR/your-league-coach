import { describe, expect, it } from "bun:test";
import type { DraftState } from "@your-league-coach/lol-data/types";

import type { GameflowPhase, LcuState } from "../src/lib/desktop/events";
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
const client = (state: LcuState): Action => ({
  name: "lcu://status",
  payload: { state },
});

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

  it("is dropped at the end of the game even when it only arrived during the game", () => {
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

describe("champion select session", () => {
  const sessionAfter = (...actions: Action[]) =>
    after(...actions).champSelectSession;
  const firstSelect = [phase("ChampSelect"), snapshot];

  it("keeps its number from the first snapshot to the end of the game", () => {
    expect(
      sessionAfter(
        ...firstSelect,
        snapshot,
        phase("GameStart"),
        phase("InProgress"),
        snapshot
      )
    ).toBe(sessionAfter(...firstSelect));
  });

  it("gets a new number for the next champion select, after a game, a dodge or a lost client", () => {
    const first = sessionAfter(...firstSelect);
    const afterGame = sessionAfter(
      ...firstSelect,
      phase("InProgress"),
      phase("EndOfGame"),
      phase("ChampSelect"),
      snapshot
    );
    const afterDodge = sessionAfter(
      ...firstSelect,
      phase("Matchmaking"),
      phase("ChampSelect"),
      snapshot
    );
    const afterLostClient = sessionAfter(
      ...firstSelect,
      client("disconnected"),
      client("connected"),
      snapshot
    );
    for (const next of [afterGame, afterDodge, afterLostClient]) {
      expect(next).not.toBe(first);
    }
  });
});
