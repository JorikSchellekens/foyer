"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/shell/copy-button";
import { SettingsIntro, SettingsSection } from "./section";
import { renameTeam } from "./actions";

export function GeneralForm({
  teamName,
  teamSlug,
  role,
  userEmail,
}: {
  teamName: string;
  teamSlug: string;
  role: string;
  userEmail: string;
}) {
  const [name, setName] = useState(teamName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const canEdit = role === "OWNER" || role === "ADMIN";
  const dirty = name.trim() !== teamName && !!name.trim();

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await renameTeam(name);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Workspace renamed");
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <SettingsIntro
        title="Workspace"
        description={
          <>
            Signed in as {userEmail}
            <Badge variant="secondary" className="ml-1.5 lowercase">
              {role.toLowerCase()}
            </Badge>
          </>
        }
      />

      <SettingsSection
        title="Identity"
        description="The workspace name appears on invitations and in the sidebar. The workspace ID never changes."
        footer={
          <span className="flex items-center gap-1.5">
            Workspace ID
            <code className="font-mono text-foreground">{teamSlug}</code>
            <CopyButton value={teamSlug} />
          </span>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canEdit && dirty && !saving) void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Workspace name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              disabled={!canEdit}
              aria-invalid={!name.trim()}
              aria-describedby="team-name-note"
            />
            <p id="team-name-note" className="min-h-4 text-xs text-muted-foreground">
              {!canEdit
                ? "Only owners and admins can rename the workspace."
                : !name.trim()
                  ? "A workspace needs a name."
                  : ""}
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving || !dirty}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <span aria-live="polite" className="text-xs text-muted-foreground">
                {saved && !saving && (
                  <span className="reveal inline-flex items-center gap-1">
                    <Check className="size-3 text-primary" strokeWidth={2.5} />
                    Saved
                  </span>
                )}
              </span>
            </div>
          )}
        </form>
      </SettingsSection>
    </div>
  );
}
