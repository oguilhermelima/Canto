"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Switch } from "@canto/ui/switch";
import {
  Loader2,
  Film,
  Tv,
  Star,
  Check,
  ArrowRight,
  ArrowLeft,
  Download,
  Search,
  Server,
  Folder,
  Rocket,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { trpc } from "~/lib/trpc/client";
import { authClient } from "~/lib/auth-client";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type Step = "welcome" | "tmdb" | "download-client" | "indexer" | "media-server" | "libraries" | "ready";

const STEPS: Step[] = ["welcome", "tmdb", "download-client", "indexer", "media-server", "libraries", "ready"];

/* -------------------------------------------------------------------------- */
/*  Step indicator dots                                                        */
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
/*  Step: Welcome                                                              */
/* -------------------------------------------------------------------------- */

function WelcomeStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Rocket className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to Canto</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground leading-relaxed">
          Let's set up your media server in a few steps. You'll connect your services,
          configure your libraries, and be ready to start downloading.
        </p>
      </div>
      <Button onClick={onNext} size="lg" className="mt-4 min-w-[200px]">
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
    onSuccess: () => {
      toast.success("TMDB connected");
      onNext();
    },
    onError: () => toast.error("Failed to save TMDB key"),
  });

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">TMDB API Key</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground leading-relaxed">
          Canto uses TMDB for all movie and TV show metadata. Get a free API key at{" "}
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            themoviedb.org
          </a>.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your TMDB API key (v3 auth)"
          type="password"
        />
      </div>

      <Button
        onClick={() => setSetting.mutate({ key: "tmdb.apiKey", value: apiKey })}
        disabled={!apiKey || setSetting.isPending}
        size="lg"
        className="min-w-[200px]"
      >
        {setSetting.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continue
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
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
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Download className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Download Client</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground leading-relaxed">
          Connect your torrent client. Canto will send downloads and manage imports automatically.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="WebUI URL (e.g. http://localhost:8080)" />
        <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
        <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
      </div>

      <Button
        onClick={handleSave}
        disabled={!url || testing}
        size="lg"
        className="min-w-[200px]"
      >
        {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Connect & continue
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Indexer (Prowlarr)                                                   */
/* -------------------------------------------------------------------------- */

function IndexerStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);

  const setMany = trpc.settings.setMany.useMutation();
  const testService = trpc.settings.testService.useMutation();

  const handleSave = async (): Promise<void> => {
    setTesting(true);
    try {
      await setMany.mutateAsync({
        settings: [
          { key: "prowlarr.url", value: url },
          { key: "prowlarr.apiKey", value: apiKey },
          { key: "prowlarr.enabled", value: true },
        ],
      });
      const result = await testService.mutateAsync({
        service: "prowlarr",
        values: { "prowlarr.url": url, "prowlarr.apiKey": apiKey },
      });
      if (result.connected) {
        toast.success("Prowlarr connected");
        onNext();
      } else {
        toast.error("Connection failed. Check your URL and API key.");
      }
    } catch {
      toast.error("Failed to connect to Prowlarr");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Search className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Indexer</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground leading-relaxed">
          Connect Prowlarr to search across your trackers. Find the API key in Prowlarr under Settings &gt; General.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Prowlarr URL (e.g. http://localhost:9696)" />
        <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" type="password" />
      </div>

      <Button
        onClick={handleSave}
        disabled={!url || !apiKey || testing}
        size="lg"
        className="min-w-[200px]"
      >
        {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Connect & continue
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step: Media Server (Jellyfin/Plex) — Optional                              */
/* -------------------------------------------------------------------------- */

function MediaServerStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const [choice, setChoice] = useState<"jellyfin" | "plex" | null>(null);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);

  const setMany = trpc.settings.setMany.useMutation();
  const testService = trpc.settings.testService.useMutation();

  const handleSave = async (): Promise<void> => {
    if (!choice) { onNext(); return; }
    setTesting(true);
    try {
      const settings = choice === "jellyfin"
        ? [
            { key: "jellyfin.url", value: url },
            { key: "jellyfin.apiKey", value: apiKey },
            { key: "jellyfin.enabled", value: true },
          ]
        : [
            { key: "plex.url", value: url },
            { key: "plex.token", value: apiKey },
            { key: "plex.enabled", value: true },
          ];
      await setMany.mutateAsync({ settings });
      const values: Record<string, string> = choice === "jellyfin"
        ? { "jellyfin.url": url, "jellyfin.apiKey": apiKey }
        : { "plex.url": url, "plex.token": apiKey };
      const result = await testService.mutateAsync({ service: choice, values });
      if (result.connected) {
        toast.success(`${choice === "jellyfin" ? "Jellyfin" : "Plex"} connected`);
        onNext();
      } else {
        toast.error("Connection failed. Check your credentials.");
      }
    } catch {
      toast.error("Failed to connect");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Server className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Media Server</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground leading-relaxed">
          Connect Jellyfin or Plex to auto-detect library paths and sync your existing media. This is optional.
        </p>
      </div>

      <div className="flex w-full max-w-sm gap-3">
        <button
          type="button"
          onClick={() => setChoice(choice === "jellyfin" ? null : "jellyfin")}
          className={cn(
            "flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 transition-all",
            choice === "jellyfin" ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/20",
          )}
        >
          <span className="text-sm font-medium">Jellyfin</span>
        </button>
        <button
          type="button"
          onClick={() => setChoice(choice === "plex" ? null : "plex")}
          className={cn(
            "flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 transition-all",
            choice === "plex" ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/20",
          )}
        >
          <span className="text-sm font-medium">Plex</span>
        </button>
      </div>

      {choice && (
        <div className="w-full max-w-sm space-y-3">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`${choice === "jellyfin" ? "Jellyfin" : "Plex"} URL (e.g. http://192.168.1.100:${choice === "jellyfin" ? "8096" : "32400"})`} />
          <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={choice === "jellyfin" ? "API Key" : "X-Plex-Token"} type="password" />
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={testing || (choice !== null && (!url || !apiKey))}
          size="lg"
          className="min-w-[200px]"
        >
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {choice ? "Connect & continue" : "Skip for now"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {choice && (
          <button type="button" onClick={() => { setChoice(null); }} className="text-xs text-muted-foreground hover:text-foreground">
            Skip this step
          </button>
        )}
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

  // Pre-fill from detected Jellyfin/Plex libraries
  useEffect(() => {
    if (!libraries) return;
    const lp: Record<string, string> = {};
    const dp: Record<string, string> = {};
    for (const lib of libraries) {
      if (lib.libraryPath) lp[lib.type] = lib.libraryPath;
      if (lib.downloadPath) dp[lib.type] = lib.downloadPath;
    }
    setLibraryPaths((prev) => ({ ...lp, ...prev }));
    setDownloadPaths((prev) => ({ ...dp, ...prev }));
  }, [libraries]);

  const toggleType = (key: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async (): Promise<void> => {
    // Seed default libraries if none exist
    if (!libraries || libraries.length === 0) {
      await seedLibraries.mutateAsync();
    }

    // Update paths for each selected type
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

  const jellyfinConnected = enabledServices?.jellyfin === true;
  const plexConnected = enabledServices?.plex === true;
  const hasServer = jellyfinConnected || plexConnected;

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Folder className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Your Libraries</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground leading-relaxed">
          Choose what types of media you want to manage, then set where the files live.
          {hasServer && " Paths from your media server are pre-filled."}
        </p>
      </div>

      {/* Media type selection */}
      <div className="flex w-full max-w-md gap-3">
        {MEDIA_TYPES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleType(key)}
            className={cn(
              "flex flex-1 flex-col items-center gap-2 rounded-xl border p-4 transition-all",
              selected.has(key) ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/20",
            )}
          >
            <Icon className={cn("h-5 w-5", selected.has(key) ? "text-primary" : "text-muted-foreground/40")} />
            <span className={cn("text-sm font-medium", selected.has(key) ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Path config per selected type */}
      <div className="w-full max-w-md space-y-4 text-left">
        {MEDIA_TYPES.filter(({ key }) => selected.has(key)).map(({ key, label }) => {
          const detectedLib = libraries?.find((l) => l.type === key);
          const serverName = detectedLib?.jellyfinLibraryId ? "Jellyfin" : detectedLib?.plexLibraryId ? "Plex" : null;

          return (
            <div key={key} className="space-y-2 rounded-xl border border-border/60 p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{label}</span>
                {serverName && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {serverName}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Library path {serverName && <span className="text-muted-foreground/50">from {serverName}</span>}
                  </label>
                  <Input
                    value={libraryPaths[key] ?? ""}
                    onChange={(e) => setLibraryPaths((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`e.g. /media/${label.toLowerCase()}`}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Download path</label>
                  <Input
                    value={downloadPaths[key] ?? ""}
                    onChange={(e) => setDownloadPaths((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`e.g. /downloads/${key}`}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button onClick={handleSave} disabled={selected.size === 0 || updatePaths.isPending} size="lg" className="min-w-[200px]">
        {updatePaths.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continue
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
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
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">You're all set</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground leading-relaxed">
          Everything is configured. You can always change these settings later. Start exploring and downloading media.
        </p>
      </div>

      <div className="mx-auto grid w-full max-w-lg grid-cols-3 gap-3">
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">Discover</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">Browse trending movies and shows</p>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-4">
          <Download className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">Download</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">Search and grab torrents with one click</p>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-4">
          <Folder className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">Organize</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">Files auto-import into your library</p>
        </div>
      </div>

      <Button onClick={onFinish} size="lg" className="mt-4 min-w-[200px]">
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

  // Redirect if already completed
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
      {/* Content area — centered */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-xl">
          {step === "welcome" && <WelcomeStep onNext={next} />}
          {step === "tmdb" && <TmdbStep onNext={next} />}
          {step === "download-client" && <DownloadClientStep onNext={next} />}
          {step === "indexer" && <IndexerStep onNext={next} />}
          {step === "media-server" && <MediaServerStep onNext={next} />}
          {step === "libraries" && <LibrariesStep onNext={next} />}
          {step === "ready" && <ReadyStep onFinish={finish} />}
        </div>
      </div>

      {/* Footer — step dots + back button */}
      <div className="flex items-center justify-between px-8 py-6">
        <div>
          {currentStep > 0 && step !== "ready" && (
            <button type="button" onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
        </div>
        <StepDots current={currentStep} total={STEPS.length} />
        <div className="w-16" /> {/* Spacer for centering */}
      </div>
    </div>
  );
}
