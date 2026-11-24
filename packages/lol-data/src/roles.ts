import { z } from "zod";

export const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

export type Role = (typeof ROLES)[number];

/** Raw LCU `assignedPosition` values; "" means no position assigned. */
export const LCU_POSITIONS = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "utility",
  "",
] as const;
export const lcuPositionSchema = z.enum(LCU_POSITIONS);
export type LcuPosition = z.infer<typeof lcuPositionSchema>;

const LCU_POSITION_TO_ROLE: ReadonlyMap<string, Role> = new Map<string, Role>([
  ["top", "TOP"],
  ["jungle", "JUNGLE"],
  ["middle", "MIDDLE"],
  ["bottom", "BOTTOM"],
  ["utility", "UTILITY"],
]);

export const lcuPositionToRole = (position: string): Role | null =>
  LCU_POSITION_TO_ROLE.get(position) ?? null;
