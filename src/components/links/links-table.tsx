"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AtSign,
  BarChart3,
  CalendarClock,
  CalendarX,
  ExternalLink,
  Eye,
  FileSignature,
  FileText,
  FolderLock,
  Lock,
  MailPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CopyButton } from "@/components/shell/copy-button";
import { LivePresenceProvider, LiveDot } from "@/components/links/live-presence";
import { cn } from "@/lib/utils";
import { formatDateTime, timeAgo } from "@/lib/format";
import {
  LinkEditor,
  type EditorLink,
  type TreeItem,
} from "@/components/links/link-editor";
import {
  InviteRecipientsDialog,
  type RecipientRow,
} from "@/components/links/invite-dialog";
import { setLinkArchived, deleteLink } from "@/app/(app)/links/actions";
import type { LinkConfig } from "@/lib/link-config";

export type LinkRowData = {
  id: string;
  name: string;
  url: string;
  displayUrl: string;
  targetType: "DOCUMENT" | "DATAROOM";
  targetId: string;
  targetName: string;
  views: number;
  lastViewed: string | null;
  isArchived: boolean;
  editor: EditorLink;
  tree: TreeItem[];
  recipients: RecipientRow[];
};

export type EditorContext = {
  appHost: string;
  domains: { id: string; domain: string }[];
  agreements: { id: string; name: string }[];
  presets: {
    id: string;
    name: string;
    isDefault: boolean;
    config: Partial<LinkConfig>;
  }[];
  previewPresets: { id: string; name: string; isDefault: boolean }[];
};

/** Column heads recede so the link name reads as the primary axis. */
const HEAD = "h-9 text-xs font-medium text-muted-foreground";

/**
 * Read once per page load rather than per render: whether an expiry has passed
 * only needs page-load resolution, and rendering stays pure.
 */
const LOADED_AT = Date.now();

const subscribeNever = () => () => {};

/**
 * True only after hydration.
 *
 * Whether a link has expired depends on the clock of whoever is rendering, and
 * the server's module-scope LOADED_AT can be hours older than the browser's.
 * Deciding it during SSR therefore produces a different label than the client
 * would, which fails hydration. Render every link as live, then let the client
 * mark the expired ones. useSyncExternalStore rather than an effect: the
 * server snapshot is explicit and there is no state written during mount.
 */
function useHydrated() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}

/**
 * Expiry dates in the chip labels are pinned to UTC.
 *
 * A date-only string formatted in the runtime's own zone lands on a different
 * calendar day on a UTC server than in a browser an hour ahead, whenever the
 * timestamp sits near midnight. An expiry is a fixed instant, so naming it in
 * one zone is both stable across hydration and the honest reading.
 */
function expiryDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function LinksTable({
  rows,
  ctx,
  showTarget = true,
}: {
  rows: LinkRowData[];
  ctx: EditorContext;
  showTarget?: boolean;
}) {
  return (
    <LivePresenceProvider>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={HEAD}>Name</TableHead>
              <TableHead className={HEAD}>Link</TableHead>
              {showTarget && <TableHead className={HEAD}>Shares</TableHead>}
              <TableHead className={`${HEAD} w-20`}>Views</TableHead>
              <TableHead className={`${HEAD} w-28`}>Last viewed</TableHead>
              <TableHead className={`${HEAD} w-20`}>Active</TableHead>
              <TableHead className={`${HEAD} w-20`} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <LinkRow
                key={row.id}
                row={row}
                ctx={ctx}
                showTarget={showTarget}
                index={i}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </LivePresenceProvider>
  );
}

/**
 * The access controls that change what a visitor meets at the door. Icon-only
 * and muted: they are a reassurance while scanning, not a headline. Expiry is
 * the one that turns oxblood, because an expired link is silently dead.
 */
function AccessChips({ link }: { link: EditorLink }) {
  const expiresAt = link.expiresAt ? new Date(link.expiresAt) : null;
  const expired =
    useHydrated() && !!expiresAt && expiresAt.getTime() < LOADED_AT;
  const chips: { icon: LucideIcon; label: string; tone?: string }[] = [];

  if (link.hasPassword) chips.push({ icon: Lock, label: "Password protected" });
  if (link.accessMode && link.accessMode !== "PUBLIC")
    chips.push({
      icon: AtSign,
      label:
        link.accessMode === "EMAIL_VERIFIED"
          ? "Requires a verified email"
          : "Asks for an email",
    });
  if (link.agreementId) chips.push({ icon: FileSignature, label: "NDA gate" });
  if (expiresAt)
    chips.push(
      expired
        ? {
            icon: CalendarX,
            label: `Expired ${expiryDate(expiresAt)}`,
            tone: "text-destructive",
          }
        : { icon: CalendarClock, label: `Expires ${expiryDate(expiresAt)}` }
    );

  if (chips.length === 0) return null;
  return (
    <span className="flex items-center gap-1">
      {chips.map(({ icon: Icon, label, tone }) => (
        <Icon
          key={label}
          role="img"
          aria-label={label}
          className={cn("size-3.5 text-muted-foreground", tone)}
          strokeWidth={1.75}
        >
          <title>{label}</title>
        </Icon>
      ))}
    </span>
  );
}

function LinkRow({
  row,
  ctx,
  showTarget,
  index,
}: {
  row: LinkRowData;
  ctx: EditorContext;
  showTarget: boolean;
  index: number;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [active, setActive] = useState(!row.isArchived);

  // An archived link still earns its row, it just stops asking for attention.
  const dim = active
    ? undefined
    : "opacity-55 transition-opacity duration-[var(--dur)]";

  return (
    <TableRow
      className="stagger-item group"
      // Cap the cascade: a long table should not ripple for seconds.
      style={{ "--i": Math.min(index, 10) } as React.CSSProperties}
    >
      <TableCell className={cn("py-2.5 font-medium", dim)}>
        <span className="flex items-center gap-2">
          <LiveDot linkId={row.id} />
          <Link
            href={`/links/${row.id}`}
            className="-mx-1 rounded-md px-1 outline-none hover:underline hover:decoration-primary/40 hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring"
          >
            {row.name}
          </Link>
        </span>
      </TableCell>
      <TableCell className={cn("py-2.5", dim)}>
        <div className="flex items-center gap-1">
          <span className="max-w-52 truncate font-mono text-xs text-muted-foreground">
            {row.displayUrl}
          </span>
          <CopyButton value={row.url} />
          <AccessChips link={row.editor} />
        </div>
      </TableCell>
      {showTarget && (
        <TableCell className={cn("py-2.5", dim)}>
          <Link
            href={
              row.targetType === "DATAROOM"
                ? `/datarooms/${row.targetId}`
                : `/documents/${row.targetId}`
            }
            className="-mx-1 inline-flex items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground outline-none transition-colors duration-[var(--dur-fast)] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
          >
            {row.targetType === "DATAROOM" ? (
              <FolderLock className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <FileText className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="max-w-40 truncate">{row.targetName}</span>
          </Link>
        </TableCell>
      )}
      <TableCell
        className={cn("py-2.5 font-mono text-[0.8125rem] tabular", dim)}
      >
        {row.views}
      </TableCell>
      <TableCell
        className={cn(
          "py-2.5 font-mono text-xs text-muted-foreground tabular",
          dim
        )}
      >
        {row.lastViewed ? (
          <time
            dateTime={row.lastViewed}
            title={formatDateTime(row.lastViewed)}
            // Relative time is measured against the reader's clock, so the
            // server's string and the client's can legitimately differ by a
            // bucket. The absolute value in dateTime/title is the stable one.
            suppressHydrationWarning
          >
            {timeAgo(row.lastViewed)}
          </time>
        ) : (
          <span aria-hidden>-</span>
        )}
      </TableCell>
      <TableCell className="py-2.5">
        <Switch
          checked={active}
          aria-label={active ? "Deactivate this link" : "Activate this link"}
          onCheckedChange={async (v) => {
            setActive(v); // optimistic: flip immediately
            try {
              await setLinkArchived(row.id, !v);
              toast.success(v ? "Link activated" : "Link deactivated");
              router.refresh();
            } catch {
              setActive(!v); // reconcile on failure
              toast.error("Could not update the link.");
            }
          }}
        />
      </TableCell>
      <TableCell className="py-2.5">
        <div className="flex justify-end gap-0.5">
          <LinkEditor
            mode="edit"
            target={{
              type: row.targetType,
              id: row.targetId,
              name: row.targetName,
            }}
            link={row.editor}
            domains={ctx.domains}
            agreements={ctx.agreements}
            presets={ctx.presets}
            previewPresets={ctx.previewPresets}
            tree={row.tree}
            appHost={ctx.appHost}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${row.name}`}
                title="Edit link"
                // Quiet until the row is engaged; the overflow menu stays put so
                // there is always one visible way in, touch included.
                className="opacity-0 transition-opacity duration-[var(--dur)] ease-[var(--ease-out-soft)] group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
              >
                <Pencil className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`More actions for ${row.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem asChild>
                <Link href={`/links/${row.id}`}>
                  <BarChart3 className="size-4" /> View analytics
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/links/${row.id}/preview`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Eye className="size-4" /> Preview as visitor
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={row.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> Open link
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                <MailPlus className="size-4" /> Invite by email
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" /> Delete link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <InviteRecipientsDialog
          linkId={row.id}
          linkName={row.name}
          recipients={row.recipients}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{row.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                The link stops working immediately and its view history is
                removed. Consider deactivating instead to keep the analytics.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={async () => {
                  await deleteLink(row.id);
                  toast.success("Link deleted");
                  router.refresh();
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
