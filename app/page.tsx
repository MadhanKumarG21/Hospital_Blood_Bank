'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleAlert, Clock3, Droplet, FlaskConical, PackageCheck, ShieldAlert, Users } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AppShell } from '@/components/app-shell'
import { getWorkflowData, loadWorkflowData, settings } from '@/lib/db/workflows'
import { monthlyActivity } from '@/lib/seed'
import { isFirebaseConfigured } from '@/lib/firebase'
import type { BloodGroup } from '@/lib/types'

const groups: BloodGroup[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']

function buildActivity(donations: { date: string }[], issues: { date: string }[]) {
  const now = new Date()
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return {
      month: date.toLocaleDateString('en-US', { month: 'short' }),
      collections: donations.filter(item => item.date.startsWith(key)).length,
      issues: issues.filter(item => item.date.startsWith(key)).length,
    }
  })
}

export default function DashboardPage() {
  const { data: loadedData, error: loadError } = useSWR('blood-bank-workflows', loadWorkflowData, {
    fallbackData: getWorkflowData(),
    refreshInterval: 15000,
    revalidateOnFocus: true,
  })
  const data = loadedData ?? getWorkflowData()
  const today = new Date().toISOString().slice(0, 10)
  const expiryLimit = new Date(Date.now() + settings.expiryAlertDays * 86400000).toISOString().slice(0, 10)
  const groupCounts = useMemo(() => Object.fromEntries(groups.map(group => [
    group,
    data.units.filter(unit => unit.status === 'available' && unit.bloodGroup === group).length,
  ])) as Record<BloodGroup, number>, [data.units])
  const lowStockGroups = groups.filter(group => groupCounts[group] < settings.lowStockThresholds[group])
  const counts = useMemo(() => ({
    available: data.units.filter(unit => unit.status === 'available' && unit.expiryDate >= today).length,
    expiring: data.units.filter(unit => unit.status === 'available' && unit.expiryDate >= today && unit.expiryDate <= expiryLimit).length,
    expired: data.units.filter(unit => unit.status === 'expired' || (unit.expiryDate < today && !['issued', 'discarded'].includes(unit.status))).length,
    quarantine: data.units.filter(unit => unit.status === 'quarantine').length,
    pending: data.requests.filter(request => !['Issued', 'Cancelled'].includes(request.status)).length,
    collections: data.donations.filter(donation => donation.date === today).length,
    issues: data.issues.filter(issue => issue.date.slice(0, 10) === today).length,
    screening: data.donations.filter(donation => ['testing', 'quarantine'].includes(donation.status)).length,
  }), [data.units, data.requests, data.donations, data.issues, today, expiryLimit])
  const priorityRequests = useMemo(() => [...data.requests]
    .filter(request => !['Issued', 'Cancelled'].includes(request.status))
    .sort((a, b) => ['emergency', 'urgent', 'routine'].indexOf(a.urgency) - ['emergency', 'urgent', 'routine'].indexOf(b.urgency)), [data.requests])
  const activity = useMemo(() => isFirebaseConfigured ? buildActivity(data.donations, data.issues) : monthlyActivity, [data.donations, data.issues])
  const thisMonth = today.slice(0, 7)
  const collectedThisMonth = data.donations.filter(donation => donation.date.startsWith(thisMonth)).length
  const urgentCount = priorityRequests.filter(request => request.urgency === 'urgent').length
  const emergencyCount = priorityRequests.filter(request => request.urgency === 'emergency').length
  const attentionAlerts = [
    ...(counts.expired > 0 ? [{ title: 'Expired units', detail: `${counts.expired} units are past their expiry date and cannot be issued.`, href: '/inventory', tone: 'red' }] : []),
    ...(counts.expiring > 0 ? [{ title: 'Units expiring soon', detail: `${counts.expiring} units expire within ${settings.expiryAlertDays} days.`, href: '/inventory', tone: 'amber' }] : []),
    ...(lowStockGroups.length > 0 ? [{ title: 'Low blood stock', detail: lowStockGroups.map(group => `${group}: ${groupCounts[group]}/${settings.lowStockThresholds[group]}`).join(' · '), href: '/inventory', tone: 'red' }] : []),
    ...(priorityRequests.length > 0 ? [{ title: `${priorityRequests[0].urgency} request · ${priorityRequests[0].ward}`, detail: `${priorityRequests[0].patient} needs ${priorityRequests[0].units} ${priorityRequests[0].component} unit(s) · ${priorityRequests[0].status}.`, href: `/requests/${encodeURIComponent(priorityRequests[0].id)}`, tone: 'red' }] : []),
    ...(counts.screening > 0 ? [{ title: 'Screening results pending', detail: `${counts.screening} donations are in testing or quarantine.`, href: '/testing', tone: 'blue' }] : []),
  ]
  const metricCards = [
    { label: 'Available units', value: counts.available, detail: 'Unexpired units across all groups', icon: PackageCheck, tone: 'red', badge: 'Current stock' },
    { label: 'Expiring soon', value: counts.expiring, detail: `Within ${settings.expiryAlertDays} days`, icon: Clock3, tone: 'amber', badge: 'Review inventory' },
    { label: 'Expired units', value: counts.expired, detail: 'Unavailable for issue', icon: CircleAlert, tone: 'red', badge: 'Past expiry' },
    { label: 'In quarantine', value: counts.quarantine, detail: 'Awaiting review', icon: ShieldAlert, tone: 'blue', badge: 'Restricted stock' },
    { label: 'Pending requests', value: counts.pending, detail: `${emergencyCount} emergency · ${urgentCount} urgent`, icon: Users, tone: 'purple', badge: 'Open queue' },
    { label: 'Low-stock groups', value: lowStockGroups.length, detail: 'Below configured thresholds', icon: Droplet, tone: 'amber', badge: 'Replenishment needed' },
    { label: 'Today’s collections', value: counts.collections, detail: 'Donations recorded today', icon: Droplet, tone: 'blue', badge: 'Today' },
    { label: 'Today’s issues', value: counts.issues, detail: 'Units issued today', icon: PackageCheck, tone: 'green', badge: 'Today' },
  ]

  return <AppShell><main className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-9">
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.15em] text-[#b91c1c]"><span className="size-1.5 rounded-full bg-[#b91c1c]"/>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        <h1 className="text-[27px] font-bold tracking-[-.04em] text-[#182431] sm:text-[31px]">Blood bank overview</h1>
        <p className="mt-1 text-sm text-slate-500">Live operational status across your blood bank.</p>
      </div>
      <Link href="/requests?new=1" className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-[#b91c1c] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991b1b] sm:self-auto"><span>+</span> New blood request</Link>
    </div>
    {loadError && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">Unable to load the live Firestore dashboard. Confirm your staff account is active and the latest Firestore rules are published.</div>}
    <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metricCards.map(({ label, value, detail, icon: Icon, tone, badge }) => <article key={label} className="rounded-xl border border-[#e9edf1] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.025)]">
        <div className="flex items-start justify-between"><div className={`grid size-10 place-items-center rounded-xl ${tone === 'red' ? 'bg-red-50 text-[#b91c1c]' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'purple' ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}><Icon size={19}/></div><span className="text-[10px] font-semibold text-slate-400">{badge}</span></div>
        <div className="mt-4"><p className="text-[13px] font-medium text-slate-500">{label}</p><p className="mt-1 text-[29px] font-bold tracking-tight text-[#1b2836]">{value}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></div>
      </article>)}
    </section>
    <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr_1fr]">
      <article className="rounded-xl border border-[#e9edf1] bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-[#202c39]">Collection &amp; issue activity</h2><p className="mt-1 text-xs text-slate-400">Monthly records · {activity[0]?.month} — {activity[activity.length - 1]?.month}</p></div></div>
        <div className="mt-5 h-[235px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={activity} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}><defs><linearGradient id="collectionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c53333" stopOpacity={0.13}/><stop offset="95%" stopColor="#c53333" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f3" strokeDasharray="3 5"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a0ae' }} dy={9}/><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a0ae' }}/><Tooltip contentStyle={{ border: '1px solid #edf0f3', borderRadius: 10, fontSize: 12, boxShadow: '0 8px 24px rgba(15,23,42,.08)' }}/><Area type="monotone" dataKey="collections" name="Collections" stroke="#b91c1c" strokeWidth={2.3} fill="url(#collectionFill)"/><Area type="monotone" dataKey="issues" name="Issues" stroke="#9aa7b5" strokeWidth={2} strokeDasharray="4 4" fill="transparent"/></AreaChart></ResponsiveContainer></div>
        <div className="mt-1 flex items-center gap-5 text-[11px] text-slate-500"><span className="flex items-center gap-2"><span className="h-0.5 w-4 rounded bg-[#b91c1c]"/> Collections</span><span className="flex items-center gap-2"><span className="h-0.5 w-4 rounded bg-slate-400"/> Issues</span><span className="ml-auto font-semibold text-slate-600">{collectedThisMonth} <span className="font-normal text-slate-400">collected this month</span></span></div>
      </article>
      <article className="rounded-xl border border-[#e9edf1] bg-white p-5 md:p-6">
        <div className="flex items-start justify-between"><div><h2 className="text-sm font-bold text-[#202c39]">Stock by blood group</h2><p className="mt-1 text-xs text-slate-400">Unexpired available units · all components</p></div><Link href="/inventory" className="text-xs font-semibold text-[#b91c1c]">View inventory <ArrowRight className="ml-1 inline" size={13}/></Link></div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">{groups.map(group => {
          const count = groupCounts[group]
          const threshold = settings.lowStockThresholds[group]
          const low = count < threshold
          return <div key={group} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${low ? 'border-amber-200 bg-amber-50/65' : 'border-[#edf0f3] bg-[#fbfcfd]'}`}><span className={`inline-flex min-w-[39px] justify-center rounded-md px-2 py-1 text-xs font-bold ${group.endsWith('-') ? 'bg-slate-100 text-slate-700' : 'bg-red-100 text-[#a91b1b]'}`}>{group}</span><span className="text-sm font-bold text-slate-700">{count}<span className="ml-1 text-[10px] font-normal text-slate-400">units</span></span></div>
        })}</div>
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800"><CircleAlert size={15}/><span><strong>{lowStockGroups.length} blood groups</strong> below configured stock thresholds</span></p>
      </article>
    </section>
    <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr_1fr]">
      <article className="rounded-xl border border-[#e9edf1] bg-white">
        <div className="flex items-center justify-between border-b border-[#edf0f3] px-5 py-4 md:px-6"><div><h2 className="text-sm font-bold text-[#202c39]">Priority requests</h2><p className="mt-1 text-xs text-slate-400">Open requests sorted by urgency</p></div><Link href="/requests" className="text-xs font-semibold text-[#b91c1c]">See all <ArrowRight className="ml-1 inline" size={13}/></Link></div>
        {priorityRequests.length ? <div className="divide-y divide-[#f0f2f4]">{priorityRequests.slice(0, 5).map(request => <Link key={request.id} href={`/requests/${encodeURIComponent(request.id)}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 md:px-6"><div className={`grid size-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold ${request.urgency === 'emergency' ? 'bg-red-100 text-[#b91c1c]' : 'bg-slate-100 text-slate-700'}`}>{request.bloodGroup}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-semibold text-slate-800">{request.patient}</p><span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{request.urgency}</span></div><p className="mt-1 truncate text-[10px] text-slate-400">{request.id} · {request.component} · {request.units} units · {request.ward}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{request.status}</span></Link>)}</div>
          : <p className="p-8 text-center text-xs text-slate-400">No open requests.</p>}
      </article>
      <article className="rounded-xl border border-[#e9edf1] bg-white">
        <div className="flex items-center justify-between border-b border-[#edf0f3] px-5 py-4 md:px-6"><div><h2 className="text-sm font-bold text-[#202c39]">Attention needed</h2><p className="mt-1 text-xs text-slate-400">Alerts from current inventory and workflow</p></div><span className="grid size-7 place-items-center rounded-full bg-red-50 text-[11px] font-bold text-[#b91c1c]">{attentionAlerts.length}</span></div>
        {attentionAlerts.length ? <div className="flex flex-col gap-3 p-5 md:px-6">{attentionAlerts.map(alert => <Link key={alert.title} href={alert.href} className={`flex gap-3 rounded-lg border p-3 ${alert.tone === 'red' ? 'border-red-100 bg-red-50/55' : alert.tone === 'amber' ? 'border-amber-100 bg-amber-50/60' : 'border-blue-100 bg-blue-50/55'}`}><div className={`mt-0.5 ${alert.tone === 'red' ? 'text-[#b91c1c]' : alert.tone === 'amber' ? 'text-amber-700' : 'text-blue-700'}`}>{alert.tone === 'blue' ? <FlaskConical size={16}/> : alert.tone === 'amber' ? <Clock3 size={16}/> : <CircleAlert size={16}/>}</div><div><p className="text-xs font-semibold text-slate-800">{alert.title}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{alert.detail}</p><span className="mt-2 inline-block text-[10px] font-semibold text-slate-600">Review <ArrowRight className="ml-1 inline" size={12}/></span></div></Link>)}</div>
          : <p className="p-8 text-center text-xs text-slate-400">No current alerts.</p>}
      </article>
    </section>
    <p className="mt-6 flex items-center gap-1.5 text-[10px] text-slate-400"><span className="inline-block size-1.5 rounded-full bg-emerald-500"/> Live Firestore data · Refreshes automatically every 15 seconds</p>
  </main></AppShell>
}
