"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Skeleton } from "@canto/ui/skeleton";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Switch } from "@canto/ui/switch";
import { Input } from "@canto/ui/input";
import {
  Globe,
  Monitor,
  Sun,
  Moon,
  Info,
  Save,
  Check,
  ExternalLink,
  Loader2,
  Server,
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
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";

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

const NAV_ITEMS = [
  { key: "services", label: "Services" },
  { key: "libraries", label: "Libraries" },
  { key: "tmdb", label: "TMDB" },
  { key: "preferences", label: "Preferences" },
  { key: "about", label: "About" },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];

/* -------------------------------------------------------------------------- */
/*  Animated collapse                                                          */
/* -------------------------------------------------------------------------- */

function AnimatedCollapse({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) setHeight(ref.current.scrollHeight);
  }, [open, children]);

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out"
      style={{ maxHeight: open ? height : 0, opacity: open ? 1 : 0 }}
    >
      <div ref={ref}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared field renderer                                                     */
/* -------------------------------------------------------------------------- */

function SettingsFields({
  fields,
  values,
  onChange,
  showSecrets,
  onToggleSecret,
  disabled,
}: {
  fields: Array<{ key: string; label: string; placeholder: string; secret?: boolean }>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  showSecrets: Record<string, boolean>;
  onToggleSecret: (key: string) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <label className={cn("text-xs font-medium", disabled ? "text-muted-foreground/40" : "text-muted-foreground")}>{f.label}</label>
          <div className="relative">
            <Input
              type={f.secret && !showSecrets[f.key] ? "password" : "text"}
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange(f.key, e.target.value)}
              className={cn("h-9 text-sm", disabled && "opacity-30 pointer-events-none")}
              disabled={disabled}
            />
            {f.secret && !disabled && (
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
/*  OR Divider                                                                 */
/* -------------------------------------------------------------------------- */

function OrDivider(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Connection helpers                                                         */
/* -------------------------------------------------------------------------- */

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
  if (data.connected) return <p className="mt-3 text-xs text-green-500">Connection successful</p>;
  return null;
}

/* -------------------------------------------------------------------------- */
/*  ServiceRow                                                                 */
/* -------------------------------------------------------------------------- */

function ServiceRow({
  title,
  description,
  serviceKey,
  fields,
  isLast,
  children,
}: {
  title: string;
  description: string;
  serviceKey: "jellyfin" | "plex" | "qbittorrent" | "prowlarr" | "jackett";
  fields?: Array<{ key: string; label: string; placeholder: string; secret?: boolean }>;
  isLast?: boolean;
  children?: React.ReactNode;
}): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const { data: enabledServices } = trpc.settings.getEnabledServices.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const testService = trpc.settings.testService.useMutation();
  const toggleService = trpc.settings.toggleService.useMutation({
    onSuccess: () => void utils.settings.getEnabledServices.invalidate(),
  });

  const isEnabled = enabledServices?.[serviceKey] === true;

  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (allSettings && fields) {
      const v: Record<string, string> = {};
      for (const f of fields) v[f.key] = (allSettings[f.key] as string) ?? "";
      setValues(v);
      setDirty(false);
    }
  }, [allSettings, fields]);

  if (isLoading) {
    return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;
  }

  const handleToggle = (): void => {
    toggleService.mutate({ service: serviceKey, enabled: !isEnabled });
  };

  return (
    <div className={cn(!isLast && "border-b border-border/60")}>
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); } }}
        className="flex w-full items-center justify-between px-5 py-5 text-left transition-colors hover:bg-muted/20 cursor-pointer"
      >
        <div className="min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{title}</p>
            {testService.data && (
              testService.data.connected ? (
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              )
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={() => handleToggle()}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <AnimatedCollapse open={isEnabled}>
        <div className="px-5 pb-6 space-y-4">
          {children ?? (
            <>
              {fields && (
                <SettingsFields
                  fields={fields}
                  values={values}
                  onChange={(key, value) => {
                    setValues((p) => ({ ...p, [key]: value }));
                    setDirty(true);
                  }}
                  showSecrets={showSecrets}
                  onToggleSecret={(key) =>
                    setShowSecrets((p) => ({ ...p, [key]: !p[key] }))
                  }
                />
              )}
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    setMany.mutate(values, { onSuccess: () => setDirty(false) })
                  }
                  disabled={!dirty || setMany.isPending}
                >
                  {setMany.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testService.mutate({ service: serviceKey, values })}
                  disabled={testService.isPending}
                >
                  {testService.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Test
                </Button>
              </div>
              <ConnectionFeedback data={testService.data} />
            </>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  MediaServerRow                                                             */
/* -------------------------------------------------------------------------- */

function MediaServerRow({
  title,
  description,
  serviceKey,
  urlField,
  apiKeyField,
  loginFields,
  isLast,
}: {
  title: string;
  description: string;
  serviceKey: "jellyfin" | "plex";
  urlField: { key: string; label: string; placeholder: string };
  apiKeyField: { key: string; label: string; placeholder: string; secret?: boolean };
  loginFields: Array<{ key: string; label: string; placeholder: string; secret?: boolean }>;
  isLast?: boolean;
}): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const { data: enabledServices } = trpc.settings.getEnabledServices.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const testService = trpc.settings.testService.useMutation();
  const toggleService = trpc.settings.toggleService.useMutation({
    onSuccess: () => void utils.settings.getEnabledServices.invalidate(),
  });
  const authJellyfin = trpc.settings.authenticateJellyfin.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const authPlex = trpc.settings.authenticatePlex.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const loginPlex = trpc.settings.loginPlex.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });

  const isEnabled = enabledServices?.[serviceKey] === true;
  const [activeSection, setActiveSection] = useState<"token" | "login" | null>(null);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loginValues, setLoginValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (allSettings) {
      setUrl((allSettings[urlField.key] as string) ?? "");
      setApiKey((allSettings[apiKeyField.key] as string) ?? "");
      setDirty(false);
    }
  }, [allSettings, urlField.key, apiKeyField.key]);

  const isConnected = allSettings?.[urlField.key];
  const authMutation = serviceKey === "jellyfin" ? authJellyfin : loginPlex;
  const isPending = setMany.isPending || authMutation.isPending;

  const handleSave = (): void => {
    if (activeSection === "login") {
      if (serviceKey === "jellyfin") {
        authJellyfin.mutate({
          url,
          username: loginValues.username ?? "",
          password: loginValues.password ?? "",
        });
      } else {
        loginPlex.mutate({
          url,
          email: loginValues.email ?? "",
          password: loginValues.password ?? "",
        });
      }
    } else {
      setMany.mutate(
        { [urlField.key]: url, [apiKeyField.key]: apiKey },
        { onSuccess: () => { setDirty(false); setActiveSection(null); } },
      );
    }
  };

  const handleToggle = (): void => {
    toggleService.mutate({ service: serviceKey, enabled: !isEnabled });
  };

  if (isLoading) {
    return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;
  }

  return (
    <div className={cn(!isLast && "border-b border-border/60")}>
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); } }}
        className="flex w-full items-center justify-between px-5 py-5 text-left transition-colors hover:bg-muted/20 cursor-pointer"
      >
        <div className="min-w-0 pr-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{title}</p>
            {isConnected && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={() => handleToggle()}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <AnimatedCollapse open={isEnabled}>
        <div className="px-5 pb-6 space-y-5">
          {/* Server URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{urlField.label}</label>
            <Input
              value={url}
              placeholder={urlField.placeholder}
              onChange={(e) => { setUrl(e.target.value); setDirty(true); }}
              className="h-9 text-sm"
            />
          </div>

          {/* Authentication */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Choose one authentication method</p>

            {/* Option 1: API Key */}
            <div
              className={cn(
                "rounded-lg border p-4 transition-all",
                activeSection === "login"
                  ? "border-border/30 opacity-40"
                  : activeSection === "token"
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 hover:border-border",
              )}
            >
              <p className="text-xs font-semibold text-foreground mb-3">{apiKeyField.label}</p>
              <div className="relative">
                <Input
                  type={apiKeyField.secret && !showSecrets[apiKeyField.key] ? "password" : "text"}
                  value={apiKey}
                  placeholder={apiKeyField.placeholder}
                  onChange={(e) => { setApiKey(e.target.value); setDirty(true); setActiveSection(e.target.value ? "token" : null); }}
                  className="h-9 text-sm"
                  disabled={activeSection === "login"}
                />
                {apiKeyField.secret && activeSection !== "login" && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowSecrets((p) => ({ ...p, [apiKeyField.key]: !p[apiKeyField.key] }))}
                  >
                    {showSecrets[apiKeyField.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>

            <OrDivider />

            {/* Option 2: Login */}
            <div
              className={cn(
                "rounded-lg border p-4 transition-all",
                activeSection === "token"
                  ? "border-border/30 opacity-40"
                  : activeSection === "login"
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 hover:border-border",
              )}
            >
              <p className="text-xs font-semibold text-foreground mb-3">
                {serviceKey === "jellyfin" ? "Login with credentials" : "Login with plex.tv"}
              </p>
              <SettingsFields
                fields={loginFields}
                values={loginValues}
                onChange={(key, value) => {
                  const next = { ...loginValues, [key]: value };
                  setLoginValues(next);
                  setDirty(true);
                  setActiveSection(Object.values(next).some((v) => v) ? "login" : null);
                }}
                showSecrets={showSecrets}
                onToggleSecret={(key) => setShowSecrets((p) => ({ ...p, [key]: !p[key] }))}
                disabled={activeSection === "token"}
              />
            </div>
          </div>

          {/* Save / Test */}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={!dirty || isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => testService.mutate({ service: serviceKey, values: { [urlField.key]: url, [apiKeyField.key]: apiKey } })}
              disabled={testService.isPending}
            >
              {testService.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Test
            </Button>
          </div>
          <ConnectionFeedback data={testService.data} />
          {authMutation.data && (
            <p className={cn("text-xs", authMutation.data.success ? "text-green-500" : "text-destructive")}>
              {authMutation.data.success
                ? `Connected to ${authMutation.data.serverName}${"user" in authMutation.data ? ` as ${authMutation.data.user}` : ""}. Credentials saved.`
                : authMutation.data.error}
            </p>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section card wrapper                                                       */
/* -------------------------------------------------------------------------- */

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1">
        {title}
      </p>
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TMDB Row                                                                   */
/* -------------------------------------------------------------------------- */

function TmdbSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const setSettings = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const [tmdbKey, setTmdbKey] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (allSettings?.["tmdb.apiKey"]) {
      setTmdbKey(allSettings["tmdb.apiKey"] as string);
      setDirty(false);
    }
  }, [allSettings]);

  if (isLoading) {
    return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;
  }

  return (
    <div className="px-5 py-5">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground">TMDB API Key</p>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Required</Badge>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
        Provides all movie and TV metadata.{" "}
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Get your free key
        </a>
      </p>
      <div className="mt-3 space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">API Key (v3 auth)</label>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            value={tmdbKey}
            placeholder="Enter your TMDB API key"
            onChange={(e) => { setTmdbKey(e.target.value); setDirty(true); }}
            className="h-9 text-sm"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowKey((p) => !p)}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="mt-4">
        <Button
          size="sm"
          onClick={() => setSettings.mutate({ "tmdb.apiKey": tmdbKey, "tmdb.enabled": true }, { onSuccess: () => setDirty(false) })}
          disabled={!dirty || setSettings.isPending}
        >
          {setSettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page sections                                                              */
/* -------------------------------------------------------------------------- */

function ServicesSection(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <SectionCard title="Metadata">
        <TmdbSection />
      </SectionCard>

      <SectionCard title="Media Servers">
        <MediaServerRow
          title="Jellyfin"
          description="Free software media system. Sync libraries and trigger scans after downloads."
          serviceKey="jellyfin"
          urlField={{ key: "jellyfin.url", label: "Server URL", placeholder: "http://192.168.1.100:8096" }}
          apiKeyField={{ key: "jellyfin.apiKey", label: "API Key", placeholder: "Your Jellyfin API key", secret: true }}
          loginFields={[
            { key: "username", label: "Username", placeholder: "admin" },
            { key: "password", label: "Password", placeholder: "Password", secret: true },
          ]}
        />
        <MediaServerRow
          title="Plex"
          description="Popular media server. Sync libraries and trigger scans after downloads."
          serviceKey="plex"
          urlField={{ key: "plex.url", label: "Server URL", placeholder: "http://192.168.1.100:32400" }}
          apiKeyField={{ key: "plex.token", label: "X-Plex-Token", placeholder: "Your Plex authentication token", secret: true }}
          loginFields={[
            { key: "email", label: "Email", placeholder: "your@email.com" },
            { key: "password", label: "Password", placeholder: "Password", secret: true },
          ]}
          isLast
        />
      </SectionCard>

      <SectionCard title="Download Client">
        <ServiceRow
          title="qBittorrent"
          description="Torrent client for downloading media. Manages torrents, organizes files, and triggers imports."
          serviceKey="qbittorrent"
          fields={[
            { key: "qbittorrent.url", label: "WebUI URL", placeholder: "http://localhost:8080" },
            { key: "qbittorrent.username", label: "Username", placeholder: "admin" },
            { key: "qbittorrent.password", label: "Password", placeholder: "Password", secret: true },
          ]}
          isLast
        />
      </SectionCard>

      <SectionCard title="Indexers">
        <ServiceRow
          title="Prowlarr"
          description="Indexer manager that aggregates torrent search across multiple trackers."
          serviceKey="prowlarr"
          fields={[
            { key: "prowlarr.url", label: "URL", placeholder: "http://localhost:9696" },
            { key: "prowlarr.apiKey", label: "API Key", placeholder: "Your Prowlarr API key", secret: true },
          ]}
        />
        <ServiceRow
          title="Jackett"
          description="Torznab-compatible indexer proxy. Alternative to Prowlarr for searching across torrent trackers."
          serviceKey="jackett"
          fields={[
            { key: "jackett.url", label: "URL", placeholder: "http://localhost:9117" },
            { key: "jackett.apiKey", label: "API Key", placeholder: "Your Jackett API key", secret: true },
          ]}
          isLast
        />
      </SectionCard>
    </div>
  );
}

function LibrariesSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: libraries, isLoading } = trpc.library.listLibraries.useQuery();

  const toggleLibrary = trpc.jellyfin.toggleLibrary.useMutation({
    onSuccess: () => { void utils.library.listLibraries.invalidate(); },
  });
  const setDefault = trpc.library.setDefault.useMutation({
    onSuccess: () => { void utils.library.listLibraries.invalidate(); },
  });
  const syncJellyfin = trpc.jellyfin.syncLibraries.useMutation({
    onSuccess: () => { void utils.library.listLibraries.invalidate(); },
  });
  const syncPlex = trpc.plex.syncLibraries.useMutation({
    onSuccess: () => { void utils.library.listLibraries.invalidate(); },
  });
  const { data: preferences } = trpc.library.getPreferences.useQuery(undefined, { retry: false });
  const setPreference = trpc.library.setPreference.useMutation({
    onSuccess: () => { void utils.library.getPreferences.invalidate(); },
  });
  const autoMergeVersions = (preferences as Record<string, unknown> | undefined)?.autoMergeVersions ?? true;
  const enabledLibraries = (libraries ?? []).filter((l) => l.enabled).length;
  const totalLibraries = (libraries ?? []).length;

  return (
    <div className="space-y-6">
      <SectionCard title="Libraries">
        {isLoading ? (
          <div className="px-5 py-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : libraries && libraries.length > 0 ? (
          <div className="px-5 py-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">
                {enabledLibraries}/{totalLibraries} enabled
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => syncJellyfin.mutate()} disabled={syncJellyfin.isPending}>
                  {syncJellyfin.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sync Jellyfin
                </Button>
                <Button size="sm" variant="outline" onClick={() => syncPlex.mutate()} disabled={syncPlex.isPending}>
                  {syncPlex.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sync Plex
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {libraries.map((lib) => (
                <div
                  key={lib.id}
                  className={cn(
                    "flex items-center gap-4 rounded-lg border p-4 transition-all",
                    !lib.enabled ? "border-border/40 opacity-50" : lib.isDefault ? "border-primary/30 bg-primary/5" : "border-border/60 hover:border-foreground/15",
                  )}
                >
                  <Switch checked={lib.enabled} onCheckedChange={(checked) => toggleLibrary.mutate({ id: lib.id, enabled: checked })} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{lib.name}</span>
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{LIBRARY_TYPE_LABELS[lib.type] ?? lib.type}</Badge>
                      {lib.isDefault && <Badge className="border-primary/20 bg-primary/10 px-1.5 py-0 text-[10px] text-primary">Default</Badge>}
                    </div>
                    {lib.mediaPath && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Folder className="h-3 w-3" />{lib.mediaPath}
                      </p>
                    )}
                  </div>
                  {lib.enabled && !lib.isDefault && (
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setDefault.mutate({ id: lib.id })}>Set default</Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">No libraries configured. Connect a media server first.</p>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Post-import">
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <p className="text-sm font-medium text-foreground">Auto-merge versions</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              When you download a second quality version, Jellyfin will automatically merge them.
            </p>
          </div>
          <Switch checked={autoMergeVersions === true} onCheckedChange={(checked) => setPreference.mutate({ key: "autoMergeVersions", value: checked })} />
        </div>
      </SectionCard>
    </div>
  );
}

function TmdbSettingsSection(): React.JSX.Element {
  const { region, setRegion } = useWatchRegion();
  const [saved, setSaved] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);
  const displayRegion = pendingRegion ?? region;

  const { data: regions, isLoading: regionsLoading } = trpc.provider.regions.useQuery();
  const { data: watchProviders, isLoading: providersLoading } =
    trpc.provider.watchProviders.useQuery({ type: "movie", region: displayRegion }, { enabled: !!displayRegion });

  const handleSaveRegion = (): void => {
    setRegion(pendingRegion ?? region);
    setPendingRegion(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const hasPendingChange = pendingRegion !== null && pendingRegion !== region;

  return (
    <SectionCard title="Watch Region">
      <div className="px-5 py-5">
        <p className="text-sm font-medium text-foreground">Streaming providers</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
          Determines which streaming providers appear on media pages.
        </p>

        <div className="mt-4 flex items-center gap-3">
          {regionsLoading ? <Skeleton className="h-9 w-[240px]" /> : (
            <Select value={displayRegion} onValueChange={(v) => setPendingRegion(v)}>
              <SelectTrigger className="h-9 w-[240px] text-sm"><SelectValue placeholder="Select region..." /></SelectTrigger>
              <SelectContent className="max-h-64">
                {regions?.sort((a, b) => a.englishName.localeCompare(b.englishName)).map((r) => (
                  <SelectItem key={r.code} value={r.code}>{r.englishName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={handleSaveRegion} disabled={!hasPendingChange && !saved}>
            {saved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>

        {displayRegion && (
          <div className="mt-6 border-t border-border/60 pt-5">
            <p className="mb-3 text-xs text-muted-foreground">Available streaming services</p>
            {providersLoading ? (
              <div className="flex flex-wrap gap-2.5">
                {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-11 w-11 rounded-lg" />)}
              </div>
            ) : watchProviders && watchProviders.length > 0 ? (
              <div className="flex flex-wrap gap-2.5">
                {watchProviders.slice(0, 30).map((p) => (
                  <img key={p.providerId} src={`${TMDB_IMAGE_BASE}/w92${p.logoPath}`} alt={p.providerName} title={p.providerName} className="h-11 w-11 rounded-lg border border-border/60 object-cover" />
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No providers found.</p>}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function PreferencesSection(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <SectionCard title="Appearance">
      <div className="px-5 py-5">
        <p className="text-sm font-medium text-foreground">Theme</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
          Choose a theme for the interface.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {themeOptions.map(({ value, label, description: desc, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-2.5 rounded-xl border p-4 transition-all",
                mounted && theme === value
                  ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/20"
                  : "border-border/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <div className="text-center">
                <span className="block text-xs font-medium">{label}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">{desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function AboutSection(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <SectionCard title="Application">
        <div className="px-5 py-5 space-y-2.5">
          {[["Version", "0.1.0"], ["Stack", "Next.js + tRPC + Drizzle"], ["Metadata", "TMDB + AniList"]].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-lg bg-muted/20 px-3.5 py-2.5 text-sm">
              <span className="text-muted-foreground text-xs">{label}</span>
              <span className="text-xs text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Links">
        <div className="divide-y divide-border/60">
          {[
            { href: "https://github.com/oguilhermelima/canto", name: "GitHub", desc: "Source code and issue tracker" },
            { href: "https://www.themoviedb.org/", name: "TMDB", desc: "Movie and TV show metadata" },
            { href: "https://jellyfin.org/", name: "Jellyfin", desc: "Free software media system" },
          ].map((link) => (
            <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-muted/20">
              <div>
                <p className="text-sm font-medium text-foreground">{link.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{link.desc}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground/50" />
            </a>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function SettingsPage(): React.JSX.Element {
  const [activeNav, setActiveNav] = useState<NavKey>("services");

  useEffect(() => { document.title = "Settings — Canto"; }, []);

  return (
    <div className="w-full">
      <PageHeader title="Settings" />

      {/* Sticky tab bar */}
      <div className="sticky top-14 z-20 border-b border-border/40 bg-background/80 backdrop-blur-md px-4 py-2.5 md:top-16 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar
          tabs={NAV_ITEMS.map((item) => ({ value: item.key, label: item.label }))}
          value={activeNav}
          onChange={(v) => setActiveNav(v as NavKey)}
        />
      </div>

      <div className="px-4 pt-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {activeNav === "services" && <ServicesSection />}
        {activeNav === "libraries" && <LibrariesSection />}
        {activeNav === "tmdb" && <TmdbSettingsSection />}
        {activeNav === "preferences" && <PreferencesSection />}
        {activeNav === "about" && <AboutSection />}
      </div>
    </div>
  );
}
