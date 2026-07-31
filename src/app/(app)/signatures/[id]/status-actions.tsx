"use client";

import { useState } from "react";
import { Bell, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { remindSigners, voidSignatureRequest } from "../actions";

export function StatusActions({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const [voidReason, setVoidReason] = useState("");
  const [reminding, setReminding] = useState(false);
  const [voiding, setVoiding] = useState(false);
  if (status !== "SENT") return null;

  return (
    <>
      <Button
        variant="outline"
        disabled={reminding}
        onClick={async () => {
          setReminding(true);
          try {
            const res = await remindSigners(requestId);
            if ("error" in res) toast.error(res.error);
            else
              toast.success(
                `Reminded ${res.count} signer${res.count === 1 ? "" : "s"}.`
              );
          } finally {
            setReminding(false);
          }
        }}
      >
        {reminding ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Bell className="size-4" aria-hidden />
        )}
        Remind
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="text-destructive">
            <Ban className="size-4" aria-hidden /> Void
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this signature request?</AlertDialogTitle>
            <AlertDialogDescription>
              All signing links stop working immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Reason (optional, shown in the audit trail)"
            rows={2}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={voiding}
              onClick={async () => {
                setVoiding(true);
                try {
                  const res = await voidSignatureRequest(requestId, voidReason);
                  if ("error" in res) toast.error(res.error);
                } finally {
                  setVoiding(false);
                }
              }}
            >
              {voiding && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              Void request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
