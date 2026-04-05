"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Switch } from "@canto/ui/switch";
import { Skeleton } from "@canto/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { Monitor, Sun, Moon, Save, Check, Loader2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { toast } from "sonner";
import { authClient } from "~/lib/auth-client";
import { trpc } from "~/lib/trpc/client";
import { useWatchRegion } from "~/hooks/use-watch-region";
import { useDirectSearch } from "~/hooks/use-direct-search";
import { PageHeader } from "~/components/layout/page-header";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const themeOptions = [
  { value: "light", label: "Light", description: "Clean and bright interface", icon: Sun },
  { value: "dark", label: "Dark", description: "Easy on the eyes", icon: Moon },
  { value: "system", label: "System", description: "Follow your OS setting", icon: Monitor },
] as const;

/* -------------------------------------------------------------------------- */
/*  Section wrapper                                                            */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-border/40 bg-background">
      <div className="border-b border-border/40 px-6 py-5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="px-6 py-6">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Profile section                                                            */
/* -------------------------------------------------------------------------- */

function ProfileSection(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
    }
  }, [user]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await authClient.updateUser({ name, image: user?.image });
      if (email !== user?.email) {
        await authClient.changeEmail({ newEmail: email });
      }
      setDirty(false);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Profile" description="Your account information and display name.">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {user?.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="account-name" className="text-sm font-medium text-muted-foreground">
              Name
            </label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              className="h-10 rounded-xl border-none bg-accent text-sm focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="account-email" className="text-sm font-medium text-muted-foreground">
              Email
            </label>
            <Input
              id="account-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setDirty(true);
              }}
              className="h-10 rounded-xl border-none bg-accent text-sm focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {dirty && (
          <Button size="sm" className="rounded-xl" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save changes
          </Button>
        )}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Password section                                                           */
/* -------------------------------------------------------------------------- */

function PasswordSection(): React.JSX.Element {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = async (): Promise<void> => {
    if (!currentPassword || !newPassword) return;
    setSaving(true);
    try {
      await authClient.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password changed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Password" description="Update your account password to keep it secure.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="account-current-password" className="text-sm font-medium text-muted-foreground">
            Current password
          </label>
          <Input
            id="account-current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            className="h-10 rounded-xl border-none bg-accent text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="account-new-password" className="text-sm font-medium text-muted-foreground">
            New password
          </label>
          <Input
            id="account-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            className="h-10 rounded-xl border-none bg-accent text-sm placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0"
          />
        </div>
      </div>
      <div className="mt-4">
        <Button
          size="sm"
          className="rounded-xl"
          onClick={handleChange}
          disabled={saving || !currentPassword || !newPassword}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Change password
        </Button>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Appearance section                                                         */
/* -------------------------------------------------------------------------- */

function AppearanceSection(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Section title="Appearance" description="Choose a theme for the interface.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {themeOptions.map(({ value, label, description: desc, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-col items-center gap-2.5 rounded-xl border p-5 transition-all",
              mounted && theme === value
                ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/20"
                : "border-border/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            <div className="text-center">
              <span className="block text-sm font-medium">{label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
            </div>
          </button>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preferences section                                                        */
/* -------------------------------------------------------------------------- */

function PreferencesSection(): React.JSX.Element {
  const utils = trpc.useUtils();
  const { data: allSettings } = trpc.settings.getAll.useQuery();
  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => void utils.settings.getAll.invalidate(),
  });

  /* Language */
  const { data: currentLanguage } = trpc.settings.getUserLanguage.useQuery();
  const { data: supportedLanguages } = trpc.settings.getSupportedLanguages.useQuery();
  const setUserLanguage = trpc.settings.setUserLanguage.useMutation({
    onSuccess: () => void utils.settings.getUserLanguage.invalidate(),
  });
  const refreshLanguage = trpc.settings.refreshLanguage.useMutation();

  const handleLanguageChange = (value: string): void => {
    setUserLanguage.mutate(
      { language: value },
      {
        onSuccess: () => {
          setMany.mutate({ "general.language": value });
          toast.success("Language updated. Refreshing all metadata in background...");
          refreshLanguage.mutate();
        },
        onError: () => toast.error("Failed to update language"),
      },
    );
  };

  /* Watch region */
  const { region, setRegion } = useWatchRegion();
  const [regionSaved, setRegionSaved] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);
  const displayRegion = pendingRegion ?? region;

  const { data: regionsRaw, isLoading: regionsLoading } = trpc.provider.filterOptions.useQuery({ type: "regions" });
  const regions = regionsRaw as Array<{ code: string; englishName: string; nativeName: string }> | undefined;
  const { data: wpRaw, isLoading: providersLoading } = trpc.provider.filterOptions.useQuery(
    { type: "watchProviders", mediaType: "movie", region: displayRegion },
    { enabled: !!displayRegion },
  );
  const watchProviders = wpRaw as
    | Array<{ providerId: number; providerName: string; logoPath: string; displayPriority: number }>
    | undefined;

  const handleSaveRegion = (): void => {
    setRegion(pendingRegion ?? region);
    setPendingRegion(null);
    setRegionSaved(true);
    setTimeout(() => setRegionSaved(false), 2000);
  };
  const hasRegionChange = pendingRegion !== null && pendingRegion !== region;

  /* Direct search */
  const { enabled: directSearchEnabled, setEnabled: setDirectSearch } = useDirectSearch();

  return (
    <Section title="Preferences" description="Language, streaming region, and playback behavior.">
      <div className="space-y-8">
        {/* Language */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Language</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Language used for metadata, titles, descriptions, and trailers.
            </p>
          </div>
          <Select value={currentLanguage ?? "en-US"} onValueChange={handleLanguageChange}>
            <SelectTrigger className="h-10 w-60 rounded-xl border-none bg-accent text-sm focus:ring-1 focus:ring-border">
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
        </div>

        <div className="h-px bg-border/40" />

        {/* Watch region */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground">Watch Region</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Determines which streaming providers appear on media pages.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {regionsLoading ? (
              <Skeleton className="h-10 w-60" />
            ) : (
              <Select value={displayRegion} onValueChange={(v) => setPendingRegion(v)}>
                <SelectTrigger className="h-10 w-60 rounded-xl border-none bg-accent text-sm focus:ring-1 focus:ring-border">
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
              className="rounded-xl"
              onClick={handleSaveRegion}
              disabled={!hasRegionChange && !regionSaved}
            >
              {regionSaved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
              {regionSaved ? "Saved" : "Save"}
            </Button>
          </div>

          {displayRegion && (
            <div>
              <p className="mb-3 text-xs text-muted-foreground">Available streaming services</p>
              {providersLoading ? (
                <div className="flex flex-wrap gap-2.5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-11 rounded-xl" />
                  ))}
                </div>
              ) : watchProviders && watchProviders.length > 0 ? (
                <div className="flex flex-wrap gap-2.5">
                  {watchProviders.slice(0, 30).map((p) => (
                    <img
                      key={p.providerId}
                      src={`${TMDB_IMAGE_BASE}/w92${p.logoPath}`}
                      alt={p.providerName}
                      title={p.providerName}
                      className="h-11 w-11 rounded-xl border border-border/60 object-cover"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No providers found.</p>
              )}
            </div>
          )}
        </div>

        <div className="h-px bg-border/40" />

        {/* Direct search toggle */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-foreground">Direct Search on Streaming Apps</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              When enabled, clicking a streaming provider logo opens a direct search on that
              service. When disabled, it opens the TMDB watch page instead.
            </p>
          </div>
          <Switch
            checked={directSearchEnabled}
            onCheckedChange={setDirectSearch}
            className="mt-0.5 shrink-0"
          />
        </div>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                  */
/* -------------------------------------------------------------------------- */

export default function AccountPage(): React.JSX.Element {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    document.title = "Account — Canto";
  }, []);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  if (isPending || !session) {
    return <div />;
  }

  return (
    <div className="w-full">
      <PageHeader title="Account" subtitle="Manage your profile, appearance, and preferences" />

      <div className="space-y-6 px-4 pb-12 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <ProfileSection />
        <PasswordSection />
        <AppearanceSection />
        <PreferencesSection />
      </div>
    </div>
  );
}
