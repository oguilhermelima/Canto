"use client";

import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@canto/ui/skeleton";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Switch } from "@canto/ui/switch";
import { Input } from "@canto/ui/input";
import {
  Save,
  Check,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { SectionCard, SettingsSection } from "~/components/settings/shared";

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
          <label className={cn("text-xs font-semibold", disabled ? "text-muted-foreground/40" : "text-muted-foreground")}>{f.label}</label>
          <div className="relative">
            <Input
              type={f.secret && !showSecrets[f.key] ? "password" : "text"}
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange(f.key, e.target.value)}
              className={cn(
                "h-10 rounded-lg border-none bg-muted/50 text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0",
                disabled && "opacity-30 pointer-events-none",
              )}
              disabled={disabled}
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

/* -------------------------------------------------------------------------- */
/*  OR Divider                                                                 */
/* -------------------------------------------------------------------------- */

function OrDivider(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-border/40" />
      <span className="text-xs text-muted-foreground/40">or</span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Connection helpers                                                         */
/* -------------------------------------------------------------------------- */

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
/*  Brand colors                                                               */
/* -------------------------------------------------------------------------- */

const BRAND_GRADIENT: Record<string, string> = {
  jellyfin: "from-[#a95ce0]/15 via-[#4bb8e8]/10 to-transparent",
  plex: "from-[#e5a00d]/15 via-[#e5a00d]/5 to-transparent",
  tmdb: "from-[#01b4e4]/15 via-[#90cea1]/10 to-transparent",
  qbittorrent: "from-[#4488cc]/15 via-[#4488cc]/5 to-transparent",
  prowlarr: "from-[#e77220]/15 via-[#e77220]/5 to-transparent",
  jackett: "from-[#c23c2a]/15 via-[#c23c2a]/5 to-transparent",
};

/** Logo config: `img` = use as <img> (SVG has own colors), `mask` = use CSS mask with brand color */
const BRAND_LOGO: Record<string, { type: "img"; src: string } | { type: "mask"; src: string; color: string } | null> = {
  jellyfin: null,
  plex: null,
  qbittorrent: { type: "mask", src: "/qbitorrent.svg", color: "#4488cc" },
  prowlarr: { type: "img", src: "/prowlarr.svg" },
  jackett: { type: "mask", src: "/jackett.svg", color: "#c23c2a" },
  tmdb: { type: "img", src: "/tmdb.svg" },
};

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
    <div className={cn(!isLast && "border-b border-border/30")}>
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); } }}
        className={cn("flex w-full items-center justify-between px-5 py-5 text-left cursor-pointer bg-gradient-to-r", BRAND_GRADIENT[serviceKey] ?? "")}
      >
        <div className="min-w-0 pr-4">
          <div className="flex items-center gap-2.5">
            {BRAND_LOGO[serviceKey]?.type === "img" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={BRAND_LOGO[serviceKey].src} alt="" className="h-5 w-5 shrink-0" />
            )}
            {BRAND_LOGO[serviceKey]?.type === "mask" && (
              <span
                className="inline-block h-5 w-5 shrink-0"
                style={{
                  background: BRAND_LOGO[serviceKey].color,
                  mask: `url(${BRAND_LOGO[serviceKey].src}) center/contain no-repeat`,
                  WebkitMask: `url(${BRAND_LOGO[serviceKey].src}) center/contain no-repeat`,
                }}
              />
            )}
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
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() =>
                    setMany.mutate(values, {
                      onSuccess: () => { setDirty(false); toast.success("Settings saved"); },
                      onError: () => toast.error("Failed to save settings"),
                    })
                  }
                  disabled={!dirty || setMany.isPending}
                >
                  {setMany.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => testService.mutate(
                    { service: serviceKey, values },
                    { onSuccess: (data) => showTestResult(data) },
                  )}
                  disabled={testService.isPending}
                >
                  {testService.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                  Test
                </Button>
              </div>
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
      const onAuthSuccess = (data: { success: boolean; serverName?: string; user?: string; error?: string }): void => {
        if (data.success) {
          const msg = data.serverName
            ? `Connected to ${data.serverName}${data.user ? ` as ${data.user}` : ""}`
            : "Credentials saved";
          toast.success(msg);
          setDirty(false);
        } else {
          toast.error(data.error ?? "Authentication failed");
        }
      };
      if (serviceKey === "jellyfin") {
        authJellyfin.mutate(
          { url, username: loginValues.username ?? "", password: loginValues.password ?? "" },
          { onSuccess: onAuthSuccess },
        );
      } else {
        loginPlex.mutate(
          { url, email: loginValues.email ?? "", password: loginValues.password ?? "" },
          { onSuccess: onAuthSuccess },
        );
      }
    } else {
      setMany.mutate(
        { [urlField.key]: url, [apiKeyField.key]: apiKey },
        {
          onSuccess: () => { setDirty(false); setActiveSection(null); toast.success("Settings saved"); },
          onError: () => toast.error("Failed to save settings"),
        },
      );
    }
  };

  const handleToggle = (): void => {
    toggleService.mutate({ service: serviceKey, enabled: !isEnabled });
  };

  if (isLoading) {
    return <div className="px-5 py-5"><Skeleton className="h-10 w-full" /></div>;
  }

  const isJellyfin = serviceKey === "jellyfin";
  const brandGradient = isJellyfin
    ? "from-[#a95ce0]/15 via-[#4bb8e8]/10 to-transparent"
    : "from-[#e5a00d]/15 via-[#e5a00d]/5 to-transparent";
  const logoStyle = isJellyfin
    ? { background: "linear-gradient(135deg, #a95ce0, #4bb8e8)", mask: "url(/jellyfin-logo.svg) center/contain no-repeat", WebkitMask: "url(/jellyfin-logo.svg) center/contain no-repeat" }
    : { background: "#e5a00d", mask: "url(/plex-logo.svg) center/contain no-repeat", WebkitMask: "url(/plex-logo.svg) center/contain no-repeat" };

  return (
    <div className={cn(!isLast && "border-b border-border/30")}>
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); } }}
        className={cn("flex w-full items-center justify-between px-5 py-5 text-left cursor-pointer bg-gradient-to-r", brandGradient)}
      >
        <div className="min-w-0 pr-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-block h-5 w-5 shrink-0" style={logoStyle} />
            <p className="text-sm font-medium text-foreground">{title}</p>
            {!!isConnected && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
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
            <label className="text-xs font-semibold text-muted-foreground">{urlField.label}</label>
            <Input
              value={url}
              placeholder={urlField.placeholder}
              onChange={(e) => { setUrl(e.target.value); setDirty(true); }}
              className="h-10 rounded-lg border-none bg-muted/50 text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
            />
          </div>

          {/* Authentication */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground">Choose one authentication method</p>

            {/* Option 1: API Key */}
            <div
              className={cn(
                "rounded-lg border p-4 transition-all",
                activeSection === "login"
                  ? "border-border/20 opacity-40"
                  : activeSection === "token"
                    ? "border-border/60 bg-muted/30"
                    : "border-border/40 hover:border-border/60",
              )}
            >
              <p className="text-xs font-semibold text-foreground mb-3">{apiKeyField.label}</p>
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
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                    onClick={() => setShowSecrets((p) => ({ ...p, [apiKeyField.key]: !p[apiKeyField.key] }))}
                  >
                    {showSecrets[apiKeyField.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </div>

            <OrDivider />

            {/* Option 2: Login */}
            {serviceKey === "jellyfin" ? (
              <div
                className={cn(
                  "rounded-lg border p-4 transition-all",
                  activeSection === "token"
                    ? "border-border/20 opacity-40"
                    : activeSection === "login"
                      ? "border-border/60 bg-muted/30"
                      : "border-border/40 hover:border-border/60",
                )}
              >
                <p className="text-xs font-semibold text-foreground mb-3">
                  Login with credentials
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
            ) : (
              <PlexOAuthSection
                serverUrl={url}
                disabled={activeSection === "token"}
                onSuccess={() => {
                  void utils.settings.getAll.invalidate();
                  setDirty(false);
                  setActiveSection(null);
                }}
              />
            )}
          </div>

          {/* Save / Test */}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={!dirty || isPending}>
              {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => testService.mutate(
                { service: serviceKey, values: { [urlField.key]: url, [apiKeyField.key]: apiKey } },
                { onSuccess: (data) => showTestResult(data) },
              )}
              disabled={testService.isPending}
            >
              {testService.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              Test
            </Button>
          </div>
        </div>
      </AnimatedCollapse>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Plex OAuth Section                                                         */
/* -------------------------------------------------------------------------- */

function PlexOAuthSection({
  serverUrl,
  disabled,
  onSuccess,
}: {
  serverUrl: string;
  disabled: boolean;
  onSuccess: () => void;
}): React.JSX.Element {
  const [polling, setPolling] = useState(false);
  const [pinData, setPinData] = useState<{ pinId: number; clientId: string } | null>(null);
  const createPin = trpc.settings.plexPinCreate.useMutation();

  // Poll for the PIN result
  const pinCheck = trpc.settings.plexPinCheck.useQuery(
    {
      pinId: pinData?.pinId ?? 0,
      clientId: pinData?.clientId ?? "",
      serverUrl: serverUrl || undefined,
    },
    {
      enabled: polling && pinData !== null,
      refetchInterval: 2000,
    },
  );

  // Handle successful auth
  useEffect(() => {
    if (pinCheck.data?.authenticated) {
      setPolling(false);
      setPinData(null);
      const msg = pinCheck.data.serverName
        ? `Connected to ${pinCheck.data.serverName}${pinCheck.data.username ? ` as ${pinCheck.data.username}` : ""}`
        : `Signed in${pinCheck.data.username ? ` as ${pinCheck.data.username}` : ""}`;
      toast.success(msg);
      onSuccess();
    }
    if (pinCheck.data?.expired) {
      setPolling(false);
      setPinData(null);
      toast.error("Authentication expired. Please try again.");
    }
  }, [pinCheck.data, onSuccess]);

  const handleSignIn = (): void => {
    createPin.mutate(undefined, {
      onSuccess: (data) => {
        setPinData({ pinId: data.pinId, clientId: data.clientId });
        setPolling(true);
        // Open Plex auth in popup
        const authUrl = `https://app.plex.tv/auth#?clientID=${data.clientId}&code=${data.pinCode}&context%5Bdevice%5D%5Bproduct%5D=Canto`;
        const w = 600;
        const h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(authUrl, "plex-auth", `width=${w},height=${h},left=${left},top=${top}`);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-all",
        disabled
          ? "border-border/20 opacity-40"
          : "border-border/40 hover:border-border/60",
      )}
    >
      <p className="text-xs font-semibold text-foreground mb-3">Sign in with Plex</p>
      <p className="text-xs text-muted-foreground mb-3">
        Opens a popup where you sign in with your Plex account (Google, Apple, or email).
        Works with all login methods.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="gap-2"
        onClick={handleSignIn}
        disabled={disabled || polling || createPin.isPending}
      >
        {polling ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for Plex...
          </>
        ) : createPin.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating PIN...
          </>
        ) : (
          <>
            <span
              className="inline-block h-4 w-4 shrink-0 bg-[#e5a00d]"
              style={{
                mask: "url(/plex-logo.svg) center/contain no-repeat",
                WebkitMask: "url(/plex-logo.svg) center/contain no-repeat",
              }}
            />
            Sign in with Plex
          </>
        )}
      </Button>
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
    <div className={cn("px-5 py-5 bg-gradient-to-r", BRAND_GRADIENT.tmdb)}>
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tmdb.svg" alt="" className="h-5 w-5 shrink-0" />
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
/*  ServicesSection                                                             */
/* -------------------------------------------------------------------------- */

export function ServicesSection(): React.JSX.Element {
  return (
    <div>
      <SettingsSection title="Metadata" description="Configure your metadata provider API key.">
        <SectionCard title="Metadata">
          <TmdbSection />
        </SectionCard>
      </SettingsSection>

      <SettingsSection title="Media Servers" description="Connect media servers to sync libraries and trigger scans after downloads.">
        <SectionCard title="Jellyfin">
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
            isLast
          />
        </SectionCard>
        <SectionCard title="Plex">
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
      </SettingsSection>

      <SettingsSection title="Download Client" description="Torrent client for downloading and managing media files.">
        <SectionCard title="qBittorrent">
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
      </SettingsSection>

      <SettingsSection title="Indexers" description="Search aggregators for finding torrents across multiple trackers.">
        <SectionCard title="Prowlarr">
          <ServiceRow
            title="Prowlarr"
            description="Indexer manager that aggregates torrent search across multiple trackers."
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
            description="Torznab-compatible indexer proxy. Alternative to Prowlarr for searching across torrent trackers."
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
