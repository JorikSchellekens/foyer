import { FoyerLogo } from "@/components/brand/logo";

/**
 * Sign-in and onboarding fallback. The wordmark renders for real and lands
 * exactly where the page will put it, so the arrival is a fill rather than a
 * jump; only the copy and the field are placeholders, and they hold at zero
 * opacity for a beat so a fast navigation never flashes a skeleton.
 */
const BAR = "shimmer rounded bg-muted";

export default function Loading() {
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-6 pb-24 pt-16">
        <div role="status" aria-busy className="w-full max-w-sm">
          <span className="sr-only">Loading</span>
          <FoyerLogo size="lg" />
          {/* Delay inline: .reveal sets the animation shorthand, which would
              reset a delay coming from a utility class. */}
          <div
            aria-hidden
            className="reveal"
            style={{ animationDelay: "140ms" }}
          >
            <div className="mt-10 space-y-3">
              <div className={`${BAR} h-8 w-full`} />
              <div className={`${BAR} h-8 w-4/5`} />
            </div>
            <div className={`${BAR} mt-5 h-3.5 w-56`} />
            <div className="mt-10 space-y-2">
              <div className={`${BAR} h-3 w-16`} />
              <div className={`${BAR} h-10 w-full`} />
            </div>
            <div className={`${BAR} mt-4 h-10 w-full`} />
          </div>
        </div>
      </div>
    </main>
  );
}
