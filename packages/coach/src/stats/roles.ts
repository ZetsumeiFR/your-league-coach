import { ROLES, type Role } from "@your-league-coach/lol-data/roles";

/** Place value above the 52-bit binary64 fraction field. */
const FRACTION_RADIX = 2n ** 52n;
/** Place value above the 11-bit binary64 exponent field. */
const EXPONENT_RADIX = 2n ** 11n;

type RoleCounts = Readonly<Partial<Record<Role, number>>>;

/** Games by champion ID and role. Missing champion or role entries mean zero. */
export type RoleDistribution = Readonly<Partial<Record<number, RoleCounts>>>;

export interface InferredRole {
  /** The champion's observed play share in this role, not a team posterior. */
  readonly confidence: number;
  readonly role: Role;
}

interface RoleOption {
  readonly assignment: InferredRole;
  readonly weight: bigint;
}

/** Encodes a non-negative finite count in units of Number.MIN_VALUE. */
function exactCountUnits(games: number, bits: DataView): bigint {
  bits.setFloat64(0, games);
  const encoded = bits.getBigUint64(0);
  const fraction = encoded % FRACTION_RADIX;
  const exponent = (encoded / FRACTION_RADIX) % EXPONENT_RADIX;
  // Subnormals already use these units; normal values have an implicit bit.
  return exponent === 0n
    ? fraction
    : (FRACTION_RADIX + fraction) * 2n ** (exponent - 1n);
}

function roleOptions(
  championId: number,
  counts: RoleCounts | undefined
): RoleOption[] {
  let total = 0;
  for (const role of ROLES) {
    const games = counts?.[role] ?? 0;
    if (!Number.isFinite(games) || games < 0) {
      throw new RangeError(
        `Invalid games for champion ${championId} in ${role}`
      );
    }
    total += games;
  }
  if (!Number.isFinite(total)) {
    throw new RangeError(
      `Total games for champion ${championId} must be finite`
    );
  }
  const bits = new DataView(new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT));
  return ROLES.map((role) => {
    const games = counts?.[role] ?? 0;
    return {
      assignment: {
        role,
        confidence: total === 0 ? 1 / ROLES.length : games / total,
      },
      weight: total === 0 ? 1n : exactCountUnits(games, bits),
    };
  });
}

/**
 * Assigns distinct roles to the revealed champions, maximizing the product of
 * their role probabilities. A champion with no games is uniform over ROLES.
 * An empty draft returns an empty map; ties use input order and ROLES order.
 * Invalid IDs, duplicates, oversized drafts, and invalid counts throw RangeError.
 */
export function inferEnemyRoles(
  championIds: readonly number[],
  roleDistribution: RoleDistribution
): ReadonlyMap<number, InferredRole> {
  if (championIds.length > ROLES.length) {
    throw new RangeError(
      `Cannot infer enemy roles for more than ${ROLES.length} champions`
    );
  }
  const champions = Array.from(championIds, (id) => {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new RangeError(
        `Expected a positive integer champion ID, received ${id}`
      );
    }
    return { id, options: roleOptions(id, roleDistribution[id]) };
  });
  if (new Set(championIds).size !== champions.length) {
    throw new RangeError("Cannot infer enemy roles for duplicate champion IDs");
  }

  const usedRoles = new Set<Role>();
  const assignment = new Map<number, InferredRole>();
  let best = new Map<number, InferredRole>();
  let bestScore = -1n;

  // Per-champion denominators are fixed across assignments, so exact products
  // of the count weights rank the probabilities without rounding or underflow.
  function search(index: number, score: bigint): void {
    const champion = champions[index];
    if (!champion) {
      if (score > bestScore) {
        best = new Map(assignment);
        bestScore = score;
      }
      return;
    }

    for (const { assignment: option, weight } of champion.options) {
      if (usedRoles.has(option.role)) {
        continue;
      }
      usedRoles.add(option.role);
      assignment.set(champion.id, option);
      search(index + 1, score * weight);
      assignment.delete(champion.id);
      usedRoles.delete(option.role);
    }
  }

  search(0, 1n);
  return best;
}
