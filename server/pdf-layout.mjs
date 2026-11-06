import { existsSync } from "node:fs";

const colors = {
  forest: "#17483F",
  coral: "#D16B52",
  ink: "#243C36",
  muted: "#566760",
  rule: "#D8E5DE",
};
const regularFont = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const boldFont = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const clean = (value) =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1");

/** Render into an existing PDFKit document. The caller owns piping and doc.end(). */
export function renderLearningPDF(
  doc,
  generation,
  { notice = "", obsolete = false, sources = [] } = {},
) {
  if (!existsSync(regularFont) || !existsSync(boldFont)) {
    throw new Error(
      "PDF export requires the DejaVu Sans regular and bold system fonts.",
    );
  }
  doc.registerFont("LearningRegular", regularFont);
  doc.registerFont("LearningBold", boldFont);
  doc.info.Title = clean(generation.title);
  doc.info.Subject = "Document pédagogique personnel — contenu généré par IA";
  let pageNumber = 0;
  let y, left, right, width, bottom;

  function decorate() {
    pageNumber++;
    left = doc.page.margins.left;
    right = doc.page.width - doc.page.margins.right;
    width = right - left;
    bottom = doc.page.height - doc.page.margins.bottom - 32;
    const top = doc.page.margins.top;
    doc
      .font("LearningBold")
      .fontSize(8)
      .fillColor(colors.forest)
      .text("ESPACE PÉDAGOGIQUE", left, top, {
        width,
        lineBreak: false,
        characterSpacing: 1,
      });
    doc
      .moveTo(left, top + 21)
      .lineTo(right, top + 21)
      .lineWidth(1)
      .strokeColor(colors.rule)
      .stroke();
    const footer = doc.page.height - doc.page.margins.bottom - 12;
    doc
      .moveTo(left, footer - 9)
      .lineTo(right, footer - 9)
      .strokeColor(colors.rule)
      .stroke();
    doc
      .font("LearningRegular")
      .fontSize(8)
      .fillColor(colors.muted)
      .text("Document personnel · IA à vérifier", left, footer, {
        width: width - 65,
        lineBreak: false,
        characterSpacing: 0,
      });
    doc.text(`Page ${pageNumber}`, right - 60, footer, {
      width: 60,
      align: "right",
      lineBreak: false,
    });
    y = top + 38;
  }
  if (!doc.page) doc.addPage();
  decorate();

  function ensure(height) {
    if (y + height > bottom) {
      doc.addPage();
      decorate();
    }
  }

  // Width-based wrapping also splits unbroken URLs/tokens, keeping text inside both margins.
  function wrap(value, available) {
    const lines = [];
    let line = "";
    for (let word of clean(value).trim().split(/\s+/u).filter(Boolean)) {
      if (line && doc.widthOfString(`${line} ${word}`) <= available) {
        line += ` ${word}`;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      if (doc.widthOfString(word) <= available) {
        line = word;
        continue;
      }
      let part = "";
      for (const character of word) {
        if (part && doc.widthOfString(part + character) > available) {
          lines.push(part);
          part = "";
        }
        part += character;
      }
      line = part;
    }
    if (line) lines.push(line);
    return lines;
  }

  function block(
    value,
    {
      size = 10.5,
      bold = false,
      color = colors.ink,
      gap = 7,
      indent = 0,
      bullet = false,
      keepNext = false,
    } = {},
  ) {
    doc
      .font(bold ? "LearningBold" : "LearningRegular")
      .fontSize(size)
      .fillColor(color);
    const lines = wrap(value, width - indent);
    if (!lines.length) return;
    const lineHeight = size * 1.55;
    ensure(lineHeight * Math.min(lines.length + (keepNext ? 2 : 0), 4));
    for (let i = 0; i < lines.length; i++) {
      ensure(lineHeight);
      // Decorations change the current font and color when a page is added.
      doc
        .font(bold ? "LearningBold" : "LearningRegular")
        .fontSize(size)
        .fillColor(color);
      if (bullet && i === 0)
        doc.text("•", left + 2, y, { width: 12, lineBreak: false });
      doc.text(lines[i], left + indent, y, {
        width: width - indent,
        lineBreak: false,
        characterSpacing: 0,
      });
      y += lineHeight;
    }
    y += gap;
  }

  block(generation.title || "Document de révision", {
    size: 23,
    bold: true,
    color: colors.forest,
    gap: 15,
    keepNext: true,
  });
  if (notice) block(notice, { size: 9, color: colors.muted, gap: 12 });
  if (obsolete)
    block(
      "Attention : une source a changé ou a été retirée depuis la génération. Vérifiez ce document avant de l’utiliser.",
      { size: 10, bold: true, color: colors.coral, gap: 14 },
    );

  for (const line of clean(generation.content).split("\n")) {
    if (!line.trim()) {
      y += 5;
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    const list = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (heading) {
      block(heading[2], {
        size: heading[1].length === 1 ? 16 : 13,
        bold: true,
        color: colors.forest,
        gap: 8,
        keepNext: true,
      });
    } else if (list) {
      block(list[1], { indent: 17, bullet: true, gap: 5 });
    } else {
      block(line, { gap: 6 });
    }
  }

  if (sources.length) {
    y += 9;
    block("Références", {
      size: 14,
      bold: true,
      color: colors.forest,
      keepNext: true,
    });
    for (const source of sources) {
      block(
        `[${source.citation}] ${source.title} — version ${source.version}`,
        { size: 9, color: colors.muted, gap: 6 },
      );
    }
  }
  return { pages: pageNumber };
}
