import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveApiKey, type ApiPrincipal } from "@/lib/api-auth";
import { recordApiEvent } from "@/lib/api-audit";
import { rateLimit } from "@/lib/rate-limit";
import type { ApiScope } from "@/lib/api-scopes";

/**
 * A failure the caller can act on. The message is written for the model on
 * the other end: say what was wrong and, where it helps, what to call instead.
 * Anything that is not a ToolError is treated as a bug and reported without
 * detail, so internals never leak into a conversation.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export type ToolResult = {
  /** Returned to the caller as JSON. */
  data: unknown;
  /**
   * One line for the audit trail. Give it for every call that changed
   * something; leave it out for previews and dry runs, which change nothing.
   */
  audit?: string;
};

type Shape = z.ZodRawShape;

export type ToolDef<S extends Shape> = {
  name: string;
  title: string;
  description: string;
  scope: ApiScope;
  input: S;
  /** Permanently removes data. Shown to the user by clients that ask first. */
  destructive?: boolean;
  /** Calling it twice with the same input leaves the same state. */
  idempotent?: boolean;
  /** Reaches outside the workspace (sends email, makes something public). */
  openWorld?: boolean;
  handler: (
    principal: ApiPrincipal,
    args: z.infer<z.ZodObject<S>>
  ) => Promise<ToolResult>;
};

// Per person and workspace, per minute, whichever key they use: making more
// keys does not buy more calls. Generous for an assistant working through a
// room, tight enough that a runaway loop is stopped quickly.
const LIMITS: Record<ApiScope, number> = {
  read: 240,
  write: 120,
  share: 30,
  delete: 20,
};
const LIMIT_ALL = 300;

/** One vocabulary for permissions: the `can` flags get_workspace returns. */
export const CAN: Record<ApiScope, { flag: string; preset: string }> = {
  read: { flag: "can.read", preset: "Read only" },
  write: { flag: "can.addAndOrganise", preset: "Organise" },
  share: { flag: "can.createLinksAndInvite", preset: "Organise and share" },
  delete: { flag: "can.deletePermanently", preset: "Full access" },
};

function scopeRefusal(tool: string, scope: ApiScope) {
  return `This API key may not use ${tool}: ${CAN[scope].flag} is false for it (see get_workspace). Tell the user. To allow it they can create a key with the "${CAN[scope].preset}" access level under Settings > API and MCP.`;
}

/** The bucket every limit for this caller is counted in. */
export function limitKey(p: Pick<ApiPrincipal, "teamId" | "userId">) {
  return `${p.teamId}:${p.userId}`;
}

// ---------- heavy work ----------

const inFlight = new Map<string, number>();

/**
 * Run `fn` unless this caller already has `max` of the same kind of job
 * running. Reading text out of large files and receiving uploads hold whole
 * files in memory; the per-minute limits count calls, not how many run at
 * once, so those jobs are also capped by how many may overlap.
 */
export async function withSlot<T>(
  key: string,
  max: number,
  busyMessage: string,
  fn: () => Promise<T>
): Promise<T> {
  const running = inFlight.get(key) ?? 0;
  if (running >= max) throw new ToolError(busyMessage);
  inFlight.set(key, running + 1);
  try {
    return await fn();
  } finally {
    const left = (inFlight.get(key) ?? 1) - 1;
    if (left <= 0) inFlight.delete(key);
    else inFlight.set(key, left);
  }
}

/** People with the web app open should see what an assistant just changed. */
export function refreshApp() {
  try {
    revalidatePath("/", "layout");
  } catch {
    // outside a request scope; the next navigation fetches fresh data anyway
  }
}

function reply(data: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        // Compact: indentation is a third of the bytes on a large room, and
        // the reader is a model.
        text: typeof data === "string" ? data : JSON.stringify(data),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * The key is re-resolved on every call rather than trusted from the session:
 * a key that was revoked, expired, or whose owner left the team stops working
 * at once, and a change to the owner's role or room permissions applies to the
 * next call.
 */
async function principalFrom(extra: unknown): Promise<ApiPrincipal> {
  const token = (extra as { authInfo?: { token?: string } })?.authInfo?.token;
  const principal = await resolveApiKey(token);
  if (!principal)
    throw new ToolError(
      "This API key is no longer valid. It may have been revoked or have expired. Ask the workspace owner for a new key."
    );
  return principal;
}

export function defineTool<S extends Shape>(
  server: McpServer,
  def: ToolDef<S>
) {
  const readOnly = def.scope === "read";
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      // Strict: a misspelt or made-up argument is an error, not something
      // silently dropped while the call "succeeds" with a default.
      inputSchema: z.strictObject(def.input),
      annotations: {
        title: def.title,
        readOnlyHint: readOnly,
        destructiveHint: !readOnly && !!def.destructive,
        idempotentHint: readOnly || !!def.idempotent,
        openWorldHint: !!def.openWorld,
      },
    },
    // The SDK's callback type depends on the schema shape in a way that does
    // not survive this generic wrapper; the arguments are validated against
    // `def.input` by the SDK before this runs.
    (async (args: z.infer<z.ZodObject<S>>, extra: unknown) => {
      let principal: ApiPrincipal | null = null;
      try {
        principal = await principalFrom(extra);
        // Count the call before anything else, so a refused call costs the
        // caller as much as an allowed one and cannot be used to flood the
        // audit trail.
        const who = limitKey(principal);
        const all = rateLimit(`mcp:${who}:all`, LIMIT_ALL, 60_000);
        const scoped = all.ok
          ? rateLimit(`mcp:${who}:${def.scope}`, LIMITS[def.scope], 60_000)
          : all;
        if (!scoped.ok)
          return reply(
            `Error: too many calls. Wait ${scoped.retryAfter} seconds and try again.`,
            true
          );
        if (!principal.scopes.includes(def.scope))
          // Not audited: a key probing for tools it lacks would otherwise
          // fill the change list with refusals.
          return reply(`Error: ${scopeRefusal(def.name, def.scope)}`, true);

        const result = await def.handler(principal, args);
        if (!readOnly && result.audit) {
          await recordApiEvent(principal, {
            tool: def.name,
            summary: result.audit,
          });
          refreshApp();
        }
        return reply(result.data);
      } catch (e) {
        if (e instanceof ToolError) {
          if (principal && !readOnly)
            await recordApiEvent(principal, {
              tool: def.name,
              summary: `Refused: ${e.message}`,
              ok: false,
            });
          return reply(`Error: ${e.message}`, true);
        }
        console.error(`[mcp] ${def.name} failed`, e);
        if (principal && !readOnly)
          await recordApiEvent(principal, {
            tool: def.name,
            summary: `${def.title}: failed with an internal error`,
            ok: false,
          });
        return reply(
          "Error: something went wrong on the server. The change may or may not have been applied. Read the current state before trying again.",
          true
        );
      }
    }) as never
  );
}

// ---------- shared input pieces ----------

/** Ids are cuids. Bounding the shape keeps junk out of queries and logs. */
export const id = (what: string) =>
  z
    .string()
    .regex(
      /^[a-zA-Z0-9]{8,40}$/,
      `Not a valid ${what} id. Ids come from the list and get tools; do not pass a name or a path.`
    )
    .describe(`The ${what} id, as returned by the list and get tools.`);

const CONTROL = /[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g;

/** Trim, drop control and direction-override characters, collapse spaces. */
export function clean(input: string): string {
  return input.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

export const nameField = (what: string, max = 200) =>
  z
    .string()
    .max(max)
    .transform(clean)
    .refine((s) => s.length > 0, `${what} cannot be empty`)
    .refine((s) => s.length <= max, `${what} is too long (max ${max} characters)`);

/**
 * A folder location as a path such as "Financials/2025". Leading and trailing
 * slashes are ignored; "" is the top level.
 */
export const MAX_DEPTH = 8;
export function parsePath(input: string | undefined | null): string[] {
  if (!input) return [];
  const parts = input
    .split("/")
    .map(clean)
    .filter((p) => p.length > 0);
  if (parts.length > MAX_DEPTH)
    throw new ToolError(
      `Folder paths can be at most ${MAX_DEPTH} levels deep; "${input}" has ${parts.length}.`
    );
  for (const p of parts) {
    if (p === "." || p === "..")
      throw new ToolError(
        `"${p}" is not a folder name. Paths are absolute from the top level, like "Financials/2025".`
      );
    if (p.length > 120)
      throw new ToolError(
        `Folder names can be at most 120 characters; "${p.slice(0, 40)}..." is longer.`
      );
  }
  return parts;
}

export const pathField = z
  .string()
  .max(1200)
  .describe(
    'Folder path from the top level, with "/" between levels, for example "Financials/2025". Use "" for the top level.'
  );

export function assertOneOf(
  a: unknown,
  b: unknown,
  message: string
) {
  if (a !== undefined && a !== null && b !== undefined && b !== null)
    throw new ToolError(message);
}

/** The app's own origin, from configuration rather than request headers. */
export function appOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
}

/** Public URL of a sharing link. */
export function publicLinkUrl(link: {
  slug: string;
  domain?: { domain: string } | null;
}): string {
  return link.domain
    ? `https://${link.domain.domain}/${link.slug}`
    : `${appOrigin()}/view/${link.slug}`;
}
