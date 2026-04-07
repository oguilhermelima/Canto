import { Toaster } from "sonner";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 bg-background">
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--color-foreground)",
            color: "var(--color-background)",
            borderRadius: "9999px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            border: "none",
            padding: "12px 20px",
          },
        }}
      />
    </div>
  );
}
