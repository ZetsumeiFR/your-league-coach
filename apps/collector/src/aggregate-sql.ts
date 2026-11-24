import {
  buildStats,
  championRoleStats,
  itemVsEnemyStats,
  matches,
  matchParticipants,
  matchupStats,
  synergyStats,
} from "@your-league-coach/db/schema/lol";
import { type SQL, sql } from "drizzle-orm";

export const aggregateTables = [
  championRoleStats,
  matchupStats,
  synergyStats,
  buildStats,
  itemVsEnemyStats,
] as const;

export const snapshotParticipants = (window: readonly string[]) => sql`
  create temporary table aggregate_participants on commit drop as
  select p.*, m.patch, m.stats_group,
    case when m.stats_group = 'aram' then 'ANY' else p.role end as stats_role
  from ${matchParticipants} p join ${matches} m using (match_id)
  where m.patch in (${sql.join(
    window.map((patch) => sql`${patch}`),
    sql`, `
  )})
`;

const upsert = (
  table: (typeof aggregateTables)[number],
  dimensions: SQL | null,
  source: SQL
) => sql`
  insert into ${table} (patch, stats_group, champion_id, role, ${dimensions ? sql`${dimensions}, ` : sql``}games, wins)
  ${source}
  on conflict (patch, stats_group, champion_id, role${dimensions ? sql`, ${dimensions}` : sql``})
  do update set games = excluded.games, wins = excluded.wins, updated_at = excluded.updated_at
`;

const key = sql`p.patch, p.stats_group, p.champion_id, p.stats_role`;
const counts = sql`count(*)::int, (count(*) filter (where p.win))::int`;

export const championCounts = upsert(
  championRoleStats,
  null,
  sql`
  select ${key}, ${counts}
  from aggregate_participants p where p.stats_role is not null
  group by 1, 2, 3, 4
`
);

const pairCounts = (enemy: boolean) => sql`
  select ${key}, peer.champion_id, peer.stats_role, ${counts}
  from aggregate_participants p
  join aggregate_participants peer on peer.match_id = p.match_id
    and ${enemy ? sql`peer.team_id <> p.team_id` : sql`peer.team_id = p.team_id and peer.champion_id <> p.champion_id`}
  where p.stats_role is not null and peer.stats_role is not null
    ${enemy ? sql`and p.stats_group = 'sr'` : sql``}
  group by 1, 2, 3, 4, 5, 6
`;

export const matchupCounts = upsert(
  matchupStats,
  sql`opponent_champion_id, opponent_role`,
  pairCounts(true)
);
export const synergyCounts = upsert(
  synergyStats,
  sql`ally_champion_id, ally_role`,
  pairCounts(false)
);

// Ingest keeps completed purchases in order. Count a legendary at most once
// per participant, and keep its first purchase position for the core.
const completedItems = sql`
  select item_id, min(position) as first_purchase
  from unnest(p.item_build_order) with ordinality as purchase(item_id, position)
  where item_id > 0 and item_id is distinct from p.boots_id
  group by item_id
`;

// Most invested basic skills first; for equal ranks prefer the one that
// reached that rank first (at level 18 this is literal max-out order).
const skillKey = sql`
  case when cardinality(p.skill_order) >= 3
    and p.skill_order[1:3] <@ array[1, 2, 3]
    and p.skill_order[1] <> p.skill_order[2]
    and count(*) = 3
  then translate(array_to_string(p.skill_order[1:3], ''), '123', 'QWE') || '|' ||
    string_agg(substr('QWE', skill, 1), '>' order by ranks desc, last_rank)
  end
  from (
    select skill, count(*) as ranks, max(position) as last_rank
    from unnest(p.skill_order) with ordinality as level(skill, position)
    where skill between 1 and 3 group by skill
  ) basic
`;

export const buildCounts = upsert(
  buildStats,
  sql`kind, key`,
  sql`
  select ${key}, build.kind::build_kind, build.key, ${counts}
  from aggregate_participants p
  cross join lateral (
    select kind, key from (values
      ('starter', (select string_agg(id::text, '-' order by id)
        from unnest(p.starter_items) as starter(id) where id > 0)),
      ('boots', case when p.boots_id > 0 then p.boots_id::text end),
      ('core', (select case when count(*) = 3 then string_agg(item_id::text, '-' order by first_purchase) end
        from (select * from (${completedItems}) items order by first_purchase limit 3) core)),
      ('rune_page', case when cardinality(p.perks) = 6 and cardinality(p.stat_perks) = 3
        and p.perk_primary_style > 0 and p.perk_sub_style > 0
        and 0 < all(p.perks) and 0 < all(p.stat_perks)
        then p.perk_primary_style || ':' || array_to_string(p.perks[1:4], '-') || '|' ||
          p.perk_sub_style || ':' || array_to_string(p.perks[5:6], '-') || '|' ||
          array_to_string(p.stat_perks, '-') end),
      ('spells', case when cardinality(p.summoner_spells) = 2 and 0 < all(p.summoner_spells)
        and p.summoner_spells[1] <> p.summoner_spells[2]
        then least(p.summoner_spells[1], p.summoner_spells[2]) || '-' ||
          greatest(p.summoner_spells[1], p.summoner_spells[2]) end),
      ('skill_order', (select ${skillKey}))
    ) as options(kind, key) where key is not null
    union all
    select 'item', item_id::text from (${completedItems}) items
  ) build
  where p.stats_role is not null
  group by 1, 2, 3, 4, 5, 6
`
);

export const itemEnemyCounts = upsert(
  itemVsEnemyStats,
  sql`item_id, enemy_profile`,
  sql`
    select ${key}, items.item_id, profiles.profile, ${counts}
    from aggregate_participants p
    join aggregate_enemy_profiles profiles using (match_id, team_id)
    cross join lateral (${completedItems}) items
    where p.stats_role is not null
    group by 1, 2, 3, 4, 5, 6
  `
);
