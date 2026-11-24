import type { DraftState } from "@your-league-coach/lol-data/types";
import { Frame, FramePanel } from "@your-league-coach/ui/components/reui/frame";
import { useId } from "react";

import { ChampionFrameHeader } from "@/components/champion-frame-header";
import { useT } from "@/i18n/use-t";
import { buildRole } from "@/lib/build/request";
import { useChampionKey, useChampionLookup } from "@/lib/ddragon";
import type { LiveGame } from "@/lib/desktop/events";
import { usePickedRole } from "@/lib/draft/picked-role";
import { nextItemsInput } from "@/lib/in-game/request";

import { AlwaysOnTopToggle } from "./always-on-top-toggle";
import { EnemyTeam } from "./enemy-team";
import { NextItems } from "./next-items";
import { OwnedItems } from "./owned-items";
import { useNextItems } from "./use-next-items";

interface GameBoardProps {
  draft: DraftState | null;
  game: LiveGame;
}

/**
 * One Frame of separated panels, like the build. Stacked, they read next
 * items, enemy team, own items. On a wide board the enemy team is a second
 * column beside the two others, as wide as a full inventory needs, and the
 * next items take the rest: their reasons then stay beside the item names.
 * The wrappers lay the panels out, so the Frame parts stay as shipped.
 */
export function GameBoard({ draft, game }: GameBoardProps) {
  const t = useT();
  const titleId = useId();
  const pickedRole = usePickedRole();
  const slug = game.activePlayer.championName;
  const championId = useChampionKey(slug);
  const champion = useChampionLookup()(championId ?? 0);
  const role = draft ? buildRole(draft, pickedRole) : null;
  const state = useNextItems(
    championId ? nextItemsInput(game, { championId, draft, pickedRole }) : null
  );

  return (
    <section aria-labelledby={titleId} data-slot="game-board">
      <Frame>
        <ChampionFrameHeader
          actions={<AlwaysOnTopToggle />}
          champion={champion}
          name={champion?.name ?? slug}
          roleLabel={role ? t(`draft.roles.${role}`) : null}
          title={t("inGame.title")}
          titleId={titleId}
        />
        <div className="@container">
          <div className="grid @3xl:grid-cols-[minmax(0,1fr)_26rem] gap-(--frame-gap)">
            <div className="flex flex-col">
              <FramePanel>
                <NextItems
                  isChampionKnown={championId !== null}
                  state={state}
                />
              </FramePanel>
            </div>
            <div className="@3xl:col-start-2 @3xl:row-span-2 @3xl:row-start-1 flex flex-col">
              <FramePanel>
                <EnemyTeam enemies={game.enemies} />
              </FramePanel>
            </div>
            <div className="flex flex-col">
              <FramePanel>
                <OwnedItems itemIds={game.myItems} />
              </FramePanel>
            </div>
          </div>
        </div>
      </Frame>
    </section>
  );
}
