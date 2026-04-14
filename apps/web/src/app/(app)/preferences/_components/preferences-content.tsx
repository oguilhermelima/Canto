"use client";

import { ProfileSection } from "./profile-section";
import { PasswordSection } from "./password-section";
import { AppearanceSection } from "./appearance-section";
import { PreferencesSection } from "./preferences-section";
import { ConnectionsSection } from "./connections-section";
import { HomeSectionsEditor } from "./home-sections-editor";
import { ProfileSectionsEditor } from "./profile-sections-editor";
import { HiddenSection } from "./hidden-section";

const SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  profile: ProfileSection,
  password: PasswordSection,
  appearance: AppearanceSection,
  "content-region": PreferencesSection,
  connections: ConnectionsSection,
  "home-sections": HomeSectionsEditor,
  "profile-sections": ProfileSectionsEditor,
  hidden: HiddenSection,
};

export function PreferencesContent({ section }: { section: string }): React.JSX.Element | null {
  const Component = SECTION_COMPONENTS[section];
  if (!Component) return null;
  return <Component />;
}
