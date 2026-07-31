"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * One field, one button. Split out only so the button can read the form's
 * pending state: creating a workspace redirects into the app, and the wait
 * should be visible rather than look like a dead click.
 */
export function WorkspaceForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      className="stagger-item mt-10 space-y-4"
      // Step 3 of the page's arrival cascade (see the page's STEP table).
      style={{ "--i": 3 } as React.CSSProperties}
    >
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          name="name"
          required
          autoFocus
          autoComplete="organization"
          placeholder="Acme Inc"
          maxLength={60}
          className="h-10"
        />
      </div>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="h-10 w-full"
      disabled={pending}
      aria-busy={pending || undefined}
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" />
          Preparing your workspace…
        </>
      ) : (
        "Create workspace"
      )}
    </Button>
  );
}
