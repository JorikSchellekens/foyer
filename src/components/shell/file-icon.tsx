import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileSpreadsheet,
  FileType,
  File,
  BookOpen,
} from "lucide-react";
import type { DocumentType } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * One weight, five hues. Colours come from the theme tokens rather than raw
 * hex so the coding holds up in dark mode; only the DOCX blue has no token.
 */
const MAP: Record<DocumentType, { icon: typeof File; className: string }> = {
  PDF: { icon: FileText, className: "text-destructive" },
  IMAGE: { icon: ImageIcon, className: "text-chart-2" },
  VIDEO: { icon: Film, className: "text-chart-4" },
  AUDIO: { icon: Music, className: "text-chart-4" },
  DOCX: { icon: FileType, className: "text-[#1f4e93] dark:text-[#7ea6d9]" },
  SHEET: { icon: FileSpreadsheet, className: "text-primary" },
  TEXT: { icon: FileText, className: "text-muted-foreground" },
  NOTION: { icon: BookOpen, className: "text-foreground" },
  OTHER: { icon: File, className: "text-muted-foreground" },
};

export function FileIcon({
  type,
  className,
}: {
  type: DocumentType;
  className?: string;
}) {
  const { icon: Icon, className: color } = MAP[type] ?? MAP.OTHER;
  return (
    <Icon strokeWidth={1.5} className={cn("size-4 shrink-0", color, className)} />
  );
}
