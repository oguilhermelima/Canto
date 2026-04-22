"use client";

import { MetadataProvidersSection } from "@/components/settings/services-section";
import { AboutSection } from "@/components/settings/about-section";
import { StatusTab } from "@/components/management/status-tab";
import { UsersTab } from "@/components/management/users-tab";
import { MediaServersSection } from "./media-servers-section";
import { DownloadsSection } from "./downloads-section";
import { SearchTabSection } from "./search-tab-section";
import { ManualScanSection } from "./manual-scan-section";
import { TraktSection } from "./trakt-section";

const SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  status: StatusTab,
  users: UsersTab,
  metadata: MetadataProvidersSection,
  search: SearchTabSection,
  "media-servers": MediaServersSection,
  trakt: TraktSection,
  downloads: DownloadsSection,
  "manual-scan": ManualScanSection,
  about: AboutSection,
};

export function ManageContent({ section }: { section: string }): React.JSX.Element | null {
  const Component = SECTION_COMPONENTS[section];
  if (!Component) return null;
  return <Component />;
}
