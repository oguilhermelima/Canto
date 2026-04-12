export function StepHeader({
  title,
  description,
}: {
  title: string;
  description?: React.ReactNode;
  onBack?: () => void;
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      {description && (
        <p className="mx-auto max-w-2xl text-base text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
