import { AppShell } from "@/components/app-shell";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { createClient } from "@/lib/supabase/server";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default async function TemplatesPage() {
  const teamContext = await getRequiredTeamContext();
  const allowed = ["owner", "admin", "pastor", "worship_leader"].includes(teamContext.role);
  if (!allowed) {
    redirect("/dashboard");
  }
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("setlist_templates")
    .select("*")
    .eq("team_id", teamContext.teamId)
    .order("created_at", { ascending: false });

  async function deleteTemplate(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (!id) return;
    const sb = await createClient();
    await sb.from("setlist_templates").delete().eq("id", id);
    revalidatePath("/setlists/templates");
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <div className="mb-6">
        <p className="font-mono text-xs font-bold uppercase text-violet-200">Setlists</p>
        <h1 className="mt-2 text-4xl font-bold">Saved Templates</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">Manage your saved setlist templates.</p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates && templates.length > 0 ? templates.map((t) => (
          <div key={t.id} className="rounded-xl border border-white/[0.04] bg-[#16151a] p-6 shadow-xl relative group">
            <h3 className="text-lg font-bold text-white">{t.name}</h3>
            {t.description && <p className="text-sm text-zinc-400 mt-2">{t.description}</p>}
            <p className="text-xs text-violet-400 mt-4 font-semibold">
              {Array.isArray(t.slots) ? t.slots.length : 0} slots
            </p>
            
            <form action={deleteTemplate} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <input type="hidden" name="id" value={t.id} />
              <Button type="submit" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-400/10 !px-2">
                <Trash2 className="size-4" />
              </Button>
            </form>
          </div>
        )) : (
          <div className="col-span-full rounded-xl border border-white/[0.04] bg-[#16151a] p-12 text-center shadow-xl">
             <p className="text-zinc-400">No templates saved yet.</p>
             <p className="text-xs text-zinc-500 mt-2">You can save a template from the Edit Setlist page.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
