"use client";

import { useState } from "react";
import { Copy, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSetlistTemplateAction } from "@/app/actions";

export function SaveAsTemplateButton({ setlistId }: { setlistId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("setlistId", setlistId);
    formData.append("name", name);
    formData.append("description", description);

    await createSetlistTemplateAction(formData);
    
    setLoading(false);
    setIsOpen(false);
  }

  return (
    <>
      <Button 
        variant="secondary" 
        onClick={() => setIsOpen(true)}
        className="rounded-xl px-4 py-2 text-xs font-bold"
      >
        <Copy className="mr-2 size-4" />
        Save as Template
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#16151a] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Save as Template</h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-4">
               <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-zinc-300">Template Name *</span>
                  <Input 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="e.g. Standard Sunday Service" 
                    required 
                    autoFocus
                  />
               </label>
               <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-zinc-300">Description (Optional)</span>
                  <Input 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    placeholder="Brief note about this template" 
                  />
               </label>
               
               <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={!name || loading} className="bg-violet-600 hover:bg-violet-500">
                    {loading ? "Saving..." : "Save Template"}
                  </Button>
               </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
