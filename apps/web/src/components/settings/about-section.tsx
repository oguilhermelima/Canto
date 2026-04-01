import { ExternalLink } from "lucide-react";
import { SettingsSection } from "~/components/settings/shared";

export function AboutSection(): React.JSX.Element {
  return (
    <div>
      <SettingsSection title="Application" description="Details about this Canto instance.">
        <div className="space-y-2.5">
          {[["Version", "0.1.0"], ["Stack", "Next.js + tRPC + Drizzle"], ["Metadata", "TMDB + AniList"]].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-xl bg-muted/20 px-3.5 py-2.5 text-sm">
              <span className="text-muted-foreground text-xs">{label}</span>
              <span className="text-xs text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Links" description="External resources and documentation.">
        <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card overflow-hidden">
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
      </SettingsSection>
    </div>
  );
}
