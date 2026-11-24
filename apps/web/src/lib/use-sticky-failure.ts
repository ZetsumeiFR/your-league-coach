import { useState } from "react";

import type { ServerFailure } from "@/utils/orpc";

/**
 * The last failure, kept until an answer replaces it: without it the screen
 * would flicker between a placeholder and the error at every client event.
 */
export const useStickyFailure = (
  reported: ServerFailure | null,
  hasFreshAnswer: boolean
): ServerFailure | null => {
  const [last, setLast] = useState<ServerFailure | null>(null);
  if (reported !== null && reported !== last) {
    setLast(reported);
  }
  if (hasFreshAnswer && last !== null) {
    setLast(null);
  }
  return last;
};
