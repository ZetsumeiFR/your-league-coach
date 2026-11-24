import { lcuPositionSchema } from "@your-league-coach/lol-data/roles";
import type { DraftState } from "@your-league-coach/lol-data/types";
import { file } from "bun";
import { z } from "zod";

import { rankedPickableChampionIds } from "../../../../scripts/fake-riot-client/fixtures/lcu/scenarios";

const FIXTURE = new URL(
  "../../../../scripts/fake-riot-client/fixtures/lcu/champ-select-ranked.jsonl",
  import.meta.url
);
const DRAFT_URI = "/lol-champ-select/v1/session";
const LINE_BREAK = /\r?\n/u;

const sessionSchema = z.object({
  localPlayerCellId: z.number().int(),
  myTeam: z.array(
    z.object({
      cellId: z.number().int(),
      championId: z.number().int(),
      championPickIntent: z.number().int(),
      assignedPosition: lcuPositionSchema,
    })
  ),
  theirTeam: z.array(
    z.object({ cellId: z.number().int(), championId: z.number().int() })
  ),
  bans: z.object({
    myTeamBans: z.array(z.number().int()),
    theirTeamBans: z.array(z.number().int()),
  }),
  actions: z.array(
    z.array(
      z.object({
        actorCellId: z.number().int(),
        championId: z.number().int(),
        completed: z.boolean(),
        isInProgress: z.boolean(),
        type: z.string(),
      })
    )
  ),
});
const frameSchema = z.tuple([
  z.literal(8),
  z.string(),
  z.object({ uri: z.string(), data: z.unknown() }),
]);

const actionType = (type: string | undefined): DraftState["currentAction"] =>
  type === "ban" || type === "pick" ? type : "none";
const noChampion = (id: number): number => Math.max(id, 0);
const banned = (ids: readonly number[]): number[] => ids.filter((id) => id > 0);

/** Draft sessions of the ranked fixture, in replay order (hover, then lock), as the desktop app normalizes them. */
export async function rankedDrafts(): Promise<DraftState[]> {
  const lines = (await file(FIXTURE).text()).trim().split(LINE_BREAK);
  return lines.flatMap((line) => {
    const [, , event] = frameSchema.parse(JSON.parse(line));
    if (event.uri !== DRAFT_URI) {
      return [];
    }
    const session = sessionSchema.parse(event.data);
    const actions = session.actions.flat();
    const current = actions.find(
      (action) => action.isInProgress && !action.completed
    );
    const localPick = actions.findLast(
      (action) =>
        action.actorCellId === session.localPlayerCellId &&
        action.type === "pick"
    );
    return [
      {
        queueId: 420,
        localPlayerCellId: session.localPlayerCellId,
        myTeam: session.myTeam.map((member) => ({
          ...member,
          championId: noChampion(member.championId),
          championPickIntent: noChampion(member.championPickIntent),
        })),
        theirTeam: session.theirTeam.map(({ cellId, championId }) => ({
          cellId,
          championId: noChampion(championId),
        })),
        bans: {
          myTeamBans: banned(session.bans.myTeamBans),
          theirTeamBans: banned(session.bans.theirTeamBans),
        },
        currentAction: actionType(current?.type),
        isLocalPlayersTurn: current?.actorCellId === session.localPlayerCellId,
        pickableChampionIds: [...rankedPickableChampionIds],
        localPick: {
          championId: noChampion(localPick?.championId ?? 0),
          completed: localPick?.completed ?? false,
        },
      },
    ];
  });
}

export const revealOnly = (
  draft: DraftState,
  visible: readonly number[]
): DraftState => ({
  ...draft,
  theirTeam: draft.theirTeam.map(({ cellId, championId }) => ({
    cellId,
    championId: visible.includes(championId) ? championId : 0,
  })),
});
