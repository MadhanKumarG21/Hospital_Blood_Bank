"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Search,
  Plus,
  SlidersHorizontal,
  Download,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  UserRound,
  Phone,
  CalendarDays,
  ArrowUpDown,
  Droplet,
  UserPlus,
} from "lucide-react";
import {
  listDonors,
  createDonor,
  donorRegistrationSchema,
  type DonorRegistrationInput,
} from "@/lib/db/donors";
import { seedDonors } from "@/lib/seed";
import type { BloodGroup, Donor } from "@/lib/types";
import { AppShell } from "@/components/app-shell";
import { isFirebaseConfigured } from "@/lib/firebase";

type FormErrors = Partial<Record<keyof DonorRegistrationInput, string>>;
const groups: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
function BloodBadge({ group }: { group: BloodGroup }) {
  return (
    <span
      className={`inline-flex min-w-[43px] justify-center rounded-md px-2 py-1 text-[11px] font-bold ${group.endsWith("+") ? "bg-[#fff0f0] text-[#a61b1b]" : "bg-slate-100 text-slate-700"}`}
    >
      {group}
    </span>
  );
}
function ageFrom(dob: string) {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000),
  );
}

function downloadDonorCsv(donors: Donor[]) {
  const rows = [
    ["Donor ID", "Name", "Phone", "Blood group", "Donor type", "Last donation"],
    ...donors.map((donor) => [
      donor.donorId,
      donor.name,
      donor.phone,
      donor.bloodGroup,
      donor.donorType,
      donor.lastDonationDate || "",
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((value) => `\"${String(value).replaceAll('\"', '\"\"')}\"`)
        .join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "blood-bank-donors.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function DonorsPage() {
  const {
    data: donorData,
    error: donorLoadError,
    mutate,
  } = useSWR("blood-bank-donors", listDonors, {
    fallbackData: isFirebaseConfigured ? [] : seedDonors,
    refreshInterval: 15000,
    revalidateOnFocus: true,
  });
  const donors = donorData ?? [];
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("All groups");
  const [typeFilter, setTypeFilter] = useState("All types");
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<Donor | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(
    () =>
      donors.filter((donor) => {
        const text =
          `${donor.name} ${donor.phone} ${donor.donorId}`.toLowerCase();
        return (
          (!query || text.includes(query.toLowerCase())) &&
          (groupFilter === "All groups" || donor.bloodGroup === groupFilter) &&
          (typeFilter === "All types" || donor.donorType === typeFilter)
        );
      }),
    [donors, query, groupFilter, typeFilter],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  async function submit(formData: FormData) {
    const raw = Object.fromEntries(formData.entries());
    const parsed = donorRegistrationSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors as FormErrors);
      return;
    }
    setErrors({});
    setSaveError("");
    setSaving(true);
    try {
      await createDonor(parsed.data);
      await mutate();
      setModal(false);
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 2800);
    } catch (reason) {
      setSaveError(
        reason instanceof Error
          ? reason.message
          : "Unable to save the donor record.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <AppShell>
      <main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.15em] text-[#b91c1c]">
              Donor management
            </div>
            <h1 className="text-[27px] font-bold tracking-[-.04em] text-[#182431] sm:text-[31px]">
              Donors
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage donor records, eligibility and donation history.
            </p>
          </div>
          <button
            onClick={() => {
              setErrors({});
              setModal(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#b91c1c] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991b1b]"
          >
            <Plus size={16} /> Register donor
          </button>
        </div>
        {(donorLoadError || saveError) && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800"
          >
            {saveError ||
              "Unable to load Firestore donor records. Confirm your account is active and the Firestore rules are published."}
          </div>
        )}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: "Registered donors",
              value: donors.length,
              caption: "All active records",
              color: "text-[#b91c1c]",
              icon: UserRound,
            },
            {
              label: "Eligible to donate",
              value: donors.filter((d) => d.deferral.type === "none").length,
              caption: "Based on current records",
              color: "text-emerald-700",
              icon: UserPlus,
            },
            {
              label: "Voluntary donors",
              value: donors.filter((d) => d.donorType === "voluntary").length,
              caption: "Community donors",
              color: "text-blue-700",
              icon: Droplet,
            },
            {
              label: "Deferred",
              value: donors.filter((d) => d.deferral.type !== "none").length,
              caption: "Temporary or permanent",
              color: "text-amber-700",
              icon: CalendarDays,
            },
          ].map(({ label, value, caption, color, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl border border-[#e9edf1] bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-slate-500">
                  {label}
                </p>
                <Icon size={16} className={color} />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[#202c39]">
                {value}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">{caption}</p>
            </div>
          ))}
        </div>
        <section className="overflow-hidden rounded-xl border border-[#e9edf1] bg-white">
          <div className="flex flex-col gap-3 border-b border-[#edf0f3] p-4 md:flex-row md:items-center md:justify-between md:px-5">
            <div>
              <h2 className="text-sm font-bold text-[#202c39]">
                Donor directory{" "}
                <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {filtered.length}
                </span>
              </h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Search and manage registered blood donors
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[200px] flex-1 md:flex-none">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search donors..."
                  aria-label="Search donors"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none placeholder:text-slate-400 focus:border-[#cf7373] focus:ring-2 focus:ring-red-100 md:w-[230px]"
                />
              </label>
              <select
                value={groupFilter}
                onChange={(e) => {
                  setGroupFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by blood group"
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] text-slate-600 outline-none"
              >
                <option>All groups</option>
                {groups.map((group) => (
                  <option key={group}>{group}</option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by donor type"
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] text-slate-600 outline-none"
              >
                <option>All types</option>
                <option value="voluntary">Voluntary</option>
                <option value="replacement">Replacement</option>
              </select>
              <button
                aria-label="Export donors"
                onClick={() => downloadDonorCsv(filtered)}
                className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <Download size={15} />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[770px] text-left">
              <thead className="bg-[#fafbfc]">
                <tr className="border-b border-[#edf0f3] text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3">
                    Donor <ArrowUpDown className="ml-1 inline" size={11} />
                  </th>
                  <th className="px-4 py-3">Blood group</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Donor type</th>
                  <th className="px-4 py-3">Last donation</th>
                  <th className="px-4 py-3">Eligibility</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2f4]">
                {filtered.slice((page - 1) * 10, page * 10).map((donor) => (
                  <tr key={donor.id} className="transition hover:bg-[#fcfcfd]">
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setSelected(donor)}
                        className="flex items-center gap-3 text-left"
                      >
                        <span className="grid size-9 place-items-center rounded-full bg-[#f5eeee] text-[11px] font-bold text-[#a53737]">
                          {donor.name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span>
                          <span className="block text-xs font-semibold text-slate-800">
                            {donor.name}
                          </span>
                          <span className="mt-1 block text-[10px] text-slate-400">
                            {donor.donorId} <span className="px-1">·</span>{" "}
                            {ageFrom(donor.dob)} years
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <BloodBadge group={donor.bloodGroup} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-slate-600">
                        {donor.phone}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${donor.donorType === "voluntary" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}
                      >
                        {donor.donorType === "voluntary"
                          ? "Voluntary"
                          : "Replacement"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {donor.lastDonationDate
                        ? new Date(donor.lastDonationDate).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" },
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      {donor.deferral.type === "none" ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
                          <span className="size-1.5 rounded-full bg-emerald-500" />{" "}
                          Eligible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-amber-700">
                          <span className="size-1.5 rounded-full bg-amber-500" />{" "}
                          Deferred
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        aria-label={`More actions for ${donor.name}`}
                        onClick={() => setSelected(donor)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-12 text-center">
              <UserRound className="mx-auto text-slate-300" size={28} />
              <p className="mt-3 text-sm font-semibold text-slate-700">
                No donors found
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Try adjusting your search or filters.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-3 border-t border-[#edf0f3] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-slate-400">
              Showing{" "}
              <span className="font-semibold text-slate-600">
                {filtered.length === 0
                  ? 0
                  : Math.min(filtered.length, (page - 1) * 10 + 1)}
                –{Math.min(filtered.length, page * 10)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-600">
                {filtered.length}
              </span>{" "}
              donors
            </p>
            <div className="flex items-center gap-1">
              <button
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="grid size-7 place-items-center rounded border border-slate-200 text-slate-500 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map(
                (number) => (
                  <button
                    key={number}
                    aria-current={number === page ? "page" : undefined}
                    onClick={() => setPage(number)}
                    className={`grid size-7 place-items-center rounded text-[11px] ${number === page ? "bg-[#b91c1c] font-semibold text-white" : "border border-slate-200 text-slate-500"}`}
                  >
                    {number}
                  </button>
                ),
              )}
              <button
                aria-label="Next page"
                disabled={page === pageCount}
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
                className="grid size-7 place-items-center rounded border border-slate-200 text-slate-500 disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </section>
        {success && (
          <div
            role="status"
            className="fixed bottom-5 right-5 z-50 rounded-lg bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-lg"
          >
            Donor record created successfully.
          </div>
        )}
        {modal && (
          <div
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModal(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-donor-title"
              className="w-full max-w-[530px] rounded-2xl bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between border-b border-slate-100 p-5">
                <div>
                  <h2
                    id="add-donor-title"
                    className="text-base font-bold text-slate-900"
                  >
                    Register a donor
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Add a new donor to the hospital registry.
                  </p>
                </div>
                <button
                  onClick={() => setModal(false)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X size={17} />
                </button>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit(new FormData(event.currentTarget));
                }}
                className="p-5"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(
                    [
                      {
                        name: "name",
                        label: "Full name",
                        type: "text",
                        placeholder: "e.g. Jordan Lee",
                      },
                      {
                        name: "phone",
                        label: "Phone number",
                        type: "tel",
                        placeholder: "+919876543210",
                      },
                      { name: "dob", label: "Date of birth", type: "date" },
                      {
                        name: "address",
                        label: "Address",
                        type: "text",
                        placeholder: "Street address",
                      },
                    ] as const
                  ).map((field) => (
                    <label
                      key={field.name}
                      className="flex flex-col gap-1.5 text-[11px] font-semibold text-slate-600"
                    >
                      {field.label}
                      <input
                        name={field.name}
                        type={field.type}
                        required
                        maxLength={field.name === "phone" ? 13 : undefined}
                        max={
                          field.name === "dob"
                            ? new Date().toISOString().slice(0, 10)
                            : undefined
                        }
                        inputMode={field.name === "phone" ? "tel" : undefined}
                        placeholder={
                          "placeholder" in field ? field.placeholder : undefined
                        }
                        aria-invalid={Boolean(errors[field.name])}
                        className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-normal outline-none focus:border-[#cd7070] focus:ring-2 focus:ring-red-100"
                      />
                      {errors[field.name] && (
                        <span className="font-normal text-red-600">
                          {errors[field.name]}
                        </span>
                      )}
                    </label>
                  ))}
                  <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-slate-600">
                    Gender
                    <select
                      required
                      name="gender"
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal"
                    >
                      <option>Female</option>
                      <option>Male</option>
                      <option>Other</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-slate-600">
                    Blood group
                    <select
                      required
                      name="bloodGroup"
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal"
                    >
                      {groups.map((group) => (
                        <option key={group}>{group}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-[11px] font-semibold text-slate-600 sm:col-span-2">
                    Donor type
                    <select
                      required
                      name="donorType"
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal"
                    >
                      <option value="voluntary">Voluntary</option>
                      <option value="replacement">Replacement</option>
                    </select>
                  </label>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModal(false)}
                    className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={saving}
                    className="h-9 rounded-lg bg-[#b91c1c] px-4 text-xs font-semibold text-white hover:bg-[#991b1b] disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Create donor record"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {selected && (
          <div
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
            className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"
          >
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="donor-detail-title"
              className="h-full w-full max-w-[430px] overflow-y-auto bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <p className="text-xs font-semibold text-slate-500">
                  Donor profile
                </p>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close donor profile"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-4">
                  <div className="grid size-14 place-items-center rounded-full bg-[#f5eeee] text-base font-bold text-[#a53737]">
                    {selected.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div>
                    <h2 id="donor-detail-title" className="text-lg font-bold">
                      {selected.name}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {selected.donorId}
                    </p>
                  </div>
                  <BloodBadge group={selected.bloodGroup} />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[
                    ["Phone", selected.phone],
                    ["Date of birth", selected.dob],
                    ["Gender", selected.gender],
                    ["Donor type", selected.donorType],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] text-slate-400">{label}</p>
                      <p className="mt-1 text-xs font-semibold capitalize text-slate-700">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-xs font-semibold text-emerald-800">
                    {selected.deferral.type === "none"
                      ? "Eligible for screening"
                      : "Currently deferred"}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-emerald-700">
                    {selected.deferral.type === "none"
                      ? "Confirm screening measurements and donation interval before every collection."
                      : selected.deferral.reason}
                  </p>
                </div>
                <h3 className="mt-7 text-sm font-bold">Donation history</h3>
                <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-5 text-center">
                  <Droplet className="mx-auto text-slate-300" size={20} />
                  <p className="mt-2 text-xs font-medium text-slate-600">
                    {selected.lastDonationDate
                      ? "Latest donation recorded"
                      : "No donations recorded yet"}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {selected.lastDonationDate ||
                      "Donation history will appear here."}
                  </p>
                </div>
                <button className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#b91c1c] text-xs font-semibold text-white">
                  <Plus size={15} /> Start collection
                </button>
              </div>
            </aside>
          </div>
        )}
      </main>
    </AppShell>
  );
}
