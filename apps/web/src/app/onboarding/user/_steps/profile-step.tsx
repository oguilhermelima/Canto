"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Upload, ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@canto/ui/cn";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc/client";
import { fileToBase64 } from "@/lib/file-to-base64";
import type { ConfigureFooter } from "../../_components/onboarding-footer";
import { StepHeader } from "../../_components/step-header";

const DEFAULT_AVATARS = [
  { name: "Bear", src: "/avatars/bear.svg" },
  { name: "Bear 2", src: "/avatars/bear2.svg" },
  { name: "Bunny", src: "/avatars/bunny.svg" },
  { name: "Dog", src: "/avatars/dog.svg" },
  { name: "Dog 2", src: "/avatars/dog2.svg" },
  { name: "Dog 3", src: "/avatars/dog3.svg" },
  { name: "Lion", src: "/avatars/lion.svg" },
  { name: "Pug", src: "/avatars/pug.svg" },
  { name: "Raccoon", src: "/avatars/raccoon.svg" },
];

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_HEADER_SIZE = 4 * 1024 * 1024;

export function ProfileStep({
  onNext,
  configureFooter,
}: {
  onNext: () => void;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const { data: profile } = trpc.auth.getProfile.useQuery();
  const utils = trpc.useUtils();

  const [image, setImage] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);

  const avatarFileRef = useRef<HTMLInputElement>(null);
  const headerFileRef = useRef<HTMLInputElement>(null);

  const updateProfile = trpc.auth.updateProfile.useMutation();

  useEffect(() => {
    if (initialized) return;
    if (session?.user) {
      setImage(session.user.image ?? null);
      setInitialized(true);
    }
  }, [session, initialized]);

  useEffect(() => {
    if (profile) {
      setBio(profile.bio ?? "");
      setHeaderImage(profile.headerImage ?? null);
    }
  }, [profile]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const tasks: Promise<unknown>[] = [];
      if (image && image !== (session?.user?.image ?? null)) {
        tasks.push(authClient.updateUser({ image }));
      }
      const profileChanged =
        (bio.trim() || null) !== (profile?.bio ?? null)
        || headerImage !== (profile?.headerImage ?? null);
      if (profileChanged) {
        tasks.push(
          updateProfile.mutateAsync({
            bio: bio.trim() || null,
            headerImage,
          }),
        );
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
        await utils.auth.getProfile.invalidate();
      }
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error("Avatar must be under 2MB");
      return;
    }
    setUploadingAvatar(true);
    try {
      setImage(await fileToBase64(file));
    } catch {
      toast.error("Failed to read image");
    } finally {
      setUploadingAvatar(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  };

  const handleHeaderUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_HEADER_SIZE) {
      toast.error("Header image must be under 4MB");
      return;
    }
    setUploadingHeader(true);
    try {
      setHeaderImage(await fileToBase64(file));
    } catch {
      toast.error("Failed to read image");
    } finally {
      setUploadingHeader(false);
      if (headerFileRef.current) headerFileRef.current.value = "";
    }
  };

  useEffect(() => {
    configureFooter({
      onPrimary: () => void handleSave(),
      primaryLabel: "Save & continue",
      primaryDisabled: saving,
      primaryLoading: saving || uploadingAvatar || uploadingHeader,
      onSkip: onNext,
    });
  }, [saving, uploadingAvatar, uploadingHeader, image, bio, headerImage, profile, session]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-10 text-center pt-16 md:pt-0 w-full">
      <StepHeader
        title="Conclua o seu perfil"
        description="Escolha um avatar, uma capa e conte um pouco sobre você. Tudo opcional — você pode mudar depois."
      />

      {/* Avatar grid */}
      <div className="w-full max-w-md space-y-3">
        <p className="text-left text-sm font-medium text-foreground">Avatar</p>
        <div className="grid grid-cols-3 gap-3">
          {DEFAULT_AVATARS.map((avatar) => (
            <button
              key={avatar.src}
              type="button"
              onClick={() => setImage(avatar.src)}
              className={cn(
                "group relative flex items-center justify-center overflow-hidden rounded-xl border-2 p-2 transition-all hover:border-foreground hover:bg-muted/40",
                image === avatar.src ? "border-primary bg-primary/10" : "border-border",
              )}
            >
              <Image
                src={avatar.src}
                alt={avatar.name}
                width={80}
                height={80}
                className="h-20 w-20 rounded-lg"
              />
            </button>
          ))}
        </div>
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void handleAvatarUpload(e)}
        />
        <button
          type="button"
          onClick={() => avatarFileRef.current?.click()}
          disabled={uploadingAvatar}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground hover:bg-muted/50"
        >
          {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload custom photo
        </button>
        {image && !DEFAULT_AVATARS.some((a) => a.src === image) && (
          <div className="flex items-center gap-3 rounded-xl border border-primary bg-primary/10 p-2">
            <Image
              src={image}
              alt="Custom avatar"
              width={48}
              height={48}
              className="h-12 w-12 rounded-lg object-cover"
              unoptimized
            />
            <span className="text-sm text-foreground">Custom avatar selected</span>
          </div>
        )}
      </div>

      {/* Header image */}
      <div className="w-full max-w-md space-y-3">
        <p className="text-left text-sm font-medium text-foreground">Header image</p>
        {headerImage ? (
          <div className="relative aspect-[3/1] overflow-hidden rounded-xl bg-muted">
            <Image src={headerImage} alt="Header" fill className="object-cover" unoptimized />
            <button
              type="button"
              onClick={() => setHeaderImage(null)}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => headerFileRef.current?.click()}
            disabled={uploadingHeader}
            className="flex aspect-[3/1] w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-foreground hover:bg-muted/50"
          >
            {uploadingHeader ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <ImageIcon className="h-6 w-6" />
                <span className="text-xs">Click to upload (max 4MB)</span>
              </div>
            )}
          </button>
        )}
        <input
          ref={headerFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void handleHeaderUpload(e)}
        />
      </div>

      {/* Bio */}
      <div className="w-full max-w-md space-y-3">
        <p className="text-left text-sm font-medium text-foreground">Bio</p>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Conte um pouco sobre você..."
          maxLength={500}
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-left text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <p className="text-right text-xs text-muted-foreground">{bio.length}/500</p>
      </div>
    </div>
  );
}
