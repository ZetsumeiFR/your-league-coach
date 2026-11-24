export const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

export type Role = (typeof ROLES)[number];

const LCU_POSITION_TO_ROLE: ReadonlyMap<string, Role> = new Map<string, Role>([
  ["top", "TOP"],
  ["jungle", "JUNGLE"],
  ["middle", "MIDDLE"],
  ["bottom", "BOTTOM"],
  ["utility", "UTILITY"],
]);

export const lcuPositionToRole = (position: string): Role | null =>
  LCU_POSITION_TO_ROLE.get(position) ?? null;
