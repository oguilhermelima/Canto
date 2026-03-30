export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {children}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="grid gap-4 border-t border-border/40 py-8 first:border-t-0 first:pt-2 md:grid-cols-[280px_1fr] md:gap-12">
      <div className="shrink-0">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}
