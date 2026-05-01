"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@canto/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@canto/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@canto/ui/sheet";
import { useIsMobile } from "@/hooks/use-is-mobile";

type MobileContentRenderer = (api: { close: () => void }) => React.ReactNode;

interface ResponsiveMenuProps {
  trigger: React.ReactNode;
  desktopContent: React.ReactNode;
  mobileContent?: React.ReactNode | MobileContentRenderer;
  desktopVariant?: "dropdown" | "popover";
  align?: "start" | "center" | "end";
  desktopContentClassName?: string;
  sheetContentClassName?: string;
  sheetTitle?: string;
  sheetDescription?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ResponsiveMenu({
  trigger,
  desktopContent,
  mobileContent,
  desktopVariant = "dropdown",
  align = "end",
  desktopContentClassName,
  sheetContentClassName,
  sheetTitle,
  sheetDescription,
  open,
  onOpenChange,
}: ResponsiveMenuProps): React.JSX.Element {
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = open !== undefined;
  const currentOpen = controlled ? open : internalOpen;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (!controlled) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlled, onOpenChange],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  const renderedMobileContent = useMemo(() => {
    if (typeof mobileContent === "function") {
      return mobileContent({ close });
    }
    return mobileContent ?? desktopContent;
  }, [mobileContent, desktopContent, close]);

  if (isMobile) {
    return (
      <Sheet open={currentOpen} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className={sheetContentClassName}>
          {sheetTitle || sheetDescription ? (
            <SheetHeader className="text-left">
              {sheetTitle ? <SheetTitle>{sheetTitle}</SheetTitle> : null}
              {sheetDescription ? (
                <SheetDescription>{sheetDescription}</SheetDescription>
              ) : null}
            </SheetHeader>
          ) : (
            <SheetHeader className="sr-only">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
          )}
          <div className="pt-2">{renderedMobileContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  if (desktopVariant === "popover") {
    return (
      <Popover open={currentOpen} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align={align} className={desktopContentClassName}>
          {desktopContent}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <DropdownMenu modal={false} open={currentOpen} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={desktopContentClassName}>
        {desktopContent}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
