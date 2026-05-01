"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import {
  Copy,
  Check,
  Crown,
  Link2,
  Loader2,
  Mail,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

interface CollectionMembersDialogProps {
  listId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollectionMembersDialog({
  listId,
  open,
  onOpenChange,
}: CollectionMembersDialogProps): React.JSX.Element {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor" | "admin">("viewer");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.list.getMembers.useQuery(
    { listId: listId ?? "" },
    { enabled: !!listId && open },
  );

  const invalidateMembers = (): void => {
    if (listId) void utils.list.getMembers.invalidate({ listId });
  };

  const createInvitation = trpc.list.createInvitation.useMutation({
    onSuccess: (invitation) => {
      invalidateMembers();
      setInviteEmail("");
      toast.success("Invitation created");
      if (invitation.token) {
        const link = `${window.location.origin}/invite/${invitation.token}`;
        void navigator.clipboard.writeText(link);
        setCopiedToken(invitation.token);
        setTimeout(() => setCopiedToken(null), 3000);
        toast.success("Invite link copied to clipboard");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMember = trpc.list.removeMember.useMutation({
    onSuccess: () => {
      invalidateMembers();
      toast.success("Member removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMember = trpc.list.updateMember.useMutation({
    onSuccess: () => {
      invalidateMembers();
      toast.success("Role updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCopyLink = (token: string): void => {
    const link = `${window.location.origin}/invite/${token}`;
    void navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 3000);
    toast.success("Invite link copied");
  };

  const handleInviteByLink = (): void => {
    if (!listId) return;
    const email = inviteEmail.trim();

    if (email) {
      createInvitation.mutate({ listId, email, role: inviteRole });
      return;
    }

    const existing = data?.invitations.find(
      (inv) =>
        !inv.invitedEmail &&
        !inv.invitedUserId &&
        inv.role === inviteRole &&
        new Date(inv.expiresAt).getTime() > Date.now(),
    );

    if (existing) {
      handleCopyLink(existing.token);
      return;
    }

    createInvitation.mutate({ listId, role: inviteRole });
  };

  const pendingInvitations = (data?.invitations ?? []).filter(
    (inv) => inv.invitedEmail ?? inv.invitedUserId,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-lg flex-col max-md:fixed max-md:inset-0 max-md:h-full max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0">
        <DialogHeader className="text-left">
          <DialogTitle>Manage Members</DialogTitle>
          <DialogDescription>
            Invite users to collaborate on this collection. Editors can add and remove items. Admins can manage members and settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto pt-2">
          {/* Invite */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Invite someone</label>
            <div className="flex gap-2">
              <Input
                variant="ghost"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email (optional)"
                className="flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") handleInviteByLink(); }}
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "viewer" | "editor" | "admin")}>
                <SelectTrigger className="w-28 rounded-xl border-none bg-accent text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={handleInviteByLink}
              disabled={createInvitation.isPending}
            >
              {createInvitation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              Invite by link
            </Button>
          </div>

          <div className="h-px bg-border/40" />

          {/* Members list */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Members</label>

            {isLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {data?.owner && (
                  <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {data.owner.image ? (
                        <Image src={data.owner.image} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        data.owner.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{data.owner.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{data.owner.email}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Crown className="h-3.5 w-3.5 text-yellow-500" />
                      Owner
                    </div>
                  </div>
                )}

                {data?.members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/30">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {member.userImage ? (
                        <Image src={member.userImage} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        member.userName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{member.userName}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.userEmail}</p>
                    </div>
                    <Select
                      value={member.role}
                      onValueChange={(v) => {
                        if (!listId) return;
                        updateMember.mutate({ listId, userId: member.userId, role: v as "viewer" | "editor" | "admin" });
                      }}
                    >
                      <SelectTrigger className="h-7 w-24 rounded-lg border-none bg-accent text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => {
                        if (!listId) return;
                        removeMember.mutate({ listId, userId: member.userId });
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {data?.members.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No members yet. Invite someone to get started.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Pending invitations */}
          {pendingInvitations.length > 0 && (
            <>
              <div className="h-px bg-border/40" />
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Pending Invitations</label>
                <div className="space-y-1">
                  {pendingInvitations.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Mail className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{inv.invitedEmail}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyLink(inv.token)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title="Copy invite link"
                      >
                        {copiedToken === inv.token ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
