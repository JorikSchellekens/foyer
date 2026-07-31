/**
 * Navigation fallback for every workspace page. It mirrors the real geometry
 * (sticky header band, then a table body) so the swap to content is a fill
 * rather than a jump, and it holds at zero opacity for a beat: a navigation
 * that resolves quickly should never flash a skeleton at all.
 */
const BAR = "shimmer rounded bg-muted";

export default function Loading() {
  return (
    <div
      role="status"
      aria-busy
      className="reveal"
      // Inline, because .reveal sets the animation shorthand and would reset a
      // delay coming from a utility class.
      style={{ animationDelay: "140ms" }}
    >
      <span className="sr-only">Loading</span>
      <div aria-hidden className="border-b px-4 py-6 sm:px-8">
        <div className={`${BAR} h-7 w-52`} />
        <div className={`${BAR} mt-3 h-3.5 w-72 max-w-full`} />
      </div>
      <div aria-hidden className="px-4 py-6 sm:px-8">
        <div className={`${BAR} h-3 w-36`} />
        <div className="mt-4 divide-y rounded-lg border">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <div className={`${BAR} size-8 shrink-0 rounded-md`} />
              <div className="min-w-0 flex-1">
                <div
                  className={`${BAR} h-3.5`}
                  style={{ width: `${58 - i * 6}%` }}
                />
                <div className={`${BAR} mt-2 h-2.5 w-24`} />
              </div>
              <div className={`${BAR} hidden h-3 w-16 sm:block`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
