import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { file, type ServerWebSocket, serve, sleep } from "bun";
import { z } from "zod";
import {
  championMastery,
  matchHistory,
  regionLocale,
  summoner,
} from "./fixtures/lcu/accounts";
import {
  itemSets,
  runeInventory,
  runePages,
  selection,
} from "./fixtures/lcu/loadouts";
import {
  draftPath,
  flowPath,
  liveArmorScenario,
  liveScenario,
  loadScenario,
  phasePath,
  rankedPickableChampionIds,
} from "./fixtures/lcu/scenarios";
import allGameData from "./fixtures/live/allgamedata.json";

type Subscription = Readonly<{ topics: Set<string> }>;
type RecordedRequest = Readonly<{
  body: unknown;
  method: string;
  path: string;
}>;
const sockets = new Set<ServerWebSocket<Subscription>>();
const requests: RecordedRequest[] = [];
const password = randomBytes(24).toString("hex");
const authorization = `Basic ${Buffer.from(`riot:${password}`).toString("base64")}`;
const certDir = process.env.YLC_FAKE_CERT_DIR ?? `${import.meta.dir}/certs`;
const tempDir = process.env.YLC_FAKE_LOCKFILE
  ? null
  : await mkdtemp(join(tmpdir(), "ylc-lcu-"));
const lockfile =
  process.env.YLC_FAKE_LOCKFILE ?? join(tempDir ?? "", "lockfile");
const notFound = () => new Response(null, { status: 404 });

const gameflow = new Map<string, unknown>([
  [phasePath, "None"],
  [flowPath, { gameData: { queue: { id: 0 } } }],
]);
const pages = new Map<number, unknown>(
  runePages.map((page) => [page.id, page])
);
let nextPageId = 103;
let currentItemSets: unknown = itemSets;
let currentSelection: unknown = selection;
let replaying = false;
let liveData = allGameData;
const livePath = "/liveclientdata/allgamedata";

const armorItems = [3047, 3075, 3110].map((itemID, slot) => ({
  count: 1,
  displayName: "SENTINEL_NAME_DO_NOT_SHOW",
  itemID,
  slot,
}));

const rest = new Map<string, unknown>([
  ["/lol-summoner/v1/current-summoner", summoner],
  ["/riotclient/region-locale", regionLocale],
  ["/lol-champion-mastery/v1/local-player/champion-mastery", championMastery],
  ["/lol-match-history/v1/products/lol/current-summoner/matches", matchHistory],
  ["/lol-perks/v1/inventory", runeInventory],
]);

const wampEvent = z.tuple([
  z.literal(8),
  z.string(),
  z.object({ data: z.json(), uri: z.string() }),
]);

const broadcast = ({
  text,
  frame,
}: Readonly<{ text: string; frame: z.infer<typeof wampEvent> }>) => {
  const [, topic, { data, uri }] = frame;
  gameflow.set(uri, data);
  for (const ws of sockets) {
    if (ws.data.topics.has(topic)) {
      ws.send(text);
    }
  }
};

const replay = async (url: URL) => {
  if (replaying) {
    return new Response("Replay in progress", { status: 409 });
  }
  replaying = true;
  try {
    const scenario = url.searchParams.get("scenario");
    const frames = await loadScenario(scenario);
    if (!frames) {
      return notFound();
    }
    const delay = Math.min(
      2000,
      Math.max(0, Number(url.searchParams.get("delayMs")) || 0)
    );
    const events = frames.map((text) => ({
      text,
      frame: wampEvent.parse(JSON.parse(text)),
    }));
    if (scenario === liveScenario || scenario === liveArmorScenario) {
      liveData = {
        ...allGameData,
        allPlayers: allGameData.allPlayers.map((player) =>
          scenario === liveArmorScenario && player.team === "CHAOS"
            ? { ...player, items: armorItems }
            : player
        ),
      };
      gameflow.delete(draftPath);
    }
    const firstDraft = events.findIndex(
      ({ frame }) => frame[2].uri === draftPath
    );
    const split = delay > 0 && firstDraft >= 0 ? firstDraft + 1 : events.length;
    for (const event of events.slice(0, split)) {
      broadcast(event);
    }
    if (split < events.length) {
      await sleep(delay);
    }
    for (const event of events.slice(split)) {
      broadcast(event);
    }
    return Response.json({ events: frames.length });
  } finally {
    replaying = false;
  }
};

const pagesPath = "/lol-perks/v1/pages";
const itemsPath = `/lol-item-sets/v1/item-sets/${summoner.summonerId}/sets`;
const selectionPath = "/lol-champ-select/v1/session/my-selection";
const pickablePath = "/lol-champ-select/v1/pickable-champion-ids";

const read = (path: string) => {
  switch (path) {
    case pagesPath:
      return Response.json([...pages.values()]);
    case itemsPath:
      return Response.json(currentItemSets);
    case selectionPath:
      return Response.json(currentSelection);
    case pickablePath:
      return gameflow.get(phasePath) === "ChampSelect"
        ? Response.json(rankedPickableChampionIds)
        : notFound();
    default:
      return gameflow.has(path) || rest.has(path)
        ? Response.json(gameflow.get(path) ?? rest.get(path))
        : notFound();
  }
};

const mutate = (method: string, path: string, body: unknown) => {
  if (method === "DELETE" && path.startsWith(`${pagesPath}/`)) {
    return pages.delete(Number(path.slice(pagesPath.length + 1)))
      ? new Response(null, { status: 204 })
      : notFound();
  }
  if (
    method === "POST" &&
    path === pagesPath &&
    body &&
    typeof body === "object"
  ) {
    const page = { ...body, id: nextPageId };
    nextPageId += 1;
    pages.set(page.id, page);
    return Response.json(page);
  }
  if (method === "PUT" && path === itemsPath) {
    currentItemSets = body;
    return new Response(null, { status: 204 });
  }
  if (method === "PATCH" && path === selectionPath) {
    currentSelection = body;
    return new Response(null, { status: 204 });
  }
  return notFound();
};

const server = serve<Subscription>({
  async fetch(request, instance) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith("/__control/")) {
      if (request.headers.has("origin")) {
        return new Response(null, { status: 403 });
      }
      if (path === "/__control/replay" && request.method === "POST") {
        return await replay(url);
      }
      if (path === "/__control/requests" && request.method === "GET") {
        return Response.json(requests);
      }
      return notFound();
    }
    if (path === livePath && request.method === "GET") {
      requests.push({ body: null, method: request.method, path });
      return gameflow.get(phasePath) === "InProgress"
        ? Response.json(liveData)
        : notFound();
    }
    if (request.headers.get("authorization") !== authorization) {
      return new Response(null, { status: 401 });
    }
    if (
      path === "/" &&
      instance.upgrade(request, { data: { topics: new Set() } })
    ) {
      return;
    }
    const { method } = request;
    const body: unknown = request.body ? await request.json() : null;
    requests.push({ body, method, path: `${path}${url.search}` });
    return method === "GET" ? read(path) : mutate(method, path, body);
  },
  hostname: "127.0.0.1",
  port: Number(process.env.YLC_FAKE_PORT ?? 0),
  tls: {
    cert: file(`${certDir}/server.pem`),
    key: file(`${certDir}/server-key.pem`),
  },
  websocket: {
    close(ws) {
      sockets.delete(ws);
    },
    message(ws, message) {
      if (typeof message !== "string") {
        return;
      }
      try {
        const frame: unknown = JSON.parse(message);
        if (
          Array.isArray(frame) &&
          frame[0] === 5 &&
          typeof frame[1] === "string"
        ) {
          ws.data.topics.add(frame[1]);
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          throw error;
        }
        ws.close(1007, "Invalid JSON");
      }
    },
    open(ws) {
      sockets.add(ws);
    },
  },
});

await writeFile(
  lockfile,
  `FakeRiot:${process.pid}:${server.port}:${password}:https`,
  {
    mode: 0o600,
  }
);
process.stdout.write(`LOCKFILE=${lockfile}\nPORT=${server.port}\n`);

const stop = async () => {
  await server.stop(true);
  await rm(tempDir ?? lockfile, { force: true, recursive: tempDir !== null });
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
