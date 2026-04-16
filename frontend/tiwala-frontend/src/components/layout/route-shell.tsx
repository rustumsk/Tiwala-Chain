"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useAccount, useChainId } from "wagmi";
import {
  BriefcaseBusiness,
  FilePlus2,
  FileText,
  Home,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import AppIcon from "@/resource/icon.png";
import WalletButton from "@/components/blockchain/wallet-button";
import NotificationBell from "@/components/layout/notification-bell";
import {
  AppThemeProvider,
  type AppTheme,
} from "@/components/layout/theme-context";
import { SESSION_STRING_UPDATED_EVENT } from "@/hooks/use-persisted-session-string";
import {
  clearStoredProfile,
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

type AppLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  category: string;
  matches: (pathname: string) => boolean;
};

function getAppLinks(
  role?: LocalUserProfile["role"],
  workspaceView: "employer" | "freelancer" = "employer"
): AppLink[] {
  const effectiveRole = role === "both" ? workspaceView : role;
  /** Employer tools stay available for `both` even when the dashboard tab is "freelancer". */
  const canCreateEmployerResources =
    role === "employer" || role === "both";
  const canViewApplications = effectiveRole === "freelancer";
  const isAdmin = role === "admin";

  if (isAdmin) {
    return [
      {
        href: "/admin",
        label: "Admin Dashboard",
        icon: ShieldCheck,
        category: "Admin",
        matches: (pathname: string) => pathname === "/admin",
      },
      {
        href: "/admin/users",
        label: "User Management",
        icon: Users,
        category: "Admin",
        matches: (pathname: string) => pathname === "/admin/users",
      },
      {
        href: "/admin/disputes",
        label: "Disputes",
        icon: Scale,
        category: "Admin",
        matches: (pathname: string) => pathname === "/admin/disputes",
      },
      {
        href: "/settings/profile",
        label: "Profile Settings",
        icon: Settings,
        category: "Account",
        matches: (pathname: string) => pathname.startsWith("/settings"),
      },
    ];
  }

  return [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      category: "Workspace",
      matches: (pathname: string) => pathname === "/dashboard",
    },
    {
      href: "/postings",
      label: canCreateEmployerResources ? "Postings" : "Browse Postings",
      icon: BriefcaseBusiness,
      category: "Work",
      matches: (pathname: string) =>
        pathname === "/postings" ||
        (pathname.startsWith("/postings/") && pathname !== "/postings/create"),
    },
    ...(canViewApplications
      ? [
          {
            href: "/applications",
            label: "Applications",
            icon: FileText,
            category: "Work",
            matches: (pathname: string) => pathname === "/applications",
          },
        ]
      : []),
    {
      href: "/offers",
      label: "Job Offers",
      icon: BriefcaseBusiness,
      category: "Work",
      matches: (pathname: string) =>
        pathname === "/offers" || pathname.startsWith("/offers/"),
    },
    {
      href: "/jobs",
      label: "Jobs",
      icon: BriefcaseBusiness,
      category: "Work",
      matches: (pathname: string) =>
        pathname === "/jobs" ||
        (pathname.startsWith("/jobs/") && pathname !== "/jobs/create"),
    },
    ...(canCreateEmployerResources
      ? [
          {
            href: "/postings/create",
            label: "Create Posting",
            icon: FilePlus2,
            category: "Create",
            matches: (pathname: string) => pathname === "/postings/create",
          },
          {
            href: "/jobs/create",
            label: "Create Job",
            icon: FilePlus2,
            category: "Create",
            matches: (pathname: string) => pathname === "/jobs/create",
          },
          {
            href: "/contracts/create",
            label: "Contract Builder",
            icon: FileText,
            category: "Create",
            matches: (pathname: string) => pathname.startsWith("/contracts"),
          },
        ]
      : []),
    {
      href: "/settings/profile",
      label: "Profile Settings",
      icon: Settings,
      category: "Account",
      matches: (pathname: string) => pathname.startsWith("/settings"),
    },
  ];
}

type HomeNavItem =
  | { kind: "section"; href: string; label: string }
  | { kind: "route"; href: string; label: string };

const homeSections: HomeNavItem[] = [
  { kind: "section", href: "#hero", label: "Home" },
  { kind: "section", href: "#features", label: "Features" },
  { kind: "section", href: "#how-it-works", label: "How It Works" },
  { kind: "route", href: "/public", label: "Public Services" },
  { kind: "section", href: "#cta", label: "Get Started" },
];

function scrollToSection(id: string) {
  const el = document.getElementById(id.replace("#", ""));
  if (el) el.scrollIntoView({ behavior: "smooth" });
}

function formatTitleFromPath(pathname: string) {
  if (pathname === "/public") return "Public Services";
  if (pathname === "/public/postings") return "Public Job Postings";
  if (pathname.startsWith("/public/postings/")) return "Public Posting Detail";
  if (pathname === "/public/contracts") return "Public Contract Tools";
  if (pathname === "/public/contracts/verify") return "Public Contract Verification";
  if (pathname === "/public/ai-review") return "Public AI Review";
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/postings") return "Job Postings";
  if (pathname === "/postings/create") return "Create Posting";
  if (pathname.endsWith("/proposals")) return "Proposal Review";
  if (pathname.startsWith("/postings/")) return "Posting Detail";
  if (pathname === "/applications") return "Applications";
  if (pathname === "/jobs") return "Jobs";
  if (pathname === "/jobs/create") return "Create Job";
  if (pathname.startsWith("/jobs/")) return `Job ${pathname.split("/").at(-1)}`;
  if (pathname === "/offers") return "Job Offers";
  if (pathname.startsWith("/offers/")) return "Offer Detail";
  if (pathname === "/contracts/create") return "Contract Builder";
  if (pathname === "/settings/profile") return "Profile Settings";
  if (pathname === "/onboarding") return "Onboarding";
  if (pathname === "/unauthorized") return "Authentication Required";
  if (pathname === "/pending-approval") return "Pending Approval";
  if (pathname === "/admin") return "Admin Dashboard";
  if (pathname === "/admin/users") return "User Management";
  if (pathname === "/admin/disputes") return "Dispute Resolution";
  return "TiwalaChain";
}

function getProfileStorageRaw() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("tiwala:user-profile");
}

function getDashboardWorkspaceStorageRaw() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem("tiwala:dashboard:workspaceTab");
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
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const chainId = useChainId();
  const [theme, setTheme] = useState<AppTheme>(() => getInitialTheme());
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("tiwala:sidebar-hidden") === "true";
  });

  const isHome = pathname === "/";
  const isOnboarding = pathname === "/onboarding";
  const isUnauthorized = pathname === "/unauthorized";
  const isPendingApproval = pathname === "/pending-approval";
  const isPublic = pathname === "/public" || pathname.startsWith("/public/");
  const isAppRoute =
    !isHome && !isOnboarding && !isUnauthorized && !isPendingApproval && !isPublic;
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

  const workspaceSnapshot = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener(SESSION_STRING_UPDATED_EVENT, onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener(SESSION_STRING_UPDATED_EVENT, onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    getDashboardWorkspaceStorageRaw,
    () => "employer"
  );

  const activeWorkspaceView = useMemo<"employer" | "freelancer">(
    () => (workspaceSnapshot === "freelancer" ? "freelancer" : "employer"),
    [workspaceSnapshot]
  );

  const isAuthenticated =
    !!authSession &&
    !!address &&
    authSession.walletAddress.toLowerCase() === address.toLowerCase();

  const appLinks = useMemo(
    () => getAppLinks(profile?.role, activeWorkspaceView),
    [activeWorkspaceView, profile?.role]
  );
  const appLinkGroups = useMemo(() => {
    const groups: Array<{ category: string; links: AppLink[] }> = [];
    for (const link of appLinks) {
      const prev = groups.at(-1);
      if (!prev || prev.category !== link.category) {
        groups.push({ category: link.category, links: [link] });
      } else {
        prev.links.push(link);
      }
    }
    return groups;
  }, [appLinks]);

  const lastVerifiedRef = useRef<string | null>(null);
  const hadConnectedWalletRef = useRef(false);

  useEffect(() => {
    if (isConnected && address) {
      hadConnectedWalletRef.current = true;
    }
  }, [address, isConnected]);

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

    // Avoid bouncing off app routes while wagmi restores the session (address is briefly undefined).
    if (isReconnecting || isConnecting) {
      return;
    }

    if (!isConnected || !address) {
      // If this tab had a connected wallet before and now it's disconnected,
      // treat it as an explicit logout/disconnect.
      if (authSession && hadConnectedWalletRef.current) {
        clearAuthSession();
        clearStoredProfile();
      }
      // During a hard refresh, wagmi can briefly have no address before restoring.
      // Keep the user on app routes while an auth session exists and no explicit
      // disconnect happened in this tab runtime.
      if (authSession && !hadConnectedWalletRef.current) {
        return;
      }
      router.replace("/");
      return;
    }

    if (!isAuthenticated) {
      router.replace("/unauthorized");
      return;
    }

    if (!authSession) return;

    const verifyKey = `${address.toLowerCase()}:${authSession.accessToken}`;
    if (lastVerifiedRef.current === verifyKey) return;

    let active = true;
    fetchCurrentUser(authSession.accessToken)
      .then((user) => {
        if (!active) return;
        if (user.walletAddress.toLowerCase() !== address.toLowerCase()) {
          clearAuthSession();
          router.replace("/unauthorized");
          return;
        }

        lastVerifiedRef.current = verifyKey;

        if (user.role === "admin") {
          syncProfileFromBackendUser(user);
          return;
        }

        if (!user.displayName) {
          clearStoredProfile();
          router.replace("/onboarding");
          return;
        }

        syncProfileFromBackendUser(user);
        if (!user.isApproved) {
          router.replace("/pending-approval");
        }
      })
      .catch(() => {
        if (!active) return;
        clearAuthSession();
        router.replace("/unauthorized");
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
    isConnecting,
    isReconnecting,
    router,
  ]);

  useEffect(() => {
    if (!isUnauthorized || !isConnected || !address || !isAuthenticated) {
      return;
    }

    if (!authSession) return;

    let active = true;
    fetchCurrentUser(authSession.accessToken)
      .then((user) => {
        if (!active) return;
        if (user.role === "admin") {
          syncProfileFromBackendUser(user);
          router.replace("/admin");
          return;
        }
        if (!user.displayName) {
          clearStoredProfile();
          router.replace("/onboarding");
          return;
        }
        if (!user.isApproved) {
          syncProfileFromBackendUser(user);
          router.replace("/pending-approval");
          return;
        }
        syncProfileFromBackendUser(user);
        router.replace("/dashboard");
      })
      .catch(() => {
        if (!active) return;
        clearAuthSession();
      });

    return () => {
      active = false;
    };
  }, [
    address,
    authSession,
    isAuthenticated,
    isConnected,
    isUnauthorized,
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
                      ? "bg-violet-500/20"
                      : "bg-violet-100"
                  }`}
                >
                  <Image
                    src={AppIcon}
                    alt="TiwalaChain icon"
                    className="h-5 w-5"
                    priority
                  />
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
                    link.kind === "section" ? (
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
                    ) : (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`text-sm transition-colors duration-200 ${
                          isDarkTheme
                            ? "text-white/50 hover:text-white/90"
                            : "text-[#666b80] hover:text-[#171a24]"
                        }`}
                      >
                        {link.label}
                      </Link>
                    )
                  ))
                ) : (
                  <div className="flex items-center gap-5">
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
                    <Link
                      href="/public"
                      className={`text-sm transition-colors ${
                        isDarkTheme
                          ? "text-white/60 hover:text-white"
                          : "text-[#666b80] hover:text-[#171a24]"
                      }`}
                    >
                      Public Services
                    </Link>
                  </div>
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
            className={`hidden shrink-0 transition-all duration-300 lg:flex lg:flex-col ${
              isDarkTheme
                ? "bg-[#08001a]"
                : "bg-[#f7f8fc] shadow-[1px_0_0_#e5e8f2]"
            } ${sidebarHidden ? "w-[72px]" : "w-64"}`}
          >
            <div
              className={`flex h-16 shrink-0 items-center border-b ${
                isDarkTheme ? "border-white/[0.06]" : "border-[#eceef5]"
              } ${sidebarHidden ? "justify-center px-3" : "justify-between px-5"}`}
            >
              <Link
                className={`inline-flex items-center ${sidebarHidden ? "justify-center" : "gap-2.5"}`}
                href="/dashboard"
              >
                <span
                  className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    isDarkTheme
                      ? "bg-violet-500/15"
                      : "bg-violet-100"
                  }`}
                >
                  <Image
                    src={AppIcon}
                    alt="TiwalaChain icon"
                    className="h-5 w-5"
                  />
                </span>
                {!sidebarHidden ? (
                  <span className={`text-[13px] font-semibold tracking-wide ${isDarkTheme ? "text-white/90" : "text-[#161925]"}`}>
                    TiwalaChain
                  </span>
                ) : null}
              </Link>

              {!sidebarHidden ? (
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className={`inline-flex size-8 items-center justify-center rounded-lg transition ${
                    isDarkTheme
                      ? "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
                      : "text-[#9299ae] hover:bg-[#eceef5] hover:text-[#4a506a]"
                  }`}
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose size={16} />
                </button>
              ) : null}
            </div>

            {sidebarHidden ? (
              <div className="flex flex-1 flex-col items-center px-2 pt-4">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className={`mb-4 inline-flex size-9 items-center justify-center rounded-lg transition ${
                    isDarkTheme
                      ? "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
                      : "text-[#9299ae] hover:bg-[#eceef5] hover:text-[#4a506a]"
                  }`}
                  aria-label="Expand sidebar"
                >
                  <PanelLeftOpen size={16} />
                </button>

                <nav className="flex w-full flex-1 flex-col items-center gap-1">
                  {appLinks.map(({ href, label, icon: Icon, matches }, idx) => {
                    const active = matches(pathname);
                    const prevCategory = idx > 0 ? appLinks[idx - 1]?.category : null;
                    const showDivider = prevCategory && prevCategory !== appLinks[idx].category;
                    return (
                      <div key={label} className="w-full">
                        {showDivider ? (
                          <div
                            className={`mx-auto my-2 h-px w-6 ${
                              isDarkTheme ? "bg-white/10" : "bg-[#e3e7f1]"
                            }`}
                          />
                        ) : null}
                        <Link
                          href={href}
                          title={label}
                          className={`relative inline-flex size-10 items-center justify-center rounded-xl transition-all duration-200 ${
                            active
                              ? isDarkTheme
                                ? "bg-violet-500/15 text-violet-300"
                                : "bg-violet-100 text-violet-700"
                              : isDarkTheme
                                ? "text-white/40 hover:bg-white/[0.05] hover:text-white/75"
                                : "text-[#8b90a6] hover:bg-[#eceef5] hover:text-[#3d4460]"
                          }`}
                        >
                          {active ? (
                            <span className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full ${isDarkTheme ? "bg-violet-400" : "bg-violet-500"}`} />
                          ) : null}
                          <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                        </Link>
                      </div>
                    );
                  })}
                </nav>
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-y-auto px-3 pt-5">
                <p className={`mb-3 px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${isDarkTheme ? "text-white/30" : "text-[#9299ae]"}`}>
                  Navigation
                </p>
                <div className="space-y-4">
                  {appLinkGroups.map((group) => (
                    <div key={group.category}>
                      <p
                        className={`mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                          isDarkTheme ? "text-white/25" : "text-[#9aa0b4]"
                        }`}
                      >
                        {group.category}
                      </p>
                      <nav className="space-y-0.5">
                        {group.links.map(({ href, label, icon: Icon, matches }) => {
                          const active = matches(pathname);
                          return (
                            <Link
                              key={label}
                              href={href}
                              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${
                                active
                                  ? isDarkTheme
                                    ? "bg-violet-500/12 text-white"
                                    : "bg-violet-50 text-violet-800"
                                  : isDarkTheme
                                    ? "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                                    : "text-[#6b7089] hover:bg-[#eef0f7] hover:text-[#2e3450]"
                              }`}
                            >
                              {active ? (
                                <span className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full ${isDarkTheme ? "bg-violet-400" : "bg-violet-500"}`} />
                              ) : null}
                              <span
                                className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${
                                  active
                                    ? isDarkTheme
                                      ? "bg-violet-400/15 text-violet-300"
                                      : "bg-violet-100 text-violet-700"
                                    : isDarkTheme
                                      ? "text-white/45 group-hover:text-white/70"
                                      : "text-[#8b90a6] group-hover:text-[#5c6078]"
                                }`}
                              >
                                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                              </span>
                              <span>{label}</span>
                            </Link>
                          );
                        })}
                      </nav>
                    </div>
                  ))}
                </div>

                <div className={`mt-auto pb-4 pt-4`}>
                  <div
                    className={`rounded-2xl border p-4 ${
                      isDarkTheme
                        ? "border-white/[0.06] bg-white/[0.025]"
                        : "border-[#e8eaf3] bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${
                          isDarkTheme
                            ? "bg-violet-500/15 text-violet-300"
                            : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        {(profile?.displayName ?? "?")[0].toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className={`truncate text-[13px] font-semibold leading-tight ${isDarkTheme ? "text-white/90" : "text-[#171b28]"}`}>
                          {profile?.displayName ?? "Wallet Connected"}
                        </p>
                        <p className={`mt-0.5 truncate text-[11px] capitalize ${isDarkTheme ? "text-white/40" : "text-[#8b90a6]"}`}>
                          {profile?.role ?? "pending"} · {chainId === 11155111 ? "Sepolia" : `Chain ${chainId}`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header
              className={`sticky top-0 z-30 ${
                isDarkTheme
                  ? "border-b border-white/[0.07] bg-[#090d18]"
                  : "border-b border-[#e5e8f2] bg-[#f8f9fc]"
              }`}
            >
              <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-8 lg:px-10">
                <div className="flex min-w-0 items-center gap-3">
                  <Link
                    className={`inline-flex shrink-0 items-center gap-2 lg:hidden ${
                      isDarkTheme ? "text-violet-300" : "text-violet-700"
                    }`}
                    href="/dashboard"
                  >
                    <span
                      className={`inline-flex size-8 items-center justify-center rounded-xl border ${
                        isDarkTheme
                          ? "border-violet-300/20 bg-violet-400/10"
                          : "border-violet-200 bg-violet-50"
                      }`}
                    >
                      <Image
                        src={AppIcon}
                        alt="TiwalaChain icon"
                        className="h-4 w-4"
                      />
                    </span>
                  </Link>

                  <div className="min-w-0">
                    <h1
                      className={`truncate text-[15px] font-semibold leading-tight ${
                        isDarkTheme ? "text-white" : "text-[#151824]"
                      }`}
                    >
                      {formatTitleFromPath(pathname)}
                    </h1>
                    {profile ? (
                      <p
                        className={`mt-0.5 truncate text-[11px] ${
                          isDarkTheme ? "text-white/40" : "text-[#7b8196]"
                        }`}
                      >
                        {profile.displayName}
                        <span className={`mx-1.5 ${isDarkTheme ? "text-white/20" : "text-[#c8cbda]"}`}>
                          /
                        </span>
                        <span className="capitalize">{profile.role}</span>
                        <span className={`mx-1.5 ${isDarkTheme ? "text-white/20" : "text-[#c8cbda]"}`}>
                          /
                        </span>
                        {chainId === 11155111 ? "Sepolia" : `Chain ${chainId}`}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <NotificationBell
                    address={address}
                    profile={profile}
                    isDarkTheme={isDarkTheme}
                  />
                  {themeToggleButton}
                  <WalletButton />
                </div>
              </div>

              <div
                className={`flex gap-1.5 overflow-x-auto px-4 pb-2.5 md:px-8 lg:hidden lg:px-10 ${
                  isDarkTheme ? "scrollbar-thin-dark" : "scrollbar-thin-light"
                }`}
              >
                {appLinkGroups.map((group, idx) => (
                  <div key={group.category} className="flex items-center gap-1.5">
                    <span
                      className={`px-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        isDarkTheme ? "text-white/30" : "text-[#9aa0b4]"
                      }`}
                    >
                      {group.category}
                    </span>
                    {group.links.map(({ href, label, icon: Icon, matches }) => {
                      const active = matches(pathname);
                      return (
                        <Link
                          key={label}
                          href={href}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                            active
                              ? isDarkTheme
                                ? "border-violet-400/30 bg-violet-500/15 text-violet-200 shadow-[0_0_8px_rgba(139,92,246,0.12)]"
                                : "border-violet-300 bg-violet-100 text-violet-800"
                              : isDarkTheme
                                ? "border-white/[0.07] bg-white/[0.03] text-white/50 hover:border-white/15 hover:text-white/75"
                                : "border-[#e4e7f1] bg-white text-[#6b7089] hover:border-violet-200 hover:text-[#3d4460]"
                          }`}
                        >
                          <Icon size={13} />
                          {label}
                        </Link>
                      );
                    })}
                    {idx < appLinkGroups.length - 1 ? (
                      <span
                        className={`mx-1 h-4 w-px ${
                          isDarkTheme ? "bg-white/10" : "bg-[#dfe3ef]"
                        }`}
                      />
                    ) : null}
                  </div>
                ))}
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
