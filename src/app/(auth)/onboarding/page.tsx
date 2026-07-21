import { redirect } from "next/navigation";
import { requireUser, setActiveTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function OnboardingPage() {
  const user = await requireUser();

  async function createTeam(formData: FormData) {
    "use server";
    const u = await requireUser();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const base = slugify(name) || "team";
    let slug = base;
    for (let i = 2; await db.team.findUnique({ where: { slug } }); i++) {
      slug = `${base}-${i}`;
    }
    const team = await db.team.create({
      data: {
        name,
        slug,
        members: { create: { userId: u.id, role: "OWNER" } },
      },
    });
    await setActiveTeam(team.id);
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="px-8 py-6">
        <span className="font-display italic text-2xl tracking-tight">
          Foyer
        </span>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-4xl leading-tight tracking-tight">
            Name your workspace
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Usually your company name. You can invite your team in a moment,
            {" "}{user.email} is the owner.
          </p>
          <form action={createTeam} className="mt-10 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input
                id="name"
                name="name"
                required
                autoFocus
                placeholder="Acme Inc"
                maxLength={60}
              />
            </div>
            <Button type="submit" className="w-full">
              Create workspace
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
