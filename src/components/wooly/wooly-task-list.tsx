"use client";

import { useState } from "react";
import { canUseWoolyAccess, type WoolyAudience, type WoolyTourId } from "@/lib/domain/wooly";
import { woolyKnowledge } from "@/lib/domain/wooly-knowledge";

export function WoolyTaskList({ audience, onTour, resumeSteps }: { audience: WoolyAudience; onTour: (id: WoolyTourId, step?: string) => void; resumeSteps: Partial<Record<WoolyTourId, string>> }) {
  const [query, setQuery] = useState("");
  const tasks = woolyKnowledge.filter((entry) => entry.tutorial && canUseWoolyAccess(entry.access, audience) &&
    `${entry.feature} ${entry.title} ${entry.keywords} ${entry.variants.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section aria-label="Task tutorials">
    <h2>What would you like to do?</h2>
    <label className="wooly-search"><input type="search" aria-label="Search task tutorials" placeholder="Search tasks, such as add a song" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="wooly-topic-list wooly-task-list">{tasks.length ? tasks.map((entry) => {
      const id: WoolyTourId = `task-${entry.id}`;
      const resume = resumeSteps[id];
      return <div key={entry.id}><button type="button" aria-label={entry.title} onClick={() => onTour(id, resume)}><span><small>{entry.feature}{resume ? " · Resume guide" : ""}</small><br />{entry.title}</span></button>{resume && <button type="button" aria-label={`Restart ${entry.title}`} onClick={() => onTour(id)}>Restart</button>}</div>;
    }) : <p>No matching task. Try a feature name or ask Wooly in Chat.</p>}</div>
  </section>;
}
