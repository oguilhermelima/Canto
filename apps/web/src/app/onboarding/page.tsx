"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Loader2,
  Film,
  Tv,
  Star,
  Check,
  ArrowRight,
  ArrowLeft,
  Folder,
  Search,
  Download,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

type Step = "welcome" | "tmdb" | "tvdb" | "download-client" | "indexer" | "media-server" | "libraries" | "ready";

const STEPS: Step[] = ["welcome", "tmdb", "tvdb", "download-client", "indexer", "media-server", "libraries", "ready"];

/** Shared input className — bg-accent, rounded-xl, no ring */
const inputCn = "bg-accent rounded-xl border-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0";

/** Shared primary button className */
const btnCn = "rounded-xl min-w-[200px]";

/* -------------------------------------------------------------------------- */
/*  Animated collapse                                                          */
/* -------------------------------------------------------------------------- */

function AnimatedCollapse({ open, children }: { open: boolean; children: React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) setHeight(ref.current.scrollHeight);
  }, [open, children]);

  return (
    <div
      className="w-full overflow-hidden transition-all duration-300 ease-in-out"
      style={{ maxHeight: open ? height : 0, opacity: open ? 1 : 0 }}
    >
      <div ref={ref}>{children}</div>
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
    <div className="flex flex-col items-center gap-6 text-center">
      <img src="/room.png" alt="Canto" className="h-16 w-16 dark:invert" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to Canto</h1>
        <p className="mx-auto max-w-lg text-base text-foreground/70 leading-relaxed">
          Canto helps you discover, download, and organize movies, shows, and anime — all in one place.
          We just need to connect a few services to get everything running.
        </p>
      </div>
      <Button onClick={onNext} size="lg" className={cn(btnCn, "mt-4")}>
        Get started
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: TMDB                                                                 */
/* -------------------------------------------------------------------------- */

function TmdbStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const [apiKey, setApiKey] = useState("");
  const setSetting = trpc.settings.set.useMutation({
    onSuccess: () => { toast.success("TMDB connected"); onNext(); },
    onError: () => toast.error("Failed to save TMDB key"),
  });

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <ServiceLogo src="/tmdb.svg" alt="TMDB" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">TMDB API Key</h1>
        <p className="mx-auto max-w-lg text-base text-foreground/70 leading-relaxed">
          Every poster, synopsis, rating, and recommendation in Canto comes from TMDB.
          You'll need a free API key to get started — it takes less than a minute to create one at{" "}
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            themoviedb.org
          </a>.
        </p>
      </div>

      <div className="w-full max-w-sm">
        <Input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your TMDB API key (v3 auth)"
          type="password"
          className={inputCn}
        />
      </div>

      <Button
        onClick={() => setSetting.mutate({ key: "tmdb.apiKey", value: apiKey })}
        disabled={!apiKey || setSetting.isPending}
        size="lg"
        className={btnCn}
      >
        {setSetting.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continue
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: TVDB                                                                 */
/* -------------------------------------------------------------------------- */

function TvdbStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const [apiKey, setApiKey] = useState("");
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => { toast.success("TVDB connected"); onNext(); },
    onError: () => toast.error("Failed to save TVDB key"),
  });

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <img src="/tvdb.svg" alt="TVDB" width={48} height={48} className="shrink-0 dark:invert" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">TVDB API Key</h1>
        <p className="mx-auto max-w-lg text-base text-foreground/70 leading-relaxed">
          TMDB doesn't always get season and episode numbering right — especially for anime,
          specials, and shows that air differently across regions. TVDB fixes that by providing
          the correct episode structure, while Canto keeps using TMDB for everything else
          (posters, descriptions, ratings).
        </p>
        <p className="mx-auto max-w-lg text-sm text-foreground/40 leading-relaxed">
          Recommended if you watch anime or multi-season shows. Get a free key at{" "}
          <a href="https://thetvdb.com/api-information" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            thetvdb.com
          </a>.
        </p>
      </div>

      <div className="w-full max-w-sm">
        <Input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your TVDB API key"
          type="password"
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

function DownloadClientStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="flex flex-col items-center gap-6 text-center">
      <ServiceLogo src="/qbitorrent.svg" alt="qBittorrent" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Download Client</h1>
        <p className="mx-auto max-w-lg text-base text-foreground/70 leading-relaxed">
          When you pick something to download, Canto sends it to your torrent client and
          automatically organizes the files once they're done. Just point us to the WebUI.
        </p>
        <p className="text-sm text-foreground/40">
          Currently supported: <span className="text-foreground/60">qBittorrent</span>. Transmission and Deluge coming soon.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="WebUI URL (e.g. http://localhost:8080)" className={inputCn} />
        <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className={inputCn} />
        <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" className={inputCn} />
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button onClick={handleSave} disabled={!url || testing} size="lg" className={btnCn}>
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
/*  Step: Indexer (Prowlarr)                                                   */
/* -------------------------------------------------------------------------- */

function IndexerStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const [choice, setChoice] = useState<"prowlarr" | "jackett" | null>(null);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
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
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex gap-3">
        <ServiceLogo src="/prowlarr.svg" alt="Prowlarr" size={36} />
        <ServiceLogo brand="jackett" alt="Jackett" size={36} />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Torrent Search</h1>
        <p className="mx-auto max-w-lg text-base text-foreground/70 leading-relaxed">
          Canto needs a way to search for torrents across your trackers. Connect Prowlarr
          or Jackett — both aggregate multiple trackers into a single search.
          You can configure both later if you want.
        </p>
      </div>

      <div className="flex w-full max-w-sm gap-3">
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

      <div className="w-full max-w-sm">
        <AnimatedCollapse open={choice !== null}>
          <div className="space-y-3 pt-1">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={`${choice === "prowlarr" ? "Prowlarr" : "Jackett"} URL (e.g. http://localhost:${choice === "prowlarr" ? "9696" : "9117"})`}
              className={inputCn}
            />
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" type="password" className={inputCn} />
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
/*  Step: Media Server (Jellyfin/Plex) — Optional                              */
/* -------------------------------------------------------------------------- */

function MediaServerStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<"jellyfin" | "plex">>(new Set());
  // Jellyfin
  const [jellyfinUrl, setJellyfinUrl] = useState("");
  const [jellyfinAuthMode, setJellyfinAuthMode] = useState<"credentials" | "apikey">("credentials");
  const [jellyfinUsername, setJellyfinUsername] = useState("");
  const [jellyfinPassword, setJellyfinPassword] = useState("");
  const [jellyfinApiKey, setJellyfinApiKey] = useState("");
  const [jellyfinConnected, setJellyfinConnected] = useState(false);
  // Plex
  const [plexUrl, setPlexUrl] = useState("");
  const [plexAuthMode, setPlexAuthMode] = useState<"oauth" | "token">("oauth");
  const [plexToken, setPlexToken] = useState("");
  const [plexPolling, setPlexPolling] = useState(false);
  const [plexPinData, setPlexPinData] = useState<{ pinId: number; clientId: string } | null>(null);
  const [plexConnected, setPlexConnected] = useState(false);
  const [testing, setTesting] = useState(false);

  const toggleExpanded = (key: "jellyfin" | "plex"): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const authJellyfin = trpc.settings.authenticateJellyfin.useMutation();
  const setMany = trpc.settings.setMany.useMutation();
  const testService = trpc.settings.testService.useMutation();
  const authPlex = trpc.settings.authenticatePlex.useMutation();
  const createPlexPin = trpc.settings.plexPinCreate.useMutation();
  const syncJellyfin = trpc.jellyfin.syncLibraries.useMutation();
  const syncPlex = trpc.plex.syncLibraries.useMutation();
  const plexPinCheck = trpc.settings.plexPinCheck.useQuery(
    { pinId: plexPinData?.pinId ?? 0, clientId: plexPinData?.clientId ?? "", serverUrl: plexUrl || undefined },
    { enabled: plexPolling && plexPinData !== null, refetchInterval: 2000 },
  );

  useEffect(() => {
    if (plexPinCheck.data?.authenticated) {
      setPlexPolling(false);
      setPlexPinData(null);
      setPlexConnected(true);
      void setMany.mutateAsync({ settings: [{ key: "plex.enabled", value: true }] }).then(() => syncPlex.mutateAsync());
      toast.success(plexPinCheck.data.serverName ? `Connected to ${plexPinCheck.data.serverName}` : "Plex connected");
    }
    if (plexPinCheck.data?.expired) {
      setPlexPolling(false);
      setPlexPinData(null);
      toast.error("Authentication expired. Please try again.");
    }
  }, [plexPinCheck.data, setMany]);

  const handleJellyfin = async (): Promise<void> => {
    setTesting(true);
    try {
      if (jellyfinAuthMode === "credentials") {
        const result = await authJellyfin.mutateAsync({ url: jellyfinUrl, username: jellyfinUsername, password: jellyfinPassword });
        if (result.success) {
          await setMany.mutateAsync({ settings: [{ key: "jellyfin.enabled", value: true }] });
          setJellyfinConnected(true);
          toast.success(`Connected to ${result.serverName || "Jellyfin"}`);
          void syncJellyfin.mutateAsync();
        } else {
          toast.error(result.error ?? "Authentication failed");
        }
      } else {
        await setMany.mutateAsync({
          settings: [
            { key: "jellyfin.url", value: jellyfinUrl },
            { key: "jellyfin.apiKey", value: jellyfinApiKey },
            { key: "jellyfin.enabled", value: true },
          ],
        });
        const result = await testService.mutateAsync({
          service: "jellyfin",
          values: { "jellyfin.url": jellyfinUrl, "jellyfin.apiKey": jellyfinApiKey },
        });
        if (result.connected) {
          setJellyfinConnected(true);
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

  const handlePlexOAuth = (): void => {
    createPlexPin.mutate(undefined, {
      onSuccess: (data) => {
        setPlexPinData({ pinId: data.pinId, clientId: data.clientId });
        setPlexPolling(true);
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

  const handlePlexToken = async (): Promise<void> => {
    setTesting(true);
    try {
      const result = await authPlex.mutateAsync({ url: plexUrl, token: plexToken });
      if (result.success) {
        await setMany.mutateAsync({ settings: [{ key: "plex.enabled", value: true }] });
        setPlexConnected(true);
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

  const canSubmitJellyfin = jellyfinUrl && (jellyfinAuthMode === "credentials" ? jellyfinUsername : jellyfinApiKey);
  const canSubmitPlex = plexAuthMode === "oauth" ? !!plexUrl : plexUrl && plexToken;
  const anyConnected = jellyfinConnected || plexConnected;

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex gap-3">
        <ServiceLogo brand="jellyfin" alt="Jellyfin" size={36} />
        <ServiceLogo brand="plex" alt="Plex" size={36} />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Media Server</h1>
        <p className="mx-auto max-w-lg text-base text-foreground/70 leading-relaxed">
          If you use Jellyfin or Plex, connecting them lets Canto detect your library folders
          automatically and trigger scans after downloads finish. You can connect both.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {/* Jellyfin card */}
        <div className={cn("rounded-xl border overflow-hidden transition-all", jellyfinConnected ? "border-green-500/40" : expanded.has("jellyfin") ? "border-primary/50" : "border-border")}>
          <button
            type="button"
            onClick={() => toggleExpanded("jellyfin")}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
          >
            <ServiceLogo brand="jellyfin" alt="" size={24} />
            <span className="flex-1 text-sm font-medium">Jellyfin</span>
            {jellyfinConnected && <Check className="h-4 w-4 text-green-500" />}
          </button>
          <AnimatedCollapse open={expanded.has("jellyfin") && !jellyfinConnected}>
            <div className="space-y-3 border-t border-border/40 px-4 py-3">
              <Input value={jellyfinUrl} onChange={(e) => setJellyfinUrl(e.target.value)} placeholder="Server URL (e.g. http://192.168.1.100:8096)" className={inputCn} />
              <div className="flex rounded-xl bg-accent p-1">
                <button type="button" onClick={() => setJellyfinAuthMode("credentials")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", jellyfinAuthMode === "credentials" ? "bg-background text-foreground" : "text-muted-foreground")}>
                  Username & Password
                </button>
                <button type="button" onClick={() => setJellyfinAuthMode("apikey")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", jellyfinAuthMode === "apikey" ? "bg-background text-foreground" : "text-muted-foreground")}>
                  API Key
                </button>
              </div>
              {jellyfinAuthMode === "credentials" ? (
                <>
                  <Input value={jellyfinUsername} onChange={(e) => setJellyfinUsername(e.target.value)} placeholder="Username" className={inputCn} />
                  <Input value={jellyfinPassword} onChange={(e) => setJellyfinPassword(e.target.value)} placeholder="Password" type="password" className={inputCn} />
                </>
              ) : (
                <Input value={jellyfinApiKey} onChange={(e) => setJellyfinApiKey(e.target.value)} placeholder="API Key" type="password" className={inputCn} />
              )}
              <Button onClick={handleJellyfin} disabled={testing || !canSubmitJellyfin} className="w-full rounded-xl">
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Connect Jellyfin
              </Button>
            </div>
          </AnimatedCollapse>
        </div>

        {/* Plex card */}
        <div className={cn("rounded-xl border overflow-hidden transition-all", plexConnected ? "border-green-500/40" : expanded.has("plex") ? "border-primary/50" : "border-border")}>
          <button
            type="button"
            onClick={() => toggleExpanded("plex")}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
          >
            <ServiceLogo brand="plex" alt="" size={24} />
            <span className="flex-1 text-sm font-medium">Plex</span>
            {plexConnected && <Check className="h-4 w-4 text-green-500" />}
          </button>
          <AnimatedCollapse open={expanded.has("plex") && !plexConnected}>
            <div className="space-y-3 border-t border-border/40 px-4 py-3">
              <Input value={plexUrl} onChange={(e) => setPlexUrl(e.target.value)} placeholder="Server URL (e.g. http://192.168.1.100:32400)" className={inputCn} />
              <div className="flex rounded-xl bg-accent p-1">
                <button type="button" onClick={() => setPlexAuthMode("oauth")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", plexAuthMode === "oauth" ? "bg-background text-foreground" : "text-muted-foreground")}>
                  Sign in with Plex
                </button>
                <button type="button" onClick={() => setPlexAuthMode("token")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors", plexAuthMode === "token" ? "bg-background text-foreground" : "text-muted-foreground")}>
                  Manual Token
                </button>
              </div>
              {plexAuthMode === "oauth" ? (
                <Button
                  variant="outline"
                  onClick={handlePlexOAuth}
                  disabled={!plexUrl || plexPolling || createPlexPin.isPending}
                  className="w-full rounded-xl gap-2"
                >
                  {(plexPolling || createPlexPin.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <ServiceLogo brand="plex" alt="" size={16} />}
                  {plexPolling ? "Waiting for Plex..." : "Sign in with Plex"}
                </Button>
              ) : (
                <>
                  <Input value={plexToken} onChange={(e) => setPlexToken(e.target.value)} placeholder="X-Plex-Token" type="password" className={inputCn} />
                  <Button onClick={handlePlexToken} disabled={testing || !canSubmitPlex} className="w-full rounded-xl">
                    {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Connect Plex
                  </Button>
                </>
              )}
            </div>
          </AnimatedCollapse>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button onClick={onNext} size="lg" className={btnCn}>
          {anyConnected ? "Continue" : "Skip for now"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {anyConnected && <SkipButton onClick={onNext} />}
        {!anyConnected && <SkipButton onClick={onNext} />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Libraries                                                            */
/* -------------------------------------------------------------------------- */

const MEDIA_TYPES = [
  { key: "movies", label: "Movies", icon: Film },
  { key: "shows", label: "Shows", icon: Tv },
  { key: "animes", label: "Anime", icon: Star },
] as const;

function LibrariesStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set(["movies", "shows"]));
  const [libraryPaths, setLibraryPaths] = useState<Record<string, string>>({});
  const [downloadPaths, setDownloadPaths] = useState<Record<string, string>>({});

  const { data: libraries } = trpc.library.listLibraries.useQuery();
  const { data: enabledServices } = trpc.settings.getEnabledServices.useQuery();
  const seedLibraries = trpc.library.seed.useMutation();
  const updatePaths = trpc.library.updatePaths.useMutation();

  // Pre-fill paths and auto-select types from synced libraries
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!libraries || libraries.length === 0) return;
    const lp: Record<string, string> = {};
    const dp: Record<string, string> = {};
    const types = new Set<string>();
    for (const lib of libraries) {
      if (lib.libraryPath) lp[lib.type] = lib.libraryPath;
      if (lib.downloadPath) dp[lib.type] = lib.downloadPath;
      types.add(lib.type);
    }
    setLibraryPaths((prev) => ({ ...lp, ...prev }));
    setDownloadPaths((prev) => ({ ...dp, ...prev }));
    if (!initialized && types.size > 0) {
      setSelected(types);
      setInitialized(true);
    }
  }, [libraries, initialized]);

  const toggleType = (key: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async (): Promise<void> => {
    if (!libraries || libraries.length === 0) {
      await seedLibraries.mutateAsync();
    }
    const libs = libraries ?? (await seedLibraries.mutateAsync());
    for (const lib of libs) {
      if (!selected.has(lib.type)) continue;
      const lp = libraryPaths[lib.type];
      const dp = downloadPaths[lib.type];
      if (lp || dp) {
        await updatePaths.mutateAsync({
          id: lib.id,
          ...(lp ? { libraryPath: lp } : {}),
          ...(dp ? { downloadPath: dp } : {}),
        });
      }
    }
    toast.success("Libraries configured");
    onNext();
  };

  const hasServer = enabledServices?.jellyfin === true || enabledServices?.plex === true;

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Folder className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Your Libraries</h1>
        <p className="mx-auto max-w-lg text-base text-foreground/70 leading-relaxed">
          Pick the types of media you want to manage. For each one, tell Canto where your
          organized media lives (library path) and where your torrent client saves downloads.
          {hasServer && " We've pre-filled paths from your media server."}
        </p>
      </div>

      <div className="flex w-full max-w-md gap-3">
        {MEDIA_TYPES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleType(key)}
            className={cn(
              "flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 transition-all",
              selected.has(key) ? "border-primary/50 bg-primary/5" : "border-border hover:bg-accent/50",
            )}
          >
            <Icon className={cn("h-5 w-5", selected.has(key) ? "text-primary" : "text-muted-foreground/40")} />
            <span className={cn("text-sm font-medium", selected.has(key) ? "text-foreground" : "text-muted-foreground")}>{label}</span>
          </button>
        ))}
      </div>

      <div className="w-full max-w-md space-y-4 text-left">
        {MEDIA_TYPES.filter(({ key }) => selected.has(key)).map(({ key, label }) => {
          const matchingLibs = libraries?.filter((l) => l.type === key) ?? [];
          const servers: string[] = [];
          if (matchingLibs.some((l) => l.jellyfinLibraryId)) servers.push("Jellyfin");
          if (matchingLibs.some((l) => l.plexLibraryId)) servers.push("Plex");
          const sourceLabel = servers.length > 0 ? servers.join(" & ") : null;

          return (
            <div key={key} className="space-y-3 rounded-xl border border-border/60 p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{label}</span>
                {servers.map((s) => (
                  <span key={s} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{s}</span>
                ))}
              </div>
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Library path {sourceLabel && <span className="text-muted-foreground/50">from {sourceLabel}</span>}
                  </label>
                  <Input
                    value={libraryPaths[key] ?? ""}
                    onChange={(e) => setLibraryPaths((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`e.g. /media/${label.toLowerCase()}`}
                    className={cn(inputCn, "text-sm")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Download path</label>
                  <Input
                    value={downloadPaths[key] ?? ""}
                    onChange={(e) => setDownloadPaths((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`e.g. /downloads/${key}`}
                    className={cn(inputCn, "text-sm")}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button onClick={handleSave} disabled={selected.size === 0 || updatePaths.isPending} size="lg" className={btnCn}>
          {updatePaths.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <SkipButton onClick={onNext} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Ready                                                                */
/* -------------------------------------------------------------------------- */

function ReadyStep({ onFinish }: { onFinish: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
        <Check className="h-8 w-8 text-emerald-500" />
      </div>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">You're all set</h1>
        <p className="mx-auto max-w-lg text-base text-foreground/70 leading-relaxed">
          Canto is ready to go. Browse what's trending, search for something specific,
          or just start downloading. You can tweak all of this later in Settings.
        </p>
      </div>

      <div className="mx-auto grid w-full max-w-lg grid-cols-3 gap-3">
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">Discover</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">Browse trending movies and shows</p>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-4">
          <Download className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">Download</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">Search and grab torrents with one click</p>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-4">
          <Folder className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">Organize</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">Files auto-import into your library</p>
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
  const step = STEPS[currentStep]!;

  const { data: isCompleted, isLoading } = trpc.settings.isOnboardingCompleted.useQuery();
  const completeOnboarding = trpc.settings.completeOnboarding.useMutation();

  useEffect(() => {
    if (isCompleted === true) router.replace("/");
  }, [isCompleted, router]);

  const next = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  }, []);

  const back = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const finish = useCallback(async () => {
    await completeOnboarding.mutateAsync();
    router.replace("/");
  }, [completeOnboarding, router]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="flex w-full max-w-xl flex-col items-center justify-center" style={{ minHeight: 480 }}>
          <FadeIn key={step}>
            {step === "welcome" && <WelcomeStep onNext={next} />}
            {step === "tmdb" && <TmdbStep onNext={next} />}
            {step === "tvdb" && <TvdbStep onNext={next} />}
            {step === "download-client" && <DownloadClientStep onNext={next} />}
            {step === "indexer" && <IndexerStep onNext={next} />}
            {step === "media-server" && <MediaServerStep onNext={next} />}
            {step === "libraries" && <LibrariesStep onNext={next} />}
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
        <StepDots current={currentStep} total={STEPS.length} />
        <div className="w-9" />
      </div>
    </div>
  );
}
