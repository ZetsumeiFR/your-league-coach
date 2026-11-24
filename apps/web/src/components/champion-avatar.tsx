import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@your-league-coach/ui/components/avatar";

import type { ChampionCard } from "@/lib/ddragon";

const FALLBACK_LETTERS = 2;

/** Hidden from assistive technology: every place that shows this icon prints the name beside it. */
export function ChampionAvatar({
  champion,
}: {
  champion: ChampionCard | null;
}) {
  const letters = champion ? champion.name.slice(0, FALLBACK_LETTERS) : "?";

  return (
    <Avatar aria-hidden="true">
      {champion ? <AvatarImage alt="" src={champion.iconUrl} /> : null}
      <AvatarFallback>{letters}</AvatarFallback>
    </Avatar>
  );
}
