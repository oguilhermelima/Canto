"use client";

import { TabBar } from "@canto/ui/tab-bar";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "downloading", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
] as const;

export type TorrentStatusFilter = (typeof STATUS_TABS)[number]["value"];

export interface TorrentStatusCounts {
  all: number;
  downloading: number;
  completed: number;
  paused: number;
}

interface TorrentTabsProps {
  value: string;
  onChange: (value: string) => void;
  counts: TorrentStatusCounts;
}

export function TorrentTabs({
  value,
  onChange,
  counts,
}: TorrentTabsProps): React.JSX.Element {
  return (
    <TabBar
      tabs={STATUS_TABS.map(({ value: v, label }) => ({
        value: v,
        label,
        count: counts[v as keyof TorrentStatusCounts],
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
