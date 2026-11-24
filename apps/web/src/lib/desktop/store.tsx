import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
} from "react";

import {
  type DesktopEvents,
  desktop,
  type GameflowPhase,
  type LcuLocale,
  type LcuState,
  type LiveGame,
  type LiveState,
  onDesktopEvent,
} from "./events";

export interface DesktopState {
  /** Latest champion select snapshot; cleared when the client goes away. */
  champSelect: DesktopEvents["lcu://champ-select"] | null;
  lcu: LcuState;
  live: LiveState;
  liveGame: LiveGame | null;
  /** Locale of the League client, kept after it closes so the language holds. */
  locale: LcuLocale | null;
  /** Null until the backend has reported a phase. */
  phase: GameflowPhase | null;
}

const INITIAL_STATE: DesktopState = {
  champSelect: null,
  lcu: "searching",
  live: "waiting_for_game",
  liveGame: null,
  locale: null,
  phase: null,
};

type DesktopAction =
  | { name: "lcu://status"; payload: DesktopEvents["lcu://status"] }
  | { name: "lcu://gameflow"; payload: DesktopEvents["lcu://gameflow"] }
  | { name: "lcu://champ-select"; payload: DesktopEvents["lcu://champ-select"] }
  | { name: "live://status"; payload: DesktopEvents["live://status"] }
  | { name: "live://game"; payload: DesktopEvents["live://game"] }
  | { name: "locale"; payload: LcuLocale };

/**
 * The backend has no command to read the current phase, so an event that only
 * exists in one phase also tells us the phase when none was reported yet (the
 * window was opened or reloaded after the phase last changed).
 */
const reduce = (state: DesktopState, action: DesktopAction): DesktopState => {
  switch (action.name) {
    case "lcu://status": {
      const lcu = action.payload.state;
      return lcu === "connected"
        ? { ...state, lcu }
        : { ...state, lcu, champSelect: null };
    }
    case "lcu://gameflow":
      return { ...state, phase: action.payload.phase };
    case "lcu://champ-select":
      return {
        ...state,
        champSelect: action.payload,
        phase: state.phase ?? "ChampSelect",
      };
    case "live://status": {
      const live = action.payload.state;
      const inGame = live !== "waiting_for_game";
      return {
        ...state,
        live,
        liveGame: live === "active" ? state.liveGame : null,
        phase: inGame ? (state.phase ?? "InProgress") : state.phase,
      };
    }
    case "live://game":
      return { ...state, liveGame: action.payload };
    case "locale":
      return { ...state, locale: action.payload };
    default:
      return state;
  }
};

const DesktopContext = createContext<DesktopState | null>(null);

export function DesktopProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);

  useEffect(() => {
    let statusReported = false;
    let disposed = false;
    const subscriptions = [
      onDesktopEvent("lcu://status", (payload) => {
        statusReported = true;
        dispatch({ name: "lcu://status", payload });
      }),
      onDesktopEvent("lcu://gameflow", (payload) =>
        dispatch({ name: "lcu://gameflow", payload })
      ),
      onDesktopEvent("lcu://champ-select", (payload) =>
        dispatch({ name: "lcu://champ-select", payload })
      ),
      onDesktopEvent("live://status", (payload) =>
        dispatch({ name: "live://status", payload })
      ),
      onDesktopEvent("live://game", (payload) =>
        dispatch({ name: "live://game", payload })
      ),
    ];
    const readInitialStatus = async () => {
      await Promise.all(subscriptions);
      const status = await desktop.lcuStatus();
      // A status event that arrived meanwhile is newer than this answer.
      if (!(disposed || statusReported)) {
        dispatch({ name: "lcu://status", payload: status });
      }
    };
    readInitialStatus();
    return () => {
      disposed = true;
      for (const subscription of subscriptions) {
        subscription.then((unlisten) => unlisten());
      }
    };
  }, []);

  const isConnected = state.lcu === "connected";
  useEffect(() => {
    if (!isConnected) {
      return;
    }
    let current = true;
    desktop.currentSummoner().then(
      ({ locale }) => {
        if (current) {
          dispatch({ name: "locale", payload: locale });
        }
      },
      () => {
        // The client closed before answering: the next connection asks again.
      }
    );
    return () => {
      current = false;
    };
  }, [isConnected]);

  return (
    <DesktopContext.Provider value={state}>{children}</DesktopContext.Provider>
  );
}

export const useDesktop = (): DesktopState => {
  const state = useContext(DesktopContext);
  if (state === null) {
    throw new Error("useDesktop must render below DesktopProvider");
  }
  return state;
};
