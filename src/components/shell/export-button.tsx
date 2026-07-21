import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Download link to a CSV export endpoint, styled as an outline button. */
export function ExportButton({
  href,
  label = "Export CSV",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={href} download>
        <Download className="size-4" />
        {label}
      </a>
    </Button>
  );
}
