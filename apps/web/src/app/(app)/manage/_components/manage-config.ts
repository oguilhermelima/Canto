import {
  Activity,
  Users,
  Database,
  Search,
  HardDrive,
  MonitorPlay,
  Link2,
  FolderSearch,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ManageSectionItem {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface ManageSectionGroup {
  groupLabel: string;
  items: ManageSectionItem[];
}

export const MANAGE_SECTIONS: ManageSectionGroup[] = [
  {
    groupLabel: "Overview",
    items: [
      { key: "status", label: "Status", icon: Activity, description: "Library stats, downloads, and services" },
      { key: "users", label: "Users", icon: Users, description: "Manage user access and roles" },
    ],
  },
  {
    groupLabel: "Services",
    items: [
      { key: "metadata", label: "Metadata", icon: Database, description: "TMDB & TVDB provider configuration" },
      { key: "search", label: "Indexers", icon: Search, description: "Torrent search aggregators" },
      { key: "media-servers", label: "Media Servers", icon: MonitorPlay, description: "Plex & Jellyfin connections" },
      { key: "trakt", label: "Trakt", icon: Link2, description: "OAuth app credentials for Trakt integration" },
    ],
  },
  {
    groupLabel: "Storage",
    items: [
      { key: "downloads", label: "Libraries", icon: HardDrive, description: "Download client, folders, and seeding" },
      { key: "manual-scan", label: "Manual Scan", icon: FolderSearch, description: "Detect and match existing media" },
      { key: "about", label: "About", icon: Info, description: "Version and instance information" },
    ],
  },
];

export const ALL_MANAGE_KEYS = MANAGE_SECTIONS.flatMap((g) => g.items.map((i) => i.key));
export const DEFAULT_MANAGE_SECTION = "status";
