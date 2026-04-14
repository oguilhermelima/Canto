"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Switch } from "@canto/ui/switch";
import { Save, Camera, Loader2, Upload, ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "~/lib/auth-client";
import { trpc } from "~/lib/trpc/client";
import { SettingsSection } from "~/components/settings/shared";
import { AvatarPickerDialog } from "../../profile/me/_components/avatar-picker-dialog";

const MAX_HEADER_SIZE = 4 * 1024 * 1024; // 4MB

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
  const { data: profile } = trpc.auth.getProfile.useQuery();
  const setPrefs = trpc.auth.setUserPreferences.useMutation({
    onSuccess: () => void utils.auth.getUserPreferences.invalidate(),
  });

  // Bio & header image state
  const [bio, setBio] = useState("");
  const [headerPreview, setHeaderPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      setProfileDirty(false);
      void utils.auth.getProfile.invalidate();
    },
    onError: () => toast.error("Failed to save profile"),
  });

  // Sync profile data
  useEffect(() => {
    if (profile) {
      setBio(profile.bio ?? "");
      setHeaderPreview(profile.headerImage ?? null);
    }
  }, [profile]);

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
      setName(user.name);
      setEmail(user.email);
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

  const handleHeaderUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_HEADER_SIZE) {
      toast.error("File too large. Maximum size is 4MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/header", { method: "POST", body: formData });
      const data = await res.json() as { url?: string; error?: string };

      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }

      setHeaderPreview(data.url ?? null);
      setProfileDirty(true);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = (): void => {
    saveProfileMutation.mutate({
      bio: bio.trim() || null,
      headerImage: headerPreview,
    });
  };

  return (
    <>
      <SettingsSection title="Profile" description="Your account information and display name.">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full"
              onClick={() => setPickerOpen(true)}
            >
              {user?.image ? (
                <Image
                  src={user.image}
                  alt={user.name}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  {user?.name.charAt(0).toUpperCase()}
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

      <SettingsSection title="Cover & Bio" description="Customize your profile header image and bio.">
        <div className="space-y-6">
          {/* Header image */}
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Header Image</label>
            {headerPreview ? (
              <div className="relative aspect-[3/1] overflow-hidden rounded-xl bg-muted">
                <Image src={headerPreview} alt="Header" fill className="object-cover" unoptimized />
                <button
                  type="button"
                  onClick={() => { setHeaderPreview(null); setProfileDirty(true); }}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex aspect-[3/1] w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted/50"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-xs">Click to upload</span>
                  </div>
                )}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleHeaderUpload} />
            {headerPreview && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Change image
              </button>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => { setBio(e.target.value); setProfileDirty(true); }}
              placeholder="Tell people about yourself..."
              maxLength={500}
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/500</p>
          </div>

          {profileDirty && (
            <Button size="sm" className="rounded-xl" onClick={handleSaveProfile} disabled={saveProfileMutation.isPending}>
              {saveProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          )}
        </div>
      </SettingsSection>
    </>
  );
}
