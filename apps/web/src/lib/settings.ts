import { z } from "zod";

export const LANGUAGE_SETTINGS = ["auto", "fr", "en"] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/** Why a server URL or access key is refused; the settings form translates each code. */
export const SERVER_URL_ISSUES = [
  "invalid",
  "insecure",
  "credentials",
] as const;
export type ServerUrlIssue = (typeof SERVER_URL_ISSUES)[number];
export const ACCESS_KEY_ISSUES = ["length", "characters"] as const;
export type AccessKeyIssue = (typeof ACCESS_KEY_ISSUES)[number];

const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const HOST_END_PATTERN = /[/:?#]/;
const HTTP_URL_PATTERN = /^(https?:\/\/)(.+)$/i;
const TRAILING_SLASHES = /\/+$/;
/** What a `fetch` header value can carry without throwing. */
const HEADER_SAFE_PATTERN = /^[\x20-\x7E]*$/;
const MAX_ACCESS_KEY_LENGTH = 512;
const MAX_SERVER_URL_LENGTH = 2048;
const MAX_HOSTNAME_LENGTH = 253;
/** Never part of an address, and URL parsers disagree on how to read them. */
const UNSAFE_ADDRESS_CHARACTERS = /[\s\\\p{Cc}]/u;
/** A DNS name or IPv4 address as a URL parser spells it (IDN in punycode). */
const HOSTNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const IPV6_LITERAL_PATTERN = /^\[[0-9a-f:.]+\]$/;

/**
 * Scheme a server address gets when it is typed without one: `https://`, or
 * `http://` for this machine, the only place plain HTTP is accepted.
 */
export const impliedScheme = (address: string): "http://" | "https://" => {
  const [host = ""] = address.trim().split(HOST_END_PATTERN);
  return LOCAL_HOSTS.has(host.toLowerCase()) ? "http://" : "https://";
};

export const hasExplicitScheme = (address: string): boolean =>
  SCHEME_PATTERN.test(address.trim());

export const normalizeServerUrl = (address: string): string => {
  const trimmed = address.trim();
  if (trimmed === "") {
    return "";
  }
  const url = hasExplicitScheme(trimmed)
    ? trimmed
    : `${impliedScheme(trimmed)}${trimmed}`;
  return url.replace(TRAILING_SLASHES, "");
};

/**
 * A saved URL as the form shows it: without its scheme when a bare address
 * would get that same scheme back, so saving what is shown changes nothing.
 */
export const displayAddress = (url: string): string => {
  const [, scheme, address] = HTTP_URL_PATTERN.exec(url) ?? [];
  return scheme && address && impliedScheme(address) === scheme.toLowerCase()
    ? address
    : url;
};

const isHostname = (hostname: string): boolean =>
  hostname.length <= MAX_HOSTNAME_LENGTH &&
  (HOSTNAME_PATTERN.test(hostname) || IPV6_LITERAL_PATTERN.test(hostname));

/**
 * Why a normalized URL is refused, or null. The URL parser is not trusted to
 * be strict: Chromium accepts hosts that other engines refuse (a space becomes
 * `%20`), so the parsed host must also look like a DNS name or an IP address.
 */
export const serverUrlIssue = (url: string): ServerUrlIssue | null => {
  if (url === "") {
    return null;
  }
  const isParseable =
    url.length <= MAX_SERVER_URL_LENGTH &&
    !UNSAFE_ADDRESS_CHARACTERS.test(url) &&
    URL.canParse(url);
  if (!isParseable) {
    return "invalid";
  }
  const { hash, hostname, password, protocol, search, username } = new URL(url);
  if (username !== "" || password !== "") {
    return "credentials";
  }
  if (search !== "" || hash !== "" || !isHostname(hostname)) {
    return "invalid";
  }
  if (protocol === "https:") {
    return null;
  }
  if (protocol === "http:") {
    return LOCAL_HOSTS.has(hostname) ? null : "insecure";
  }
  return "invalid";
};

/**
 * The one spelling an accepted URL is stored in: lower-case host, no default
 * port, no trailing slash.
 */
const canonicalServerUrl = (url: string): string => {
  if (!URL.canParse(url)) {
    return url;
  }
  const { origin, pathname } = new URL(url);
  return `${origin}${pathname}`.replace(TRAILING_SLASHES, "");
};

const serverUrlSchema = z
  .string()
  .transform(normalizeServerUrl)
  .superRefine((url, context) => {
    const issue = serverUrlIssue(url);
    if (issue) {
      context.addIssue({ code: "custom", message: issue });
    }
  })
  .transform(canonicalServerUrl);

const accessKeySchema = z
  .string()
  .trim()
  .max(MAX_ACCESS_KEY_LENGTH, { message: "length" satisfies AccessKeyIssue })
  .regex(HEADER_SAFE_PATTERN, {
    message: "characters" satisfies AccessKeyIssue,
  });

export const connectionSchema = z.object({
  serverUrl: serverUrlSchema,
  accessKey: accessKeySchema,
});
export type Connection = z.infer<typeof connectionSchema>;

/** A blank path means "find the lockfile automatically". */
export const lockfilePathSchema = z
  .string()
  .nullable()
  .transform((path) => path?.trim() || null);

export const settingsSchema = connectionSchema.extend({
  language: z.enum(LANGUAGE_SETTINGS),
  autoImport: z.boolean(),
  lockfilePath: lockfilePathSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

export const SETTING_KEYS = [
  "serverUrl",
  "accessKey",
  "language",
  "autoImport",
  "lockfilePath",
] as const satisfies readonly (keyof Settings)[];

export const isConnectionConfigured = ({
  accessKey,
  serverUrl,
}: Connection): boolean => serverUrl !== "" && accessKey !== "";

/**
 * Settings read back from disk: a key that is missing or no longer valid
 * (edited by hand, written by another version) takes its default instead of
 * failing the whole load.
 */
export const parseStoredSettings = (
  stored: Partial<Record<keyof Settings, unknown>>,
  defaults: Settings
): Settings => {
  const read = <Key extends keyof Settings>(key: Key): Settings[Key] => {
    if (stored[key] === undefined) {
      return defaults[key];
    }
    const parsed = settingsSchema.shape[key].safeParse(stored[key]);
    return parsed.success ? (parsed.data as Settings[Key]) : defaults[key];
  };
  return {
    serverUrl: read("serverUrl"),
    accessKey: read("accessKey"),
    language: read("language"),
    autoImport: read("autoImport"),
    lockfilePath: read("lockfilePath"),
  };
};
