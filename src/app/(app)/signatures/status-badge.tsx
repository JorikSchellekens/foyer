import {
  Ban,
  Check,
  CircleDashed,
  Clock,
  Eye,
  Send,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Envelope statuses (draft/sent/completed/declined/voided/expired) and signer
 * statuses (pending/sent/viewed/signed/declined) share this badge. Colour stays
 * inside the palette - green accent, oxblood, muted - so each state also gets
 * its own glyph and border treatment: shape carries the meaning, hue only
 * reinforces it.
 */
const STATES: Record<string, { icon: LucideIcon; className: string }> = {
  DRAFT: {
    icon: CircleDashed,
    className: "border-dashed border-input text-muted-foreground",
  },
  PENDING: {
    icon: CircleDashed,
    className: "border-dashed border-input text-muted-foreground",
  },
  SENT: { icon: Send, className: "border-input text-foreground" },
  VIEWED: { icon: Eye, className: "border-input text-foreground" },
  SIGNED: {
    icon: Check,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  COMPLETED: {
    icon: Check,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  DECLINED: {
    icon: X,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  VOIDED: {
    icon: Ban,
    className: "border-border bg-muted text-muted-foreground",
  },
  EXPIRED: {
    icon: Clock,
    className: "border-dashed border-input text-muted-foreground",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const state = STATES[status];
  const Icon = state?.icon;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium tracking-[0.01em]", state?.className)}
    >
      {Icon && <Icon aria-hidden strokeWidth={2.25} />}
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}
