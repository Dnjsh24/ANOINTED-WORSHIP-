import Link from "next/link";
import { buildListingHref } from "@/lib/domain/listing-pagination";

export function ListPagination({
  path,
  page,
  pageCount,
  params,
  totalCount,
}: {
  path: string;
  page: number;
  pageCount: number;
  params: Record<string, string | undefined>;
  totalCount: number;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="List pages" className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
      {page > 1 ? (
        <Link href={buildListingHref(path, page - 1, params)} className="rounded-md px-3 py-2 font-semibold text-violet-300 hover:bg-white/[0.06]">
          Previous
        </Link>
      ) : <span />}
      <span aria-live="polite" className="text-xs font-semibold text-zinc-400">
        Page {page} of {pageCount} · {totalCount} results
      </span>
      {page < pageCount ? (
        <Link href={buildListingHref(path, page + 1, params)} className="rounded-md px-3 py-2 font-semibold text-violet-300 hover:bg-white/[0.06]">
          Next
        </Link>
      ) : <span />}
    </nav>
  );
}
