import { ROLES, type Role } from "@your-league-coach/lol-data/roles";

type RoleCounts = Readonly<Partial<Record<Role, number>>>;

/** Games by champion ID and role. Missing champion or role entries mean zero. */
export type RoleDistribution = Readonly<Partial<Record<number, RoleCounts>>>;

export interface InferredRole {
  /** The champion's observed play share in this role, not a team posterior. */
  readonly confidence: number;
  readonly role: Role;
}

function roleOptions(
  championId: number,
  counts: RoleCounts | undefined
): InferredRole[] {
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
  return ROLES.map((role) => ({
    role,
    confidence: total === 0 ? 1 / ROLES.length : (counts?.[role] ?? 0) / total,
  }));
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
  let bestScore = Number.NEGATIVE_INFINITY;

  // Adding logs ranks the products without underflow for small probabilities.
  function search(index: number, score: number): void {
    const champion = champions[index];
    if (!champion) {
      if (best.size === 0 || score > bestScore) {
        best = new Map(assignment);
        bestScore = score;
      }
      return;
    }

    for (const option of champion.options) {
      if (usedRoles.has(option.role)) {
        continue;
      }
      usedRoles.add(option.role);
      assignment.set(champion.id, option);
      search(index + 1, score + Math.log(option.confidence));
      assignment.delete(champion.id);
      usedRoles.delete(option.role);
    }
  }

  search(0, 0);
  return best;
}
