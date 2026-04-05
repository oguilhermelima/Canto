"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Switch } from "@canto/ui/switch";
import {
  Loader2,
  Check,
  ArrowRight,
  ArrowLeft,
  Folder,
  Search,
  Download,
  Eye,
  EyeOff,
  Clapperboard,
  FolderSync,
  Plug,
  Tv,
  Link2,
  MonitorSmartphone,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";
import { DownloadFolders } from "~/components/settings/download-folders";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

type Step = "welcome" | "overview" | "tmdb" | "tvdb" | "download-client" | "libraries" | "indexer" | "jellyfin" | "plex" | "ready";

function buildSteps(torrentConnected: boolean): Step[] {
  const steps: Step[] = ["welcome", "overview", "tmdb", "tvdb", "download-client"];
  if (torrentConnected) steps.push("libraries");
  steps.push("indexer", "jellyfin", "plex", "ready");
  return steps;
}

type Settings = Record<string, unknown>;
const str = (s: Settings | undefined, key: string): string => (s?.[key] as string) ?? "";
const bool = (s: Settings | undefined, key: string): boolean => (s?.[key] as boolean) ?? false;

/** Shared input className — bg-accent, rounded-xl, no ring */
const inputCn = "bg-accent rounded-xl border-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0";

/** Shared primary button className */
const btnCn = "rounded-xl min-w-[200px]";

/* -------------------------------------------------------------------------- */
/*  Password input with reveal toggle                                          */
/* -------------------------------------------------------------------------- */

function PasswordInput({ className, ...props }: React.ComponentProps<typeof Input>): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn(className, "pr-10")} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Animated collapse                                                          */
/* -------------------------------------------------------------------------- */

function AnimatedCollapse({ open, children }: { open: boolean; children: React.ReactNode }): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!contentRef.current) return;
    if (open) {
      setHeight(contentRef.current.scrollHeight);
      const observer = new ResizeObserver(() => {
        if (contentRef.current) setHeight(contentRef.current.scrollHeight);
      });
      observer.observe(contentRef.current);
      return () => observer.disconnect();
    } else {
      setHeight(0);
    }
  }, [open]);

  return (
    <div
      className="w-full overflow-hidden transition-all duration-300 ease-in-out"
      style={{ maxHeight: open ? height : 0, opacity: open ? 1 : 0 }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fade-in wrapper for step transitions                                       */
/* -------------------------------------------------------------------------- */

function FadeIn({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 20); return () => clearTimeout(t); }, []);

  return (
    <div className={cn("transition-all duration-500 ease-out", visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3")}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skip button                                                                */
/* -------------------------------------------------------------------------- */

function SkipButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" onClick={onClick} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
      Skip this step
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step dots                                                                  */
/* -------------------------------------------------------------------------- */

function StepDots({ current, total }: { current: number; total: number }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === current ? "w-6 bg-primary" : i < current ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted-foreground/20",
          )}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Service logo helper                                                        */
/* -------------------------------------------------------------------------- */

const SERVICE_BRAND: Record<string, { background: string; mask: string }> = {
  jellyfin: { background: "linear-gradient(135deg, #a95ce0, #4bb8e8)", mask: "url(/jellyfin-logo.svg)" },
  plex: { background: "#e5a00d", mask: "url(/plex-logo.svg)" },
  jackett: { background: "#c23c2a", mask: "url(/jackett.svg)" },
  qbittorrent: { background: "#4c8eda", mask: "url(/qbitorrent.svg)" },
};

function ServiceLogo({ src, brand, alt, size = 48 }: { src?: string; brand?: string; alt: string; size?: number }): React.JSX.Element {
  const b = brand ? SERVICE_BRAND[brand] : null;
  if (b) {
    return (
      <span
        className="inline-block shrink-0"
        style={{ width: size, height: size, background: b.background, mask: `${b.mask} center/contain no-repeat`, WebkitMask: `${b.mask} center/contain no-repeat` }}
      />
    );
  }
  return <img src={src} alt={alt} width={size} height={size} className="shrink-0" />;
}

/* -------------------------------------------------------------------------- */
/*  Step: Welcome                                                              */
/* -------------------------------------------------------------------------- */

function WelcomeStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <img src="/room.png" alt="Canto" className="h-16 w-16 dark:invert" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to Canto</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          Your all-in-one media manager. Search for movies, shows, and anime across multiple
          torrent indexers, download them with one click, and automatically organize everything
          into your media library — ready for Jellyfin or Plex to pick up.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Button onClick={onNext} size="lg" className={cn(btnCn, "mt-4")}>
          Get started
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => authClient.signOut().then(() => window.location.replace("/login"))}
          className="text-sm text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Overview                                                             */
/* -------------------------------------------------------------------------- */

function OverviewStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Plug className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">How Canto works</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          Canto connects a few services together so everything runs automatically.
          Here's what each piece does and what we'll configure next.
        </p>
      </div>

      {/* What Canto does */}
      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Search className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Discover</p>
          <p className="text-sm text-muted-foreground leading-relaxed">Browse trending, search by name, and find torrents across all your indexers.</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Download</p>
          <p className="text-sm text-muted-foreground leading-relaxed">Send torrents to qBittorrent and track progress — all from a single interface.</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FolderSync className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Organize</p>
          <p className="text-sm text-muted-foreground leading-relaxed">Files are renamed, sorted, and hardlinked into your library automatically.</p>
        </div>
      </div>

      {/* What we need */}
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border/40 bg-muted/5 p-5 space-y-4">
        <p className="text-sm font-semibold text-foreground">What we'll connect</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          <div className="flex items-start gap-3">
            <Clapperboard className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">TMDB & TVDB</p>
              <p className="text-sm text-muted-foreground">Metadata, posters, and episode info</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Download className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Torrent client</p>
              <p className="text-sm text-muted-foreground">qBittorrent for downloading</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Indexer</p>
              <p className="text-sm text-muted-foreground">Prowlarr or Jackett for torrent search</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Tv className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Media server</p>
              <p className="text-sm text-muted-foreground">Jellyfin or Plex (optional)</p>
            </div>
          </div>
        </div>
      </div>

      <Button onClick={onNext} size="lg" className={btnCn}>
        Let's go
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: TMDB                                                                 */
/* -------------------------------------------------------------------------- */

function TmdbStep({ onNext, settings }: { onNext: () => void; settings?: Settings }): React.JSX.Element {
  const [apiKey, setApiKey] = useState(str(settings, "tmdb.apiKey"));
  const [testing, setTesting] = useState(false);

  const setSetting = trpc.settings.set.useMutation();
  const testService = trpc.settings.testService.useMutation();

  const handleSave = async (): Promise<void> => {
    setTesting(true);
    try {
      await setSetting.mutateAsync({ key: "tmdb.apiKey", value: apiKey });
      const result = await testService.mutateAsync({
        service: "tmdb",
        values: { "tmdb.apiKey": apiKey },
      });
      if (result.connected) {
        toast.success("TMDB connected");
        onNext();
      } else {
        toast.error("Invalid API key. Check your TMDB key and try again.");
      }
    } catch {
      toast.error("Failed to validate TMDB key");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <ServiceLogo src="/tmdb.svg" alt="TMDB" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">TMDB API Key</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          Every poster, synopsis, rating, and recommendation in Canto comes from TMDB.
          You'll need a free API key to get started — it takes less than a minute to create one at{" "}
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            themoviedb.org
          </a>.
        </p>
      </div>

      <div className="w-full max-w-md">
        <PasswordInput
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your TMDB API key (v3 auth)"
          className={inputCn}
        />
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={!apiKey || testing}
          size="lg"
          className={btnCn}
        >
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: TVDB                                                                 */
/* -------------------------------------------------------------------------- */

function TvdbStep({ onNext, settings }: { onNext: () => void; settings?: Settings }): React.JSX.Element {
  const [apiKey, setApiKey] = useState(str(settings, "tvdb.apiKey"));
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => { toast.success("TVDB connected"); onNext(); },
    onError: () => toast.error("Failed to save TVDB key"),
  });

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <img src="/tvdb.svg" alt="TVDB" width={48} height={48} className="shrink-0 dark:invert" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">TVDB API Key</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          TMDB doesn't always get season and episode numbering right — especially for anime,
          specials, and shows that air differently across regions. TVDB fixes that by providing
          the correct episode structure, while Canto keeps using TMDB for everything else
          (posters, descriptions, ratings).
        </p>
        <p className="mx-auto max-w-2xl text-sm text-foreground/40 leading-relaxed">
          Recommended if you watch anime or multi-season shows. Get a free key at{" "}
          <a href="https://thetvdb.com/api-information" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            thetvdb.com
          </a>.
        </p>
      </div>

      <div className="w-full max-w-md">
        <PasswordInput
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your TVDB API key"
          className={inputCn}
        />
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button
          onClick={() => setMany.mutate({
            settings: [
              { key: "tvdb.apiKey", value: apiKey },
              { key: "tvdb.enabled", value: true },
            ],
          })}
          disabled={!apiKey || setMany.isPending}
          size="lg"
          className={btnCn}
        >
          {setMany.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <SkipButton onClick={onNext} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Download Client (qBittorrent)                                        */
/* -------------------------------------------------------------------------- */

function DownloadClientStep({ onNext, onSkip, settings }: { onNext: () => void; onSkip: () => void; settings?: Settings }): React.JSX.Element {
  const [url, setUrl] = useState(str(settings, "qbittorrent.url"));
  const [username, setUsername] = useState(str(settings, "qbittorrent.username"));
  const [password, setPassword] = useState(str(settings, "qbittorrent.password"));
  const [testing, setTesting] = useState(false);

  const setMany = trpc.settings.setMany.useMutation();
  const testService = trpc.settings.testService.useMutation();

  const handleSave = async (): Promise<void> => {
    setTesting(true);
    try {
      await setMany.mutateAsync({
        settings: [
          { key: "qbittorrent.url", value: url },
          { key: "qbittorrent.username", value: username },
          { key: "qbittorrent.password", value: password },
          { key: "qbittorrent.enabled", value: true },
        ],
      });
      const result = await testService.mutateAsync({
        service: "qbittorrent",
        values: { "qbittorrent.url": url, "qbittorrent.username": username, "qbittorrent.password": password },
      });
      if (result.connected) {
        toast.success("Connected to qBittorrent");
        onNext();
      } else {
        toast.error("Connection failed. Check your URL and credentials.");
      }
    } catch {
      toast.error("Failed to connect to qBittorrent");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <ServiceLogo brand="qbittorrent" alt="qBittorrent" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Download Client</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          When you pick something to download, Canto sends it to your torrent client and
          automatically organizes the files once they're done. Just point us to the WebUI.
        </p>
        <p className="text-sm text-foreground/40">
          Currently supported: <span className="text-foreground/60">qBittorrent</span>. Transmission and Deluge coming soon.
        </p>
      </div>

      <div className="w-full max-w-md space-y-3">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="WebUI URL (e.g. http://localhost:8080)" className={inputCn} />
        <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className={inputCn} />
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inputCn} />
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button onClick={handleSave} disabled={!url || testing} size="lg" className={btnCn}>
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Connect & continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <SkipButton onClick={onSkip} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Indexer (Prowlarr)                                                   */
/* -------------------------------------------------------------------------- */

function IndexerStep({ onNext, settings }: { onNext: () => void; settings?: Settings }): React.JSX.Element {
  const hasProwlarr = bool(settings, "prowlarr.enabled");
  const hasJackett = bool(settings, "jackett.enabled");
  const defaultChoice = hasProwlarr ? "prowlarr" as const : hasJackett ? "jackett" as const : null;
  const [choice, setChoice] = useState<"prowlarr" | "jackett" | null>(defaultChoice);
  const [url, setUrl] = useState(defaultChoice ? str(settings, `${defaultChoice}.url`) : "");
  const [apiKey, setApiKey] = useState(defaultChoice ? str(settings, `${defaultChoice}.apiKey`) : "");
  const [testing, setTesting] = useState(false);

  const setMany = trpc.settings.setMany.useMutation();
  const testService = trpc.settings.testService.useMutation();

  const handleSave = async (): Promise<void> => {
    if (!choice) return;
    setTesting(true);
    try {
      const prefix = choice;
      await setMany.mutateAsync({
        settings: [
          { key: `${prefix}.url`, value: url },
          { key: `${prefix}.apiKey`, value: apiKey },
          { key: `${prefix}.enabled`, value: true },
        ],
      });
      const result = await testService.mutateAsync({
        service: choice,
        values: { [`${prefix}.url`]: url, [`${prefix}.apiKey`]: apiKey },
      });
      if (result.connected) {
        toast.success(`${choice === "prowlarr" ? "Prowlarr" : "Jackett"} connected`);
        onNext();
      } else {
        toast.error("Connection failed. Check your URL and API key.");
      }
    } catch {
      toast.error("Failed to connect");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex gap-3">
        <ServiceLogo src="/prowlarr.svg" alt="Prowlarr" size={36} />
        <ServiceLogo brand="jackett" alt="Jackett" size={36} />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Torrent Search</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          Canto needs a way to search for torrents across your trackers. Connect Prowlarr
          or Jackett — both aggregate multiple trackers into a single search.
          You can configure both later if you want.
        </p>
      </div>

      <div className="flex w-full max-w-md gap-3">
        <button
          type="button"
          onClick={() => { setChoice(choice === "prowlarr" ? null : "prowlarr"); setUrl(""); setApiKey(""); }}
          className={cn(
            "flex flex-1 flex-col items-center gap-3 rounded-xl border p-4 transition-all",
            choice === "prowlarr" ? "border-primary/50 bg-primary/5" : "border-border hover:bg-accent/50",
          )}
        >
          <img src="/prowlarr.svg" alt="" className="h-8 w-8" />
          <span className="text-sm font-medium">Prowlarr</span>
        </button>
        <button
          type="button"
          onClick={() => { setChoice(choice === "jackett" ? null : "jackett"); setUrl(""); setApiKey(""); }}
          className={cn(
            "flex flex-1 flex-col items-center gap-3 rounded-xl border p-4 transition-all",
            choice === "jackett" ? "border-primary/50 bg-primary/5" : "border-border hover:bg-accent/50",
          )}
        >
          <ServiceLogo brand="jackett" alt="" size={32} />
          <span className="text-sm font-medium">Jackett</span>
        </button>
      </div>

      <div className="w-full max-w-md">
        <AnimatedCollapse open={choice !== null}>
          <div className="space-y-3 pt-1">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={`${choice === "prowlarr" ? "Prowlarr" : "Jackett"} URL (e.g. http://localhost:${choice === "prowlarr" ? "9696" : "9117"})`}
              className={inputCn}
            />
            <PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" className={inputCn} />
          </div>
        </AnimatedCollapse>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button onClick={handleSave} disabled={!choice || !url || !apiKey || testing} size="lg" className={btnCn}>
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Connect & continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <SkipButton onClick={onNext} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Jellyfin — Optional                                                  */
/* -------------------------------------------------------------------------- */

function JellyfinStep({ onNext, settings }: { onNext: () => void; settings?: Settings }): React.JSX.Element {
  const jellyfinSaved = bool(settings, "jellyfin.enabled");
  const [url, setUrl] = useState(str(settings, "jellyfin.url"));
  const hasApiKey = !!str(settings, "jellyfin.apiKey");
  const [authMode, setAuthMode] = useState<"credentials" | "apikey">(hasApiKey ? "apikey" : "credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState(str(settings, "jellyfin.apiKey"));
  const [connected, setConnected] = useState(jellyfinSaved);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [testing, setTesting] = useState(false);

  const authJellyfin = trpc.settings.authenticateJellyfin.useMutation();
  const setMany = trpc.settings.setMany.useMutation();
  const testService = trpc.settings.testService.useMutation();
  const syncJellyfin = trpc.jellyfin.syncLibraries.useMutation();
  const allServerLinks = trpc.folder.listAllServerLinks.useQuery(undefined, { enabled: connected });
  const updateServerLink = trpc.folder.updateServerLink.useMutation();

  const toggleSync = (enabled: boolean): void => {
    const links = (allServerLinks.data ?? []).filter((l) => l.serverType === "jellyfin");
    for (const link of links) {
      updateServerLink.mutate({ id: link.id, syncEnabled: enabled });
    }
  };

  const handleConnect = async (): Promise<void> => {
    setTesting(true);
    try {
      if (authMode === "credentials") {
        const result = await authJellyfin.mutateAsync({ url, username, password });
        if (result.success) {
          await setMany.mutateAsync({ settings: [{ key: "jellyfin.enabled", value: true }] });
          setConnected(true);
          toast.success(`Connected to ${result.serverName || "Jellyfin"}`);
          void syncJellyfin.mutateAsync();
        } else {
          toast.error(result.error ?? "Authentication failed");
        }
      } else {
        await setMany.mutateAsync({
          settings: [
            { key: "jellyfin.url", value: url },
            { key: "jellyfin.apiKey", value: apiKey },
            { key: "jellyfin.enabled", value: true },
          ],
        });
        const result = await testService.mutateAsync({
          service: "jellyfin",
          values: { "jellyfin.url": url, "jellyfin.apiKey": apiKey },
        });
        if (result.connected) {
          setConnected(true);
          toast.success("Jellyfin connected");
          void syncJellyfin.mutateAsync();
        } else {
          toast.error("Connection failed. Check your URL and API key.");
        }
      }
    } catch {
      toast.error("Failed to connect to Jellyfin");
    } finally {
      setTesting(false);
    }
  };

  const canSubmit = url && (authMode === "credentials" ? username : apiKey);

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <ServiceLogo brand="jellyfin" alt="Jellyfin" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Jellyfin</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          Jellyfin is a free, open-source media server that streams your movies and shows to any device.
          Connecting it lets Canto detect your library folders automatically and trigger scans after
          downloads finish.
        </p>
      </div>

      <div className="w-full max-w-md space-y-3">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL (e.g. http://192.168.1.100:8096)" className={inputCn} />
        <div className="flex rounded-xl bg-accent p-1">
          <button type="button" onClick={() => setAuthMode("credentials")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "credentials" ? "bg-background text-foreground" : "text-muted-foreground")}>
            Username & Password
          </button>
          <button type="button" onClick={() => setAuthMode("apikey")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "apikey" ? "bg-background text-foreground" : "text-muted-foreground")}>
            API Key
          </button>
        </div>
        {authMode === "credentials" ? (
          <>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className={inputCn} />
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inputCn} />
          </>
        ) : (
          <PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" className={inputCn} />
        )}
        {connected && (
          <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3 text-left">
            <div>
              <p className="text-sm font-medium text-foreground">Import existing library</p>
              <p className="text-xs text-muted-foreground">Sync movies and shows already in Jellyfin into Canto</p>
            </div>
            <Switch
              checked={syncEnabled}
              onCheckedChange={(checked) => {
                setSyncEnabled(checked);
                toggleSync(checked);
              }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        {connected ? (
          <Button onClick={onNext} size="lg" className={btnCn}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleConnect} disabled={testing || !canSubmit} size="lg" className={btnCn}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Connect & continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
        <SkipButton onClick={onNext} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Plex — Optional                                                      */
/* -------------------------------------------------------------------------- */

function PlexStep({ onNext, settings }: { onNext: () => void; settings?: Settings }): React.JSX.Element {
  const plexSaved = bool(settings, "plex.enabled");
  const [url, setUrl] = useState(str(settings, "plex.url"));
  const [authMode, setAuthMode] = useState<"oauth" | "token">("oauth");
  const [token, setToken] = useState(str(settings, "plex.token"));
  const [polling, setPolling] = useState(false);
  const [pinData, setPinData] = useState<{ pinId: number; clientId: string } | null>(null);
  const [connected, setConnected] = useState(plexSaved);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [testing, setTesting] = useState(false);

  const setMany = trpc.settings.setMany.useMutation();
  const authPlex = trpc.settings.authenticatePlex.useMutation();
  const createPlexPin = trpc.settings.plexPinCreate.useMutation();
  const syncPlex = trpc.plex.syncLibraries.useMutation();
  const allServerLinks = trpc.folder.listAllServerLinks.useQuery(undefined, { enabled: connected });
  const updateServerLink = trpc.folder.updateServerLink.useMutation();
  const plexPinCheck = trpc.settings.plexPinCheck.useQuery(
    { pinId: pinData?.pinId ?? 0, clientId: pinData?.clientId ?? "", serverUrl: url || undefined },
    { enabled: polling && pinData !== null, refetchInterval: 2000 },
  );

  useEffect(() => {
    if (plexPinCheck.data?.authenticated) {
      setPolling(false);
      setPinData(null);
      setConnected(true);
      void setMany.mutateAsync({ settings: [{ key: "plex.enabled", value: true }] }).then(() => syncPlex.mutateAsync());
      toast.success(plexPinCheck.data.serverName ? `Connected to ${plexPinCheck.data.serverName}` : "Plex connected");
    }
    if (plexPinCheck.data?.expired) {
      setPolling(false);
      setPinData(null);
      toast.error("Authentication expired. Please try again.");
    }
  }, [plexPinCheck.data, setMany]);

  const toggleSync = (enabled: boolean): void => {
    const links = (allServerLinks.data ?? []).filter((l) => l.serverType === "plex");
    for (const link of links) {
      updateServerLink.mutate({ id: link.id, syncEnabled: enabled });
    }
  };

  const handleOAuth = (): void => {
    createPlexPin.mutate(undefined, {
      onSuccess: (data) => {
        setPinData({ pinId: data.pinId, clientId: data.clientId });
        setPolling(true);
        const w = 600, h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(
          `https://app.plex.tv/auth#?clientID=${data.clientId}&code=${data.pinCode}&context%5Bdevice%5D%5Bproduct%5D=Canto`,
          "plex-auth",
          `width=${w},height=${h},left=${left},top=${top}`,
        );
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleToken = async (): Promise<void> => {
    setTesting(true);
    try {
      const result = await authPlex.mutateAsync({ url, token });
      if (result.success) {
        await setMany.mutateAsync({ settings: [{ key: "plex.enabled", value: true }] });
        setConnected(true);
        toast.success(`Connected to ${result.serverName || "Plex"}`);
        void syncPlex.mutateAsync();
      } else {
        toast.error(result.error ?? "Connection failed");
      }
    } catch {
      toast.error("Failed to connect to Plex");
    } finally {
      setTesting(false);
    }
  };

  const canSubmitToken = url && token;

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <ServiceLogo brand="plex" alt="Plex" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Plex</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          Plex organizes and streams your media collection to all your devices.
          Connecting it lets Canto detect your library folders automatically and trigger scans after
          downloads finish.
        </p>
      </div>

      <div className="w-full max-w-md space-y-3">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL (e.g. http://192.168.1.100:32400)" className={inputCn} />
        <div className="flex rounded-xl bg-accent p-1">
          <button type="button" onClick={() => setAuthMode("oauth")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "oauth" ? "bg-background text-foreground" : "text-muted-foreground")}>
            Sign in with Plex
          </button>
          <button type="button" onClick={() => setAuthMode("token")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", authMode === "token" ? "bg-background text-foreground" : "text-muted-foreground")}>
            Manual Token
          </button>
        </div>
        {authMode === "oauth" ? (
          <Button
            variant="outline"
            onClick={handleOAuth}
            disabled={!url || polling || createPlexPin.isPending}
            className="w-full rounded-xl gap-2"
          >
            {(polling || createPlexPin.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <ServiceLogo brand="plex" alt="" size={16} />}
            {polling ? "Waiting for Plex..." : "Sign in with Plex"}
          </Button>
        ) : (
          <PasswordInput value={token} onChange={(e) => setToken(e.target.value)} placeholder="X-Plex-Token" className={inputCn} />
        )}
        {connected && (
          <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3 text-left">
            <div>
              <p className="text-sm font-medium text-foreground">Import existing library</p>
              <p className="text-xs text-muted-foreground">Sync movies and shows already in Plex into Canto</p>
            </div>
            <Switch
              checked={syncEnabled}
              onCheckedChange={(checked) => {
                setSyncEnabled(checked);
                toggleSync(checked);
              }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        {connected ? (
          <Button onClick={onNext} size="lg" className={btnCn}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : authMode === "oauth" ? (
          <Button onClick={onNext} size="lg" className={btnCn}>
            Skip for now
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleToken} disabled={testing || !canSubmitToken} size="lg" className={btnCn}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Connect & continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
        <SkipButton onClick={onNext} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Download Folders                                                     */
/* -------------------------------------------------------------------------- */

function DownloadFoldersStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const [substep, setSubstep] = useState<"import-method" | "folders">("import-method");
  const [importMethod, setImportMethod] = useState<"local" | "remote">("local");
  const setDownloadSettings = trpc.library.setDownloadSettings.useMutation();

  const handleMethodChosen = (): void => {
    setDownloadSettings.mutate({
      importMethod,
      seedRatioLimit: null,
      seedTimeLimitHours: null,
      seedCleanupFiles: false,
    });
    setSubstep("folders");
  };

  if (substep === "import-method") {
    return (
      <div className="flex flex-col items-center gap-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Folder className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-foreground">How should Canto handle files?</h1>
          <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
            After a download finishes, Canto needs to organize the files into your media library.
            Choose how Canto should do this based on your setup.
          </p>
        </div>

        <div className="mx-auto grid w-full max-w-2xl grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          {/* Hardlink option */}
          <button
            type="button"
            onClick={() => setImportMethod("local")}
            className={cn(
              "flex flex-col rounded-2xl border p-5 text-left transition-all",
              importMethod === "local"
                ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                : "border-border/40 hover:border-border hover:bg-muted/10",
            )}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Link2 className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Hardlink</p>
                <p className="text-xs text-primary font-medium">Recommended</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              The file appears in both your download and library folders but takes <strong>zero extra space</strong> — same
              data, two names. Deleting the torrent only removes the download copy; your library stays intact.
            </p>

            <div className="space-y-2 pt-3 border-t border-border/20">
              <div className="flex items-start gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span className="text-foreground/80">No extra disk space</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span className="text-foreground/80">Seeding never interrupted</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span className="text-foreground/80">Safe for private trackers</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="text-foreground/60">Canto and qBittorrent must share the same filesystem</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="text-foreground/60">Both paths must be on the same disk/partition</span>
              </div>
            </div>
          </button>

          {/* API option */}
          <button
            type="button"
            onClick={() => setImportMethod("remote")}
            className={cn(
              "flex flex-col rounded-2xl border p-5 text-left transition-all",
              importMethod === "remote"
                ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                : "border-border/40 hover:border-border hover:bg-muted/10",
            )}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                <MonitorSmartphone className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">qBittorrent API</p>
                <p className="text-xs text-muted-foreground font-medium">For remote setups</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Canto tells qBittorrent to <strong>move and rename</strong> files via its API. Works when services run
              on different machines — no shared storage needed. Only one copy exists at a time.
            </p>

            <div className="space-y-2 pt-3 border-t border-border/20">
              <div className="flex items-start gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span className="text-foreground/80">Works across different servers</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span className="text-foreground/80">No shared filesystem needed</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span className="text-foreground/80">Zero extra disk space — files are moved, not copied</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="text-foreground/60">Removing a torrent also removes the file from your library</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="text-foreground/60">File renaming may break seeding on some trackers</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="text-foreground/60">Automatic seed cleanup must be configured carefully</span>
              </div>
            </div>
          </button>
        </div>

        <Button onClick={handleMethodChosen} size="lg" className={btnCn} disabled={setDownloadSettings.isPending}>
          {setDownloadSettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Folder className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Download Folders</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          {importMethod === "local"
            ? <>Tell Canto where to put things. Each folder needs a <strong>download path</strong> (where your torrent client saves files while downloading and seeding) and a <strong>library path</strong> (where Canto organizes them with clean names so your media server can pick them up).</>
            : <>Tell Canto where qBittorrent stores your files. Each folder needs a <strong>download path</strong> (where qBittorrent saves files initially) and a <strong>media path</strong> (where qBittorrent moves them after import). Both paths are from qBittorrent's perspective.</>
          }
        </p>
      </div>

      <div className="w-full max-w-2xl text-left">
        <DownloadFolders mode="onboarding" importMethod={importMethod} />
      </div>

      <FolderGate onNext={onNext} />
    </div>
  );
}

/** Shows Continue when at least one folder with both paths exists, otherwise warns. */
function FolderGate({ onNext }: { onNext: () => void }): React.JSX.Element {
  const { data: folders, isError } = trpc.folder.list.useQuery(undefined, { retry: false });
  const hasFolders = (folders ?? []).some((f) => f.downloadPath && f.libraryPath);

  // If query fails (e.g. permission issue), allow continuing
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Button onClick={onNext} size="lg" className={btnCn}>
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {!hasFolders && folders !== undefined && (
        <p className="text-sm text-amber-400/80 text-center max-w-md">
          No folders with both paths configured yet. Downloads won't work until you add at least one folder.
        </p>
      )}
      <Button onClick={onNext} size="lg" className={btnCn} disabled={folders === undefined || !hasFolders}>
        Continue
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
      <button type="button" onClick={onNext} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        Skip — configure later in Settings
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Ready                                                                */
/* -------------------------------------------------------------------------- */

function ReadyStep({ onFinish }: { onFinish: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/10">
        <Check className="h-10 w-10 text-emerald-500" />
      </div>
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-foreground">You're all set</h1>
        <p className="mx-auto max-w-2xl text-base text-foreground/70 leading-relaxed">
          Everything is connected and ready to go. Start exploring — search for a movie,
          browse what's trending, or dive straight into downloading. All your settings
          can be adjusted anytime from the Settings page.
        </p>
      </div>

      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Discover</p>
          <p className="text-sm text-muted-foreground leading-relaxed">Browse trending movies, shows, and anime across all your sources.</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Download className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Download</p>
          <p className="text-sm text-muted-foreground leading-relaxed">Search across your indexers and send torrents to qBittorrent with one click.</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/40 p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <FolderSync className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Organize</p>
          <p className="text-sm text-muted-foreground leading-relaxed">Files are renamed, sorted, and imported into your media library automatically.</p>
        </div>
      </div>

      <Button onClick={onFinish} size="lg" className={cn(btnCn, "mt-4")}>
        Open Canto
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Onboarding Page                                                       */
/* -------------------------------------------------------------------------- */

export default function OnboardingPage(): React.JSX.Element {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [torrentConnected, setTorrentConnected] = useState(false);

  const { data: isCompleted, isLoading } = trpc.settings.isOnboardingCompleted.useQuery();
  const { data: allSettings, isLoading: settingsLoading } = trpc.settings.getAll.useQuery();
  const completeOnboarding = trpc.settings.completeOnboarding.useMutation();

  // Detect if torrent client was already configured before onboarding
  useEffect(() => {
    if (allSettings && (allSettings["qbittorrent.enabled"] === true)) {
      setTorrentConnected(true);
    }
  }, [allSettings]);

  const steps = buildSteps(torrentConnected);
  const step = steps[currentStep]!;

  useEffect(() => {
    if (isCompleted === true) router.replace("/");
  }, [isCompleted, router]);

  const next = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  }, [steps.length]);

  const back = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const finish = useCallback(async () => {
    await completeOnboarding.mutateAsync();
    router.replace("/");
  }, [completeOnboarding, router]);

  if (isLoading || settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center py-12" style={{ minHeight: "calc(100vh - 120px)" }}>
          <FadeIn key={step}>
            {step === "welcome" && <WelcomeStep onNext={next} />}
            {step === "overview" && <OverviewStep onNext={next} />}
            {step === "tmdb" && <TmdbStep onNext={next} settings={allSettings} />}
            {step === "tvdb" && <TvdbStep onNext={next} settings={allSettings} />}
            {step === "download-client" && (
              <DownloadClientStep
                onNext={() => { setTorrentConnected(true); next(); }}
                onSkip={next}
                settings={allSettings}
              />
            )}
            {step === "libraries" && <DownloadFoldersStep onNext={next} />}
            {step === "indexer" && <IndexerStep onNext={next} settings={allSettings} />}
            {step === "jellyfin" && <JellyfinStep onNext={next} settings={allSettings} />}
            {step === "plex" && <PlexStep onNext={next} settings={allSettings} />}
            {step === "ready" && <ReadyStep onFinish={finish} />}
          </FadeIn>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 px-8 py-6">
        <button
          type="button"
          onClick={back}
          disabled={currentStep === 0}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
            currentStep > 0 ? "bg-accent text-foreground hover:bg-accent/80" : "text-transparent cursor-default",
          )}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <StepDots current={currentStep} total={steps.length} />
        <div className="w-9" />
      </div>
    </div>
  );
}
