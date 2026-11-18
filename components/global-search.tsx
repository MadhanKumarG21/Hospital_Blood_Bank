"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { WorkflowData } from "@/lib/db/workflows";

type SearchResult = {
  label: string;
  detail: string;
  href: string;
  kind: string;
};

export function GlobalSearch({ data }: { data: WorkflowData }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    const candidates: SearchResult[] = [
      ...data.donors.map((donor) => ({
        label: donor.name,
        detail: `${donor.donorId} · ${donor.phone} · ${donor.bloodGroup}`,
        href: "/donors",
        kind: "Donor",
      })),
      ...data.requests.map((request) => ({
        label: request.patient,
        detail: `${request.id} · ${request.ward} · ${request.bloodGroup} · ${request.status}`,
        href: `/requests/${encodeURIComponent(request.id)}`,
        kind: "Request",
      })),
      ...data.units.map((unit) => ({
        label: unit.id,
        detail: `${unit.bloodGroup} · ${unit.component} · ${unit.status} · exp ${unit.expiryDate}`,
        href: "/inventory",
        kind: "Inventory",
      })),
    ];
    return candidates
      .filter((item) =>
        `${item.label} ${item.detail}`.toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [data.donors, data.requests, data.units, search]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-[#eaedf0] bg-[#fafbfc] px-3 py-2.5 text-left text-xs text-slate-400 hover:border-slate-300"
        aria-label="Search donors, requests, and inventory"
      >
        <Search size={15} /> Search donors, requests, inventory{" "}
        <kbd className="ml-auto rounded border bg-white px-1.5 py-0.5 text-[10px]">
          Search
        </kbd>
      </button>
      {open && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh]"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-search-title"
            className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          >
            <h2 id="global-search-title" className="sr-only">
              Search blood bank records
            </h2>
            <label className="flex items-center gap-3 border-b border-slate-100 px-4">
              <Search size={17} className="text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search donors, requests, units…"
                className="h-12 flex-1 text-sm outline-none"
                aria-label="Search blood bank records"
              />
              <button
                onClick={() => setOpen(false)}
                className="rounded border px-1.5 py-0.5 text-[10px] text-slate-500"
              >
                Esc
              </button>
            </label>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {!search.trim() ? (
                <p className="px-3 py-8 text-center text-xs text-slate-400">
                  Enter a name, phone number, request ID, unit ID, or blood
                  group.
                </p>
              ) : results.length ? (
                results.map((item, index) => (
                  <Link
                    key={`${item.kind}-${item.label}-${index}`}
                    href={item.href}
                    onClick={() => {
                      setOpen(false);
                      setSearch("");
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-slate-50"
                  >
                    <span className="min-w-20 rounded bg-slate-100 px-2 py-1 text-center text-[10px] font-semibold text-slate-600">
                      {item.kind}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-800">
                        {item.label}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-slate-500">
                        {item.detail}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="px-3 py-8 text-center text-xs text-slate-400">
                  No matching records.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
