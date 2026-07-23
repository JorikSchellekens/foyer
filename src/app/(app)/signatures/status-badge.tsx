import { Badge } from "@/components/ui/badge";

const STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SENT: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  COMPLETED: "bg-primary/10 text-primary",
  DECLINED: "bg-destructive/10 text-destructive",
  VOIDED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`border-0 ${STYLES[status] ?? ""}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}
