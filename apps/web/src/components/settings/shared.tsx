export function SectionCard({
  title: _title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {children}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
  variant = "stacked",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  variant?: "stacked" | "grid";
}): React.JSX.Element {
  if (variant === "grid") {
    return (
      <div className="grid border-t border-border py-4 first:border-t-0 first:pt-0 md:grid-cols-[280px_1fr] md:gap-12 md:py-10">
        <div className="mb-2 shrink-0 md:mb-0">
          <h3 className="text-sm font-semibold text-foreground md:text-base">{title}</h3>
          {description && (
            <p className="hidden text-sm text-muted-foreground md:mt-1 md:block md:leading-relaxed">{description}</p>
          )}
        </div>
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    );
  }

  return (
    <div className="group/section border-t border-border py-6 first:border-t-0 first:pt-0">
      <div className="mb-4 group-first/section:hidden md:block">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}
