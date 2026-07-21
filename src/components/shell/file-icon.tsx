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

const MAP: Record<DocumentType, { icon: typeof File; className: string }> = {
  PDF: { icon: FileText, className: "text-[#93321f]" },
  IMAGE: { icon: ImageIcon, className: "text-[#4e8b74]" },
  VIDEO: { icon: Film, className: "text-[#b7791f]" },
  AUDIO: { icon: Music, className: "text-[#b7791f]" },
  DOCX: { icon: FileType, className: "text-[#1f4e93]" },
  SHEET: { icon: FileSpreadsheet, className: "text-[#175b47]" },
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
  return <Icon strokeWidth={1.5} className={cn("size-4", color, className)} />;
}
