import {
  User,
  Lock,
  Palette,
  Globe,
  Cable,
  LayoutDashboard,
  UserCircle,
  EyeOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface PreferencesSectionItem {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface PreferencesSectionGroup {
  groupLabel: string;
  items: PreferencesSectionItem[];
}

export const PREFERENCES_SECTIONS: PreferencesSectionGroup[] = [
  {
    groupLabel: "Account",
    items: [
      { key: "profile", label: "Profile", icon: User, description: "Name, avatar, cover image & bio" },
      { key: "password", label: "Password", icon: Lock, description: "Update your account password" },
    ],
  },
  {
    groupLabel: "Preferences",
    items: [
      { key: "appearance", label: "Appearance", icon: Palette, description: "Theme and display" },
      { key: "content-region", label: "Content & Region", icon: Globe, description: "Language, streaming region, search" },
      { key: "connections", label: "Connections", icon: Cable, description: "Plex & Jellyfin accounts" },
    ],
  },
  {
    groupLabel: "Customize",
    items: [
      { key: "home-sections", label: "Home Sections", icon: LayoutDashboard, description: "Reorder your homepage" },
      { key: "profile-sections", label: "Profile Sections", icon: UserCircle, description: "Your public profile layout" },
      { key: "hidden", label: "Hidden Media", icon: EyeOff, description: "Manage hidden items" },
    ],
  },
];

export const ALL_SECTION_KEYS = PREFERENCES_SECTIONS.flatMap((g) => g.items.map((i) => i.key));
export const DEFAULT_SECTION = "profile";
