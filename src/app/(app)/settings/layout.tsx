import { PageHeader } from "@/components/shell/page-header";
import { SettingsNav } from "./settings-nav";

export const metadata = { title: "Settings" };

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Workspace, team, branding and integrations."
      />
      <div className="flex flex-col gap-8 px-4 py-6 sm:px-8 lg:flex-row lg:gap-10">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
