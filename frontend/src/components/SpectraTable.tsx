import React, { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Search } from "lucide-react";
import type { SpectrumResult } from "@/lib/mockGenerator";

interface SpectraTableProps {
  results: SpectrumResult[];
}

type SortKey = "id" | "probability" | "cls";
type SortDir = "asc" | "desc";

export const SpectraTable: React.FC<SpectraTableProps> = ({ results }) => {
  const [sortKey, setSortKey] = useState<SortKey>("probability");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return results.filter((r) => !q || r.label.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }, [results, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "probability") diff = a.probability - b.probability;
      else if (sortKey === "cls") diff = a.cls - b.cls;
      else diff = a.id.localeCompare(b.id);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageData = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 text-teal" />
      : <ChevronDown className="h-3 w-3 text-teal" />;
  };

  return (
    <div className="card-surface rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Detailed Results</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} spectra</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-teal/40 w-40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {([["id", "Spectrum ID"], ["probability", "Probability p"], ["cls", "Class"]] as [SortKey, string][]).map(
                ([key, label]) => (
                  <th
                    key={key}
                    className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none transition-colors"
                    onClick={() => toggleSort(key)}
                  >
                    <span className="flex items-center gap-1.5">
                      {label}
                      <SortIcon col={key} />
                    </span>
                  </th>
                )
              )}
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Score Bar</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((r, i) => (
              <tr
                key={r.id}
                className={[
                  "border-b border-border/50 transition-colors hover:bg-muted/20",
                  i % 2 === 0 ? "" : "bg-muted/10",
                ].join(" ")}
              >
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.id}</td>
                <td className="px-4 py-2.5 font-mono font-semibold tabular-nums">
                  <span className={r.cls === 1 ? "text-danger" : "text-teal"}>
                    {r.probability.toFixed(4)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {r.cls === 1 ? (
                    <span className="badge-cls-1">cls = 1</span>
                  ) : (
                    <span className="badge-cls-0">cls = 0</span>
                  )}
                </td>
                <td className="px-4 py-2.5 w-36">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${(r.probability * 100).toFixed(1)}%`,
                        background: r.cls === 1 ? "hsl(var(--red-neg))" : "hsl(var(--teal))",
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-border">
        <span className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-teal/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-teal/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

