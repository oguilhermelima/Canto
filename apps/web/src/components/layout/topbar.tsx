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
  Armchair,
  Download,
  Search,
  User,
  LayoutDashboard,
  Settings,
  Bell,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { useState, useEffect, memo } from "react";
import { useTheme } from "next-themes";
import { authClient } from "~/lib/auth-client";

/* ─── Constants ─── */

const userNavLinks = [
  { href: "/", label: "Discover" },
  { href: "/lists", label: "My Lists" },
] as const;

const adminNavLinks = [
  { href: "/", label: "Discover" },
  { href: "/lists", label: "My Lists" },
  { href: "/torrents", label: "Downloads" },
] as const;

/* ─── Nav Links ─── */

const NavLinks = memo(function NavLinks({ role }: { role?: string }): React.JSX.Element {
  const pathname = usePathname();
  const links = role === "admin" ? adminNavLinks : userNavLinks;
  return (
    <nav className="flex items-center gap-1">
      {links.map(({ href, label }) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
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
      className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-foreground/5"
    >
      <Search className="h-[18px] w-[18px] text-foreground/70" />
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
      <div className="flex h-9 w-9 items-center justify-center rounded-full">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button aria-label="User menu" className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-foreground/5 focus:outline-none">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10">
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
        <DropdownMenuItem asChild>
          <a href="/requests">
            <Download className="mr-2 h-4 w-4" />
            Requests
          </a>
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
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Armchair className="h-6 w-6 text-foreground" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            Canto
          </span>
        </Link>

        {/* Center: Nav Links */}
        <div className="flex flex-1 items-center justify-center">
          <NavLinks role={role} />
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
