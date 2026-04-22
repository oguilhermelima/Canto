"use client";

import { useState } from "react";
import { Button } from "@canto/ui/button";
import { PasswordInput } from "@canto/ui/password-input";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { SettingsSection } from "@/components/settings/shared";

export function PasswordSection(): React.JSX.Element {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = async (): Promise<void> => {
    if (!currentPassword || !newPassword) return;
    setSaving(true);
    try {
      await authClient.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password changed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title="Password" description="Update your account password to keep it secure.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="account-current-password" className="text-sm font-medium text-muted-foreground">
            Current password
          </label>
          <PasswordInput
            id="account-current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            variant="ghost"
            className="text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-border"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="account-new-password" className="text-sm font-medium text-muted-foreground">
            New password
          </label>
          <PasswordInput
            id="account-new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            variant="ghost"
            className="text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-border"
          />
        </div>
      </div>
      <div className="mt-4">
        <Button
          size="sm"
          className="rounded-xl"
          onClick={handleChange}
          disabled={saving || !currentPassword || !newPassword}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Change password
        </Button>
      </div>
    </SettingsSection>
  );
}
