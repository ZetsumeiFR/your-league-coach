import type { Role } from "@your-league-coach/lol-data/roles";
import type { BuildInput, DraftState } from "@your-league-coach/lol-data/types";

import { assignedRole, draftMode } from "../draft/request";

/** The most allies and enemies the API accepts in one request. */
const MAX_ALLIES = 4;
export const MAX_ENEMIES = 5;

const localMember = (draft: DraftState) =>
  draft.myTeam.find(({ cellId }) => cellId === draft.localPlayerCellId);

/**
 * The champion the client holds for the local player's seat: in ARAM, the one
 * assigned to them. A champion they only declare is not in it. 0 while there
 * is none.
 */
export const assignedChampionId = (draft: DraftState): number =>
  localMember(draft)?.championId ?? 0;

/**
 * The champion the build is for: the one the local player has locked or is
 * hovering, else the one they have declared. 0 while there is none.
 */
export const buildChampionId = (draft: DraftState): number => {
  const local = localMember(draft);
  return (
    draft.localPick.championId ||
    local?.championId ||
    local?.championPickIntent ||
    0
  );
};

/** One spelling for a team: the same champions always give the same request. */
export const teamChampionIds = (
  ids: readonly number[],
  limit: number
): number[] =>
  [...new Set(ids.filter((id) => id > 0))]
    .toSorted((a, b) => a - b)
    .slice(0, limit);

/**
 * The role the local player's statistics are read for: the one the client
 * assigned, else the one they picked. ARAM has no roles.
 */
export const buildRole = (
  draft: DraftState,
  pickedRole: Role | null
): Role | null =>
  draftMode(draft.queueId) === "aram"
    ? null
    : (assignedRole(draft) ?? pickedRole);

/**
 * The request for the local player's build, or null while they have no
 * champion. Allies count once they are picked or hovered in their turn, not
 * on a declared intent. ARAM has no roles.
 */
export const buildInput = (
  draft: DraftState,
  pickedRole: Role | null
): BuildInput | null => {
  const championId = buildChampionId(draft);
  if (championId === 0) {
    return null;
  }
  const allies = draft.myTeam
    .filter(({ cellId }) => cellId !== draft.localPlayerCellId)
    .map((member) => member.championId);
  const enemies = draft.theirTeam.map((member) => member.championId);
  return {
    queueId: draft.queueId,
    role: buildRole(draft, pickedRole),
    championId,
    allies: teamChampionIds(allies, MAX_ALLIES),
    enemies: teamChampionIds(enemies, MAX_ENEMIES),
  };
};
