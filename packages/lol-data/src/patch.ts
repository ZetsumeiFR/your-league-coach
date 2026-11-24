const PATCH_PATTERN = /^(\d+)\.(\d+)(?:\.|$)/;

const parsePatch = (patch: string): [number, number] => {
  const match = PATCH_PATTERN.exec(patch);
  if (!(match?.[1] && match[2])) {
    throw new Error(`Invalid patch or game version: "${patch}"`);
  }
  return [Number(match[1]), Number(match[2])];
};

/** "15.23.1" (Data Dragon) and "15.23.712.1234" (match-v5 gameVersion) both give "15.23". */
export const toPatch = (version: string): string => {
  const [major, minor] = parsePatch(version);
  return `${major}.${minor}`;
};

export const comparePatch = (a: string, b: string): number => {
  const [aMajor, aMinor] = parsePatch(a);
  const [bMajor, bMinor] = parsePatch(b);
  return aMajor - bMajor || aMinor - bMinor;
};

/** Greatest known patch strictly older than `patch`, or null when there is none. */
export const previousPatch = (
  patch: string,
  knownPatches: readonly string[]
): string | null => {
  let previous: string | null = null;
  for (const known of knownPatches) {
    if (
      comparePatch(known, patch) < 0 &&
      (previous === null || comparePatch(known, previous) > 0)
    ) {
      previous = known;
    }
  }
  return previous;
};
