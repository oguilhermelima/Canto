import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { SettingsSection } from "~/components/settings/shared";

const LINKS = [
  { href: "https://github.com/oguilhermelima/canto", name: "GitHub", desc: "Source code and issue tracker" },
  { href: "https://www.themoviedb.org/", name: "TMDB", desc: "Movie and TV show metadata" },
  { href: "https://jellyfin.org/", name: "Jellyfin", desc: "Free software media system" },
] as const;

export function AboutSection(): React.JSX.Element {
  return (
    <div>
      <SettingsSection title="About" description="Instance information and resources.">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <Image src="/canto.svg" alt="Canto" width={48} height={48} className="h-12 w-12 dark:invert" />
            <div>
              <p className="font-semibold text-foreground">Canto</p>
              <p className="text-sm text-muted-foreground">Version 0.1.0</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Next.js + tRPC + Drizzle + PostgreSQL</p>
            </div>
          </div>
        </div>

        <div className="mt-4 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
          {LINKS.map((link) => (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-muted/20"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{link.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{link.desc}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
