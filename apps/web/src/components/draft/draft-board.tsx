import {
  lcuPositionToRole,
  type Role,
} from "@your-league-coach/lol-data/roles";
import type { DraftState } from "@your-league-coach/lol-data/types";

import { appIcons } from "@/components/icons";
import { IdleState } from "@/components/idle-state";
import type { Translate } from "@/i18n/translate";
import { useT } from "@/i18n/use-t";
import { type FindChampion, useChampionLookup } from "@/lib/ddragon";
import { pickRole, usePickedRole } from "@/lib/draft/picked-role";
import { assignedRole, draftMode } from "@/lib/draft/request";

import { SuggestionList } from "./suggestion-list";
import { type TeamBan, TeamColumn, type TeamRow } from "./team-column";
import { useDraftSuggestions } from "./use-draft-suggestions";

/*
 * The list comes first in the document and keeps its shipped width. Around it,
 * by the width of this board: teams under the list, side by side once two
 * columns fit; then stacked in one cell beside the list; then one on each
 * side of it. The teams wrapper is a box only in the stacked arrangement.
 */
const BOARD =
  "grid items-start gap-4 @lg:grid-cols-2 @2xl:grid-cols-[28rem_minmax(0,1fr)] @4xl:grid-cols-[minmax(0,1fr)_28rem_minmax(0,1fr)]";
const LIST_CELL =
  "min-w-0 @lg:col-span-2 @2xl:col-span-1 @4xl:col-start-2 @4xl:row-start-1";
const TEAMS =
  "contents @2xl:flex @2xl:min-w-0 @2xl:flex-col @2xl:gap-4 @4xl:contents";
const ALLY_CELL = "min-w-0 @4xl:col-start-1 @4xl:row-start-1";
const ENEMY_CELL = "min-w-0 @4xl:col-start-3 @4xl:row-start-1";

const championNamer =
  (findChampion: FindChampion, t: Translate) =>
  (championId: number): string =>
    findChampion(championId)?.name ??
    t("draft.teams.unknownChampion", { id: championId });

const allyRows = (
  draft: DraftState,
  findChampion: FindChampion,
  t: Translate
): TeamRow[] => {
  const nameOf = championNamer(findChampion, t);
  const allyCells = draft.myTeam
    .filter(({ cellId }) => cellId !== draft.localPlayerCellId)
    .map(({ cellId }) => cellId);

  return draft.myTeam.map((member) => {
    const isLocal = member.cellId === draft.localPlayerCellId;
    const who = isLocal
      ? t("draft.teams.you")
      : t("draft.teams.ally", { number: allyCells.indexOf(member.cellId) + 1 });
    const role = lcuPositionToRole(member.assignedPosition);
    const championId = member.championId || member.championPickIntent;
    const isHovering = member.championId === 0 && championId !== 0;
    const status = championId === 0 ? t("draft.teams.notPicked") : who;
    return {
      id: member.cellId,
      isLocal,
      role,
      champion: championId === 0 ? null : findChampion(championId),
      title: championId === 0 ? who : nameOf(championId),
      detail: role ? `${t(`draft.roles.${role}`)} \u00b7 ${status}` : status,
      detailLabel: null,
      badge: isHovering ? t("draft.teams.hovering") : null,
    };
  });
};

const enemyRows = (
  draft: DraftState,
  roles: ReadonlyMap<number, Role>,
  findChampion: FindChampion,
  t: Translate
): TeamRow[] => {
  const nameOf = championNamer(findChampion, t);

  return draft.theirTeam.map(({ cellId, championId }, index) => {
    const row = {
      id: cellId,
      isLocal: false,
      badge: null,
    };
    if (championId === 0) {
      return {
        ...row,
        role: null,
        champion: null,
        title: t("draft.teams.enemy", { number: index + 1 }),
        detail: t("draft.teams.notRevealed"),
        detailLabel: null,
      };
    }
    const role = roles.get(championId) ?? null;
    const roleName = role ? t(`draft.roles.${role}`) : null;
    return {
      ...row,
      role,
      champion: findChampion(championId),
      title: nameOf(championId),
      detail: roleName ? t("draft.teams.likelyRole", { role: roleName }) : null,
      detailLabel: roleName
        ? t("draft.teams.likelyRoleHint", { role: roleName })
        : null,
    };
  });
};

const banChips = (
  championIds: readonly number[],
  findChampion: FindChampion,
  t: Translate
): TeamBan[] => {
  const nameOf = championNamer(findChampion, t);
  return championIds.map((championId) => ({
    id: championId,
    name: nameOf(championId),
  }));
};

function RiftBoard({ draft }: { draft: DraftState }) {
  const t = useT();
  const findChampion = useChampionLookup();
  const pickedRole = usePickedRole();
  const clientRole = assignedRole(draft);
  const role = clientRole ?? pickedRole;
  const suggestions = useDraftSuggestions(draft, pickedRole);

  const enemyRoles = new Map(
    suggestions.enemyRoles.map((enemy) => [enemy.championId, enemy.role])
  );
  const laneOpponent =
    role === null
      ? undefined
      : suggestions.enemyRoles.find((enemy) => enemy.role === role);

  return (
    <div className="@container" data-slot="draft-board">
      <div className={BOARD}>
        <div className={LIST_CELL}>
          <SuggestionList
            assignedRole={clientRole}
            findChampion={findChampion}
            laneOpponentId={laneOpponent?.championId ?? null}
            onPickRole={pickRole}
            role={role}
            suggestions={suggestions}
          />
        </div>
        <div className={TEAMS}>
          <TeamColumn
            bans={banChips(draft.bans.myTeamBans, findChampion, t)}
            className={ALLY_CELL}
            rows={allyRows(draft, findChampion, t)}
            title={t("draft.teams.allies")}
          />
          <TeamColumn
            bans={banChips(draft.bans.theirTeamBans, findChampion, t)}
            className={ENEMY_CELL}
            rows={enemyRows(draft, enemyRoles, findChampion, t)}
            title={t("draft.teams.enemies")}
          />
        </div>
      </div>
    </div>
  );
}

function AramBoard({ draft }: { draft: DraftState }) {
  const t = useT();
  const findChampion = useChampionLookup();

  return (
    <div className="@container" data-slot="draft-board">
      <div className="grid @2xl:grid-cols-[minmax(0,1fr)_16rem] items-start gap-4">
        <IdleState
          description={t("draft.aram.description")}
          icon={appIcons.build}
          title={t("draft.aram.title")}
        />
        <TeamColumn
          className="min-w-0"
          rows={allyRows(draft, findChampion, t)}
          title={t("draft.teams.allies")}
        />
      </div>
    </div>
  );
}

/**
 * Suggestions are asked only on the Rift: the other boards never mount the
 * hook that sends requests.
 */
export function DraftBoard({ draft }: { draft: DraftState }) {
  const t = useT();
  const mode = draftMode(draft.queueId);

  if (mode === "unsupported") {
    return (
      <IdleState
        description={t("draft.unsupported.description")}
        icon={appIcons.warning}
        title={t("draft.unsupported.title")}
      />
    );
  }
  return mode === "aram" ? (
    <AramBoard draft={draft} />
  ) : (
    <RiftBoard draft={draft} />
  );
}
