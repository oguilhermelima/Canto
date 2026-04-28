export default function CollectionsLoading(): React.JSX.Element {
  return (
    <div className="px-4 md:px-8 md:pb-12 lg:px-12 xl:px-16 2xl:px-24">
      <div className="mb-1 h-9 w-32 animate-pulse rounded-lg bg-muted" />
      <div className="mb-8 h-5 w-72 animate-pulse rounded-lg bg-muted" />
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-[108px] animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>
    </div>
  );
}
