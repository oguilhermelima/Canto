"use client";

import { useState, useEffect } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Switch } from "@canto/ui/switch";
import { Save, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "~/lib/auth-client";
import { trpc } from "~/lib/trpc/client";
import { SettingsSection } from "~/components/settings/shared";
import { AvatarPickerDialog } from "../../profile/me/_components/avatar-picker-dialog";

export function ProfileSection(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: prefs } = trpc.auth.getUserPreferences.useQuery();
  const setPrefs = trpc.auth.setUserPreferences.useMutation({
    onSuccess: () => void utils.auth.getUserPreferences.invalidate(),
  });

  const handleTogglePublic = (checked: boolean): void => {
    setPrefs.mutate(
      { isPublic: checked },
      {
        onSuccess: () => toast.success(checked ? "Profile set to public" : "Profile set to private"),
        onError: () => toast.error("Failed to update profile visibility"),
      },
    );
  };

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
    }
  }, [user]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await authClient.updateUser({ name, image: user?.image });
      if (email !== user?.email) {
        await authClient.changeEmail({ newEmail: email });
      }
      setDirty(false);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title="Profile" description="Your account information and display name.">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full"
            onClick={() => setPickerOpen(true)}
          >
            {user?.image ? (
              <img
                src={user.image}
                alt={user.name ?? ""}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                {user?.name?.charAt(0).toUpperCase() ?? "?"}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </div>
          </button>
          <div>
            <p className="text-sm font-medium text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="account-name" className="text-sm font-medium text-muted-foreground">
              Name
            </label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              variant="ghost"
              className="text-sm focus-visible:ring-1 focus-visible:ring-border"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="account-email" className="text-sm font-medium text-muted-foreground">
              Email
            </label>
            <Input
              id="account-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setDirty(true);
              }}
              variant="ghost"
              className="text-sm focus-visible:ring-1 focus-visible:ring-border"
            />
          </div>
        </div>

        {dirty && (
          <Button size="sm" className="rounded-xl" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save changes
          </Button>
        )}

        <div className="h-px bg-border/40" />

        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-foreground">Public Profile</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              When enabled, other users can see your profile, ratings, and public collections.
              New collections will default to your profile visibility.
            </p>
          </div>
          <Switch
            checked={prefs?.isPublic ?? false}
            onCheckedChange={handleTogglePublic}
            disabled={setPrefs.isPending}
            className="mt-0.5 shrink-0"
          />
        </div>
      </div>

      <AvatarPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentImage={user?.image}
      />
    </SettingsSection>
  );
}
