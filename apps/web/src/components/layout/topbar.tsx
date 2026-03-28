"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@canto/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@canto/ui/dropdown-menu";
import { Search, User, Settings, LogOut } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { SearchCommand } from "./search-command";

const navLinks = [
  { href: "/", label: "Discover" },
  { href: "/library", label: "Library" },
  { href: "/torrents", label: "Torrents" },
] as const;

export function Topbar(): React.JSX.Element {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const isDiscover = pathname === "/";

  // Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearchClick = useCallback(() => {
    setSearchOpen(true);
  }, []);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50",
          isDiscover
            ? "bg-transparent"
            : "border-b border-neutral-200 bg-white",
        )}
      >
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black">
                <span className="text-sm font-bold text-white">C</span>
              </div>
              <span
                className={cn(
                  "text-lg font-semibold tracking-tight",
                  isDiscover ? "text-white" : "text-black",
                )}
              >
                Canto
              </span>
            </Link>

            {/* Navigation */}
            <nav className="hidden items-center gap-1 md:flex">
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
                      "relative px-3 py-1.5 text-sm font-medium transition-colors",
                      isDiscover
                        ? isActive
                          ? "text-white"
                          : "text-white/60 hover:text-white"
                        : isActive
                          ? "text-black"
                          : "text-neutral-400 hover:text-black",
                    )}
                  >
                    {label}
                    {isActive && (
                      <span
                        className={cn(
                          "absolute bottom-0 left-3 right-3 h-0.5 rounded-full",
                          isDiscover ? "bg-white" : "bg-black",
                        )}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Center: Search bar */}
          <div className="hidden lg:block">
            <button
              onClick={handleSearchClick}
              className={cn(
                "flex w-[350px] items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors",
                isDiscover
                  ? "border-white/20 bg-white/10 text-white/50 hover:border-white/30"
                  : "border-neutral-200 bg-neutral-50 text-neutral-400 hover:border-neutral-300",
              )}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Search...</span>
              <kbd
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                  isDiscover
                    ? "border-white/20 bg-white/10 text-white/50"
                    : "border-neutral-200 bg-white text-neutral-400",
                )}
              >
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Mobile search */}
            <button
              className={cn(
                "rounded-full p-2 transition-colors lg:hidden",
                isDiscover
                  ? "text-white/70 hover:text-white"
                  : "text-neutral-400 hover:text-black",
              )}
              onClick={handleSearchClick}
            >
              <Search className="h-5 w-5" />
            </button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
                    isDiscover
                      ? "border-white/20 text-white hover:border-white/40"
                      : "border-neutral-200 text-neutral-600 hover:border-neutral-300",
                  )}
                >
                  <User className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 border-neutral-200 bg-white">
                <DropdownMenuItem className="text-neutral-700 hover:bg-neutral-50">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-neutral-200" />
                <DropdownMenuItem className="text-neutral-700 hover:bg-neutral-50">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile nav */}
            <div className="flex items-center gap-1 md:hidden">
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
                      "px-2 py-1 text-xs font-medium",
                      isDiscover
                        ? isActive
                          ? "text-white"
                          : "text-white/50"
                        : isActive
                          ? "text-black"
                          : "text-neutral-400",
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
