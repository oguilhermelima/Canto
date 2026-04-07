import * as React from "react";
import { cn } from "../lib/utils";
import { Label } from "./label";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

function FormField({
  label,
  htmlFor,
  error,
  children,
  className,
}: FormFieldProps): React.JSX.Element {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

export { FormField };
export type { FormFieldProps };
