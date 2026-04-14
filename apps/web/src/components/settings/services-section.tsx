"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Skeleton } from "@canto/ui/skeleton";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Switch } from "@canto/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import {
  Save,
  Check,
  Loader2,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { useWatchRegion } from "~/hooks/use-watch-region";
import { useDirectSearch } from "~/hooks/use-direct-search";
import { SectionCard, SettingsSection } from "~/components/settings/shared";
import { FieldInput } from "~/components/settings/_primitives";
import {
  SETTINGS_REGISTRY
  
} from "@canto/db/settings-registry";
import type {SettingKey} from "@canto/db/settings-registry";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

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
/*  Shared                                                                     */
/* -------------------------------------------------------------------------- */

function _OrDivider(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border/40" />
      <span className="text-xs text-muted-foreground/40">or</span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

function formatConnectionError(error: string): string {
  if (/40[13]/.test(error)) return "Authentication failed. Check your API key/token.";
  if (/ECONNREFUSED/.test(error)) return "Could not connect. Check the URL and ensure the server is running.";
  if (/timeout/i.test(error) || /abort/i.test(error)) return "Connection timed out. Check the URL and network.";
  return error;
}

function showTestResult(data: { connected: boolean; error?: string; serverName?: string; version?: string } | undefined): void {
  if (!data) return;
  if (data.connected) {
    const msg = data.serverName
      ? `Connected to ${data.serverName}${data.version ? ` (v${data.version})` : ""}`
      : "Connection successful";
    toast.success(msg);
  } else {
    toast.error(formatConnectionError(data.error ?? "Connection failed"));
  }
}

/* -------------------------------------------------------------------------- */
/*  Brand config                                                               */
/* -------------------------------------------------------------------------- */

const BRAND_GRADIENT: Record<string, string> = {
  jellyfin: "from-[#a95ce0]/15 via-[#4bb8e8]/10 to-transparent",
  plex: "from-[#e5a00d]/15 via-[#e5a00d]/5 to-transparent",
  tmdb: "from-[#01b4e4]/15 via-[#90cea1]/10 to-transparent",
  tvdb: "from-[#6cd491]/15 via-[#6cd491]/5 to-transparent",
  qbittorrent: "from-[#4488cc]/15 via-[#4488cc]/5 to-transparent",
  prowlarr: "from-[#e77220]/15 via-[#e77220]/5 to-transparent",
  jackett: "from-[#c23c2a]/15 via-[#c23c2a]/5 to-transparent",
};

const BRAND_LOGO: Record<string, { type: "img"; src: string } | { type: "mask"; src: string; color: string } | null> = {
  jellyfin: null,
  plex: null,
  qbittorrent: { type: "mask", src: "/qbitorrent.svg", color: "#4488cc" },
  prowlarr: { type: "img", src: "/prowlarr.svg" },
  jackett: { type: "mask", src: "/jackett.svg", color: "#c23c2a" },
  tmdb: { type: "img", src: "/tmdb.svg" },
  tvdb: { type: "img", src: "/tvdb.svg" },
};

const SERVICE_INFO: Record<string, { subtitle?: string; link?: { label: string; href: string }; apiKeyHint?: string; apiKeyLink?: { label: string; href: string } }> = {
  jellyfin: { subtitle: "Free software media system. Sync libraries and trigger scans after downloads.", link: { label: "jellyfin.org", href: "https://jellyfin.org" } },
  plex: { subtitle: "Popular media server. Sync libraries and trigger scans after downloads.", link: { label: "plex.tv", href: "https://plex.tv" } },
  qbittorrent: { subtitle: "Torrent client for downloading media files.", link: { label: "qbittorrent.org", href: "https://www.qbittorrent.org" } },
  prowlarr: { subtitle: "Indexer manager for searching across torrent trackers.", link: { label: "prowlarr.com", href: "https://prowlarr.com" }, apiKeyHint: "Found in Prowlarr under Settings → General → API Key.", apiKeyLink: { label: "How to find your API key", href: "https://wiki.servarr.com/prowlarr/settings#security" } },
  jackett: { subtitle: "Torznab-compatible indexer proxy. Alternative to Prowlarr.", link: { label: "GitHub", href: "https://github.com/Jackett/Jackett" }, apiKeyHint: "Found in the Jackett dashboard at the top right corner.", apiKeyLink: { label: "How to find your API key", href: "https://github.com/Jackett/Jackett#api-key" } },
};

function BrandLogo({ serviceKey }: { serviceKey: string }): React.JSX.Element | null {
  const logo = BRAND_LOGO[serviceKey];
  if (!logo) return null;
  if (logo.type === "img") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo.src} alt="" className="h-5 w-5 shrink-0" />;
  }
  return (
    <span
      className="inline-block h-5 w-5 shrink-0"
      style={{
        background: logo.color,
        mask: `url(${logo.src}) center/contain no-repeat`,
        WebkitMask: `url(${logo.src}) center/contain no-repeat`,
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  ServiceRow (qBittorrent, Prowlarr, Jackett)                                */
/* -------------------------------------------------------------------------- */

function ServiceRow({
  title,
  serviceKey,
  fields,
  isLast,
}: {
  title: string;
  serviceKey: "jellyfin" | "plex" | "qbittorrent" | "prowlarr" | "jackett";
  fields?: Array<{ key: string; label: string; placeholder: string; secret?: boolean }>;
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

  const isEnabled = enabledServices?.[serviceKey] === true;
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (allSettings && fields) {
      const v: Record<string, string> = {};
      let hasValues = false;
      for (const f of fields) {
        v[f.key] = (allSettings[f.key] as string | undefined) ?? "";
        if (v[f.key]) hasValues = true;
      }
      setValues(v);
      setDirty(false);
      // Auto-expand if enabled but not yet configured
      if (isEnabled && !hasValues) setExpanded(true);
    }
  }, [allSettings, fields, isEnabled]);

  const handleToggle = (): void => {
    toggleService.mutate({ service: serviceKey, enabled: !isEnabled });
    // Auto-expand when enabling
    if (!isEnabled) setExpanded(true);
  };

  if (isLoading) return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;

  const info = SERVICE_INFO[serviceKey];

  return (
    <div className={cn(!isLast && "border-b border-border/30")}>
      {/* Header — click to expand/collapse */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((p) => !p); } }}
        className={cn("flex w-full items-center justify-between px-5 py-3.5 text-left cursor-pointer bg-gradient-to-r", BRAND_GRADIENT[serviceKey] ?? "")}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-300", expanded && "rotate-180")} />
          <BrandLogo serviceKey={serviceKey} />
          <p className="text-base font-semibold text-foreground">{title}</p>
          {isEnabled ? (
            <Badge variant="secondary" className="rounded-lg border-green-500/20 bg-green-500/10 px-2 py-0 text-xs text-green-500">Connected</Badge>
          ) : (
            <Badge variant="secondary" className="rounded-lg px-2 py-0 text-xs">Disconnected</Badge>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {isEnabled && dirty && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-xl text-xs"
                onClick={() => testService.mutate(
                  { service: serviceKey, values },
                  { onSuccess: (data) => showTestResult(data) },
                )}
                disabled={testService.isPending}
              >
                {testService.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                Test
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-xl text-xs"
                onClick={() =>
                  setMany.mutate({ settings: Object.entries(values).map(([key, value]) => ({ key, value })) }, {
                    onSuccess: () => { setDirty(false); toast.success("Settings saved"); },
                    onError: () => toast.error("Failed to save settings"),
                  })
                }
                disabled={setMany.isPending}
              >
                {setMany.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                Save
              </Button>
            </>
          )}
          <Switch
            checked={isEnabled}
            onCheckedChange={() => handleToggle()}
          />
        </div>
      </div>

      {/* Content — collapsible */}
      <AnimatedCollapse open={expanded}>
        <div className="px-5 py-5 space-y-4">
          {info?.subtitle && (
            <p className="text-sm text-muted-foreground">{info.subtitle}</p>
          )}
          {info?.link && (
            <a href={info.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />
              {info.link.label}
            </a>
          )}
          {fields && (
            <div className="space-y-4">
              {fields.map((f) => {
                const def = SETTINGS_REGISTRY[f.key as SettingKey];
                return (
                  <div key={f.key} className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">
                      {f.label}
                    </label>
                    <FieldInput
                      inputType={def.inputType}
                      value={values[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(next) => {
                        setValues((p) => ({
                          ...p,
                          [f.key]: typeof next === "string" ? next : "",
                        }));
                        setDirty(true);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {info?.apiKeyHint && (
            <p className="text-sm text-muted-foreground">
              {info.apiKeyHint}
              {info.apiKeyLink && (
                <>
                  {" "}
                  <a href={info.apiKeyLink.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {info.apiKeyLink.label}
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      </AnimatedCollapse>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  MediaServerRow (Jellyfin, Plex)                                            */
/* -------------------------------------------------------------------------- */

function MediaServerRow({
  title,
  serviceKey,
  urlField,
  apiKeyField,
  isLast,
}: {
  title: string;
  serviceKey: "jellyfin" | "plex";
  urlField: { key: string; label: string; placeholder: string };
  apiKeyField: { key: string; label: string; placeholder: string; secret?: boolean };
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

  const isEnabled = enabledServices?.[serviceKey] === true;
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (allSettings) {
      setUrl((allSettings[urlField.key] as string | undefined) ?? "");
      setApiKey((allSettings[apiKeyField.key] as string | undefined) ?? "");
      setDirty(false);
      if (isEnabled && !allSettings[urlField.key]) setExpanded(true);
    }
  }, [allSettings, urlField.key, apiKeyField.key, isEnabled]);

  const handleSave = (): void => {
    setMany.mutate(
      { settings: [{ key: urlField.key, value: url }, { key: apiKeyField.key, value: apiKey }] },
      { onSuccess: () => { setDirty(false); toast.success("Settings saved"); }, onError: () => toast.error("Failed to save settings") },
    );
  };

  const handleToggle = (): void => {
    toggleService.mutate({ service: serviceKey, enabled: !isEnabled });
    if (!isEnabled) setExpanded(true);
  };

  if (isLoading) return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;

  const isJellyfin = serviceKey === "jellyfin";
  const brandGradient = isJellyfin ? BRAND_GRADIENT.jellyfin : BRAND_GRADIENT.plex;
  const logoStyle = isJellyfin
    ? { background: "linear-gradient(135deg, #a95ce0, #4bb8e8)", mask: "url(/jellyfin-logo.svg) center/contain no-repeat", WebkitMask: "url(/jellyfin-logo.svg) center/contain no-repeat" }
    : { background: "#e5a00d", mask: "url(/plex-logo.svg) center/contain no-repeat", WebkitMask: "url(/plex-logo.svg) center/contain no-repeat" };
  const info = SERVICE_INFO[serviceKey];

  return (
    <div className={cn(!isLast && "border-b border-border/30")}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((p) => !p); } }}
        className={cn("flex w-full items-center justify-between px-5 py-3.5 text-left cursor-pointer bg-gradient-to-r", brandGradient)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-300", expanded && "rotate-180")} />
          <span className="inline-block h-5 w-5 shrink-0" style={logoStyle} />
          <p className="text-base font-semibold text-foreground">{title}</p>
          {isEnabled ? (
            <Badge variant="secondary" className="rounded-lg border-green-500/20 bg-green-500/10 px-2 py-0 text-xs text-green-500">Active</Badge>
          ) : (
            <Badge variant="secondary" className="rounded-lg px-2 py-0 text-xs">Inactive</Badge>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {isEnabled && dirty && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-xl text-xs"
                onClick={() => testService.mutate(
                  { service: serviceKey, values: { [urlField.key]: url, [apiKeyField.key]: apiKey } },
                  { onSuccess: (data) => showTestResult(data) },
                )}
                disabled={testService.isPending}
              >
                {testService.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                Test
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-xl text-xs"
                onClick={handleSave}
                disabled={setMany.isPending}
              >
                {setMany.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                Save
              </Button>
            </>
          )}
          <Switch checked={isEnabled} onCheckedChange={() => handleToggle()} />
        </div>
      </div>

      <AnimatedCollapse open={expanded}>
        <div className="px-5 py-5 space-y-5">
          {info?.subtitle && (
            <p className="text-sm text-muted-foreground">{info.subtitle}</p>
          )}
          {info?.link && (
            <a href={info.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />
              {info.link.label}
            </a>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{urlField.label}</label>
              <FieldInput
                inputType="url"
                value={url}
                onChange={(v) => {
                  setUrl(typeof v === "string" ? v : "");
                  setDirty(true);
                }}
                placeholder={urlField.placeholder}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{apiKeyField.label}</label>
              <FieldInput
                inputType={apiKeyField.secret ? "password" : "text"}
                value={apiKey}
                onChange={(v) => {
                  setApiKey(typeof v === "string" ? v : "");
                  setDirty(true);
                }}
                placeholder={apiKeyField.placeholder}
              />
              <p className="px-1 text-xs text-muted-foreground">
                {isJellyfin
                  ? "System-wide API Key for background tasks and metadata."
                  : "System-wide X-Plex-Token for background tasks and metadata."}
              </p>
            </div>
          </div>
        </div>
      </AnimatedCollapse>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Plex OAuth                                                                 */
/* -------------------------------------------------------------------------- */

function PlexOAuthSection({ serverUrl, disabled, onSuccess, isConnected }: { serverUrl: string; disabled: boolean; onSuccess: () => void; isConnected: boolean }): React.JSX.Element {
  const [polling, setPolling] = useState(false);
  const [pinData, setPinData] = useState<{ pinId: number; clientId: string } | null>(null);
  const createPin = trpc.settings.plexPinCreate.useMutation();

  const pinCheck = trpc.settings.plexPinCheck.useQuery(
    { pinId: pinData?.pinId ?? 0, clientId: pinData?.clientId ?? "", serverUrl: serverUrl || undefined },
    { enabled: polling && pinData !== null, refetchInterval: 2000 },
  );

  useEffect(() => {
    if (pinCheck.data?.authenticated) {
      setPolling(false); setPinData(null);
      toast.success(pinCheck.data.serverName ? `Connected to ${pinCheck.data.serverName}${pinCheck.data.username ? ` as ${pinCheck.data.username}` : ""}` : `Signed in${pinCheck.data.username ? ` as ${pinCheck.data.username}` : ""}`);
      onSuccess();
    }
    if (pinCheck.data?.expired) { setPolling(false); setPinData(null); toast.error("Authentication expired. Please try again."); }
  }, [pinCheck.data, onSuccess]);

  const handleSignIn = (): void => {
    createPin.mutate(undefined, {
      onSuccess: (data) => {
        setPinData({ pinId: data.pinId, clientId: data.clientId });
        setPolling(true);
        const w = 600, h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(`https://app.plex.tv/auth#?clientID=${data.clientId}&code=${data.pinCode}&context%5Bdevice%5D%5Bproduct%5D=Canto`, "plex-auth", `width=${w},height=${h},left=${left},top=${top}`);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className={cn("rounded-xl border bg-card p-4 transition-all", disabled ? "border-border/30 opacity-40" : "border-border/60 hover:border-border/80")}>
      <p className="mb-2 text-sm font-medium text-foreground">{isConnected ? "Plex account" : "Sign in with Plex"}</p>
      <p className="mb-3 text-sm text-muted-foreground">
        {isConnected
          ? "Your Plex account is connected. Re-authenticate if your token has expired."
          : "Opens a popup where you sign in with your Plex account. Works with Google, Apple, and email."}
      </p>
      <Button size="sm" variant="outline" className="gap-2 rounded-xl" onClick={handleSignIn} disabled={disabled || polling || createPin.isPending}>
        {polling ? (<><Loader2 className="h-4 w-4 animate-spin" />Waiting for Plex...</>) : createPin.isPending ? (<><Loader2 className="h-4 w-4 animate-spin" />Creating PIN...</>) : (
          <><span className="inline-block h-4 w-4 shrink-0 bg-[#e5a00d]" style={{ mask: "url(/plex-logo.svg) center/contain no-repeat", WebkitMask: "url(/plex-logo.svg) center/contain no-repeat" }} />{isConnected ? "Re-authenticate" : "Sign in with Plex"}</>
        )}
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TMDB                                                                       */
/* -------------------------------------------------------------------------- */

function TmdbSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });

  const [tmdbKey, setTmdbKey] = useState("");
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (allSettings?.["tmdb.apiKey"]) {
      setTmdbKey(allSettings["tmdb.apiKey"] as string);
      setDirty(false);
    } else if (allSettings) {
      // Auto-expand when no key is configured
      setExpanded(true);
    }
  }, [allSettings]);

  if (isLoading) return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;

  const hasKey = !!allSettings?.["tmdb.apiKey"];

  const handleSave = (): void => {
    // Atomic save: persist the key AND flip enabled=true in a single write so
    // the admin never ends up with a saved key that isn't active yet.
    setMany.mutate(
      {
        settings: [
          { key: "tmdb.apiKey", value: tmdbKey },
          { key: "tmdb.enabled", value: true },
        ],
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Saved");
        },
        onError: () => toast.error("Failed to save"),
      },
    );
  };

  return (
    <div>
      {/* Header — click to expand/collapse */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((p) => !p); } }}
        className={cn("flex items-center justify-between px-5 py-3.5 cursor-pointer bg-gradient-to-r", BRAND_GRADIENT.tmdb)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-300", expanded && "rotate-180")} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tmdb.svg" alt="" className="h-5 w-5 shrink-0" />
          <p className="text-base font-semibold text-foreground">TMDB</p>
          <Badge variant="secondary" className="rounded-lg px-2 py-0 text-xs">Required</Badge>
          {hasKey && (
            <Badge variant="secondary" className="rounded-lg border-green-500/20 bg-green-500/10 px-2 py-0 text-xs text-green-500">Connected</Badge>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {dirty && (
            <Button
              size="sm"
              className="h-8 rounded-xl text-xs"
              onClick={handleSave}
              disabled={setMany.isPending}
            >
              {setMany.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Content — collapsible */}
      <AnimatedCollapse open={expanded}>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">Provides all movie and TV metadata.</p>
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" />
            Get your free API key
          </a>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">API Key (v3 auth)</label>
            <FieldInput
              inputType="password"
              value={tmdbKey}
              onChange={(v) => {
                setTmdbKey(typeof v === "string" ? v : "");
                setDirty(true);
              }}
              placeholder="Enter your TMDB API key"
            />
          </div>
        </div>
      </AnimatedCollapse>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TVDB API Key                                                               */
/* -------------------------------------------------------------------------- */

function TvdbApiKeySection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const testService = trpc.settings.testService.useMutation();

  const [apiKey, setApiKey] = useState("");
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (allSettings) {
      setApiKey((allSettings["tvdb.apiKey"] as string | undefined) ?? "");
      setDirty(false);
      if (!allSettings["tvdb.apiKey"]) setExpanded(true);
    }
  }, [allSettings]);

  if (isLoading) return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;

  const isPending = testService.isPending || setMany.isPending;
  const hasKey = !!allSettings?.["tvdb.apiKey"];

  const handleSave = (): void => {
    // Atomic flow: test the key first; only persist (and flip enabled=true)
    // on a successful connection. Keeps the admin from landing broken creds.
    testService.mutate(
      { service: "tvdb", values: { "tvdb.apiKey": apiKey } },
      {
        onSuccess: (data) => {
          if (!data.connected) {
            toast.error(data.error);
            return;
          }
          setMany.mutate(
            {
              settings: [
                { key: "tvdb.apiKey", value: apiKey },
                { key: "tvdb.enabled", value: true },
              ],
            },
            {
              onSuccess: () => {
                setDirty(false);
                toast.success("TVDB connected and saved");
              },
              onError: () => toast.error("Failed to save settings"),
            },
          );
        },
        onError: () => toast.error("Connection test failed"),
      },
    );
  };

  return (
    <div>
      {/* Header — click to expand/collapse */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((p) => !p); } }}
        className={cn("flex items-center justify-between px-5 py-3.5 cursor-pointer bg-gradient-to-r", BRAND_GRADIENT.tvdb)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-300", expanded && "rotate-180")} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tvdb.svg" alt="" className="h-5 w-5 shrink-0" />
          <p className="text-base font-semibold text-foreground">TVDB</p>
          <Badge variant="secondary" className="rounded-lg px-2 py-0 text-xs">Optional</Badge>
          {hasKey && (
            <Badge variant="secondary" className="rounded-lg border-green-500/20 bg-green-500/10 px-2 py-0 text-xs text-green-500">Connected</Badge>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {dirty && (
            <Button
              size="sm"
              className="h-8 rounded-xl text-xs"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Save & Test
            </Button>
          )}
        </div>
      </div>

      {/* Content — collapsible */}
      <AnimatedCollapse open={expanded}>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">Better TV show seasons and anime episode numbering.</p>
          <a href="https://thetvdb.com/api-information" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" />
            Get your free API key
          </a>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">API Key</label>
            <FieldInput
              inputType="password"
              value={apiKey}
              onChange={(v) => {
                setApiKey(typeof v === "string" ? v : "");
                setDirty(true);
              }}
              placeholder="Enter your TVDB API key"
            />
          </div>
        </div>
      </AnimatedCollapse>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Watch Region & Direct Search                                               */
/* -------------------------------------------------------------------------- */

function WatchRegionSection(): React.JSX.Element {
  const { region, setRegion } = useWatchRegion();
  const [saved, setSaved] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);
  const displayRegion = pendingRegion ?? region;

  const { data: regionsRaw, isLoading: regionsLoading } = trpc.provider.filterOptions.useQuery({ type: "regions" });
  const regions = regionsRaw as Array<{ code: string; englishName: string; nativeName: string }> | undefined;
  const { data: wpRaw, isLoading: providersLoading } =
    trpc.provider.filterOptions.useQuery({ type: "watchProviders", mediaType: "movie", region: displayRegion }, { enabled: !!displayRegion });
  const watchProviders = wpRaw as Array<{ providerId: number; providerName: string; logoPath: string; displayPriority: number }> | undefined;

  const handleSaveRegion = (): void => {
    setRegion(pendingRegion ?? region);
    setPendingRegion(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const hasPendingChange = pendingRegion !== null && pendingRegion !== region;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground mb-1">Watch Region</p>
          <p className="text-xs text-muted-foreground mb-3">Determines which streaming providers appear on media pages.</p>
        </div>
        <div className="flex items-center gap-3">
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
          <Button size="sm" className="rounded-xl" onClick={handleSaveRegion} disabled={!hasPendingChange && !saved}>
            {saved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>

        {displayRegion && (
          <div>
            <p className="mb-3 text-xs text-muted-foreground">Available streaming services</p>
            {providersLoading ? (
              <div className="flex flex-wrap gap-2.5">
                {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-11 w-11 rounded-xl" />)}
              </div>
            ) : watchProviders && watchProviders.length > 0 ? (
              <div className="flex flex-wrap gap-2.5">
                {watchProviders.slice(0, 30).map((p) => (
                  <Image key={p.providerId} src={`${TMDB_IMAGE_BASE}/w92${p.logoPath}`} alt={p.providerName} title={p.providerName} width={44} height={44} className="h-11 w-11 rounded-xl border border-border/60 object-cover" />
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No providers found.</p>}
          </div>
        )}
      </div>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ServicesSection                                                             */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  TVDB Default Toggle (used in Services tab)                                 */
/* -------------------------------------------------------------------------- */

function TvdbDefaultToggle(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings } = trpc.settings.getAll.useQuery();
  const toggleTvdb = trpc.settings.toggleTvdbDefault.useMutation({
    onSuccess: (data, variables) => {
      void utils.settings.getAll.invalidate();
      toast.success(
        variables.enabled
          ? `TVDB enabled — reprocessing ${data.reprocessing} shows`
          : `TVDB disabled — reprocessing ${data.reprocessing} shows with TMDB`,
      );
    },
    onError: () => toast.error("Failed to update preference"),
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const isConnected = allSettings?.["tvdb.enabled"] === true;
  const defaultShows = allSettings?.["tvdb.defaultShows"] === true;

  const handleSwitchClick = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    toggleTvdb.mutate({ enabled: !defaultShows });
    setConfirmOpen(false);
  }, [defaultShows, toggleTvdb]);

  return (
    <>
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            When enabled, Canto uses <strong className="text-foreground">TVDB</strong> to validate and correct the
            <strong className="text-foreground"> season and episode organization</strong> of TV shows and anime.
            All other metadata (titles, images, ratings, translations) stays from TMDB.
          </p>

          <p className="font-medium text-foreground">What changes with TVDB enabled:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-foreground">Accurate season splits</strong> for anime and multi-season shows</li>
            <li><strong className="text-foreground">Absolute episode numbering</strong> for anime</li>
            <li><strong className="text-foreground">Correct episode counts</strong> (specials separated)</li>
          </ul>

          {!isConnected && (
            <p className="mt-2 rounded-xl bg-yellow-500/10 px-3 py-2 text-yellow-500">
              Connect your TVDB API key above before enabling this.
            </p>
          )}
        </div>
        <Switch checked={defaultShows} onCheckedChange={handleSwitchClick} disabled={!isConnected || toggleTvdb.isPending} className="mt-1 shrink-0" />
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {defaultShows ? "Disable TVDB episode structure?" : "Enable TVDB for episode structure?"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                {defaultShows ? (
                  <p>
                    This will revert all TV shows to use TMDB's default season/episode structure. Shows that were
                    corrected by TVDB will be reprocessed with TMDB data.
                  </p>
                ) : (
                  <>
                    <p>
                      This will use TVDB to validate and correct season/episode numbering for all TV shows and anime in
                      your library. Changes include:
                    </p>
                    <ul className="list-disc pl-5 space-y-1.5">
                      <li><strong className="text-foreground">Accurate season splits</strong> for anime and multi-season shows</li>
                      <li><strong className="text-foreground">Absolute episode numbering</strong> for anime</li>
                      <li><strong className="text-foreground">Correct episode counts</strong> (specials separated)</li>
                    </ul>
                  </>
                )}
                <p>All existing shows in your library will be reprocessed. This may take a few minutes.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-xl" onClick={handleConfirm} disabled={toggleTvdb.isPending}>
              {toggleTvdb.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {defaultShows ? "Disable & reprocess" : "Enable & reprocess"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  MetadataProvidersSection (Services tab)                                    */
/* -------------------------------------------------------------------------- */

export function MetadataProvidersSection(): React.JSX.Element {
  return (
    <div>
      <SettingsSection variant="grid" title="Metadata Providers" description="Configure your metadata provider API keys.">
        <SectionCard title="TMDB">
          <TmdbSection />
        </SectionCard>
        <SectionCard title="TVDB">
          <TvdbApiKeySection />
        </SectionCard>
      </SettingsSection>

      <SettingsSection variant="grid" title="Use TVDB for season/episode structure" description="Validate and fix the season and episode structure using TVDB data.">
        <TvdbDefaultToggle />
      </SettingsSection>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DownloadClientSection (Downloads tab)                                      */
/* -------------------------------------------------------------------------- */

export function DownloadClientSection(): React.JSX.Element {
  return (
    <SettingsSection variant="grid" title="Download Client" description="Torrent client for downloading and managing media files.">
      <SectionCard title="qBittorrent">
        <ServiceRow
          title="qBittorrent"
          serviceKey="qbittorrent"
          fields={[
            { key: "qbittorrent.url", label: "WebUI URL", placeholder: "http://localhost:8080" },
            { key: "qbittorrent.username", label: "Username", placeholder: "admin" },
            { key: "qbittorrent.password", label: "Password", placeholder: "Password", secret: true },
          ]}
          isLast
        />
      </SectionCard>
    </SettingsSection>
  );
}

/* -------------------------------------------------------------------------- */
/*  IndexersSection (Search tab)                                               */
/* -------------------------------------------------------------------------- */

export function IndexersSection(): React.JSX.Element {
  return (
    <SettingsSection variant="grid" title="Indexers" description="Search aggregators for finding torrents across multiple trackers.">
      <SectionCard title="Prowlarr">
        <ServiceRow
          title="Prowlarr"
          serviceKey="prowlarr"
          fields={[
            { key: "prowlarr.url", label: "URL", placeholder: "http://localhost:9696" },
            { key: "prowlarr.apiKey", label: "API Key", placeholder: "Your Prowlarr API key", secret: true },
          ]}
          isLast
        />
      </SectionCard>
      <SectionCard title="Jackett">
        <ServiceRow
          title="Jackett"
          serviceKey="jackett"
          fields={[
            { key: "jackett.url", label: "URL", placeholder: "http://localhost:9117" },
            { key: "jackett.apiKey", label: "API Key", placeholder: "Your Jackett API key", secret: true },
          ]}
          isLast
        />
      </SectionCard>
    </SettingsSection>
  );
}

/* Keep backward-compatible alias */
export function ServicesSection(): React.JSX.Element {
  return <MetadataProvidersSection />;
}

/* -------------------------------------------------------------------------- */
/*  Media Server Connection (separate tab)                                     */
/* -------------------------------------------------------------------------- */

export function MediaServerConnectionSection(): React.JSX.Element {
  return (
    <SettingsSection variant="grid" title="Connection" description="Connect media servers to sync libraries and trigger scans after downloads.">
      <SectionCard title="Jellyfin">
        <MediaServerRow
          title="Jellyfin"
          serviceKey="jellyfin"
          urlField={{ key: "jellyfin.url", label: "Server URL", placeholder: "http://192.168.1.100:8096" }}
          apiKeyField={{ key: "jellyfin.apiKey", label: "System API Key", placeholder: "Your Jellyfin API key (for background tasks)", secret: true }}
          isLast
        />
        <p className="px-5 pb-4 pt-3 text-xs text-muted-foreground">
          Users connect their personal Jellyfin accounts in <strong>Account → Media Server Connections</strong>.
        </p>
      </SectionCard>
      <SectionCard title="Plex">
        <PlexServerSection />
        <p className="px-5 pb-4 pt-3 text-xs text-muted-foreground">
          Users connect their personal Plex accounts in <strong>Account → Media Server Connections</strong>.
        </p>
      </SectionCard>
    </SettingsSection>
  );
}

export function JellyfinConnectionSection(): React.JSX.Element {
  return (
    <SettingsSection variant="grid" title="Connection" description="Connect Jellyfin to sync libraries and trigger scans after downloads.">
      <SectionCard title="Jellyfin">
        <MediaServerRow
          title="Jellyfin"
          serviceKey="jellyfin"
          urlField={{ key: "jellyfin.url", label: "Server URL", placeholder: "http://192.168.1.100:8096" }}
          apiKeyField={{ key: "jellyfin.apiKey", label: "System API Key", placeholder: "Your Jellyfin API key (for background tasks)", secret: true }}
          isLast
        />
        <p className="px-5 pb-4 pt-3 text-xs text-muted-foreground">
          Users connect their personal Jellyfin accounts in <strong>Account → Media Server Connections</strong>.
        </p>
      </SectionCard>
    </SettingsSection>
  );
}

export function PlexConnectionSection(): React.JSX.Element {
  return (
    <SettingsSection variant="grid" title="Connection" description="Connect Plex to sync libraries and trigger scans after downloads.">
      <SectionCard title="Plex">
        <PlexServerSection />
      </SectionCard>
    </SettingsSection>
  );
}

function PlexServerSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings, isLoading } = trpc.settings.getAll.useQuery();
  const { data: enabledServices } = trpc.settings.getEnabledServices.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const toggleService = trpc.settings.toggleService.useMutation({
    onSuccess: () => void utils.settings.getEnabledServices.invalidate(),
  });

  const isEnabled = enabledServices?.plex === true;
  const isConnected = !!allSettings?.["plex.token"];
  const [url, setUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (allSettings) {
      setUrl((allSettings["plex.url"] as string | undefined) ?? "");
      setDirty(false);
      if (isEnabled && !allSettings["plex.url"]) setExpanded(true);
    }
  }, [allSettings, isEnabled]);

  const handleToggle = (): void => {
    toggleService.mutate({ service: "plex", enabled: !isEnabled });
    if (!isEnabled) setExpanded(true);
  };

  const handleSave = (): void => {
    setMany.mutate(
      { settings: [{ key: "plex.url", value: url }] },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Settings saved");
        },
        onError: () => toast.error("Failed to save settings"),
      },
    );
  };

  if (isLoading) return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;

  const info = SERVICE_INFO.plex;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((p) => !p)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((p) => !p); } }}
        className={cn("flex w-full items-center justify-between px-5 py-3.5 text-left cursor-pointer bg-gradient-to-r", BRAND_GRADIENT.plex)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-300", expanded && "rotate-180")} />
          <span className="inline-block h-5 w-5 shrink-0 bg-[#e5a00d]" style={{ mask: "url(/plex-logo.svg) center/contain no-repeat", WebkitMask: "url(/plex-logo.svg) center/contain no-repeat" }} />
          <p className="text-base font-semibold text-foreground">Plex</p>
          {isEnabled ? (
            <Badge variant="secondary" className="rounded-lg border-green-500/20 bg-green-500/10 px-2 py-0 text-xs text-green-500">Active</Badge>
          ) : (
            <Badge variant="secondary" className="rounded-lg px-2 py-0 text-xs">Inactive</Badge>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {isEnabled && dirty && (
            <Button
              size="sm"
              className="h-8 rounded-xl text-xs"
              onClick={handleSave}
              disabled={setMany.isPending}
            >
              {setMany.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Save
            </Button>
          )}
          <Switch checked={isEnabled} onCheckedChange={() => handleToggle()} />
        </div>
      </div>

      <AnimatedCollapse open={expanded}>
        <div className="px-5 py-5 space-y-5">
          {info?.subtitle && <p className="text-sm text-muted-foreground">{info.subtitle}</p>}
          {info?.link && (
            <a href={info.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />
              {info.link.label}
            </a>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Server URL</label>
            <FieldInput
              inputType="url"
              value={url}
              onChange={(v) => {
                setUrl(typeof v === "string" ? v : "");
                setDirty(true);
              }}
              placeholder="http://192.168.1.100:32400"
            />
          </div>
          <PlexOAuthSection
            serverUrl={url}
            disabled={!isEnabled || !url}
            onSuccess={() => void utils.settings.getAll.invalidate()}
            isConnected={isConnected}
          />
        </div>
      </AnimatedCollapse>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Metadata Settings (separate tab)                                          */
/* -------------------------------------------------------------------------- */

export function MetadataSettingsSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings } = trpc.settings.getAll.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });
  const { enabled: directSearchEnabled, setEnabled: setDirectSearch } = useDirectSearch();

  const { data: currentLanguage } = trpc.settings.getUserLanguage.useQuery();
  const { data: supportedLanguages } = trpc.settings.getSupportedLanguages.useQuery();
  const setUserLanguage = trpc.settings.setUserLanguage.useMutation({
    onSuccess: () => void utils.settings.getUserLanguage.invalidate(),
  });
  const refreshLanguage = trpc.settings.refreshLanguage.useMutation();
  const isConnected = !!allSettings?.["tvdb.token"];
  const defaultShows = allSettings?.["tvdb.defaultShows"] === true;

  const handleLanguageChange = (value: string): void => {
    setUserLanguage.mutate(
      { language: value },
      {
        onSuccess: () => {
          // Also update global setting for pool items / browse
          setMany.mutate({ settings: [{ key: "general.language", value }] });
          toast.success("Language updated. Refreshing all metadata in background...");
          refreshLanguage.mutate();
        },
        onError: () => toast.error("Failed to update language"),
      },
    );
  };

  const handleToggleDefault = (checked: boolean): void => {
    setMany.mutate(
      { settings: [{ key: "tvdb.defaultShows", value: checked }] },
      {
        onSuccess: () => toast.success(checked ? "TVDB set as default for TV shows" : "TMDB restored as default"),
        onError: () => toast.error("Failed to update preference"),
      },
    );
  };

  return (
    <div>
      <SettingsSection variant="grid" title="Language" description="Language used for metadata, titles, descriptions, and trailers from TMDB and TVDB.">
        <div className="flex items-center gap-4">
          <Select value={currentLanguage ?? "en-US"} onValueChange={handleLanguageChange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(supportedLanguages ?? []).map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Changes apply to new metadata fetches. Existing items update on next refresh.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection variant="grid" title="Use TVDB for season/episode structure" description="Validate and fix the season and episode structure using TVDB data.">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                When enabled, Canto uses <strong className="text-foreground">TVDB</strong> to validate and correct the
                <strong className="text-foreground"> season and episode organization</strong> of TV shows and anime.
                All other metadata (titles, images, ratings, translations) stays from TMDB.
              </p>

              <p className="font-medium text-foreground">What changes with TVDB enabled:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong className="text-foreground">Accurate season splits</strong> for anime and multi-season shows
                </li>
                <li>
                  <strong className="text-foreground">Absolute episode numbering</strong> for anime
                </li>
                <li>
                  <strong className="text-foreground">Correct episode counts</strong> (specials separated)
                </li>
              </ul>

              <p className="font-medium text-foreground">What stays the same:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>All titles, overviews, and translations (from TMDB)</li>
                <li>Posters, logos, and backdrops (from TMDB)</li>
                <li>Ratings, popularity, and recommendations</li>
                <li>Trailers and videos</li>
              </ul>

              {!isConnected && (
                <p className="mt-2 rounded-xl bg-yellow-500/10 px-3 py-2 text-yellow-500">
                  You need to connect your TVDB API key in the Services tab before enabling this.
                </p>
              )}
            </div>
            <Switch checked={defaultShows} onCheckedChange={handleToggleDefault} disabled={!isConnected} className="mt-1 shrink-0" />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection variant="grid" title="Direct Search on Streaming Apps" description="Controls what happens when you click a streaming provider on a media page.">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                On every media detail page, the <strong className="text-foreground">Where to Watch</strong> section
                shows logos of streaming services where the title is available (Netflix, Disney+, HBO Max, etc.).
              </p>

              <p className="font-medium text-foreground">When enabled:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  Clicking a provider logo opens a <strong className="text-foreground">direct search</strong> on
                  that streaming service&apos;s website — e.g. clicking the Netflix logo
                  opens <code className="rounded bg-muted px-1 text-xs">netflix.com/search?q=Title</code>.
                </li>
                <li>This lets you jump straight to the content on the app you subscribe to.</li>
              </ul>

              <p className="font-medium text-foreground">When disabled:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  Clicking a provider logo opens the <strong className="text-foreground">TMDB watch page</strong> instead,
                  which shows all available providers and links for that title across regions.
                </li>
              </ul>

              <p className="text-sm text-muted-foreground/70">
                <strong className="text-muted-foreground">Note:</strong> Not all streaming providers support direct search.
                Only providers with a known search URL (such as Netflix, Disney+, Amazon Prime, HBO Max, and Crunchyroll)
                will open a direct search. Other providers will fall back to the TMDB watch page regardless of this setting.
                The list of supported providers is updated automatically.
              </p>
            </div>
            <Switch checked={directSearchEnabled} onCheckedChange={setDirectSearch} className="mt-1 shrink-0" />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection variant="grid" title="Watch Region" description="Controls which streaming providers appear on media detail pages.">
        <WatchRegionSection />
      </SettingsSection>
    </div>
  );
}
