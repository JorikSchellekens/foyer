"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  MailPlus,
  Clock,
  ShieldCheck,
  Trash2,
  RefreshCw,
  X,
} from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { initials, timeAgo, formatDate } from "@/lib/format";
import { SettingsIntro, SettingsSection } from "../section";
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
  const [removingMember, setRemovingMember] = useState<Member | null>(null);
  const canManage = role === "OWNER" || role === "ADMIN";
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsIntro
        title="Team members"
        description="Admins can do everything except delete the workspace. Members see every data room unless you scope them to specific rooms."
      />

      {canManage && (
        <SettingsSection
          title="Invite a teammate"
          icon={MailPlus}
          description="They get an email with a link that expires. Nothing is shared with them until they accept."
        >
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-start"
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
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="invite-email" className="sr-only">
                Email address
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                aria-invalid={email.length > 0 && !emailValid}
                required
              />
            </div>
            <Select
              value={inviteRole}
              onValueChange={(v) => setInviteRole(v as "ADMIN" | "MEMBER")}
            >
              <SelectTrigger className="w-28 shrink-0" aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="submit"
              className="shrink-0"
              disabled={busy || !emailValid}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MailPlus className="size-4" />
              )}
              {busy ? "Sending…" : "Invite"}
            </Button>
          </form>
        </SettingsSection>
      )}

      {invites.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-baseline font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="shrink-0">Pending invitations</span>
            <span aria-hidden className="leader-dots text-muted-foreground/60" />
            <span className="shrink-0 tabular">{invites.length}</span>
          </h2>
          <div className="space-y-1.5">
            {invites.map((invite, i) => (
              <div
                key={invite.id}
                className="stagger-item flex items-center gap-3 rounded-lg border border-dashed bg-card/60 px-4 py-2.5"
                style={{ "--i": i } as React.CSSProperties}
              >
                <Clock
                  className="size-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {invite.email}
                </span>
                <Badge variant="secondary" className="lowercase">
                  {invite.role.toLowerCase()}
                </Badge>
                <span className="shrink-0 text-xs text-muted-foreground">
                  expires {formatDate(invite.expiresAt)}
                </span>
                {canManage && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Resend invitation to ${invite.email}`}
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
                      size="icon-sm"
                      aria-label={`Revoke invitation to ${invite.email}`}
                      className="text-muted-foreground hover:text-destructive"
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

      <section className="space-y-2">
        <h2 className="flex items-baseline font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="shrink-0">Members</span>
          <span aria-hidden className="leader-dots text-muted-foreground/60" />
          <span className="shrink-0 tabular">{members.length}</span>
        </h2>
        <div className="space-y-1.5">
          {members.map((m, i) => (
            <div
              key={m.id}
              className="stagger-item flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-[var(--shadow-hairline)]"
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                {initials(m.name ?? m.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.email}
                  {m.userId === currentUserId && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      (you)
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                  joined {timeAgo(m.joinedAt)}
                  {m.role === "MEMBER" && m.permissions.length > 0
                    ? ` · ${m.permissions.length} scoped permission${
                        m.permissions.length === 1 ? "" : "s"
                      }`
                    : m.role === "MEMBER"
                      ? " · sees every data room"
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
                    else {
                      toast.success(`${m.email} is now a ${v.toLowerCase()}`);
                      router.refresh();
                    }
                  }}
                >
                  <SelectTrigger
                    className="h-8 w-28 shrink-0 text-xs"
                    aria-label={`Role for ${m.email}`}
                  >
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
                  size="icon-sm"
                  aria-label={`Data room permissions for ${m.email}`}
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
                    size="icon-sm"
                    aria-label={`Remove ${m.email}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setRemovingMember(m)}
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

      <AlertDialog
        open={!!removingMember}
        onOpenChange={(o) => !o && setRemovingMember(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removingMember?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to every data room and document in this
              workspace immediately. Links they created keep working, and
              nothing they uploaded is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep member</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                const m = removingMember;
                setRemovingMember(null);
                if (!m) return;
                const res = await removeMember(m.id);
                if (res && "error" in res && res.error) toast.error(res.error);
                else {
                  toast.success("Member removed");
                  router.refresh();
                }
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

  async function save() {
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
  }

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
        <div className="max-h-72 divide-y overflow-y-auto">
          {datarooms.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No data rooms yet.
            </p>
          )}
          {datarooms.map((d) => (
            <div key={d.id} className="flex items-center gap-3 py-2">
              <Label
                htmlFor={`perm-${d.id}`}
                className="min-w-0 flex-1 truncate font-normal"
              >
                {d.name}
              </Label>
              <Select
                value={levels[d.id]}
                onValueChange={(v) =>
                  setLevels((s) => ({ ...s, [d.id]: v }))
                }
              >
                <SelectTrigger
                  id={`perm-${d.id}`}
                  className="h-8 w-32 shrink-0 text-xs"
                >
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
        <p
          aria-live="polite"
          className="min-h-8 text-xs leading-relaxed text-muted-foreground"
        >
          {anyScoped
            ? "This member is now restricted to the rooms marked View or higher."
            : "No scoping set: this member can open every data room."}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={save}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Saving…" : "Save permissions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
