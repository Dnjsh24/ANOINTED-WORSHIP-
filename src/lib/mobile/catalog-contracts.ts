import { z } from "zod";
import { mobileIdentitySchema } from "./contracts";

export const mobileCatalogKinds = ["song", "setlist", "event"] as const;
export const mobileCatalogRequestSchema = z.object({
  version: z.literal(1),
  kind: z.enum(mobileCatalogKinds),
  search: z.string().trim().max(120).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Search must use printable text.").optional(),
  after: z.uuid().optional(),
}).strict();
export const mobileCatalogItemSchema = z.object({
  kind: z.enum(mobileCatalogKinds), id: z.uuid(), title: z.string().max(160), subtitle: z.string().max(300).nullable(),
}).strict();
export const mobileCatalogResponseSchema = z.object({
  version: z.literal(1), identity: mobileIdentitySchema,
  items: z.array(mobileCatalogItemSchema).max(50), nextId: z.uuid().nullable(),
}).strict();
export type MobileCatalogRequest = z.infer<typeof mobileCatalogRequestSchema>;
export type MobileCatalogItem = z.infer<typeof mobileCatalogItemSchema>;
export type MobileCatalogResponse = z.infer<typeof mobileCatalogResponseSchema>;
