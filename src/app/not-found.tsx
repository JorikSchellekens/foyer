import Link from "next/link";
import { FoyerLogo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <FoyerLogo size="md" />
      <h1 className="mt-6 font-display text-4xl tracking-tight">
        Nothing at this address
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The page may have moved, the link may have been mistyped, or you may
        not have access to it from this workspace.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Back to overview
      </Link>
    </main>
  );
}
