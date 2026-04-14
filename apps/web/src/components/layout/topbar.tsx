"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@canto/ui/cn";
// Popover removed — user menu uses custom positioned panel
import {
  Compass,
  Download,
  GalleryVerticalEnd,
  Search,
  Send,
  User,
  Settings,
  SlidersHorizontal,
  Bell,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useTheme } from "next-themes";
import { authClient } from "~/lib/auth-client";

/* ─── Constants ─── */

const navLinks: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Discover", icon: Compass },
  { href: "/library", label: "Library", icon: GalleryVerticalEnd },
  { href: "/search", label: "Search", icon: Search },
];

/* ─── Nav Links ─── */

const NavLinks = memo(function NavLinks({ scrolled }: { scrolled?: boolean }): React.JSX.Element {
  const pathname = usePathname();
  const containerRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);

  const activeHref = navLinks.find(({ href }) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href),
  )?.href;

  const updateIndicator = useCallback(() => {
    if (!activeHref) { setReady(false); return; }
    const el = linkRefs.current.get(activeHref);
    if (!el || !el.offsetWidth) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    setReady(true);
  }, [activeHref]);

  useEffect(() => {
    // Delay to ensure layout is ready after mount/navigation
    const raf = requestAnimationFrame(updateIndicator);
    return () => cancelAnimationFrame(raf);
  }, [updateIndicator]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  return (
    <nav
      ref={containerRef}
      className={cn(
        "relative flex items-center gap-0.5 rounded-2xl p-1 transition-colors duration-300",
        scrolled ? "bg-transparent" : "bg-muted/60",
      )}
    >
      {/* Sliding pill */}
      <div
        className={cn(
          "absolute top-1 bottom-1 rounded-xl shadow-sm",
          ready
            ? "transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
            : "invisible",
          "bg-foreground",
        )}
        style={{ left: indicator.left, width: indicator.width }}
      />

      {navLinks.map(({ href, label, icon: Icon }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            ref={(el) => { if (el) linkRefs.current.set(href, el); }}
            className={cn(
              "relative z-10 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors duration-200",
              isActive
                ? "text-background"
                : "text-foreground/80 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
});

/* ─── User Menu ─── */

interface MenuAction {
  href?: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
}

const UserMenu = memo(function UserMenu(): React.JSX.Element {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMounted(true); }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!mounted) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin";

  const groups: MenuAction[][] = [
    // Account
    [
      { href: "/profile/me", label: "Profile", icon: User },
      { href: "/preferences", label: "Preferences", icon: SlidersHorizontal },
      { href: "/manage", label: "Manage", icon: Settings },
    ],
    // Activity
    [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/requests", label: "Requests", icon: Send },
      ...(isAdmin
        ? [{ href: "/torrents", label: "Downloads", icon: Download } as MenuAction]
        : []),
    ],
    // System
    [
      {
        label: theme === "dark" ? "Light" : "Dark",
        icon: theme === "dark" ? Sun : Moon,
        onClick: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        label: "Log Out",
        icon: LogOut,
        onClick: () => {
          void authClient.signOut().then(() => {
            router.push("/login");
            router.refresh();
          });
        },
      },
    ],
  ];

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        aria-label="User menu"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted/60 transition-colors hover:bg-muted focus:outline-none"
      >
        {session?.user.image ? (
          <Image
            src={session.user.image}
            alt={session.user.name}
            width={32}
            height={32}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : session?.user.name ? (
          <span className="text-xs font-medium">
            {session.user.name.charAt(0).toUpperCase()}
          </span>
        ) : (
          <User className="h-4 w-4" />
        )}
      </button>

      {/* Dropdown */}
      <div
        ref={menuRef}
        className={cn(
          "absolute right-0 top-full z-50 mt-5 w-80 overflow-hidden rounded-2xl border border-border/50 bg-background p-5 shadow-xl transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-3 scale-95 opacity-0",
        )}
      >
        {session?.user && (
          <div className="flex items-center gap-3 pb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span className="text-sm font-medium">
                  {session.user.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{session.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
            </div>
          </div>
        )}
        {groups.map((group, gi) => (
          <div
            key={gi}
            className={cn(
              "grid grid-cols-3",
              gi === 0 ? "border-t border-border/50 pt-5" : "mt-5 border-t border-border/50 pt-5",
            )}
          >
            {group.map((action) => {
              const Icon = action.icon;
              const item = (
                <div className="flex flex-col items-center gap-2.5">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 transition-colors hover:bg-muted">
                    <Icon className="h-[22px] w-[22px] text-foreground/80" />
                  </div>
                  <span className="text-center text-xs leading-tight text-foreground/80">
                    {action.label}
                  </span>
                </div>
              );

              return action.href ? (
                <Link key={action.label} href={action.href} onClick={() => setOpen(false)} className="flex justify-center">
                  {item}
                </Link>
              ) : (
                <button key={action.label} onClick={() => { action.onClick?.(); setOpen(false); }} className="flex justify-center">
                  {item}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

/* ─── Topbar ─── */

export function Topbar(): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handler = (): void => setScrolled(window.scrollY > 0);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Cmd/Ctrl+K → search
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        router.push("/search");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return (
    <header className="pointer-events-none fixed top-0 right-0 left-0 z-40 hidden justify-center pt-2 md:flex">
      <nav
        className={cn(
          "pointer-events-auto flex w-full items-center overflow-visible rounded-2xl border py-2.5 transition-all duration-300 ease-out",
          scrolled
            ? "max-w-[80%] border-border/50 bg-background/80 px-6 backdrop-blur-xl xl:max-w-[60%]"
            : "max-w-full border-transparent px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24",
        )}
      >
        {/* Left: Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/canto.svg" alt="Canto" width={36} height={36} className="h-9 w-9 dark:invert" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            Canto
          </span>
        </Link>

        {/* Center: Nav Links */}
        <div className="flex flex-1 items-center justify-center">
          <NavLinks scrolled={scrolled} />
        </div>

        {/* Right: User Menu */}
        <div className="flex shrink-0 items-center">
          <UserMenu />
        </div>
      </nav>
    </header>
  );
}
