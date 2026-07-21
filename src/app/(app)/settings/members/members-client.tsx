"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MailPlus, ShieldCheck, Trash2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { initials, timeAgo, formatDate } from "@/lib/format";
import {
  inviteMember,
  revokeInvite,
  resendInvite,
  setMemberRole,
  removeMember,
  setMemberPermissions,
} from "../actions";

type Member = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
  permissions: {
    resourceType: "DATAROOM" | "DOCUMENT";
    resourceId: string;
    level: "VIEW" | "EDIT" | "MANAGE";
  }[];
};

export function MembersClient({
  currentUserId,
  role,
  members,
  invites,
  datarooms,
}: {
  currentUserId: string;
  role: string;
  members: Member[];
  invites: { id: string; email: string; role: string; expiresAt: string }[];
  datarooms: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [busy, setBusy] = useState(false);
  const [permMember, setPermMember] = useState<Member | null>(null);
  const canManage = role === "OWNER" || role === "ADMIN";

  return (
    <div className="max-w-2xl space-y-8">
      {canManage && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium">Invite a teammate</h2>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            action={async () => {
              setBusy(true);
              try {
                const res = await inviteMember(email, inviteRole);
                if (res && "error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success(`Invitation sent to ${email}`);
                setEmail("");
                router.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="flex-1"
              required
            />
            <Select
              value={inviteRole}
              onValueChange={(v) => setInviteRole(v as "ADMIN" | "MEMBER")}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={busy || !email.includes("@")}>
              <MailPlus className="size-4" /> Invite
            </Button>
          </form>
        </section>
      )}

      {invites.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            Pending invitations
          </h2>
          <div className="space-y-1.5">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center gap-3 rounded-lg border border-dashed bg-card px-4 py-2.5"
              >
                <span className="flex-1 truncate text-sm">{invite.email}</span>
                <Badge variant="secondary" className="lowercase">
                  {invite.role.toLowerCase()}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  expires {formatDate(invite.expiresAt)}
                </span>
                {canManage && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      title="Resend invitation"
                      onClick={async () => {
                        const res = await resendInvite(invite.id);
                        if (res && "error" in res && res.error)
                          toast.error(res.error);
                        else toast.success("Invitation re-sent");
                      }}
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      title="Revoke invitation"
                      onClick={async () => {
                        await revokeInvite(invite.id);
                        toast.success("Invitation revoked");
                        router.refresh();
                      }}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Members
        </h2>
        <div className="space-y-1.5">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                {initials(m.name ?? m.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.email}
                  {m.userId === currentUserId && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      (you)
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  joined {timeAgo(m.joinedAt)}
                  {m.role === "MEMBER" && m.permissions.length > 0
                    ? ` · ${m.permissions.length} scoped permission${
                        m.permissions.length === 1 ? "" : "s"
                      }`
                    : ""}
                </p>
              </div>
              {role === "OWNER" && m.userId !== currentUserId ? (
                <Select
                  value={m.role}
                  onValueChange={async (v) => {
                    const res = await setMemberRole(
                      m.id,
                      v as "ADMIN" | "MEMBER"
                    );
                    if (res && "error" in res && res.error)
                      toast.error(res.error);
                    else router.refresh();
                  }}
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    {m.role === "OWNER" && (
                      <SelectItem value="OWNER">Owner</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary" className="lowercase">
                  {m.role.toLowerCase()}
                </Badge>
              )}
              {canManage && m.role === "MEMBER" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Data room permissions"
                  onClick={() => setPermMember(m)}
                >
                  <ShieldCheck className="size-3.5" />
                </Button>
              )}
              {canManage &&
                m.role !== "OWNER" &&
                m.userId !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    title="Remove member"
                    onClick={async () => {
                      const res = await removeMember(m.id);
                      if (res && "error" in res && res.error)
                        toast.error(res.error);
                      else {
                        toast.success("Member removed");
                        router.refresh();
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
            </div>
          ))}
        </div>
      </section>

      {permMember && (
        <PermissionsDialog
          member={permMember}
          datarooms={datarooms}
          onClose={() => setPermMember(null)}
        />
      )}
    </div>
  );
}

function PermissionsDialog({
  member,
  datarooms,
  onClose,
}: {
  member: Member;
  datarooms: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [levels, setLevels] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      datarooms.map((d) => [
        d.id,
        member.permissions.find(
          (p) => p.resourceType === "DATAROOM" && p.resourceId === d.id
        )?.level ?? "NONE",
      ])
    )
  );
  const [saving, setSaving] = useState(false);
  const anyScoped = Object.values(levels).some((l) => l !== "NONE");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Data room access · {member.email}</DialogTitle>
          <DialogDescription>
            Members with no scoped permissions can access every data room. Set
            any level here to restrict this member to only the rooms listed.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {datarooms.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No data rooms yet.
            </p>
          )}
          {datarooms.map((d) => (
            <div key={d.id} className="flex items-center gap-3">
              <Label className="min-w-0 flex-1 truncate font-normal">
                {d.name}
              </Label>
              <Select
                value={levels[d.id]}
                onValueChange={(v) =>
                  setLevels((s) => ({ ...s, [d.id]: v }))
                }
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No access</SelectItem>
                  <SelectItem value="VIEW">View</SelectItem>
                  <SelectItem value="EDIT">Edit</SelectItem>
                  <SelectItem value="MANAGE">Manage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        {anyScoped && (
          <p className="text-xs text-muted-foreground">
            This member is now restricted to the rooms marked View or higher.
          </p>
        )}
        <DialogFooter>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await setMemberPermissions(
                  member.id,
                  datarooms.map((d) => ({
                    resourceType: "DATAROOM" as const,
                    resourceId: d.id,
                    level: levels[d.id] as "VIEW" | "EDIT" | "MANAGE" | "NONE",
                  }))
                );
                if (res && "error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Permissions saved");
                onClose();
                router.refresh();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
