import type { Json } from "@/lib/supabase/database.types";

export function parseSongSlotNotes(value: string | null | undefined) {
  let metadata: { [key: string]: Json | undefined } = {};
  if (value?.startsWith("Lead: ")) metadata.lead = value.slice(6);
  else if (value?.startsWith("Template Tag: ")) metadata.templateTag = value.slice(14);
  else if (value) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as { [key: string]: Json | undefined };
      else metadata.notes = value;
    } catch { metadata.notes = value; }
  }
  return { metadata, lead: typeof metadata.lead === "string" ? metadata.lead : "", notes: typeof metadata.notes === "string" ? metadata.notes : "" };
}
