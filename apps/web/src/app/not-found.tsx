import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@canto/ui/button";
import { FileQuestion } from "lucide-react";

export const metadata: Metadata = { title: "Not Found" };

export default function NotFound(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <FileQuestion className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          Page not found
        </h1>
        <p className="mb-6 max-w-md text-sm text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
