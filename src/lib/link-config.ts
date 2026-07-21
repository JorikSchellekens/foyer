import { z } from "zod";

/** Everything configurable on a link; shared by the editor, presets and MCP. */
export const linkConfigSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .regex(/^[a-zA-Z0-9-_]*$/, "Letters, numbers and dashes only")
    .max(64)
    .optional(),
  domainId: z.string().nullable().optional(),
  accessMode: z.enum(["PUBLIC", "EMAIL", "EMAIL_VERIFIED"]).default("PUBLIC"),
  password: z.string().max(200).nullable().optional(),
  clearPassword: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(), // ISO date
  allowDownload: z.boolean().default(true),
  allowList: z.array(z.string()).default([]),
  blockList: z.array(z.string()).default([]),
  screenshotProtection: z.boolean().default(false),
  watermark: z.boolean().default(false),
  agreementId: z.string().nullable().optional(),
  notifyOnAccess: z.boolean().default(true),
  enableIndexFile: z.boolean().default(false),
  enableQA: z.boolean().default(false),
  welcomeMessage: z.string().max(2000).nullable().optional(),
  previewPresetId: z.string().nullable().optional(),
  metaTitle: z.string().max(200).nullable().optional(),
  metaDescription: z.string().max(500).nullable().optional(),
  metaImageKey: z.string().nullable().optional(),
  fullAccess: z.boolean().default(true),
  permissions: z
    .array(
      z.object({
        itemType: z.enum(["DATAROOM_DOCUMENT", "DATAROOM_FOLDER"]),
        itemId: z.string(),
        canView: z.boolean(),
        canDownload: z.boolean(),
      })
    )
    .default([]),
});

export type LinkConfig = z.infer<typeof linkConfigSchema>;

/** Subset of config stored inside a LinkPreset. */
export const presetConfigSchema = linkConfigSchema.omit({
  name: true,
  slug: true,
  permissions: true,
  fullAccess: true,
});

export type PresetConfig = z.infer<typeof presetConfigSchema>;
