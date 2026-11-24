import { Separator } from "@your-league-coach/ui/components/separator";
import type { ReactNode } from "react";

interface InflowRowProps {
  amount: ReactNode;
  children?: ReactNode;
  logo: ReactNode;
  name: string;
  share: ReactNode;
  showSeparator: boolean;
}

/**
 * Row of ReUI list-3 with its demo fund replaced: the main line is as
 * shipped and its four values come from the caller. `children` adds lines
 * between that line and the separator.
 */
export function InflowRow({
  amount,
  children,
  logo,
  name,
  share,
  showSeparator,
}: InflowRowProps) {
  return (
    <li>
      <div className="flex min-h-12 items-center gap-2">
        {logo}

        <p className="text-foreground min-w-0 flex-1 text-sm font-medium">
          {name}
        </p>

        <div className="flex shrink-0 items-baseline justify-end gap-3.5">
          <span className="text-foreground text-end text-sm font-medium">
            {amount}
          </span>
          <span className="text-muted-foreground text-end text-sm">
            {share}
          </span>
        </div>
      </div>
      {children}
      {showSeparator ? <Separator /> : null}
    </li>
  );
}
