import "server-only";

type IndexNode = {
  kind: "folder" | "document";
  name: string;
  fileName?: string;
  children?: IndexNode[];
};

/**
 * Generate a typeset PDF index (table of contents) for a dataroom:
 * numbered sections, dot leaders, quiet typography.
 */
export async function generateIndexPdf(
  dataroomName: string,
  teamName: string,
  nodes: IndexNode[]
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const ink = rgb(0.086, 0.094, 0.113);
  const gray = rgb(0.42, 0.435, 0.463);
  const green = rgb(0.09, 0.357, 0.278);

  const A4: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(A4);
  const margin = 72;
  let y = A4[1] - margin;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage(A4);
      y = A4[1] - margin;
    }
  };

  // heading
  page.drawText("Index", {
    x: margin,
    y: y - 28,
    size: 30,
    font: serifItalic,
    color: ink,
  });
  y -= 44;
  page.drawText(dataroomName, {
    x: margin,
    y: y - 14,
    size: 14,
    font: serif,
    color: ink,
  });
  y -= 20;
  page.drawText(
    `${teamName} · generated ${new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`,
    { x: margin, y: y - 11, size: 10, font: serif, color: gray }
  );
  y -= 34;
  page.drawLine({
    start: { x: margin, y },
    end: { x: A4[0] - margin, y },
    thickness: 0.75,
    color: green,
  });
  y -= 24;

  const walk = (items: IndexNode[], prefix: string, depth: number) => {
    let n = 1;
    for (const item of items) {
      const number = prefix ? `${prefix}.${n}` : `${n}`;
      newPageIfNeeded(20);
      const isFolder = item.kind === "folder";
      const size = isFolder ? 12 : 11;
      const font = isFolder ? serifItalic : serif;
      const x = margin + depth * 18;
      page.drawText(`${number}`, {
        x,
        y,
        size,
        font: serif,
        color: green,
      });
      const label = item.name.length > 70 ? `${item.name.slice(0, 67)}…` : item.name;
      page.drawText(label, {
        x: x + 30,
        y,
        size,
        font,
        color: ink,
      });
      if (!isFolder && item.fileName) {
        const ext = item.fileName.split(".").pop()?.toUpperCase();
        if (ext && ext.length <= 5) {
          page.drawText(ext, {
            x: A4[0] - margin - serif.widthOfTextAtSize(ext, 9),
            y: y + 1,
            size: 9,
            font: serif,
            color: gray,
          });
        }
      }
      y -= isFolder ? 22 : 18;
      if (item.children?.length) {
        walk(item.children, number, depth + 1);
        y -= 4;
      }
      n++;
    }
  };
  walk(nodes, "", 0);

  return pdf.save();
}

export type { IndexNode };
