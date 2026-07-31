"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UsersRound } from "lucide-react";
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
    <div className="max-w-3xl space-y-4">
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Who on your team can open and change this data room. Owners and admins
        always have full access. A member with no scoped access sees every room;
        grant a level here and they are limited to just the rooms you choose.
      </p>

      {/* The three levels stated once, so the per-row select does not have to
          carry an explanation each time it appears. */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg border bg-muted/30 px-4 py-3 text-xs sm:grid-cols-3">
        {(
          [
            ["View", "Read the room and its files"],
            ["Edit", "Add, remove and reorder contents"],
            ["Manage", "Everything, including deleting the room"],
          ] as const
        ).map(([level, meaning]) => (
          <div key={level}>
            <dt className="font-medium">{level}</dt>
            <dd className="text-muted-foreground">{meaning}</dd>
          </div>
        ))}
      </dl>

      {members.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No teammates yet"
          description="Invite people to your team from Settings to grant them access here."
        />
      ) : (
        <div className="space-y-1.5">
          {members.map((m, i) => (
            <MemberRow
              key={m.id}
              dataroomId={dataroomId}
              member={m}
              canManage={canManage}
              index={i}
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
  index,
}: {
  dataroomId: string;
  member: MemberAccess;
  canManage: boolean;
  index: number;
}) {
  const router = useRouter();
  const [level, setLevel] = useState(member.level);
  const [saving, setSaving] = useState(false);
  const isAdmin = member.role !== "MEMBER";
  // An unrestricted member (no grants anywhere) effectively sees every room.
  const unrestricted = !member.restricted && level === "NONE";

  return (
    <div
      className="stagger-item flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-[var(--shadow-hairline)]"
      style={{ "--i": Math.min(index, 10) } as React.CSSProperties}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
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
          <SelectTrigger
            className="h-8 w-32 shrink-0 text-xs"
            aria-label={`Access level for ${member.email}`}
          >
            {saving ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Saving…
              </span>
            ) : (
              <SelectValue />
            )}
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
