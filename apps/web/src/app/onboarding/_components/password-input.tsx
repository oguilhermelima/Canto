"use client";

import { useState } from "react";
import { Input } from "@canto/ui/input";
import { cn } from "@canto/ui/cn";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn(className, "pr-10")}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
