export default function HistoryLoading(): React.JSX.Element {
  return (
    <div className="px-4 md:px-8 md:pb-12 lg:px-12 xl:px-16 2xl:px-24">
      <div className="mb-1 h-9 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="mb-8 h-5 w-72 animate-pulse rounded-lg bg-muted" />
      <div className="mb-4 flex gap-1 py-3">
        <div className="h-9 w-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-9 w-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-9 w-28 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="mb-4 flex gap-1.5">
        <div className="h-7 w-14 animate-pulse rounded-xl bg-muted" />
        <div className="h-7 w-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-7 w-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-7 w-18 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-[120px] animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>
    </div>
  );
}
