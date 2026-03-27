import { Topbar } from "~/components/layout/topbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <main className="pt-16">{children}</main>
    </div>
  );
}
