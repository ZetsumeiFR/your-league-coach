import type { Role } from "@your-league-coach/lol-data/roles";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@your-league-coach/ui/components/item";
import { Badge } from "@your-league-coach/ui/components/reui/badge";
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@your-league-coach/ui/components/reui/frame";

import { ChampionAvatar } from "@/components/champion-avatar";
import { useT } from "@/i18n/use-t";
import type { ChampionCard } from "@/lib/ddragon";

import { ROLE_ICONS } from "./role-icons";

export interface TeamRow {
  badge: string | null;
  champion: ChampionCard | null;
  detail: string | null;
  /** Read aloud in place of `detail` when its notation means nothing spoken ("~Mid"). */
  detailLabel: string | null;
  id: number;
  isHovering: boolean;
  isLocal: boolean;
  role: Role | null;
  title: string;
}

export interface TeamBan {
  champion: ChampionCard | null;
  id: number;
  name: string;
}

interface TeamColumnProps {
  bans?: TeamBan[];
  className?: string;
  rows: TeamRow[];
  title: string;
}

function TeamMember({ row }: { row: TeamRow }) {
  const RoleIcon = row.role ? ROLE_ICONS[row.role] : null;

  return (
    <Item size="xs" variant={row.isLocal ? "muted" : "default"}>
      <ItemMedia>
        <ChampionAvatar
          champion={row.champion}
          className={row.isHovering ? "opacity-60" : undefined}
        />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{row.title}</ItemTitle>
        {row.detail ? (
          <ItemDescription>
            <span aria-hidden={row.detailLabel !== null}>{row.detail}</span>
            {row.detailLabel ? (
              <span className="sr-only">{row.detailLabel}</span>
            ) : null}
          </ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions>
        {row.badge ? <Badge variant="outline">{row.badge}</Badge> : null}
        {RoleIcon ? (
          <RoleIcon className="size-4 text-muted-foreground" />
        ) : null}
      </ItemActions>
    </Item>
  );
}

function TeamBans({ bans }: { bans: TeamBan[] }) {
  const t = useT();

  return (
    <FramePanel>
      <div className="flex flex-col gap-2">
        <p className="font-medium text-muted-foreground text-xs">
          {t("draft.teams.bans")}
        </p>
        {bans.length > 0 ? (
          <ul
            aria-label={t("draft.teams.bans")}
            className="flex flex-wrap gap-1.5"
          >
            {bans.map((ban) => (
              <li key={ban.id}>
                <Badge variant="outline">
                  <ChampionAvatar
                    champion={ban.champion}
                    className="size-3.5"
                    withLetters={false}
                  />
                  {ban.name}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">
            {t("draft.teams.noBans")}
          </p>
        )}
      </div>
    </FramePanel>
  );
}

export function TeamColumn({ bans, className, rows, title }: TeamColumnProps) {
  return (
    <Frame className={className} spacing="xs" stacked>
      <FrameHeader>
        <FrameTitle>
          <h2>{title}</h2>
        </FrameTitle>
      </FrameHeader>
      <FramePanel>
        <ul aria-label={title} className="flex flex-col">
          {rows.map((row) => (
            <li key={row.id}>
              <TeamMember row={row} />
            </li>
          ))}
        </ul>
      </FramePanel>
      {bans ? <TeamBans bans={bans} /> : null}
    </Frame>
  );
}
