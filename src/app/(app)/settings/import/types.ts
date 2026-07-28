import type { ImportPlan } from "@/lib/papermark/scan";
import type { ImportOptions } from "@/lib/papermark/run";

export type ActiveImport = {
  id: string;
  status:
    | "DRAFT"
    | "SCANNING"
    | "READY"
    | "RUNNING"
    | "PAUSED"
    | "COMPLETED"
    | "FAILED";
  activity: string | null;
  error: string | null;
  total: number;
  done: number;
  failed: number;
  sourceTeamId: string | null;
  hasCookie: boolean;
  rootFolderId: string | null;
  createdAt: string;
  completedAt: string | null;
  plan: ImportPlan | null;
  options: ImportOptions | null;
};

export type ImportItemRow = {
  id: string;
  kind:
    | "FOLDER"
    | "DOCUMENT"
    | "DATAROOM"
    | "DATAROOM_FOLDER"
    | "DATAROOM_DOCUMENT"
    | "LINK"
    | "DOMAIN"
    | "VISITOR";
  status: "PENDING" | "RUNNING" | "DONE" | "SKIPPED" | "FAILED";
  externalId: string;
  externalName: string;
  localId: string | null;
  error: string | null;
};

export type ExistingDomain = {
  domain: string;
  status: "PENDING" | "VERIFIED" | "ERROR";
};
