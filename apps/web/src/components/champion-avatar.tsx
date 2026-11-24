import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@your-league-coach/ui/components/avatar";

import type { ChampionCard } from "@/lib/ddragon";

const FALLBACK_LETTERS = 2;

interface ChampionAvatarProps {
  champion: ChampionCard | null;
  className?: string;
  size?: "default" | "sm" | "lg";
  withLetters?: boolean;
}

/** Hidden from assistive technology: every place that shows this icon prints the name beside it. */
export function ChampionAvatar({
  champion,
  className,
  size,
  withLetters = true,
}: ChampionAvatarProps) {
  const letters = champion ? champion.name.slice(0, FALLBACK_LETTERS) : "?";

  return (
    <Avatar aria-hidden="true" className={className} size={size}>
      {champion ? <AvatarImage alt="" src={champion.iconUrl} /> : null}
      <AvatarFallback>{withLetters ? letters : null}</AvatarFallback>
    </Avatar>
  );
}
