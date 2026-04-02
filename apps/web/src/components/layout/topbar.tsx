"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@canto/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@canto/ui/dropdown-menu";
import {
  Compass,
  Download,
  GalleryVerticalEnd,
  Search,
  Send,
  User,
  LayoutDashboard,
  Settings,
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

const userNavLinks: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Discover", icon: Compass },
  { href: "/lists", label: "Library", icon: GalleryVerticalEnd },
  { href: "/requests", label: "Requests", icon: Send },
];

const adminNavLinks: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Discover", icon: Compass },
  { href: "/lists", label: "Library", icon: GalleryVerticalEnd },
  { href: "/requests", label: "Requests", icon: Send },
  { href: "/torrents", label: "Downloads", icon: Download },
];

/* ─── Nav Links ─── */

const NavLinks = memo(function NavLinks({ role, scrolled }: { role?: string; scrolled?: boolean }): React.JSX.Element {
  const pathname = usePathname();
  const links = role === "admin" ? adminNavLinks : userNavLinks;
  const containerRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);

  const activeHref = links.find(({ href }) =>
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
            : "opacity-0",
          "bg-foreground",
        )}
        style={{ left: indicator.left, width: indicator.width }}
      />

      {links.map(({ href, label, icon: Icon }) => {
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

/* ─── Search Button ─── */

const TopbarSearch = memo(function TopbarSearch(): React.JSX.Element {
  const router = useRouter();

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
    <Link
      href="/search"
      aria-label="Search"
      className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 transition-colors hover:bg-muted"
    >
      <Search className="h-[18px] w-[18px] text-foreground/80" />
    </Link>
  );
});

/* ─── User Menu ─── */

const UserMenu = memo(function UserMenu(): React.JSX.Element {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button aria-label="User menu" className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 transition-colors hover:bg-muted focus:outline-none">
            {session?.user?.name ? (
              <span className="text-xs font-medium">
                {session.user.name.charAt(0).toUpperCase()}
              </span>
            ) : (
              <User className="h-4 w-4" />
            )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-56 rounded-lg"
        sideOffset={8}
      >
        {session?.user && (
          <>
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{session.user.name}</p>
              <p className="text-xs text-muted-foreground">
                {session.user.email}
              </p>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link href="/status">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Status
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="mr-2 h-4 w-4 dark:hidden" />
          <Moon className="mr-2 hidden h-4 w-4 dark:block" />
          <span className="dark:hidden">Dark mode</span>
          <span className="hidden dark:inline">Light mode</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

/* ─── Topbar ─── */

export function Topbar(): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false);
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  useEffect(() => {
    const handler = (): void => setScrolled(window.scrollY > 0);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header className="pointer-events-none fixed top-0 right-0 left-0 z-40 hidden justify-center pt-2 md:flex">
      <nav
        className={cn(
          "pointer-events-auto flex w-full items-center rounded-2xl border py-2.5 transition-all duration-300 ease-out",
          scrolled
            ? "max-w-[80%] border-border/50 bg-background/80 px-6 backdrop-blur-xl xl:max-w-[60%]"
            : "max-w-full border-transparent px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24",
        )}
      >
        {/* Left: Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <img src="/room.png" alt="Canto" className="h-9 w-9 dark:invert" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            Canto
          </span>
        </Link>

        {/* Center: Nav Links */}
        <div className="flex flex-1 items-center justify-center">
          <NavLinks role={role} scrolled={scrolled} />
        </div>

        {/* Right: Search + User */}
        <div className="flex shrink-0 items-center gap-1">
          <TopbarSearch />
          <UserMenu />
        </div>
      </nav>
    </header>
  );
}
