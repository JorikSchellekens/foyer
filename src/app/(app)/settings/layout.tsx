import { SettingsNav } from "./settings-nav";

export const metadata = { title: "Settings" };

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="border-b px-4 sm:px-8 py-6">
        <h1 className="font-display text-3xl tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace, team, branding and integrations.
        </p>
      </div>
      <div className="flex flex-col gap-8 px-4 sm:px-8 py-6 lg:flex-row">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
