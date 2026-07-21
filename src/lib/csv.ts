/** Serialize rows to CSV. Columns come from the header keys, in order. */
export function toCsv(
  headers: { key: string; label: string }[],
  rows: Record<string, unknown>[]
): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map((h) => escape(h.label)).join(",");
  const body = rows.map((r) =>
    headers.map((h) => escape(r[h.key])).join(",")
  );
  return [head, ...body].join("\n");
}

/** A downloadable CSV response with a sensible filename. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
