"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@canto/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@canto/ui/dropdown-menu";
import {
  Armchair,
  Search,
  X,
  User,
  LayoutDashboard,
  Settings,
  Bell,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { Suspense, useState, useCallback, useEffect, useRef, memo } from "react";
import { useTheme } from "next-themes";
import { authClient } from "~/lib/auth-client";

/* ─── Constants ─── */

const navLinks = [
  { href: "/", label: "Discover" },
  { href: "/library", label: "Library" },
  { href: "/torrents", label: "Downloads" },
] as const;

const searchHints = ["movies", "TV shows", "anime", "documentaries", "series"];

/* ─── Nav Links (isolated — only re-renders on pathname change) ─── */

const NavLinks = memo(function NavLinks(): React.JSX.Element {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {navLinks.map(({ href, label }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors",
              isActive
                ? "bg-foreground/10 text-foreground"
                : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
});

/* ─── Search (fully isolated — hint rotation is DOM-only) ─── */

const TopbarSearch = memo(function TopbarSearch(): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);

  const isSearchPage = pathname.startsWith("/search");

  // Sync from URL
  useEffect(() => {
    if (isSearchPage) {
      const q = searchParams.get("q") ?? "";
      setValue(q);
      if (q) setOpen(true);
    } else {
      setValue("");
      setOpen(false);
    }
  }, [isSearchPage, searchParams]);

  // Rotating hints — DOM-only, zero React re-renders
  useEffect(() => {
    const el = hintRef.current;
    if (!el || open || value) return;
    let idx = 0;
    el.textContent = searchHints[0]!;
    const id = setInterval(() => {
      idx = (idx + 1) % searchHints.length;
      el.style.animation = "none";
      void el.offsetHeight;
      el.textContent = searchHints[idx]!;
      el.style.animation = "";
    }, 3000);
    return () => clearInterval(id);
  }, [open, value]);

  // Cmd+K / Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (e.key === "Escape" && open) {
        setValue("");
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const submit = useCallback(() => {
    const q = value.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  }, [value, router]);

  const handleInput = useCallback(
    (v: string) => {
      setValue(v);
      if (isSearchPage) {
        const params = new URLSearchParams(searchParams.toString());
        if (v) params.set("q", v); else params.delete("q");
        router.replace(`/search?${params.toString()}`, { scroll: false });
      }
    },
    [isSearchPage, searchParams, router],
  );

  const clear = useCallback(() => {
    setValue("");
    if (isSearchPage) router.push("/search");
    inputRef.current?.focus();
  }, [isSearchPage, router]);

  return (
    <div
      className={cn(
        "absolute left-1/2 -translate-x-1/2 transition-[width] duration-200",
        open || value ? "w-[32rem]" : "w-[24rem]",
      )}
    >
      <div className="flex w-full items-center gap-2 rounded-xl border border-border/60 bg-muted py-1.5 pl-4 pr-1.5">
        <Search size={15} className="shrink-0 text-muted-foreground" />
        <div className="relative flex flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => { if (!value) setTimeout(() => setOpen(false), 200); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="relative z-10 h-5 w-full bg-transparent text-sm leading-5 text-foreground focus:outline-none"
            placeholder=""
          />
          {!value && (
            <span className="pointer-events-none absolute inset-0 flex items-center text-sm leading-5 text-muted-foreground">
              Find&nbsp;
              <span
                ref={hintRef}
                className="inline-block animate-[hintRotate_0.4s_cubic-bezier(0.16,1,0.3,1)_both] text-foreground/50"
              />
            </span>
          )}
        </div>
        {value && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); clear(); }}
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
        {open || value ? (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); submit(); }}
            className="shrink-0 rounded-xl bg-primary px-4 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Search
          </button>
        ) : (
          <kbd className="shrink-0 rounded-md border border-foreground/15 bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-foreground/40">
            ⌘K
          </kbd>
        )}
      </div>
    </div>
  );
});

/* ─── User Menu (isolated — session/theme changes don't touch anything else) ─── */

const UserMenu = memo(function UserMenu(): React.JSX.Element {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-accent focus:outline-none">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            {session?.user?.name ? (
              <span className="text-xs font-medium">
                {session.user.name.charAt(0).toUpperCase()}
              </span>
            ) : (
              <User className="h-4 w-4" />
            )}
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 rounded-lg" sideOffset={8}>
        {session?.user && (
          <>
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{session.user.name}</p>
              <p className="text-xs text-muted-foreground">{session.user.email}</p>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <a href="/status">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Status
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
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

/* ─── Topbar (shell — no hooks, no state, never re-renders) ─── */

export function Topbar(): React.JSX.Element {
  return (
    <header className="topbar-scroll fixed top-0 left-0 right-0 z-40 hidden h-16 items-center md:flex">
      <div className="relative flex w-full items-center px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Left: Logo + Nav */}
        <div className="flex shrink-0 items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Armchair className="h-7 w-7 text-foreground" />
            <span className="text-lg font-bold tracking-tight text-foreground">Canto</span>
          </Link>
          <NavLinks />
        </div>

        {/* Center: Search */}
        <Suspense>
          <TopbarSearch />
        </Suspense>

        {/* Right: User Menu */}
        <div className="ml-auto flex shrink-0 items-center">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
