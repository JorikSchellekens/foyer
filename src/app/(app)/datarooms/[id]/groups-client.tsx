"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shell/empty-state";
import { PermissionTree, type TreeItem } from "@/components/links/link-editor";
import type { LinkConfig } from "@/lib/link-config";
import { saveGroup, deleteGroup } from "../actions";
import { pluralize } from "@/lib/format";

export type GroupData = {
  id: string;
  name: string;
  emails: string[];
  fullAccess: boolean;
  allowDownload: boolean;
  linkCount: number;
  permissions: LinkConfig["permissions"];
};

export function GroupsTab({
  dataroomId,
  groups,
  tree,
}: {
  dataroomId: string;
  groups: GroupData[];
  tree: TreeItem[];
}) {
  const [editing, setEditing] = useState<GroupData | null | "new">(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Groups are named audiences, like “Series A investors”, with their own
          member emails and file permissions. Attach a group to a link to scope
          who gets in and what they see.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New group
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No groups yet"
          description="Create a group to give a set of people their own slice of this data room."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setEditing(g)}
              className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{g.name}</span>
                <Badge variant="secondary">
                  {g.fullAccess ? "full access" : "restricted"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {pluralize(g.emails.length, "member")} ·{" "}
                {pluralize(g.linkCount, "link")}
              </p>
            </button>
          ))}
        </div>
      )}

      {editing !== null && (
        <GroupEditor
          dataroomId={dataroomId}
          group={editing === "new" ? null : editing}
          tree={tree}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function GroupEditor({
  dataroomId,
  group,
  tree,
  onClose,
}: {
  dataroomId: string;
  group: GroupData | null;
  tree: TreeItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(group?.name ?? "");
  const [emails, setEmails] = useState(group?.emails.join("\n") ?? "");
  const [fullAccess, setFullAccess] = useState(group?.fullAccess ?? true);
  const [allowDownload, setAllowDownload] = useState(
    group?.allowDownload ?? true
  );
  const [permissions, setPermissions] = useState<LinkConfig["permissions"]>(
    group?.permissions ?? []
  );
  const [saving, setSaving] = useState(false);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="font-display text-xl font-normal">
            {group ? "Edit group" : "New group"}
          </SheetTitle>
          <SheetDescription>
            Members are matched by the email they enter or verify at the door.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label>Group name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Series A investors"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Member emails</Label>
            <Textarea
              rows={5}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder={"jane@fund.com\nmark@partners.vc"}
            />
            <p className="text-xs text-muted-foreground">One per line.</p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Full access</div>
              <div className="text-xs text-muted-foreground">
                Members see every file. Turn off to pick per item.
              </div>
            </div>
            <Switch checked={fullAccess} onCheckedChange={setFullAccess} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Allow downloads</div>
              <div className="text-xs text-muted-foreground">
                Applies to everything the group can view.
              </div>
            </div>
            <Switch
              checked={allowDownload}
              onCheckedChange={setAllowDownload}
            />
          </div>
          {!fullAccess && (
            <PermissionTree
              tree={tree}
              permissions={permissions}
              allowDownload={allowDownload}
              onChange={setPermissions}
            />
          )}
        </div>
        <SheetFooter className="border-t">
          <div className="flex w-full items-center justify-between">
            {group ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  await deleteGroup(dataroomId, group.id);
                  toast.success("Group deleted");
                  onClose();
                  router.refresh();
                }}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <Button
              disabled={saving || !name.trim()}
              onClick={async () => {
                setSaving(true);
                try {
                  const res = await saveGroup(dataroomId, {
                    id: group?.id,
                    name,
                    emails: emails.split(/[\n,;]+/),
                    fullAccess,
                    allowDownload,
                    permissions,
                  });
                  if (res && "error" in res && res.error) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success(group ? "Group updated" : "Group created");
                  onClose();
                  router.refresh();
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : group ? "Save changes" : "Create group"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
