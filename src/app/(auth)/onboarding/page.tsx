import { redirect } from "next/navigation";
import { requireUser, setActiveTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { FoyerLogo } from "@/components/brand/logo";
import { WorkspaceForm } from "./workspace-form";

export const metadata = { title: "New workspace" };

/** Cascade steps for the arrival; .stagger-item reads --i. */
const STEP = [0, 1, 2, 3, 4].map((i) => ({ "--i": i }) as React.CSSProperties);

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
    <main className="flex min-h-svh flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-6 pb-24 pt-16">
        <div className="w-full max-w-sm">
          <span className="stagger-item block" style={STEP[0]}>
            <FoyerLogo size="lg" />
          </span>
          <h1
            className="stagger-item mt-10 font-display text-4xl leading-[1.08] tracking-tight text-balance"
            style={STEP[1]}
          >
            Name your workspace
          </h1>
          <p
            className="stagger-item mt-3 text-sm leading-relaxed text-muted-foreground"
            style={STEP[2]}
          >
            Usually your company name. You can rename it later, and invite
            people once you are inside.
          </p>
          <WorkspaceForm action={createTeam} />
          {/* Dot-leader row: the book-index motif, used where there is a real
              label and value to set against each other. */}
          <p
            className="stagger-item mt-6 flex items-baseline text-xs text-muted-foreground"
            style={STEP[4]}
          >
            <span>Owner</span>
            <span aria-hidden className="leader-dots" />
            <span className="font-mono">{user.email}</span>
          </p>
        </div>
      </div>
    </main>
  );
}
