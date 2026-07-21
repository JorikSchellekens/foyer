"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  const router = useRouter();
  const canEdit = role === "OWNER" || role === "ADMIN";

  return (
    <div className="max-w-lg space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl">Workspace</h2>
          <p className="text-sm text-muted-foreground">
            You are signed in as {userEmail}{" "}
            <Badge variant="secondary" className="ml-1 lowercase">
              {role.toLowerCase()}
            </Badge>
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="team-name">Workspace name</Label>
          <Input
            id="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit}
          />
          <p className="text-xs text-muted-foreground">
            Workspace ID: <span className="font-mono">{teamSlug}</span>
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={async () => {
              const res = await renameTeam(name);
              if (res && "error" in res && res.error) {
                toast.error(res.error);
                return;
              }
              toast.success("Workspace renamed");
              router.refresh();
            }}
            disabled={!name.trim() || name === teamName}
          >
            Save changes
          </Button>
        )}
      </section>
    </div>
  );
}
