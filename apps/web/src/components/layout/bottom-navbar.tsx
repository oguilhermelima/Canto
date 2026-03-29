"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@canto/ui/cn";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@canto/ui/sheet";
import { Separator } from "@canto/ui/separator";
import {
  Compass,
  BookOpen,
  Search,
  Download,
  UserRound,
  LayoutDashboard,
  Settings,
  Bell,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "next-themes";

const navItems = [
  { title: "Discover", href: "/", icon: Compass },
  { title: "Library", href: "/library", icon: BookOpen },
  { title: "Search", href: "/search", icon: Search },
  { title: "Downloads", href: "/torrents", icon: Download },
] as const;

export function BottomNavbar(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  function isActive(href: string): boolean {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-border/50 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden">
      {navItems.map(({ title, href, icon: Icon }) => (
        <Link
          key={title}
          href={href}
          className={cn(
            "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
            isActive(href) ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Icon size={20} />
          <span>{title}</span>
        </Link>
      ))}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <button className="flex flex-col items-center gap-1 px-3 py-2 text-xs text-muted-foreground transition-colors">
            <UserRound size={20} />
            <span>Menu</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex items-center gap-3 px-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <UserRound className="h-5 w-5" />
              </div>
              <div className="flex-1 text-left text-sm leading-tight">
                <p className="font-semibold">User</p>
                <p className="text-xs text-muted-foreground">user@canto.app</p>
              </div>
            </div>
          </SheetHeader>
          <Separator className="my-3" />
          <div className="flex flex-col gap-1 px-1">
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent"
              onClick={() => {
                setSheetOpen(false);
                router.push("/status");
              }}
            >
              <LayoutDashboard className="h-4 w-4" />
              Status
            </button>
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent"
              onClick={() => {
                setSheetOpen(false);
                router.push("/settings");
              }}
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent"
              onClick={() => {
                setSheetOpen(false);
                router.push("/notifications");
              }}
            >
              <Bell className="h-4 w-4" />
              Notifications
            </button>
            <Separator className="my-1" />
            <button
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent"
              onClick={() =>
                setTheme(theme === "dark" ? "light" : "dark")
              }
            >
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="hidden h-4 w-4 dark:block" />
              <span className="dark:hidden">Dark mode</span>
              <span className="hidden dark:inline">Light mode</span>
            </button>
            <Separator className="my-1" />
            <button className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10">
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
