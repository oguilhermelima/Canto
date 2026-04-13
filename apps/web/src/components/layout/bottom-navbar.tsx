"use client";

import Image from "next/image";
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
  GalleryVerticalEnd,
  Search,
  Download,
  UserRound,
  Settings,
  Palette,
  Bell,
  Send,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { authClient } from "~/lib/auth-client";

const navItems = [
  { label: "Discover", href: "/", icon: Compass },
  { label: "Library", href: "/library", icon: GalleryVerticalEnd },
  { label: "Search", href: "/search", icon: Search },
] as const;

export function BottomNavbar(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data: session } = authClient.useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin";

  // Hide on scroll down, show on scroll up
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = (): void => {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;

      // Only react after a minimum scroll threshold to avoid jitter
      if (Math.abs(delta) < 8) return;

      setHidden(delta > 0 && y > 60);
      lastScrollY.current = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function isActive(href: string): boolean {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-10 border-t border-border/50 bg-background py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-transform duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] md:hidden",
        hidden && "translate-y-full",
      )}
    >
      {navItems.map(({ label, href, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={label}
            href={href}
            aria-label={label}
            className={cn(
              "flex items-center justify-center p-2 transition-colors duration-300",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon size={26} strokeWidth={active ? 2.5 : 1.5} />
          </Link>
        );
      })}

      {mounted ? (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <button aria-label="Menu" className="flex items-center justify-center p-2">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted">
              {session?.user.image ? (
                <Image src={session.user.image} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <UserRound size={16} className="text-muted-foreground" />
              )}
            </div>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="px-6 pb-8">
          <SheetHeader className="text-left">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                {session?.user.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : session?.user.name ? (
                  <span className="text-sm font-medium">{session.user.name.charAt(0).toUpperCase()}</span>
                ) : (
                  <UserRound className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1 text-left text-sm leading-tight">
                <p className="truncate font-semibold">{session?.user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{session?.user.email}</p>
              </div>
            </div>
          </SheetHeader>
          <Separator className="my-5" />
          {[
            // Account
            [
              { label: "Profile", icon: UserRound, onClick: () => router.push("/profile/me") },
              { label: "Personalize", icon: Palette, onClick: () => router.push("/personalize") },
              { label: "Manage", icon: Settings, onClick: () => router.push("/manage") },
            ],
            // Activity
            [
              { label: "Notifications", icon: Bell, onClick: () => router.push("/notifications") },
              { label: "Requests", icon: Send, onClick: () => router.push("/requests") },
              ...(isAdmin
                ? [{ label: "Downloads", icon: Download, onClick: () => router.push("/torrents") }]
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
                label: "Log out",
                icon: LogOut,
                onClick: async () => {
                  await authClient.signOut();
                  router.push("/login");
                  router.refresh();
                },
              },
            ],
          ].map((group, gi) => (
            <div
              key={gi}
              className={cn(
                "grid grid-cols-3",
                gi > 0 && "mt-5 border-t border-border/50 pt-5",
              )}
            >
              {group.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => { action.onClick(); setSheetOpen(false); }}
                    className="flex flex-col items-center gap-2.5"
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 transition-colors active:bg-muted">
                      <Icon className="h-[22px] w-[22px] text-foreground/80" />
                    </div>
                    <span className="text-center text-xs leading-tight text-foreground/80">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </SheetContent>
      </Sheet>
      ) : (
        <button aria-label="Menu" className="flex items-center justify-center p-2 text-muted-foreground">
          <UserRound size={26} />
        </button>
      )}
    </nav>
  );
}
