import { defineRelations } from "drizzle-orm";

import { matches, matchParticipants } from "./schema/lol";

export const relations = defineRelations(
  { matches, matchParticipants },
  (r) => ({
    matches: {
      participants: r.many.matchParticipants({
        from: r.matches.matchId,
        to: r.matchParticipants.matchId,
      }),
    },
    matchParticipants: {
      match: r.one.matches({
        from: r.matchParticipants.matchId,
        to: r.matches.matchId,
      }),
    },
  })
);
