"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export function SearchBox({
  placeholder,
  children,
}: {
  placeholder: string;
  children: (query: string) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useMemo(() => query.trim().toLowerCase(), [query]);

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 size-4 text-violet-200" />
        <Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} />
      </div>
      {children(debouncedQuery)}
    </>
  );
}
