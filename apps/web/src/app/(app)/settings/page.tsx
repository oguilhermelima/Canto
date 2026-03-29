"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@canto/ui/tabs";
import { Skeleton } from "@canto/ui/skeleton";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Switch } from "@canto/ui/switch";
import { Input } from "@canto/ui/input";
import {
  Globe,
  Library,
  Monitor,
  Sun,
  Moon,
  Info,
  Save,
  Check,
  ExternalLink,
  Loader2,
  Server,
  RefreshCw,
  Film,
  Folder,
  Palette,
  Merge,
  Github,
  Download,
  Search,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { useWatchRegion } from "~/hooks/use-watch-region";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const themeOptions = [
  { value: "light", label: "Light", description: "Clean and bright interface", icon: Sun },
  { value: "dark", label: "Dark", description: "Easy on the eyes", icon: Moon },
  { value: "system", label: "System", description: "Follow your OS setting", icon: Monitor },
] as const;

const LIBRARY_TYPE_LABELS: Record<string, string> = {
  movies: "Movies",
  shows: "Shows",
  animes: "Animes",
};

/* -------------------------------------------------------------------------- */
/*  Shared field renderer                                                     */
/* -------------------------------------------------------------------------- */

function SettingsFields({
  fields,
  values,
  onChange,
  showSecrets,
  onToggleSecret,
}: {
  fields: Array<{ key: string; label: string; placeholder: string; secret?: boolean }>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  showSecrets: Record<string, boolean>;
  onToggleSecret: (key: string) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
          <div className="relative">
            <Input
              type={f.secret && !showSecrets[f.key] ? "password" : "text"}
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="h-9 text-sm"
            />
            {f.secret && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => onToggleSecret(f.key)}
              >
                {showSecrets[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Service Config Form (qBittorrent, Prowlarr)                               */
/* -------------------------------------------------------------------------- */

function ServiceConfigForm({
  title,
  description,
  icon,
  iconColor,
  fields,
  serviceKey,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconColor: string;
  fields: Array<{ key: string; label: string; placeholder: string; secret?: boolean }>;
  serviceKey: "jellyfin" | "plex" | "qbittorrent" | "prowlarr";
}): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const testService = trpc.settings.testService.useMutation();

  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (allSettings) {
      const v: Record<string, string> = {};
      for (const f of fields) v[f.key] = (allSettings[f.key] as string) ?? "";
      setValues(v);
      setDirty(false);
    }
  }, [allSettings, fields]);

  if (isLoading) {
    return <section className="rounded-lg border border-border bg-card p-6"><Skeleton className="h-20 w-full" /></section>;
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", iconColor)}>{icon}</div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <ConnectionBadge data={testService.data} />
      </div>

      <div className="mt-5">
        <SettingsFields
          fields={fields}
          values={values}
          onChange={(key, value) => { setValues((p) => ({ ...p, [key]: value })); setDirty(true); }}
          showSecrets={showSecrets}
          onToggleSecret={(key) => setShowSecrets((p) => ({ ...p, [key]: !p[key] }))}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => setMany.mutate(values, { onSuccess: () => setDirty(false) })} disabled={!dirty || setMany.isPending}>
          {setMany.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={() => testService.mutate({ service: serviceKey, values })} disabled={testService.isPending}>
          {testService.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Test
        </Button>
      </div>

      <ConnectionFeedback data={testService.data} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Media Server Config (Jellyfin / Plex — supports login OR token)           */
/* -------------------------------------------------------------------------- */

function MediaServerConfigForm({
  title,
  description,
  icon,
  iconColor,
  serviceKey,
  urlKey,
  tokenFields,
  loginFields,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconColor: string;
  serviceKey: "jellyfin" | "plex";
  urlKey: string;
  tokenFields: Array<{ key: string; label: string; placeholder: string; secret?: boolean }>;
  loginFields: Array<{ key: string; label: string; placeholder: string; secret?: boolean }>;
}): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const testService = trpc.settings.testService.useMutation();
  const authJellyfin = trpc.settings.authenticateJellyfin.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const authPlex = trpc.settings.authenticatePlex.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });

  const [authMode, setAuthMode] = useState<"token" | "login">("token");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loginValues, setLoginValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (allSettings) {
      const v: Record<string, string> = {};
      for (const f of tokenFields) v[f.key] = (allSettings[f.key] as string) ?? "";
      setValues(v);
      setDirty(false);
    }
  }, [allSettings, tokenFields]);

  const isConnected = allSettings?.[urlKey];
  const authMutation = serviceKey === "jellyfin" ? authJellyfin : authPlex;

  const handleLogin = (): void => {
    const url = loginValues.url ?? "";
    if (serviceKey === "jellyfin") {
      authJellyfin.mutate({
        url,
        username: loginValues.username ?? "",
        password: loginValues.password ?? "",
      });
    } else {
      authPlex.mutate({
        url,
        token: loginValues.token ?? "",
      });
    }
  };

  if (isLoading) {
    return <section className="rounded-lg border border-border bg-card p-6"><Skeleton className="h-20 w-full" /></section>;
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", iconColor)}>{icon}</div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {isConnected && (
          <Badge className="border-green-500/20 bg-green-500/10 text-green-500">
            <CheckCircle className="mr-1 h-3 w-3" />
            Configured
          </Badge>
        )}
      </div>

      {/* Auth mode tabs */}
      <div className="mt-5 flex gap-4 border-b border-border">
        <button
          type="button"
          onClick={() => setAuthMode("token")}
          className={cn(
            "pb-2 text-sm font-medium transition-colors",
            authMode === "token"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          API Key / Token
        </button>
        <button
          type="button"
          onClick={() => setAuthMode("login")}
          className={cn(
            "pb-2 text-sm font-medium transition-colors",
            authMode === "login"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {serviceKey === "jellyfin" ? "Login with credentials" : "Login with token"}
        </button>
      </div>

      {authMode === "token" ? (
        <>
          <div className="mt-4">
            <SettingsFields
              fields={tokenFields}
              values={values}
              onChange={(key, value) => { setValues((p) => ({ ...p, [key]: value })); setDirty(true); }}
              showSecrets={showSecrets}
              onToggleSecret={(key) => setShowSecrets((p) => ({ ...p, [key]: !p[key] }))}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => setMany.mutate(values, { onSuccess: () => setDirty(false) })} disabled={!dirty || setMany.isPending}>
              {setMany.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => testService.mutate({ service: serviceKey, values })} disabled={testService.isPending}>
              {testService.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Test
            </Button>
          </div>
          <ConnectionFeedback data={testService.data} />
        </>
      ) : (
        <>
          <div className="mt-4">
            <SettingsFields
              fields={[
                { key: "url", label: "Server URL", placeholder: serviceKey === "jellyfin" ? "http://192.168.1.100:8096" : "http://192.168.1.100:32400" },
                ...loginFields,
              ]}
              values={loginValues}
              onChange={(key, value) => setLoginValues((p) => ({ ...p, [key]: value }))}
              showSecrets={showSecrets}
              onToggleSecret={(key) => setShowSecrets((p) => ({ ...p, [key]: !p[key] }))}
            />
          </div>
          <div className="mt-4">
            <Button size="sm" onClick={handleLogin} disabled={authMutation.isPending}>
              {authMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {serviceKey === "jellyfin" ? "Sign in & save" : "Verify & save"}
            </Button>
          </div>
          {authMutation.data && (
            <p className={cn("mt-3 text-xs", authMutation.data.success ? "text-green-500" : "text-destructive")}>
              {authMutation.data.success
                ? `Connected to ${authMutation.data.serverName}${"user" in authMutation.data ? ` as ${authMutation.data.user}` : ""}. Credentials saved.`
                : authMutation.data.error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Connection status helpers                                                  */
/* -------------------------------------------------------------------------- */

function ConnectionBadge({ data }: { data: { connected: boolean } | undefined }): React.JSX.Element | null {
  if (!data) return null;
  return data.connected ? (
    <Badge className="border-green-500/20 bg-green-500/10 text-green-500">
      <CheckCircle className="mr-1 h-3 w-3" />
      Connected
    </Badge>
  ) : (
    <Badge className="border-destructive/20 bg-destructive/10 text-destructive">
      <XCircle className="mr-1 h-3 w-3" />
      Failed
    </Badge>
  );
}

function ConnectionFeedback({ data }: { data: { connected: boolean; error?: string; serverName?: string; version?: string } | undefined }): React.JSX.Element | null {
  if (!data) return null;
  if (!data.connected && data.error) return <p className="mt-3 text-xs text-destructive">{data.error}</p>;
  if (data.connected && data.serverName) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Connected to {data.serverName}{data.version && ` (v${data.version})`}
      </p>
    );
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function SettingsPage(): React.JSX.Element {
  const { region, setRegion } = useWatchRegion();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => { document.title = "Settings — Canto"; }, []);

  const displayRegion = pendingRegion ?? region;
  const utils = trpc.useUtils();

  const { data: regions, isLoading: regionsLoading } = trpc.provider.regions.useQuery();
  const { data: watchProviders, isLoading: providersLoading } =
    trpc.provider.watchProviders.useQuery(
      { type: "movie", region: displayRegion },
      { enabled: !!displayRegion },
    );

  const handleSaveRegion = (): void => {
    const value = pendingRegion ?? region;
    setRegion(value);
    setPendingRegion(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const hasPendingChange = pendingRegion !== null && pendingRegion !== region;

  // Libraries
  const { data: libraries, isLoading: librariesLoading } =
    trpc.library.listLibraries.useQuery();

  const toggleLibrary = trpc.jellyfin.toggleLibrary.useMutation({
    onSuccess: () => { void utils.library.listLibraries.invalidate(); },
  });
  const setDefault = trpc.library.setDefault.useMutation({
    onSuccess: () => { void utils.library.listLibraries.invalidate(); },
  });

  // Sync buttons
  const syncJellyfin = trpc.jellyfin.syncLibraries.useMutation({
    onSuccess: () => { void utils.library.listLibraries.invalidate(); },
  });
  const syncPlex = trpc.plex.syncLibraries.useMutation({
    onSuccess: () => { void utils.library.listLibraries.invalidate(); },
  });
  const scanJellyfin = trpc.jellyfin.scan.useMutation();
  const scanPlex = trpc.plex.scan.useMutation();

  // Preferences
  const { data: preferences } = trpc.library.getPreferences.useQuery(
    undefined, { retry: false },
  );
  const setPreference = trpc.library.setPreference.useMutation({
    onSuccess: () => { void utils.library.getPreferences.invalidate(); },
  });
  const autoMergeVersions =
    (preferences as Record<string, unknown> | undefined)?.autoMergeVersions ?? true;

  // TMDB API Key
  const { data: allSettings } = trpc.settings.getAll.useQuery();
  const setSettings = trpc.settings.setMany.useMutation({
    onSuccess: () => { void utils.settings.getAll.invalidate(); },
  });
  const [tmdbKey, setTmdbKey] = useState("");
  const [tmdbDirty, setTmdbDirty] = useState(false);
  useEffect(() => {
    if (allSettings?.["tmdb.apiKey"]) {
      setTmdbKey(allSettings["tmdb.apiKey"] as string);
      setTmdbDirty(false);
    }
  }, [allSettings]);

  const enabledLibraries = (libraries ?? []).filter((l) => l.enabled).length;
  const totalLibraries = (libraries ?? []).length;

  const tabTriggerClass =
    "rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-1 shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none";

  return (
    <div className="mx-auto w-full px-4 py-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your media server, services, and preferences, services, and application preferences.
        </p>
      </div>

      <Tabs defaultValue="services">
        <TabsList className="mb-8 h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger value="services" className={tabTriggerClass}>
            <Server className="mr-2 h-4 w-4" />
            Services
          </TabsTrigger>
          <TabsTrigger value="libraries" className={tabTriggerClass}>
            <Library className="mr-2 h-4 w-4" />
            Libraries
          </TabsTrigger>
          <TabsTrigger value="tmdb" className={tabTriggerClass}>
            <Film className="mr-2 h-4 w-4" />
            TMDB
          </TabsTrigger>
          <TabsTrigger value="preferences" className={tabTriggerClass}>
            <Palette className="mr-2 h-4 w-4" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="about" className={tabTriggerClass}>
            <Info className="mr-2 h-4 w-4" />
            About
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/*  SERVICES — all connections in one place                         */}
        {/* ================================================================ */}
        <TabsContent value="services" className="mt-0">
          <div className="grid gap-6 grid-cols-1">
            {/* Media Servers */}
            <MediaServerConfigForm
              title="Jellyfin"
              description="Free software media system. Connect to sync libraries and trigger scans after downloads."
              icon={<Server className="h-6 w-6 text-purple-500" />}
              iconColor="bg-purple-500/10"
              serviceKey="jellyfin"
              urlKey="jellyfin.url"
              tokenFields={[
                { key: "jellyfin.url", label: "Server URL", placeholder: "http://192.168.1.100:8096" },
                { key: "jellyfin.apiKey", label: "API Key", placeholder: "Your Jellyfin API key", secret: true },
              ]}
              loginFields={[
                { key: "username", label: "Username", placeholder: "admin" },
                { key: "password", label: "Password", placeholder: "Password", secret: true },
              ]}
            />

            <MediaServerConfigForm
              title="Plex"
              description="Popular media server. Connect to sync libraries and trigger scans after downloads."
              icon={<Server className="h-6 w-6 text-orange-500" />}
              iconColor="bg-orange-500/10"
              serviceKey="plex"
              urlKey="plex.url"
              tokenFields={[
                { key: "plex.url", label: "Server URL", placeholder: "http://192.168.1.100:32400" },
                { key: "plex.token", label: "X-Plex-Token", placeholder: "Your Plex authentication token", secret: true },
              ]}
              loginFields={[
                { key: "token", label: "X-Plex-Token", placeholder: "Your Plex token", secret: true },
              ]}
            />

            {/* Download tools */}
            <ServiceConfigForm
              title="qBittorrent"
              description="Torrent client used for downloading media. Canto manages torrents, organizes files, and triggers imports through this connection."
              icon={<Download className="h-6 w-6 text-blue-500" />}
              iconColor="bg-blue-500/10"
              serviceKey="qbittorrent"
              fields={[
                { key: "qbittorrent.url", label: "WebUI URL", placeholder: "http://localhost:8080" },
                { key: "qbittorrent.username", label: "Username", placeholder: "admin" },
                { key: "qbittorrent.password", label: "Password", placeholder: "Password", secret: true },
              ]}
            />

            <ServiceConfigForm
              title="Prowlarr"
              description="Indexer manager that aggregates torrent search across multiple trackers. Used to find torrents when you search for media to download."
              icon={<Search className="h-6 w-6 text-teal-500" />}
              iconColor="bg-teal-500/10"
              serviceKey="prowlarr"
              fields={[
                { key: "prowlarr.url", label: "URL", placeholder: "http://localhost:9696" },
                { key: "prowlarr.apiKey", label: "API Key", placeholder: "Your Prowlarr API key", secret: true },
              ]}
            />

            {/* TMDB */}
            <section className="rounded-lg border border-border bg-card p-6 ">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                  <Film className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">TMDB</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    The Movie Database provides all movie and TV show metadata. Get your free API key at{" "}
                    <a
                      href="https://www.themoviedb.org/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      themoviedb.org
                    </a>.
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  API Key (v3 auth)
                </label>
                <Input
                  type="password"
                  value={tmdbKey}
                  placeholder="Enter your TMDB API key"
                  onChange={(e) => {
                    setTmdbKey(e.target.value);
                    setTmdbDirty(true);
                  }}
                  className="h-9 text-sm"
                />
              </div>
              <div className="mt-4">
                <Button
                  size="sm"
                  onClick={() => {
                    setSettings.mutate({ "tmdb.apiKey": tmdbKey }, {
                      onSuccess: () => setTmdbDirty(false),
                    });
                  }}
                  disabled={!tmdbDirty || setSettings.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </div>
            </section>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/*  LIBRARIES                                                       */}
        {/* ================================================================ */}
        <TabsContent value="libraries" className="mt-0">
          <div className="grid gap-6">
            {librariesLoading ? (
              <section className="rounded-lg border border-border bg-card p-6">
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              </section>
            ) : libraries && libraries.length > 0 ? (
              <>
                <section className="rounded-lg border border-border bg-card p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        Libraries
                      </h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Choose which libraries to use for downloads. The default
                        library for each type is where new media will be saved.
                        {totalLibraries > 0 && (
                          <span className="ml-1 text-foreground">
                            {enabledLibraries}/{totalLibraries} enabled.
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => syncJellyfin.mutate()}
                        disabled={syncJellyfin.isPending}
                      >
                        {syncJellyfin.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Sync Jellyfin
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => syncPlex.mutate()}
                        disabled={syncPlex.isPending}
                      >
                        {syncPlex.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Sync Plex
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {(libraries ?? []).map((lib) => (
                      <div
                        key={lib.id}
                        className={cn(
                          "flex items-center gap-4 rounded-lg border p-4 transition-all",
                          !lib.enabled
                            ? "border-border bg-muted/20 opacity-60"
                            : lib.isDefault
                              ? "border-primary/40 bg-primary/5"
                              : "border-border hover:border-foreground/15",
                        )}
                      >
                        <Switch
                          checked={lib.enabled}
                          onCheckedChange={(checked) =>
                            toggleLibrary.mutate({ id: lib.id, enabled: checked })
                          }
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {lib.name}
                            </span>
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                              {LIBRARY_TYPE_LABELS[lib.type] ?? lib.type}
                            </Badge>
                            {lib.isDefault && (
                              <Badge className="border-primary/20 bg-primary/10 px-1.5 py-0 text-[10px] text-primary">
                                Default
                              </Badge>
                            )}
                            {lib.jellyfinLibraryId && (
                              <Badge variant="secondary" className="border-purple-500/20 bg-purple-500/10 px-1.5 py-0 text-[10px] text-purple-500">
                                Jellyfin
                              </Badge>
                            )}
                            {lib.plexLibraryId && (
                              <Badge variant="secondary" className="border-orange-500/20 bg-orange-500/10 px-1.5 py-0 text-[10px] text-orange-500">
                                Plex
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                            {lib.mediaPath && (
                              <span className="flex items-center gap-1">
                                <Folder className="h-3 w-3" />
                                {lib.mediaPath}
                              </span>
                            )}
                            {lib.qbitCategory && (
                              <span>qBit: {lib.qbitCategory}</span>
                            )}
                          </div>
                        </div>
                        {lib.enabled && !lib.isDefault && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => setDefault.mutate({ id: lib.id })}
                          >
                            Set default
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                {/* Post-import */}
                <section className="rounded-lg border border-border bg-card p-6">
                  <h3 className="mb-3 text-lg font-semibold text-foreground">
                    Post-import
                  </h3>
                  <div className="flex items-center gap-4 rounded-lg border border-border p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                      <Merge className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Auto-merge versions</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        When you download a second quality version (e.g. 4K after 1080p),
                        Jellyfin will automatically merge them into a single entry.
                      </p>
                    </div>
                    <Switch
                      checked={autoMergeVersions === true}
                      onCheckedChange={(checked) =>
                        setPreference.mutate({ key: "autoMergeVersions", value: checked })
                      }
                    />
                  </div>
                </section>
              </>
            ) : (
              <section className="rounded-lg border border-border bg-card p-6">
                <p className="text-sm text-muted-foreground">
                  No libraries configured. Connect a media server in the Services tab to sync libraries automatically.
                </p>
              </section>
            )}
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/*  TMDB                                                            */}
        {/* ================================================================ */}
        <TabsContent value="tmdb" className="mt-0">
          <div className="grid gap-6 grid-cols-1">
            {/* Watch Region */}
            <section className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10">
                  <Globe className="h-6 w-6 text-teal-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Watch Region</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Determines which streaming providers appear on media pages.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                {regionsLoading ? (
                  <Skeleton className="h-9 w-[280px]" />
                ) : (
                  <Select
                    value={displayRegion}
                    onValueChange={(value) => setPendingRegion(value)}
                  >
                    <SelectTrigger className="h-9 w-[280px] border-border text-sm">
                      <SelectValue placeholder="Select region..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {regions
                        ?.sort((a, b) => a.englishName.localeCompare(b.englishName))
                        .map((r) => (
                          <SelectItem key={r.code} value={r.code}>
                            {r.englishName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  size="sm"
                  onClick={handleSaveRegion}
                  disabled={!hasPendingChange && !saved}
                >
                  {saved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                  {saved ? "Saved" : "Save"}
                </Button>
              </div>

              {displayRegion && (
                <div className="mt-6 border-t border-border pt-5">
                  <h4 className="mb-1 text-sm font-medium text-foreground">
                    Available streaming services
                  </h4>
                  <p className="mb-4 text-xs text-muted-foreground">
                    These providers will appear on media detail pages.
                  </p>
                  {providersLoading ? (
                    <div className="flex flex-wrap gap-3">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-12 rounded-lg" />
                      ))}
                    </div>
                  ) : watchProviders && watchProviders.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {watchProviders.slice(0, 30).map((p) => (
                        <div key={p.providerId} className="group relative" title={p.providerName}>
                          <img
                            src={`${TMDB_IMAGE_BASE}/w92${p.logoPath}`}
                            alt={p.providerName}
                            className="h-12 w-12 rounded-lg border border-border object-cover transition-transform group-hover:scale-105"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No streaming providers found for this region.
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/*  PREFERENCES                                                     */}
        {/* ================================================================ */}
        <TabsContent value="preferences" className="mt-0">
          <div className="grid gap-6 grid-cols-1">
            <section className="rounded-lg border border-border bg-card p-6 ">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10">
                  <Palette className="h-6 w-6 text-orange-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Appearance</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Choose a theme for the Canto interface. The system option
                    will follow your operating system&apos;s light or dark mode setting.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                {themeOptions.map(({ value, label, description, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={cn(
                      "flex flex-col items-center gap-3 rounded-lg border p-5 transition-all",
                      mounted && theme === value
                        ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/20"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    <div className="text-center">
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </TabsContent>

        {/* ================================================================ */}
        {/*  ABOUT                                                           */}
        {/* ================================================================ */}
        <TabsContent value="about" className="mt-0">
          <div className="grid gap-6 grid-cols-1">
            <section className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-lg font-semibold text-foreground">Application</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Your personal corner for media.
              </p>
              <div className="mt-5 space-y-3">
                {[
                  ["Version", "0.1.0"],
                  ["Stack", "Next.js + tRPC + Drizzle"],
                  ["Metadata", "TMDB + AniList"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-xs text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-lg font-semibold text-foreground">Links</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Project resources and data providers.
              </p>
              <div className="mt-5 space-y-2">
                {[
                  { href: "https://github.com/oguilhermelima/canto", icon: Github, name: "GitHub", desc: "Source code and issue tracker" },
                  { href: "https://www.themoviedb.org/", icon: Film, name: "TMDB", desc: "Movie and TV show metadata" },
                  { href: "https://jellyfin.org/", icon: Server, name: "Jellyfin", desc: "Free software media system" },
                ].map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:border-foreground/20 hover:bg-muted/30"
                  >
                    <link.icon className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <span className="font-medium text-foreground">{link.name}</span>
                      <p className="text-xs text-muted-foreground">{link.desc}</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
