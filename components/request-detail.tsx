"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  compatibleUnits,
  getWorkflowData,
  issueBloodUnit,
  loadCurrentStaffRole,
  loadWorkflowData,
  recordCrossmatch,
} from "@/lib/db/workflows";

export function RequestDetail({ requestId }: { requestId: string }) {
  const {
    data: loadedData,
    mutate,
    isLoading,
  } = useSWR("blood-bank-workflows", loadWorkflowData, {
    fallbackData: getWorkflowData(),
    refreshInterval: 15000,
    revalidateOnFocus: true,
  });
  const { data: currentRole } = useSWR(
    "blood-bank-staff-role",
    loadCurrentStaffRole,
    { revalidateOnFocus: true },
  );
  const data = loadedData ?? getWorkflowData();
  const request = data.requests.find((item) => item.id === requestId);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [unitId, setUnitId] = useState("");
  const [emergencyUnitId, setEmergencyUnitId] = useState("");
  const [approver, setApprover] = useState("");
  const matches = data.crossmatches.filter(
    (match) => match.requestId === requestId,
  );
  const units = request ? compatibleUnits(request) : [];
  const selectedUnit = units.find((unit) => unit.id === unitId);
  const emergencyUnits = units.filter(
    (unit) => unit.bloodGroup === "O-" && unit.status === "available",
  );
  const selectedEmergencyUnit = emergencyUnits.find(
    (unit) => unit.id === emergencyUnitId,
  );
  const selectedHasMatch = Boolean(
    selectedUnit &&
    (selectedUnit.reservedForRequest === requestId ||
      matches.some(
        (match) =>
          match.unitId === selectedUnit.id && match.result === "compatible",
      )),
  );
  const issuedCount = request
    ? (request.issuedUnits ??
      data.issues.filter((issue) => issue.requestId === requestId).length)
    : 0;
  const canCrossmatch = ["admin", "lab_tech"].includes(currentRole || "");
  const canIssue = ["admin", "medical_officer"].includes(currentRole || "");

  async function act(callback: () => unknown | Promise<unknown>) {
    setError("");
    setMessage("");
    try {
      await callback();
      await mutate();
      setMessage("Action recorded successfully.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to complete the action.",
      );
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-[1100px] px-5 py-8 md:px-8">
        <Link
          href="/requests"
          className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-red-700"
        >
          <ArrowLeft size={14} /> All requests
        </Link>
        {isLoading && !request ? (
          <section className="rounded-xl border bg-white p-8">
            <h1 className="text-xl font-bold">Loading request…</h1>
          </section>
        ) : !request ? (
          <section className="rounded-xl border bg-white p-8">
            <h1 className="text-xl font-bold">Request not found</h1>
            <p className="mt-2 text-sm text-slate-500">
              This request may have been removed or the link is invalid.
            </p>
          </section>
        ) : (
          <>
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700">
                  Blood request workflow
                </p>
                <h1 className="mt-2 text-2xl font-bold">{request.patient}</h1>
                <p className="mt-1 text-xs text-slate-500">
                  {request.id} · {request.ward} ·{" "}
                  {request.diagnosis || "Hospital request"}
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                {request.status}
              </span>
            </header>
            {(message || error) && (
              <div
                role={error ? "alert" : "status"}
                className={`mb-4 rounded-lg p-3 text-xs ${error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
              >
                {error || message}
              </div>
            )}
            <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
              <section className="rounded-xl border bg-white p-5">
                <h2 className="font-bold">Request details</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    ["Blood group", request.bloodGroup],
                    ["Component", request.component],
                    ["Units requested", request.units],
                    ["Units issued", `${issuedCount} / ${request.units}`],
                    ["Urgency", request.urgency],
                    ["Patient age", request.age ?? "—"],
                    ["Doctor", request.doctor || "—"],
                    ["UHID", request.uhid || "—"],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-lg bg-slate-50 p-3"
                    >
                      <p className="text-[10px] text-slate-400">{label}</p>
                      <p className="mt-1 text-xs font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] text-slate-500">
                  Every requested unit needs a compatible cross-match before
                  routine issue.
                </p>
              </section>
              <section className="rounded-xl border bg-white p-5">
                <h2 className="font-bold">Compatible inventory</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Available units and units already cross-matched to this
                  request, ordered by expiry.
                </p>
                <label className="mt-4 flex flex-col gap-1.5 text-[11px] font-semibold text-slate-600">
                  Select unit
                  <select
                    value={unitId}
                    onChange={(event) => setUnitId(event.target.value)}
                    className="h-10 rounded-lg border px-3 text-xs"
                  >
                    <option value="">Select a compatible unit</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.id} · {unit.bloodGroup} · {unit.component} ·{" "}
                        {unit.status} · exp {unit.expiryDate}
                      </option>
                    ))}
                  </select>
                </label>
                {units.length === 0 && (
                  <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                    No unexpired available inventory matches this blood group
                    and component.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={
                      !selectedUnit ||
                      selectedUnit.status !== "available" ||
                      !canCrossmatch
                    }
                    onClick={() =>
                      act(() =>
                        recordCrossmatch(request.id, unitId, "compatible"),
                      )
                    }
                    className="rounded-lg bg-[#b91c1c] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <CheckCircle2 className="mr-1 inline" size={14} /> Record
                    compatible cross-match
                  </button>
                  <button
                    disabled={
                      !selectedUnit ||
                      selectedUnit.status !== "available" ||
                      !canCrossmatch
                    }
                    onClick={() =>
                      act(() =>
                        recordCrossmatch(request.id, unitId, "incompatible"),
                      )
                    }
                    className="rounded-lg border px-4 py-2.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Mark incompatible
                  </button>
                </div>
                {request.urgency === "emergency" && canIssue && (
                  <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-xs font-bold text-red-800">
                      <ShieldAlert className="mr-1 inline" size={14} />{" "}
                      Emergency O-negative quick issue
                    </p>
                    <p className="mt-1 text-[10px] text-red-700">
                      Requires an available O-negative unit and medical officer
                      approval.
                    </p>
                    <label className="mt-3 flex flex-col gap-1 text-[10px] font-semibold text-red-800">
                      Available O-negative unit
                      <select
                        value={emergencyUnitId}
                        onChange={(event) =>
                          setEmergencyUnitId(event.target.value)
                        }
                        className="h-9 rounded border border-red-200 bg-white px-3 text-xs"
                      >
                        <option value="">Select an available O-negative unit</option>
                        {emergencyUnits.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.id} · {unit.component} · exp {unit.expiryDate}
                          </option>
                        ))}
                      </select>
                    </label>
                    {emergencyUnits.length === 0 && (
                      <p className="mt-2 text-[10px] text-red-700">
                        No unexpired, available O-negative unit matches this
                        request.
                      </p>
                    )}
                    <label className="mt-3 flex flex-col gap-1 text-[10px] font-semibold text-red-800">
                      Medical officer approver
                      <input
                        value={approver}
                        onChange={(event) => setApprover(event.target.value)}
                        className="h-9 rounded border border-red-200 bg-white px-3 text-xs"
                        placeholder="Approver name"
                      />
                    </label>
                    <button
                      disabled={
                        !selectedEmergencyUnit ||
                        !approver.trim()
                      }
                      onClick={() =>
                        act(() =>
                          issueBloodUnit(
                            request.id,
                            emergencyUnitId,
                            approver,
                            true,
                          ),
                        )
                      }
                      className="mt-3 rounded-lg bg-red-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Emergency issue one unit
                    </button>
                  </div>
                )}
                {["Ready", "Partially Issued"].includes(request.status) &&
                  canIssue && (
                    <button
                      disabled={!selectedUnit || !selectedHasMatch}
                      onClick={() =>
                        act(() =>
                          issueBloodUnit(
                            request.id,
                            unitId,
                            approver || "Medical officer",
                          ),
                        )
                      }
                      className="mt-4 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Issue selected cross-matched unit
                    </button>
                  )}
              </section>
            </div>
            <section className="mt-5 rounded-xl border bg-white p-5">
              <h2 className="font-bold">Cross-match history</h2>
              {matches.length ||
              data.issues.some((issue) => issue.requestId === requestId) ? (
                <div className="mt-3 divide-y">
                  {matches.map((match) => (
                    <div
                      key={match.id}
                      className="flex justify-between py-3 text-xs"
                    >
                      <span>{match.unitId}</span>
                      <span className="capitalize">{match.result}</span>
                      <span className="text-slate-400">
                        {new Date(match.doneAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {data.issues
                    .filter((issue) => issue.requestId === requestId)
                    .map((issue) => (
                      <div
                        key={issue.id}
                        className="flex justify-between py-3 text-xs"
                      >
                        <span>{issue.unitId}</span>
                        <span className="text-emerald-700">issued</span>
                        <span className="text-slate-400">
                          {new Date(issue.date).toLocaleString()}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400">
                  No cross-match or issue records.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
