import { TimerOff } from "lucide-react";

export const metadata = { title: "Link expired" };

export default function ExpiredPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#101418] px-6 text-[#f2f1ec]">
      <div className="max-w-sm text-center">
        <TimerOff className="mx-auto size-8 opacity-40" strokeWidth={1.25} />
        <h1 className="mt-4 font-display text-3xl">This link has expired</h1>
        <p className="mt-2 text-sm opacity-60">
          The invitation is no longer valid. Ask the person who shared it with
          you to send a fresh one.
        </p>
      </div>
    </main>
  );
}
