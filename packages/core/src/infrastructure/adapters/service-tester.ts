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
  const url = v["jellyfin.url"];
  const apiKey = v["jellyfin.apiKey"];
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
  const url = v["plex.url"];
  const token = v["plex.token"];
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
  const url = v["qbittorrent.url"];
  const username = v["qbittorrent.username"] ?? "";
  const password = v["qbittorrent.password"] ?? "";
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
  const url = v["prowlarr.url"];
  const apiKey = v["prowlarr.apiKey"];
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
  const url = v["jackett.url"];
  const apiKey = v["jackett.apiKey"];
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
  const apiKey = v["tvdb.apiKey"];
  if (!apiKey) return { connected: false, error: "API key not configured" };
  try {
    // Read-only probe: we deliberately do NOT persist the returned token here.
    // The token is picked up organically by TvdbProvider the next time it runs
    // getToken() + onTokenRefresh — that path is the single writer for
    // `tvdb.token` / `tvdb.tokenExpires`. Writing here caused races when the
    // admin clicked "Test" twice or when a background refresh was in flight.
    const res = await fetch("https://api4.thetvdb.com/v4/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: apiKey }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
    return { connected: true };
  } catch {
    return { connected: false, error: "Connection failed" };
  }
}

async function testTmdb(v: Record<string, string>): Promise<TestResult> {
  const apiKey = v["tmdb.apiKey"];
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
