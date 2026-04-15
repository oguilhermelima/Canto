"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface PageBackProps {
  href: string;
  label?: string;
}

export function PageBack({ href, label }: PageBackProps): React.JSX.Element {
  return (
    <>
      {/* Desktop — inline back row */}
      <div className="hidden items-center gap-2 pb-6 pt-4 md:flex">
        <Link
          href={href}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={18} />
          {label && <span>{label}</span>}
        </Link>
      </div>
    </>
  );
}
