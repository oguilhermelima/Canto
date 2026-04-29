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
  Home,
  GalleryVerticalEnd,
  Search,
  Download,
  UserRound,
  Settings,
  SlidersHorizontal,
  Bell,
  Send,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { authClient } from "@/lib/auth-client";

const navItems = [
  { label: "Home", href: "/", icon: Home },
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

  function isActive(href: string): boolean {
    return pathname === href || (href !== "/" && pathname.startsWith(href));
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 items-start border-t border-border bg-background pt-2 pb-[calc(0.25rem+env(safe-area-inset-bottom))] md:hidden"
    >
      {navItems.map(({ label, href, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={label}
            href={href}
            aria-label={label}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-1 transition-colors duration-300",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon
              size={24}
              strokeWidth={active ? 2 : 1.75}
              className={active ? "fill-current" : undefined}
            />
            <span
              className={cn(
                "text-[10px] leading-none tracking-tight",
                active ? "font-semibold" : "font-medium",
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}

      {mounted ? (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <button
            aria-label="Profile"
            className="flex flex-col items-center justify-center gap-1 px-1 text-muted-foreground"
          >
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-muted">
              {session?.user.image ? (
                <Image src={session.user.image} alt="" width={24} height={24} className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <UserRound size={14} className="text-muted-foreground" />
              )}
            </div>
            <span className="text-[10px] font-medium leading-none tracking-tight">Profile</span>
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
              { label: "Preferences", icon: SlidersHorizontal, onClick: () => router.push("/preferences") },
              { label: "Manage", icon: Settings, onClick: () => router.push("/manage") },
            ],
            // Activity
            [
              { label: "Notifications", icon: Bell, onClick: () => router.push("/notifications") },
              { label: "Requests", icon: Send, onClick: () => router.push("/requests") },
              ...(isAdmin
                ? [{ label: "Downloads", icon: Download, onClick: () => router.push("/download") }]
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
                gi > 0 && "mt-5 border-t border-border pt-5",
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
                      <Icon className="h-[22px] w-[22px] text-foreground" />
                    </div>
                    <span className="text-center text-xs leading-tight text-foreground">
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
        <button
          aria-label="Profile"
          className="flex flex-col items-center justify-center gap-1 px-1 text-muted-foreground"
        >
          <UserRound size={24} />
          <span className="text-[10px] font-medium leading-none tracking-tight">Profile</span>
        </button>
      )}
    </nav>
  );
}
