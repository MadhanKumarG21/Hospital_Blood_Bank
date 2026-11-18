"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, getDocFromCache } from "firebase/firestore";
import {
  Bell,
  ChevronDown,
  ClipboardList,
  Droplet,
  FileBarChart2,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  TentTree,
  Users,
  X,
} from "lucide-react";
import { GlobalSearch } from "@/components/global-search";
import { cn } from "@/lib/utils";
import {
  auth,
  firestore,
  isFirebaseConfigured,
  isFirebaseOfflineError,
} from "@/lib/firebase";
import { getWorkflowData, loadWorkflowData } from "@/lib/db/workflows";
import type { Role } from "@/lib/types";

const sections = [
  {
    title: "WORKSPACE",
    links: [
      { label: "Overview", href: "/", icon: LayoutDashboard },
      { label: "Donors", href: "/donors", icon: Users },
      { label: "Collections", href: "/collections", icon: Droplet },
      { label: "Testing", href: "/testing", icon: FlaskConical },
      { label: "Inventory", href: "/inventory", icon: Package },
      { label: "Requests", href: "/requests", icon: ClipboardList },
    ],
  },
  {
    title: "MANAGEMENT",
    links: [
      { label: "Camps", href: "/camps", icon: TentTree },
      { label: "Reports", href: "/reports", icon: FileBarChart2 },
    ],
  },
];
const roleLabel: Record<Role, string> = {
  admin: "Administrator",
  medical_officer: "Medical officer",
  lab_tech: "Lab technician",
  nurse_phlebotomist: "Phlebotomist",
  receptionist: "Receptionist",
};
const roles: Role[] = [
  "admin",
  "medical_officer",
  "lab_tech",
  "nurse_phlebotomist",
  "receptionist",
];
const access: Record<string, Role[]> = {
  "/": roles,
  "/donors": ["admin", "nurse_phlebotomist", "receptionist"],
  "/collections": ["admin", "nurse_phlebotomist"],
  "/testing": ["admin", "lab_tech"],
  "/inventory": ["admin", "medical_officer", "lab_tech"],
  "/requests": ["admin", "medical_officer", "lab_tech", "receptionist"],
  "/camps": ["admin", "nurse_phlebotomist", "receptionist"],
  "/reports": ["admin", "medical_officer", "receptionist"],
  "/issues": ["admin", "medical_officer"],
  "/discards": ["admin", "medical_officer"],
  "/audit-log": ["admin", "medical_officer"],
  "/settings": ["admin"],
};

function isRole(value: unknown): value is Role {
  return typeof value === "string" && roles.some((role) => role === value);
}

function pageTitle(pathname: string) {
  if (pathname === "/") return "Overview";
  if (pathname.startsWith("/requests/")) return "Requests";
  return pathname
    .slice(1)
    .split("/")[0]
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("admin");
  const [userName, setUserName] = useState("Jordan Carter");
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [authError, setAuthError] = useState("");
  const workflowKey =
    !isFirebaseConfigured ||
    (authReady && !authError && Boolean(auth?.currentUser))
      ? "blood-bank-workflows"
      : null;
  const { data: workflowData } = useSWR(workflowKey, loadWorkflowData, {
    fallbackData: getWorkflowData(),
    refreshInterval: 15000,
    revalidateOnFocus: true,
  });
  const requestCount = (workflowData ?? getWorkflowData()).requests.filter(
    (request) => !["Issued", "Cancelled"].includes(request.status),
  ).length;
  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => name[0])
      .join("")
      .toUpperCase() || "ST";

  useEffect(() => {
    const firebaseAuth = auth;
    const database = firestore;
    if (!firebaseAuth || !database || !isFirebaseConfigured) return;
    let active = true;
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (user) => {
        if (!active) return;
        setAuthError("");
        if (!user) {
          router.replace("/login");
          setAuthReady(true);
          return;
        }
        const profileRef = doc(database, "users", user.uid);
        let profile;
        let usedOfflineCache = false;
        try {
          profile = await getDoc(profileRef);
        } catch (error) {
          if (!isFirebaseOfflineError(error)) {
            const code =
              typeof error === "object" && error !== null && "code" in error
                ? String((error as { code?: unknown }).code)
                : "unknown";
            if (active) {
              setAuthError(
                code === "permission-denied"
                  ? `Firestore denied access to users/${user.uid}. Make sure your published rules allow staff to read their own profile.`
                  : `Could not read users/${user.uid} from Firestore (${code}). Check the project configuration and rules.`,
              );
              setAuthReady(true);
            }
            return;
          }
          usedOfflineCache = true;
          try {
            profile = await getDocFromCache(profileRef);
          } catch {
            if (active) {
              setAuthError(
                "You are offline and no cached staff profile is available. Reconnect to verify staff access.",
              );
              setAuthReady(true);
            }
            return;
          }
        }
        if (!active) return;
        if (!profile.exists() || profile.data().active !== true) {
          setAuthError(
            usedOfflineCache
              ? "Your staff profile cannot be verified while offline. Reconnect and try again."
              : profile.exists()
                ? `Your staff profile at users/${user.uid} is inactive. Set active to true to restore access.`
                : `No staff profile exists at users/${user.uid}. Create that Firestore document with active: true and a valid role.`,
          );
          setAuthReady(true);
          return;
        }
        const data = profile.data();
        if (!isRole(data.role)) {
          setAuthError(
            `Your staff profile at users/${user.uid} has an invalid role. Contact an administrator to correct it.`,
          );
          setAuthReady(true);
          return;
        }
        setRole(data.role);
        setUserName(data.name || user.email || "Staff member");
        setAuthReady(true);
      },
      () => {
        if (!active) return;
        setAuthError(
          "Unable to verify your hospital staff session. Reconnect and try again.",
        );
        setAuthReady(true);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    const allowed = access[pathname] ?? access[`/${pathname.split("/")[1]}`];
    if (allowed && !allowed.includes(role)) router.replace("/");
  }, [pathname, role, router]);

  if (!authReady && isFirebaseConfigured)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f9]">
        <p className="text-sm font-medium text-slate-500">
          Checking staff access…
        </p>
      </main>
    );
  if (authError && isFirebaseConfigured)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f9] p-6">
        <section
          role="alert"
          className="max-w-lg rounded-2xl border border-amber-200 bg-white p-7 shadow-sm"
        >
          <h1 className="text-lg font-bold text-slate-900">
            Staff access could not be verified
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 h-10 rounded-lg bg-[#b91c1c] px-4 text-xs font-semibold text-white"
          >
            Retry connection
          </button>
        </section>
      </main>
    );

  const systemLinks = [
    { label: "Audit log", href: "/audit-log", icon: ShieldCheck },
    { label: "Settings", href: "/settings", icon: Settings },
  ].filter((item) => access[item.href]?.includes(role));

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#202a36]">
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col border-r border-[#e8ebef] bg-white transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-[105%]",
        )}
      >
        <div className="flex h-[76px] items-center gap-3 border-b border-[#edf0f2] px-6">
          <div className="grid size-10 place-items-center rounded-xl bg-[#b91c1c] text-white shadow-sm">
            <Droplet size={21} fill="currentColor" />
          </div>
          <div>
            <div className="text-[15px] font-bold tracking-tight text-[#1e2936]">
              BloodBank <span className="text-[#b91c1c]">HMS</span>
            </div>
            <div className="mt-0.5 text-[10px] font-semibold tracking-[.15em] text-slate-400">
              RIVERSIDE GENERAL
            </div>
          </div>
          <button
            className="ml-auto lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-4 pt-5">
          <GlobalSearch data={workflowData ?? getWorkflowData()} />
        </div>
        <nav
          aria-label="Main navigation"
          className="flex-1 overflow-y-auto px-3 pt-6"
        >
          {sections.map((section) => {
            const visibleLinks = section.links.filter((item) =>
              access[item.href]?.includes(role),
            );
            return (
              visibleLinks.length > 0 && (
                <div key={section.title} className="mb-7">
                  <p className="mb-2 px-3 text-[10px] font-bold tracking-[.16em] text-slate-400">
                    {section.title}
                  </p>
                  <div className="flex flex-col gap-1">
                    {visibleLinks.map(({ label, href, icon: Icon }) => {
                      const isActive =
                        pathname === href ||
                        (href !== "/" && pathname.startsWith(href));
                      return (
                        <Link
                          key={label}
                          href={href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "group flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors",
                            isActive
                              ? "bg-[#fff1f1] text-[#b91c1c]"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                          )}
                        >
                          <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
                          {label}
                          {label === "Requests" && requestCount > 0 && (
                            <span className="ml-auto rounded-full bg-[#b91c1c] px-2 py-0.5 text-[10px] font-bold text-white">
                              {requestCount > 99 ? "99+" : requestCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )
            );
          })}
          {systemLinks.length > 0 && (
            <div className="mb-7">
              <p className="mb-2 px-3 text-[10px] font-bold tracking-[.16em] text-slate-400">
                SYSTEM
              </p>
              {systemLinks.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium",
                    pathname === href
                      ? "bg-[#fff1f1] text-[#b91c1c]"
                      : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              ))}
            </div>
          )}
        </nav>
        <div className="border-t border-[#edf0f2] p-4">
          <div className="flex items-center gap-3 rounded-xl bg-[#f8f9fb] p-3">
            <div className="grid size-9 place-items-center rounded-full bg-[#f7d8d8] text-xs font-bold text-[#a51b1b]">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{userName}</p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                {roleLabel[role]}
              </p>
            </div>
            {!isFirebaseConfigured ? (
              <select
                aria-label="Demo role"
                className="max-w-[22px] cursor-pointer border-0 bg-transparent text-xs text-slate-500 outline-none"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {roles.map((value) => (
                  <option key={value} value={value}>
                    {roleLabel[value]}
                  </option>
                ))}
              </select>
            ) : (
              <button
                aria-label="Sign out"
                onClick={() => auth && signOut(auth)}
                className="text-[10px] text-slate-400 hover:text-red-700"
              >
                Sign out
              </button>
            )}
          </div>
          <p className="px-1 pt-3 text-[10px] text-slate-400">
            {isFirebaseConfigured
              ? "Secure staff session"
              : "Demo workspace · Preview data"}
          </p>
        </div>
      </aside>
      <div className="min-h-screen lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e8ebef] bg-white/95 px-5 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
              <span>Riverside General Hospital</span>
              <span>/</span>
              <span className="font-semibold capitalize text-slate-700">
                {pageTitle(pathname)}
              </span>
            </div>
            <span className="font-semibold sm:hidden">
              {pageTitle(pathname)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 rounded-full border border-[#dcefe4] bg-[#f1faf4] px-2.5 py-1.5 text-[10px] font-semibold text-[#25824d] sm:flex">
              <span className="size-1.5 rounded-full bg-[#38a169]" /> Blood bank
              operational
            </div>
            <button
              aria-label="Notifications"
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <Bell size={18} />
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-white bg-[#b91c1c]" />
            </button>
            <div className="hidden h-7 w-px bg-slate-200 sm:block" />
            <button className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-full bg-[#f7d8d8] text-[11px] font-bold text-[#a51b1b]">
                {initials}
              </div>
              <span className="hidden text-xs font-semibold sm:block">
                {userName}
              </span>
              <ChevronDown
                size={14}
                className="hidden text-slate-400 sm:block"
              />
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
