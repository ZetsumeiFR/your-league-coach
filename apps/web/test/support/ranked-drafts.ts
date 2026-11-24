import type { DraftState } from "@your-league-coach/lol-data/types";
import { file } from "bun";

import {
  draftPath,
  rankedPickableChampionIds,
  rankedScenario,
  scenarioFrames,
} from "../../../../scripts/fake-riot-client/fixtures/lcu/scenarios";
import { normalizeDraft, wampFrameSchema } from "./backend-mirror";

const rankedJsonl = await file(
  new URL(
    "../../../../scripts/fake-riot-client/fixtures/lcu/champ-select-ranked.jsonl",
    import.meta.url
  )
).text();

export const rankedDrafts = (scenarioFrames(rankedScenario, rankedJsonl) ?? [])
  .map((text) => wampFrameSchema.parse(JSON.parse(text))[2])
  .filter(({ uri }) => uri === draftPath)
  .map(({ data }) => normalizeDraft(data, 420, [...rankedPickableChampionIds]));

// The scenario starts on the local ban turn and ends on the local hover, then the lock.
const [banTurn] = rankedDrafts;
const [hovering, locked] = rankedDrafts.slice(-2);
if (!(banTurn && hovering && locked)) {
  throw new Error(
    "The ranked scenario must start on a ban turn and end on a hover and a lock"
  );
}

export { banTurn, hovering, locked };

export const withLocal = (
  draft: DraftState,
  change: Partial<DraftState["myTeam"][number]>
): DraftState => ({
  ...draft,
  myTeam: draft.myTeam.map((member) =>
    member.cellId === draft.localPlayerCellId
      ? { ...member, ...change }
      : member
  ),
});
