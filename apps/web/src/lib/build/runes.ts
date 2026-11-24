const PRIMARY_RUNES = 4;
const SECONDARY_RUNES = 2;

export interface RunePageParts {
  primary: number[];
  secondary: number[];
  shards: number[];
}

/**
 * A page lists its primary runes, then the secondary ones, then the stat
 * shards: the order the League client stores and the coach answers in.
 */
export const runePageParts = (perkIds: readonly number[]): RunePageParts => ({
  primary: perkIds.slice(0, PRIMARY_RUNES),
  secondary: perkIds.slice(PRIMARY_RUNES, PRIMARY_RUNES + SECONDARY_RUNES),
  shards: perkIds.slice(PRIMARY_RUNES + SECONDARY_RUNES),
});

export const SHARD_NAMES = [
  "healthScaling",
  "attackSpeed",
  "abilityHaste",
  "adaptiveForce",
  "moveSpeed",
  "health",
  "tenacity",
] as const;
export type ShardName = (typeof SHARD_NAMES)[number];

/** Data Dragon does not describe stat shards, so the app names the ones the game has. */
const SHARDS: ReadonlyMap<number, ShardName> = new Map([
  [5001, "healthScaling"],
  [5005, "attackSpeed"],
  [5007, "abilityHaste"],
  [5008, "adaptiveForce"],
  [5010, "moveSpeed"],
  [5011, "health"],
  [5013, "tenacity"],
]);

export const shardName = (shardId: number): ShardName | null =>
  SHARDS.get(shardId) ?? null;
