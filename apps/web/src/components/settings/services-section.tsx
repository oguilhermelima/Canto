"use client";

import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@canto/ui/skeleton";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Switch } from "@canto/ui/switch";
import { Input } from "@canto/ui/input";
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
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { useWatchRegion } from "~/hooks/use-watch-region";
import { useDirectSearch } from "~/hooks/use-direct-search";
import { SectionCard, SettingsSection } from "~/components/settings/shared";

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
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <label className={cn("text-sm font-medium", disabled ? "text-muted-foreground/40" : "text-muted-foreground")}>{f.label}</label>
          <div className="relative">
            <Input
              type={f.secret && !showSecrets[f.key] ? "password" : "text"}
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange(f.key, e.target.value)}
              disabled={disabled}
              className="h-10 rounded-lg border-none bg-muted/50 text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
            />
            {f.secret && !disabled && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
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

function OrDivider(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border/40" />
      <span className="text-xs text-muted-foreground/40">or</span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

function showTestResult(data: { connected: boolean; error?: string; serverName?: string; version?: string } | undefined): void {
  if (!data) return;
  if (data.connected) {
    const msg = data.serverName
      ? `Connected to ${data.serverName}${data.version ? ` (v${data.version})` : ""}`
      : "Connection successful";
    toast.success(msg);
  } else {
    toast.error(data.error ?? "Connection failed");
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

  const handleToggle = (): void => {
    toggleService.mutate({ service: serviceKey, enabled: !isEnabled });
  };

  if (isLoading) return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;

  const info = SERVICE_INFO[serviceKey];

  return (
    <div className={cn(!isLast && "border-b border-border/30")}>
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); } }}
        className={cn("flex w-full items-center justify-between px-5 py-3.5 text-left cursor-pointer bg-gradient-to-r", BRAND_GRADIENT[serviceKey] ?? "")}
      >
        <div>
          <div className="flex items-center gap-2.5">
            <BrandLogo serviceKey={serviceKey} />
            <p className="text-base font-semibold text-foreground">{title}</p>
            {testService.data?.connected && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
          </div>
          {info?.subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{info.subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {isEnabled && dirty && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => testService.mutate(
                  { service: serviceKey, values },
                  { onSuccess: (data) => showTestResult(data) },
                )}
                disabled={testService.isPending}
              >
                {testService.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                Test
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setMany.mutate(values, {
                    onSuccess: () => { setDirty(false); toast.success("Settings saved"); },
                    onError: () => toast.error("Failed to save settings"),
                  })
                }
                disabled={setMany.isPending}
              >
                {setMany.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
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

      {/* Content */}
      <AnimatedCollapse open={isEnabled}>
        <div className="px-5 py-5 space-y-4">
          {info?.link && (
            <a href={info.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />
              {info.link.label}
            </a>
          )}
          {fields && (
            <SettingsFields
              fields={fields}
              values={values}
              onChange={(key, value) => { setValues((p) => ({ ...p, [key]: value })); setDirty(true); }}
              showSecrets={showSecrets}
              onToggleSecret={(key) => setShowSecrets((p) => ({ ...p, [key]: !p[key] }))}
            />
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
  loginFields,
  isLast,
}: {
  title: string;
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
      const onAuthSuccess = (data: { success: boolean; serverName?: string; user?: string; error?: string }): void => {
        if (data.success) {
          toast.success(data.serverName ? `Connected to ${data.serverName}${data.user ? ` as ${data.user}` : ""}` : "Credentials saved");
          setDirty(false);
        } else {
          toast.error(data.error ?? "Authentication failed");
        }
      };
      if (serviceKey === "jellyfin") {
        authJellyfin.mutate({ url, username: loginValues.username ?? "", password: loginValues.password ?? "" }, { onSuccess: onAuthSuccess });
      } else {
        loginPlex.mutate({ url, email: loginValues.email ?? "", password: loginValues.password ?? "" }, { onSuccess: onAuthSuccess });
      }
    } else {
      setMany.mutate(
        { [urlField.key]: url, [apiKeyField.key]: apiKey },
        { onSuccess: () => { setDirty(false); setActiveSection(null); toast.success("Settings saved"); }, onError: () => toast.error("Failed to save settings") },
      );
    }
  };

  const handleToggle = (): void => { toggleService.mutate({ service: serviceKey, enabled: !isEnabled }); };

  if (isLoading) return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;

  const isJellyfin = serviceKey === "jellyfin";
  const brandGradient = isJellyfin ? BRAND_GRADIENT.jellyfin : BRAND_GRADIENT.plex;
  const logoStyle = isJellyfin
    ? { background: "linear-gradient(135deg, #a95ce0, #4bb8e8)", mask: "url(/jellyfin-logo.svg) center/contain no-repeat", WebkitMask: "url(/jellyfin-logo.svg) center/contain no-repeat" }
    : { background: "#e5a00d", mask: "url(/plex-logo.svg) center/contain no-repeat", WebkitMask: "url(/plex-logo.svg) center/contain no-repeat" };
  const info = SERVICE_INFO[serviceKey];

  return (
    <div className={cn(!isLast && "border-b border-border/30")}>
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); } }}
        className={cn("flex w-full items-center justify-between px-5 py-3.5 text-left cursor-pointer bg-gradient-to-r", brandGradient)}
      >
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-5 w-5 shrink-0" style={logoStyle} />
            <p className="text-base font-semibold text-foreground">{title}</p>
            {!!isConnected && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
          </div>
          {info?.subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{info.subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {isEnabled && dirty && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => testService.mutate(
                  { service: serviceKey, values: { [urlField.key]: url, [apiKeyField.key]: apiKey } },
                  { onSuccess: (data) => showTestResult(data) },
                )}
                disabled={testService.isPending}
              >
                {testService.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                Test
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleSave}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Save
              </Button>
            </>
          )}
          <Switch checked={isEnabled} onCheckedChange={() => handleToggle()} />
        </div>
      </div>

      {/* Content */}
      <AnimatedCollapse open={isEnabled}>
        <div className="px-5 py-5 space-y-5">
          {info?.link && (
            <a href={info.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" />
              {info.link.label}
            </a>
          )}

          {/* Server URL */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">{urlField.label}</label>
            <Input
              value={url}
              placeholder={urlField.placeholder}
              onChange={(e) => { setUrl(e.target.value); setDirty(true); }}
              className="h-10 rounded-lg border-none bg-muted/50 text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
            />
          </div>

          {/* Auth methods */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Authentication</p>

            {/* Jellyfin: Token first, then credentials */}
            {isJellyfin && (
              <>
                <div className={cn("rounded-xl border p-4 transition-all", activeSection === "login" ? "border-border/20 opacity-40" : activeSection === "token" ? "border-border/60 bg-muted/30" : "border-border/40 hover:border-border/60")}>
                  <p className="text-sm font-medium text-foreground mb-3">{apiKeyField.label}</p>
                  <div className="relative">
                    <Input
                      type={apiKeyField.secret && !showSecrets[apiKeyField.key] ? "password" : "text"}
                      value={apiKey}
                      placeholder={apiKeyField.placeholder}
                      onChange={(e) => { setApiKey(e.target.value); setDirty(true); setActiveSection(e.target.value ? "token" : null); }}
                      className="h-10 rounded-lg border-none bg-muted/50 text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
                      disabled={activeSection === "login"}
                    />
                    {apiKeyField.secret && activeSection !== "login" && (
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors" onClick={() => setShowSecrets((p) => ({ ...p, [apiKeyField.key]: !p[apiKeyField.key] }))}>
                        {showSecrets[apiKeyField.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>

                <OrDivider />

                <div className={cn("rounded-xl border p-4 transition-all", activeSection === "token" ? "border-border/20 opacity-40" : activeSection === "login" ? "border-border/60 bg-muted/30" : "border-border/40 hover:border-border/60")}>
                  <p className="text-sm font-medium text-foreground mb-3">Login with credentials</p>
                  <SettingsFields
                    fields={loginFields}
                    values={loginValues}
                    onChange={(key, value) => { const next = { ...loginValues, [key]: value }; setLoginValues(next); setDirty(true); setActiveSection(Object.values(next).some((v) => v) ? "login" : null); }}
                    showSecrets={showSecrets}
                    onToggleSecret={(key) => setShowSecrets((p) => ({ ...p, [key]: !p[key] }))}
                    disabled={activeSection === "token"}
                  />
                </div>
              </>
            )}

            {/* Plex: Sign in first, then token */}
            {!isJellyfin && (
              <>
                <PlexOAuthSection
                  serverUrl={url}
                  disabled={activeSection === "token"}
                  isConnected={!!isConnected}
                  onSuccess={() => { void utils.settings.getAll.invalidate(); setDirty(false); setActiveSection(null); }}
                />

                <OrDivider />

                <div className={cn("rounded-xl border p-4 transition-all", activeSection === "login" ? "border-border/20 opacity-40" : activeSection === "token" ? "border-border/60 bg-muted/30" : "border-border/40 hover:border-border/60")}>
                  <p className="text-sm font-medium text-foreground mb-2">{apiKeyField.label}</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    Filled automatically when you sign in above. To find it manually, visit{" "}
                    <a href="https://plex.tv/devices.xml" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">plex.tv/devices.xml</a>
                    {" "}while logged in.
                  </p>
                  <div className="relative">
                    <Input
                      type={apiKeyField.secret && !showSecrets[apiKeyField.key] ? "password" : "text"}
                      value={apiKey}
                      placeholder={apiKeyField.placeholder}
                      onChange={(e) => { setApiKey(e.target.value); setDirty(true); setActiveSection(e.target.value ? "token" : null); }}
                      className="h-10 rounded-lg border-none bg-muted/50 text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
                      disabled={activeSection === "login"}
                    />
                    {apiKeyField.secret && activeSection !== "login" && (
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors" onClick={() => setShowSecrets((p) => ({ ...p, [apiKeyField.key]: !p[apiKeyField.key] }))}>
                        {showSecrets[apiKeyField.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
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
    <div className={cn("rounded-xl border p-4 transition-all", disabled ? "border-border/20 opacity-40" : "border-border/40 hover:border-border/60")}>
      <p className="text-sm font-medium text-foreground mb-2">{isConnected ? "Plex account" : "Sign in with Plex"}</p>
      <p className="text-sm text-muted-foreground mb-3">
        {isConnected
          ? "Your Plex account is connected. Re-authenticate if your token has expired."
          : "Opens a popup where you sign in with your Plex account. Works with Google, Apple, and email."}
      </p>
      <Button size="sm" variant="outline" className="gap-2" onClick={handleSignIn} disabled={disabled || polling || createPin.isPending}>
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

  if (isLoading) return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;

  return (
    <div>
      {/* Header */}
      <div className={cn("flex items-center justify-between px-5 py-3.5 bg-gradient-to-r", BRAND_GRADIENT.tmdb)}>
        <div>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tmdb.svg" alt="" className="h-5 w-5 shrink-0" />
            <p className="text-base font-semibold text-foreground">TMDB</p>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Required</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Provides all movie and TV metadata.</p>
        </div>
        {dirty && (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSettings.mutate({ "tmdb.apiKey": tmdbKey, "tmdb.enabled": true }, { onSuccess: () => { setDirty(false); toast.success("Saved"); } })}
            disabled={setSettings.isPending}
          >
            {setSettings.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
            Save
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-5 space-y-4">
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ExternalLink className="h-3.5 w-3.5" />
          Get your free API key
        </a>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">API Key (v3 auth)</label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={tmdbKey}
              placeholder="Enter your TMDB API key"
              onChange={(e) => { setTmdbKey(e.target.value); setDirty(true); }}
              className="h-10 rounded-lg border-none bg-muted/50 text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors" onClick={() => setShowKey((p) => !p)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
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
  const [showKey, setShowKey] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (allSettings) {
      setApiKey((allSettings["tvdb.apiKey"] as string) ?? "");
      setDirty(false);
    }
  }, [allSettings]);

  const handleSave = (): void => {
    const values: Record<string, string> = { "tvdb.apiKey": apiKey };
    testService.mutate(
      { service: "tvdb", values },
      {
        onSuccess: (data) => {
          if (data.connected) {
            setMany.mutate({ ...values, "tvdb.enabled": true }, {
              onSuccess: () => { setDirty(false); toast.success("TVDB connected and saved"); },
              onError: () => toast.error("Failed to save settings"),
            });
          } else {
            toast.error(data.error ?? "Connection failed");
          }
        },
        onError: () => toast.error("Connection test failed"),
      },
    );
  };

  if (isLoading) return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;

  const isPending = testService.isPending || setMany.isPending;

  return (
    <div>
      {/* Header — matches TMDB style */}
      <div className={cn("flex items-center justify-between px-5 py-3.5 bg-gradient-to-r", BRAND_GRADIENT.tvdb)}>
        <div>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tvdb.svg" alt="" className="h-5 w-5 shrink-0" />
            <p className="text-base font-semibold text-foreground">TVDB</p>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Optional</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Better TV show seasons and anime episode numbering.</p>
        </div>
        {dirty && (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
            Save & Test
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-5 space-y-4">
        <a href="https://thetvdb.com/api-information" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ExternalLink className="h-3.5 w-3.5" />
          Get your free API key
        </a>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">API Key</label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              placeholder="Enter your TVDB API key"
              onChange={(e) => { setApiKey(e.target.value); setDirty(true); }}
              className="h-10 rounded-lg border-none bg-muted/50 text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors" onClick={() => setShowKey((p) => !p)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Watch Region & Direct Search                                               */
/* -------------------------------------------------------------------------- */

function WatchRegionSection(): React.JSX.Element {
  const { enabled: directSearchEnabled, setEnabled: setDirectSearch } = useDirectSearch();
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
          <Button size="sm" onClick={handleSaveRegion} disabled={!hasPendingChange && !saved}>
            {saved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>

        {displayRegion && (
          <div>
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

      <div className="border-t border-border/40 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Direct search on streamings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">When enabled, clicking a provider opens a search directly on that streaming service.</p>
          </div>
          <Switch checked={directSearchEnabled} onCheckedChange={setDirectSearch} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ServicesSection                                                             */
/* -------------------------------------------------------------------------- */

export function ServicesSection(): React.JSX.Element {
  return (
    <div>
      <SettingsSection title="Metadata" description="Configure your metadata provider API keys.">
        <SectionCard title="TMDB">
          <TmdbSection />
        </SectionCard>
        <SectionCard title="TVDB">
          <TvdbApiKeySection />
        </SectionCard>
      </SettingsSection>

      <SettingsSection title="Media Servers" description="Connect media servers to sync libraries and trigger scans after downloads.">
        <SectionCard title="Jellyfin">
          <MediaServerRow
            title="Jellyfin"
            serviceKey="jellyfin"
            urlField={{ key: "jellyfin.url", label: "Server URL", placeholder: "http://192.168.1.100:8096" }}
            apiKeyField={{ key: "jellyfin.apiKey", label: "API Key", placeholder: "Your Jellyfin API key", secret: true }}
            loginFields={[
              { key: "username", label: "Username", placeholder: "admin" },
              { key: "password", label: "Password", placeholder: "Password", secret: true },
            ]}
            isLast
          />
        </SectionCard>
        <SectionCard title="Plex">
          <MediaServerRow
            title="Plex"
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
      </SettingsSection>

      <SettingsSection title="Download Client" description="Torrent client for downloading and managing media files.">
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

      <SettingsSection title="Indexers" description="Search aggregators for finding torrents across multiple trackers.">
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

  const isConnected = !!allSettings?.["tvdb.token"];
  const defaultShows = allSettings?.["tvdb.defaultShows"] === true;

  const handleToggleDefault = (checked: boolean): void => {
    setMany.mutate(
      { "tvdb.defaultShows": checked },
      {
        onSuccess: () => toast.success(checked ? "TVDB set as default for TV shows" : "TMDB restored as default"),
        onError: () => toast.error("Failed to update preference"),
      },
    );
  };

  return (
    <div>
      <SettingsSection title="Default Provider" description="Choose which metadata provider to use for TV shows and anime seasons.">
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-5 py-5">
          <div>
            <p className="text-sm font-medium text-foreground">Use TVDB as default for TV shows</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              When enabled, new TV shows and anime will use TVDB for seasons and episodes.
              {!isConnected && " Connect TVDB in Services first."}
            </p>
          </div>
          <Switch checked={defaultShows} onCheckedChange={handleToggleDefault} disabled={!isConnected} />
        </div>
      </SettingsSection>

      <SettingsSection title="Watch Region" description="Configure watch region and search behavior.">
        <WatchRegionSection />
      </SettingsSection>
    </div>
  );
}
