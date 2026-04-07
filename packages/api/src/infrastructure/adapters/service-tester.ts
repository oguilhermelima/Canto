import { getSetting, setSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";

type ServiceType = "jellyfin" | "plex" | "qbittorrent" | "prowlarr" | "jackett" | "tvdb" | "tmdb";

type TestResult =
  | { connected: false; error: string }
  | { connected: true; serverName?: string; version?: string };

function validateServiceUrl(url: string): void {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP/HTTPS URLs are allowed");
  }
  const hostname = parsed.hostname.toLowerCase();
  const blockedPatterns = [
    /^169\.254\./, /^0\./,
    /^metadata\.google\.internal$/i,
    /^metadata\.internal$/i,
  ];
  if (blockedPatterns.some((re) => re.test(hostname))) {
    throw new Error("This URL is not allowed");
  }
}

async function testJellyfin(v: Record<string, string>): Promise<TestResult> {
  const url = v[SETTINGS.JELLYFIN_URL];
  const apiKey = v[SETTINGS.JELLYFIN_API_KEY];
  if (!url || !apiKey) return { connected: false, error: "URL or API key not configured" };
  validateServiceUrl(url);
  try {
    const res = await fetch(`${url}/System/Info`, { headers: { "X-Emby-Token": apiKey } });
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    const info = (await res.json()) as { ServerName: string; Version: string };
    return { connected: true, serverName: info.ServerName, version: info.Version };
  } catch {
    return { connected: false, error: "Connection failed" };
  }
}

async function testPlex(v: Record<string, string>): Promise<TestResult> {
  const url = v[SETTINGS.PLEX_URL];
  const token = v[SETTINGS.PLEX_TOKEN];
  if (!url || !token) return { connected: false, error: "URL or token not configured" };
  validateServiceUrl(url);
  try {
    const res = await fetch(`${url}/?X-Plex-Token=${token}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { MediaContainer: { friendlyName: string; version: string } };
    return { connected: true, serverName: data.MediaContainer.friendlyName, version: data.MediaContainer.version };
  } catch {
    return { connected: false, error: "Connection failed" };
  }
}

async function testQbittorrent(v: Record<string, string>): Promise<TestResult> {
  const url = v[SETTINGS.QBITTORRENT_URL];
  const username = v[SETTINGS.QBITTORRENT_USERNAME] ?? "";
  const password = v[SETTINGS.QBITTORRENT_PASSWORD] ?? "";
  if (!url) return { connected: false, error: "URL not configured" };
  validateServiceUrl(url);
  try {
    const body = new URLSearchParams({ username, password });
    const res = await fetch(`${url}/api/v2/auth/login`, {
      method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    if (text.includes("Fails")) return { connected: false, error: "Invalid credentials" };
    return { connected: true };
  } catch {
    return { connected: false, error: "Connection failed" };
  }
}

async function testProwlarr(v: Record<string, string>): Promise<TestResult> {
  const url = v[SETTINGS.PROWLARR_URL];
  const apiKey = v[SETTINGS.PROWLARR_API_KEY];
  if (!url || !apiKey) return { connected: false, error: "URL or API key not configured" };
  validateServiceUrl(url);
  try {
    const res = await fetch(`${url}/api/v1/health?apikey=${apiKey}`);
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    return { connected: true };
  } catch {
    return { connected: false, error: "Connection failed" };
  }
}

async function testJackett(v: Record<string, string>): Promise<TestResult> {
  const url = v[SETTINGS.JACKETT_URL];
  const apiKey = v[SETTINGS.JACKETT_API_KEY];
  if (!url || !apiKey) return { connected: false, error: "URL or API key not configured" };
  validateServiceUrl(url);
  try {
    const res = await fetch(`${url}/api/v2.0/indexers/all/results/torznab/api?apikey=${apiKey}&t=caps`);
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    return { connected: true };
  } catch {
    return { connected: false, error: "Connection failed" };
  }
}

async function testTvdb(v: Record<string, string>): Promise<TestResult> {
  const apiKey = v[SETTINGS.TVDB_API_KEY];
  if (!apiKey) return { connected: false, error: "API key not configured" };
  try {
    const res = await fetch("https://api4.thetvdb.com/v4/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey }),
    });
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { data: { token: string } };
    await setSetting(SETTINGS.TVDB_TOKEN, body.data.token);
    await setSetting(SETTINGS.TVDB_TOKEN_EXPIRES, new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString());
    return { connected: true };
  } catch {
    return { connected: false, error: "Connection failed" };
  }
}

async function testTmdb(v: Record<string, string>): Promise<TestResult> {
  const apiKey = v[SETTINGS.TMDB_API_KEY];
  if (!apiKey) return { connected: false, error: "API key not configured" };
  try {
    const res = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${apiKey}`);
    if (!res.ok) return { connected: false, error: `Invalid API key (HTTP ${res.status})` };
    return { connected: true };
  } catch {
    return { connected: false, error: "Connection failed" };
  }
}

const testers: Record<ServiceType, (v: Record<string, string>) => Promise<TestResult>> = {
  jellyfin: testJellyfin,
  plex: testPlex,
  qbittorrent: testQbittorrent,
  prowlarr: testProwlarr,
  jackett: testJackett,
  tvdb: testTvdb,
  tmdb: testTmdb,
};

/** Test connectivity for a given service using the provided values (not from DB). */
export async function testService(service: ServiceType, values: Record<string, string>): Promise<TestResult> {
  return testers[service](values);
}
