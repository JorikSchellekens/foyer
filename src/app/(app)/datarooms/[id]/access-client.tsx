"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shell/empty-state";
import { initials } from "@/lib/format";
import { setDataroomMemberAccess } from "../actions";

export type MemberAccess = {
  id: string;
  email: string;
  name: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  level: "VIEW" | "EDIT" | "MANAGE" | "NONE";
  // whether this member has any scoped room grant (and is thus restricted)
  restricted: boolean;
};

export function AccessTab({
  dataroomId,
  members,
  canManage,
}: {
  dataroomId: string;
  members: MemberAccess[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Who on your team can open and change this data room. Owners and admins
        always have full access. A member with no scoped access sees every room;
        grant a level here and they are limited to just the rooms you choose.
        View lets them read, Edit lets them change contents, Manage lets them
        delete the room.
      </p>

      {members.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No teammates yet"
          description="Invite people to your team from Settings to grant them access here."
        />
      ) : (
        <div className="space-y-1.5">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              dataroomId={dataroomId}
              member={m}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberRow({
  dataroomId,
  member,
  canManage,
}: {
  dataroomId: string;
  member: MemberAccess;
  canManage: boolean;
}) {
  const router = useRouter();
  const [level, setLevel] = useState(member.level);
  const [saving, setSaving] = useState(false);
  const isAdmin = member.role !== "MEMBER";
  // An unrestricted member (no grants anywhere) effectively sees every room.
  const unrestricted = !member.restricted && level === "NONE";

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
        {initials(member.name ?? member.email)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{member.email}</p>
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? `${member.role.toLowerCase()} · full access`
            : unrestricted
              ? "unrestricted · sees every room"
              : "member"}
        </p>
      </div>
      {isAdmin ? (
        <Badge variant="secondary">Full access</Badge>
      ) : !canManage ? (
        <Badge variant="secondary" className="lowercase">
          {level === "NONE" ? (unrestricted ? "full" : "no access") : level}
        </Badge>
      ) : (
        <Select
          value={level}
          onValueChange={async (v) => {
            const next = v as MemberAccess["level"];
            const prev = level;
            setLevel(next);
            setSaving(true);
            try {
              const res = await setDataroomMemberAccess(
                dataroomId,
                member.id,
                next
              );
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                setLevel(prev);
                return;
              }
              toast.success("Access updated");
              router.refresh();
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
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
      )}
    </div>
  );
}
