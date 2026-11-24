import {
  FrameDescription,
  FrameHeader,
  FrameTitle,
} from "@your-league-coach/ui/components/reui/frame";
import type { ReactNode } from "react";

import type { ChampionCard } from "@/lib/ddragon";

import { ChampionAvatar } from "./champion-avatar";

interface ChampionFrameHeaderProps {
  actions?: ReactNode;
  champion: ChampionCard | null;
  name: string;
  roleLabel: string | null;
  title: string;
  titleId: string;
}

export function ChampionFrameHeader({
  actions,
  champion,
  name,
  roleLabel,
  title,
  titleId,
}: ChampionFrameHeaderProps) {
  const subject = roleLabel ? `${name} \u00b7 ${roleLabel}` : name;

  return (
    <FrameHeader>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <ChampionAvatar champion={champion} />
          <div className="flex min-w-0 flex-col">
            <FrameTitle>
              <h2 id={titleId}>{title}</h2>
            </FrameTitle>
            <FrameDescription>{subject}</FrameDescription>
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {actions}
          </div>
        ) : null}
      </div>
    </FrameHeader>
  );
}
