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
import { useState, useCallback, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { authClient } from "~/lib/auth-client";

const navLinks = [
  { href: "/", label: "Discover" },
  { href: "/library", label: "Library" },
  { href: "/torrents", label: "Downloads" },
] as const;

const searchHints = ["movies", "TV shows", "anime", "documentaries", "series"];

export function Topbar(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { data: session } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [currentHint, setCurrentHint] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hintIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDiscover = pathname === "/";
  const isSearchPage = pathname.startsWith("/search");

  // Track client mount to avoid hydration mismatch from session-dependent UI
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync search value from URL params when on search page
  useEffect(() => {
    if (isSearchPage) {
      const q = searchParams.get("q") ?? "";
      setSearchValue(q);
      if (q) setSearchFocused(true);
    }
  }, [isSearchPage, searchParams]);

  // Scroll listener for backdrop blur
  useEffect(() => {
    const onScroll = (): void => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Rotating search hints
  useEffect(() => {
    if (!searchFocused && !searchValue) {
      hintIntervalRef.current = setInterval(() => {
        setCurrentHint((prev) => (prev + 1) % searchHints.length);
      }, 3000);
    }
    return () => {
      if (hintIntervalRef.current) clearInterval(hintIntervalRef.current);
    };
  }, [searchFocused, searchValue]);

  // Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchFocused(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (e.key === "Escape" && searchFocused) {
        setSearchValue("");
        setSearchFocused(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchFocused]);

  // Reset search when navigating away from search page
  useEffect(() => {
    if (!isSearchPage) {
      setSearchValue("");
      setSearchFocused(false);
    }
  }, [isSearchPage]);

  const submitSearch = useCallback(() => {
    const q = searchValue.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }, [searchValue, router]);

  // Live-update search URL while typing on the search page
  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (isSearchPage) {
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
          params.set("q", value);
        } else {
          params.delete("q");
        }
        router.replace(`/search?${params.toString()}`, { scroll: false });
      }
    },
    [isSearchPage, searchParams, router],
  );

  const clearSearch = useCallback(() => {
    setSearchValue("");
    if (isSearchPage) {
      router.push("/search");
    }
    searchInputRef.current?.focus();
  }, [isSearchPage, router]);

  const onSearchFocus = useCallback(() => {
    setSearchFocused(true);
    if (hintIntervalRef.current) clearInterval(hintIntervalRef.current);
  }, []);

  const onSearchBlur = useCallback(() => {
    setTimeout(() => {
      if (!searchValue) {
        setSearchFocused(false);
      }
    }, 200);
  }, [searchValue]);

  const showBlur = scrolled || searchFocused;

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-40 hidden h-16 items-center transition-all duration-150 md:flex",
        showBlur
          ? "bg-background/80 shadow-sm backdrop-blur-md"
          : "bg-transparent",
      )}
    >
      <div className="relative flex w-full items-center px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Left: Logo + Nav Links */}
        <div className="flex shrink-0 items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="text-foreground">
              <path d="M2 2h12a8 8 0 0 1 8 8v12H10a8 8 0 0 1-8-8V2Z" />
            </svg>
          </Link>
          <nav className="flex items-center gap-1">
            {navLinks.map(({ href, label }) => {
              const isActive =
                href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
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
        </div>

        {/* Center: Search (truly centered via absolute) */}
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2 transition-all duration-200",
            searchFocused || searchValue ? "w-[32rem]" : "w-[24rem]",
          )}
        >
          <div
            className={cn(
              "flex w-full items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 transition-all duration-200",
              searchFocused || scrolled
                ? "border border-foreground/30 bg-background shadow-sm focus-within:border-primary/50"
                : "border border-foreground/30 bg-background/50 shadow-sm backdrop-blur-xl",
            )}
          >
            <Search
              size={15}
              className={cn(
                "shrink-0",
                searchFocused || scrolled
                  ? "text-muted-foreground"
                  : "text-foreground/60",
              )}
            />
            <div className="relative flex flex-1">
              <input
                ref={searchInputRef}
                type="text"
                value={searchValue}
                onChange={(e) => handleSearchInput(e.target.value)}
                onFocus={onSearchFocus}
                onBlur={onSearchBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitSearch();
                }}
                className="relative z-10 h-5 w-full bg-transparent text-sm leading-5 text-foreground transition-colors focus:outline-none"
                placeholder=""
              />
              {!searchValue && (
                <span
                  className={cn(
                    "pointer-events-none absolute inset-0 flex items-center text-sm leading-5",
                    searchFocused || scrolled
                      ? "text-muted-foreground"
                      : "text-foreground/60",
                  )}
                >
                  Find&nbsp;
                  <span
                    key={currentHint}
                    className={cn(
                      "inline-block animate-[hintRotate_0.4s_cubic-bezier(0.16,1,0.3,1)_both]",
                      searchFocused || scrolled
                        ? "text-foreground/50"
                        : "text-foreground/80",
                    )}
                  >
                    {searchHints[currentHint]}
                  </span>
                </span>
              )}
            </div>
            {searchValue && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  clearSearch();
                }}
                className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
            {searchFocused || searchValue ? (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  submitSearch();
                }}
                className="shrink-0 rounded-full bg-primary px-4 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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

        {/* Right: User Dropdown */}
        <div className="ml-auto flex shrink-0 items-center">
          {mounted ? (
            <DropdownMenu>
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
                <DropdownMenuItem
                  onClick={() =>
                    setTheme(theme === "dark" ? "light" : "dark")
                  }
                >
                  <Sun className="mr-2 h-4 w-4 dark:hidden" />
                  <Moon className="mr-2 hidden h-4 w-4 dark:block" />
                  <span className="dark:hidden">Dark mode</span>
                  <span className="hidden dark:inline">Light mode</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/settings#me">
                    <User className="mr-2 h-4 w-4" />
                    My Account
                  </a>
                </DropdownMenuItem>
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
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4" />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
