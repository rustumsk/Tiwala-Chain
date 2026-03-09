"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAccount, useChainId } from "wagmi";
import {
  BriefcaseBusiness,
  ChevronRight,
  FilePlus2,
  FileText,
  Home,
  LayoutDashboard,
  LinkIcon,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import WalletButton from "@/components/blockchain/wallet-button";
import {
  AppThemeProvider,
  type AppTheme,
} from "@/components/layout/theme-context";
import {
  PROFILE_UPDATED_EVENT,
  type LocalUserProfile,
} from "@/lib/profile";
import {
  AUTH_UPDATED_EVENT,
  clearAuthSession,
  fetchCurrentUser,
  getAuthStorageRaw,
  getStoredAuthSession,
  isSessionExpired,
  syncProfileFromBackendUser,
} from "@/lib/auth";

type RouteShellProps = {
  children: React.ReactNode;
};

const THEME_STORAGE_KEY = "tiwala:theme";

function getAppLinks(role?: LocalUserProfile["role"]) {
  const canCreateEmployerResources = role === "employer" || role === "both";

  return [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      matches: (pathname: string) => pathname === "/dashboard",
    },
    {
      href: "/jobs",
      label: "Jobs",
      icon: BriefcaseBusiness,
      matches: (pathname: string) =>
        pathname === "/jobs" ||
        (pathname.startsWith("/jobs/") && pathname !== "/jobs/create"),
    },
    ...(canCreateEmployerResources
      ? [
          {
            href: "/jobs/create",
            label: "Create Job",
            icon: FilePlus2,
            matches: (pathname: string) => pathname === "/jobs/create",
          },
          {
            href: "/contracts/create",
            label: "Contract Builder",
            icon: FileText,
            matches: (pathname: string) => pathname.startsWith("/contracts"),
          },
        ]
      : []),
    {
      href: "/settings/profile",
      label: "Profile Settings",
      icon: Settings,
      matches: (pathname: string) => pathname.startsWith("/settings"),
    },
  ];
}

const homeSections = [
  { href: "#hero", label: "Home" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#cta", label: "Get Started" },
];

function scrollToSection(id: string) {
  const el = document.getElementById(id.replace("#", ""));
  if (el) el.scrollIntoView({ behavior: "smooth" });
}

function formatTitleFromPath(pathname: string) {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/jobs") return "Jobs";
  if (pathname === "/jobs/create") return "Create Job";
  if (pathname.startsWith("/jobs/")) return `Job ${pathname.split("/").at(-1)}`;
  if (pathname === "/contracts/create") return "Contract Builder";
  if (pathname === "/settings/profile") return "Profile Settings";
  if (pathname === "/onboarding") return "Onboarding";
  return "TiwalaChain";
}

function getProfileStorageRaw() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("tiwala:user-profile");
}

function getInitialTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function RouteShell({ children }: RouteShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [theme, setTheme] = useState<AppTheme>(() => getInitialTheme());
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("tiwala:sidebar-hidden") === "true";
  });

  const isHome = pathname === "/";
  const isOnboarding = pathname === "/onboarding";
  const isAppRoute = !isHome && !isOnboarding;
  const isDashboard = pathname === "/dashboard";
  const isDarkTheme = theme === "dark";

  const profileSnapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener(PROFILE_UPDATED_EVENT, onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener(PROFILE_UPDATED_EVENT, onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    getProfileStorageRaw,
    () => null
  );

  const profile = useMemo(() => {
    if (!address || !profileSnapshot) return null;

    try {
      const parsed = JSON.parse(profileSnapshot) as LocalUserProfile;
      return parsed.wallet.toLowerCase() === address.toLowerCase() ? parsed : null;
    } catch {
      return null;
    }
  }, [address, profileSnapshot]);

  const authSnapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener(AUTH_UPDATED_EVENT, onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener(AUTH_UPDATED_EVENT, onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    getAuthStorageRaw,
    () => null
  );

  const authSession = useMemo(() => {
    if (!authSnapshot) return null;
    const session = getStoredAuthSession();
    if (!session) return null;
    if (isSessionExpired(session)) {
      clearAuthSession();
      return null;
    }
    return session;
  }, [authSnapshot]);

  const isAuthenticated =
    !!authSession &&
    !!address &&
    authSession.walletAddress.toLowerCase() === address.toLowerCase();

  const appLinks = useMemo(() => getAppLinks(profile?.role), [profile?.role]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const toggleSidebar = () => {
    setSidebarHidden((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("tiwala:sidebar-hidden", String(next));
      }
      return next;
    });
  };

  useEffect(() => {
    if (!isAppRoute) return;

    if (!isConnected || !address) {
      router.replace("/");
      return;
    }

    if (!isAuthenticated) {
      router.replace("/");
      return;
    }

    if (profile) {
      return;
    }

    if (!authSession) return;

    let active = true;
    fetchCurrentUser(authSession.accessToken)
      .then((user) => {
        if (!active) return;
        if (user.walletAddress.toLowerCase() !== address.toLowerCase()) {
          clearAuthSession();
          router.replace("/");
          return;
        }

        if (user.displayName) {
          syncProfileFromBackendUser(user);
          return;
        }

        router.replace("/onboarding");
      })
      .catch(() => {
        if (!active) return;
        clearAuthSession();
        router.replace("/");
      });

    return () => {
      active = false;
    };
  }, [
    address,
    authSession,
    isAppRoute,
    isAuthenticated,
    isConnected,
    profile,
    router,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const themeToggleButton = (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition ${
        isDarkTheme
          ? "border-white/15 bg-white/[0.04] text-white/85 hover:border-violet-300/35 hover:bg-violet-500/12"
          : "border-[#dde1ec] bg-white text-[#363c4e] hover:border-violet-300 hover:bg-violet-50"
      }`}
      aria-label={`Switch to ${isDarkTheme ? "light" : "dark"} mode`}
    >
      {isDarkTheme ? <Sun size={14} /> : <Moon size={14} />}
      {isDarkTheme ? "Light" : "Dark"}
    </button>
  );

  if (!isAppRoute) {
    return (
      <AppThemeProvider value={{ theme, isDarkTheme, setTheme, toggleTheme }}>
        <div className={`min-h-screen ${isDarkTheme ? "bg-[#080010] text-white" : "bg-[#f3f4f9] text-[#181b26]"}`}>
          <header
            className={`sticky top-0 z-40 border-b ${
              isDarkTheme
                ? "border-white/10 bg-[#080010]"
                : "border-[#e5e8f2] bg-[#f8f9fc]"
            }`}
          >
            <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 md:px-12">
              <Link className="group inline-flex shrink-0 items-center gap-2.5" href="/">
                <span
                  className={`inline-flex size-8 items-center justify-center rounded-lg ${
                    isDarkTheme
                      ? "bg-violet-500/20 text-violet-300"
                      : "bg-violet-100 text-violet-700"
                  }`}
                >
                  <LinkIcon size={15} strokeWidth={2.5} />
                </span>
                <span
                  className={`text-sm font-semibold tracking-wide transition-colors duration-200 ${
                    isDarkTheme
                      ? "text-white group-hover:text-violet-300"
                      : "text-[#171a24] group-hover:text-violet-700"
                  }`}
                >
                  TiwalaChain
                </span>
              </Link>

              <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 md:flex">
                {isHome ? (
                  homeSections.map((link) => (
                    <button
                      key={link.href}
                      onClick={() => scrollToSection(link.href)}
                      className={`text-sm transition-colors duration-200 ${
                        isDarkTheme
                          ? "text-white/50 hover:text-white/90"
                          : "text-[#666b80] hover:text-[#171a24]"
                      }`}
                    >
                      {link.label}
                    </button>
                  ))
                ) : (
                  <Link
                    href="/"
                    className={`inline-flex items-center gap-2 text-sm transition-colors ${
                      isDarkTheme
                        ? "text-white/60 hover:text-white"
                        : "text-[#666b80] hover:text-[#171a24]"
                    }`}
                  >
                    <Home size={14} />
                    Back to Home
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2">
                {themeToggleButton}
                <WalletButton
                  buttonClassName={`rounded-full border px-4 py-2 text-sm transition-all duration-200 ${
                    isDarkTheme
                      ? "border-white/20 bg-transparent text-white hover:border-white/60"
                      : "border-[#d8dceb] bg-white text-[#262b3b] hover:border-violet-300"
                  }`}
                  connectedClassName={`rounded-full border px-4 py-2 text-sm transition-all duration-200 ${
                    isDarkTheme
                      ? "border-violet-400/40 bg-violet-500/10 text-violet-300 hover:border-violet-400/70"
                      : "border-violet-300 bg-violet-100 text-violet-700 hover:border-violet-400"
                  }`}
                  wrongNetworkClassName={`rounded-full border px-4 py-2 text-sm transition-all duration-200 ${
                    isDarkTheme
                      ? "border-red-400/40 bg-red-500/10 text-red-300 hover:border-red-400/70"
                      : "border-red-300 bg-red-50 text-red-700 hover:border-red-400"
                  }`}
                />
              </div>
            </nav>
          </header>
          {children}
        </div>
      </AppThemeProvider>
    );
  }

  return (
    <AppThemeProvider value={{ theme, isDarkTheme, setTheme, toggleTheme }}>
      <div
        className={`relative min-h-screen overflow-hidden ${
          isDarkTheme ? "text-white" : "text-[#171a24]"
        } ${isDashboard ? (isDarkTheme ? "bg-[#090d16]" : "bg-[#f3f4f9]") : (isDarkTheme ? "bg-[#060912]" : "bg-[#f3f4f9]")}`}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: isDarkTheme
              ? isDashboard
                ? [
                    "radial-gradient(ellipse 50% 70% at 0% 0%, rgba(116,76,222,0.13) 0%, transparent 70%)",
                    "radial-gradient(ellipse 45% 65% at 100% 0%, rgba(116,76,222,0.1) 0%, transparent 72%)",
                  ].join(", ")
                : [
                    "radial-gradient(ellipse 42% 76% at 0% 20%, rgba(76,29,149,0.26) 0%, transparent 70%)",
                    "radial-gradient(ellipse 42% 76% at 100% 18%, rgba(99,43,160,0.22) 0%, transparent 72%)",
                    "radial-gradient(ellipse 34% 38% at 50% 100%, rgba(91,44,166,0.16) 0%, transparent 80%)",
                  ].join(", ")
              : [
                  "radial-gradient(ellipse 52% 70% at 0% 0%, rgba(124,58,237,0.12) 0%, transparent 70%)",
                  "radial-gradient(ellipse 45% 65% at 100% 0%, rgba(139,92,246,0.09) 0%, transparent 72%)",
                ].join(", "),
          }}
        />

        <div className="relative z-10 flex min-h-screen">
          <aside
            className={`hidden shrink-0 border-r py-6 transition-all duration-300 lg:flex lg:flex-col ${
              isDarkTheme
                ? "border-white/10 bg-black/25"
                : "border-[#e5e8f2] bg-[#f7f8fc]"
            } ${sidebarHidden ? "w-24 px-3" : "w-72 px-6"}`}
          >
            <div
              className={`flex items-center ${sidebarHidden ? "justify-center" : "justify-between gap-3"}`}
            >
              <Link
                className={`inline-flex items-center ${sidebarHidden ? "justify-center" : "gap-3"}`}
                href="/dashboard"
              >
                <span
                  className={`inline-flex size-10 items-center justify-center rounded-2xl border ${
                    isDarkTheme
                      ? "border-violet-300/20 bg-violet-400/10 text-violet-200"
                      : "border-violet-300 bg-violet-100 text-violet-700"
                  }`}
                >
                  <ChevronRight size={16} strokeWidth={2.8} />
                </span>
                {!sidebarHidden ? (
                  <div>
                    <p className={`text-sm font-semibold ${isDarkTheme ? "text-white" : "text-[#161925]"}`}>TiwalaChain</p>
                    <p className={`text-xs ${isDarkTheme ? "text-white/45" : "text-[#73788c]"}`}>Trust-first app workspace</p>
                  </div>
                ) : null}
              </Link>

              {!sidebarHidden ? (
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className={`inline-flex size-10 items-center justify-center rounded-2xl border transition ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20 hover:text-white"
                      : "border-[#dce0ec] bg-white text-[#697086] hover:border-violet-300 hover:text-[#151925]"
                  }`}
                  aria-label="Hide sidebar"
                >
                  <PanelLeftClose size={18} />
                </button>
              ) : null}
            </div>

            {sidebarHidden ? (
              <div className="mt-8 flex flex-1 flex-col items-center">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className={`inline-flex size-11 items-center justify-center rounded-2xl border transition ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.04] text-white/75 hover:border-white/20 hover:text-white"
                      : "border-[#dce0ec] bg-white text-[#697086] hover:border-violet-300 hover:text-[#151925]"
                  }`}
                  aria-label="Show sidebar"
                >
                  <PanelLeftOpen size={18} />
                </button>

                <nav className="mt-6 flex w-full flex-1 flex-col items-center gap-3">
                  {appLinks.map(({ href, label, icon: Icon, matches }) => {
                    const active = matches(pathname);
                    return (
                      <Link
                        key={label}
                        href={href}
                        title={label}
                        className={`inline-flex size-11 items-center justify-center rounded-2xl border transition-all duration-200 ${
                          active
                            ? isDarkTheme
                              ? "border-violet-300/25 bg-violet-500/12 text-white shadow-[0_0_0_1px_rgba(196,181,253,0.08)_inset]"
                              : "border-violet-300 bg-violet-100 text-violet-800"
                            : isDarkTheme
                              ? "border-white/8 bg-white/[0.03] text-white/58 hover:border-white/15 hover:bg-white/[0.05] hover:text-white/88"
                              : "border-[#dce0ec] bg-white text-[#667089] hover:border-violet-300 hover:bg-violet-50 hover:text-[#1a2030]"
                        }`}
                      >
                        <Icon size={16} />
                      </Link>
                    );
                  })}
                </nav>
              </div>
            ) : (
              <>
                <div className="mt-8">
                  <p className={`mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] ${isDarkTheme ? "text-white/35" : "text-[#767c90]"}`}>
                    Main App
                  </p>
                  <nav className="space-y-2">
                    {appLinks.map(({ href, label, icon: Icon, matches }) => {
                      const active = matches(pathname);
                      return (
                        <Link
                          key={label}
                          href={href}
                          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-all duration-200 ${
                            active
                              ? isDarkTheme
                                ? "border-violet-300/25 bg-violet-500/12 text-white shadow-[0_0_0_1px_rgba(196,181,253,0.08)_inset]"
                                : "border-violet-300 bg-violet-100 text-violet-800"
                              : isDarkTheme
                                ? "border-white/8 bg-white/[0.03] text-white/58 hover:border-white/15 hover:bg-white/[0.05] hover:text-white/88"
                                : "border-[#dce0ec] bg-white text-[#667089] hover:border-violet-300 hover:bg-violet-50 hover:text-[#1a2030]"
                          }`}
                        >
                          <Icon size={16} />
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </div>

                <div
                  className={`mt-auto rounded-3xl border p-5 ${
                    isDarkTheme
                      ? "border-white/10 bg-white/[0.04] shadow-[0_24px_70px_rgba(120,70,220,0.18)]"
                      : "border-[#e3e6f1] bg-white shadow-[0_10px_30px_rgba(40,50,90,0.08)]"
                  }`}
                >
                  <div
                    className={`inline-flex size-10 items-center justify-center rounded-2xl border ${
                      isDarkTheme
                        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    <ShieldCheck size={18} />
                  </div>
                  <p className={`mt-4 text-sm font-semibold ${isDarkTheme ? "text-white" : "text-[#171b28]"}`}>
                    {profile?.displayName ?? "Wallet Connected"}
                  </p>
                  <p className={`mt-1 text-xs capitalize ${isDarkTheme ? "text-white/55" : "text-[#6b7288]"}`}>
                    Role: {profile?.role ?? "pending"}
                  </p>
                  <p className={`mt-1 text-xs ${isDarkTheme ? "text-white/45" : "text-[#7b8297]"}`}>
                    Network: {chainId === 11155111 ? "Sepolia" : `Chain ${chainId}`}
                  </p>
                </div>
              </>
            )}
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header
              className={`sticky top-0 z-30 border-b ${
                isDarkTheme
                  ? "border-white/10 bg-[#090d18]"
                  : "border-[#e5e8f2] bg-[#f8f9fc]"
              }`}
            >
              <div className="flex flex-col gap-4 px-4 py-4 md:px-8 lg:px-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p
                    className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${
                        isDarkTheme ? "text-white/35" : "text-[#7b8196]"
                      }`}
                    >
                      App Workspace
                    </p>
                    <h1
                      className={`mt-1 text-xl font-semibold ${
                        isDarkTheme ? "text-white" : "text-[#151824]"
                      }`}
                    >
                      {formatTitleFromPath(pathname)}
                    </h1>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {profile ? (
                      <div
                        className={`hidden rounded-full border px-4 py-2 text-xs sm:block ${
                          isDarkTheme
                            ? "border-white/10 bg-white/[0.04] text-white/70"
                            : "border-[#e1e5f0] bg-white text-[#4d5265]"
                        }`}
                      >
                        {profile.displayName} · <span className="capitalize">{profile.role}</span>
                      </div>
                    ) : null}
                    {themeToggleButton}
                    <WalletButton />
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto lg:hidden">
                  {appLinks.map(({ href, label, icon: Icon, matches }) => {
                    const active = matches(pathname);
                    return (
                      <Link
                        key={label}
                        href={href}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm whitespace-nowrap ${
                          active
                            ? isDarkTheme
                              ? "border-violet-300/30 bg-violet-500/15 text-white"
                              : "border-violet-300 bg-violet-100 text-violet-900"
                            : isDarkTheme
                              ? "border-white/10 bg-white/[0.04] text-white/60"
                              : "border-[#e1e5f0] bg-white text-[#5e6478]"
                        }`}
                      >
                        <Icon size={14} />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </header>

            <main
              className={`flex-1 px-4 py-6 md:px-8 md:py-8 lg:px-10 ${
                isDashboard
                  ? "dashboard-main-surface"
                  : isDarkTheme
                    ? "bg-white/[0.02]"
                    : "bg-[#f3f4f9]"
              }`}
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </AppThemeProvider>
  );
}
