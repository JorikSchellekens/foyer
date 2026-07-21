import { FoyerLogo } from "@/components/brand/logo";

/**
 * Root of a custom domain (e.g. https://dataroom.acme.com/). There is no
 * public listing; visitors need a full link.
 */
export default function DomainRootPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#101418] px-6 text-[#f2f1ec]">
      <div className="max-w-sm text-center">
        <FoyerLogo size="lg" className="justify-center" markClassName="text-[#4caf8b]" />
        <p className="mt-3 text-sm opacity-60">
          This domain hosts private document links. If you were given a link,
          open it exactly as it was shared with you.
        </p>
      </div>
    </main>
  );
}
