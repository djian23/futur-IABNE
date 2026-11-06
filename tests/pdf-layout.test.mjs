import test from "node:test";
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { PDFParse } from "pdf-parse";
import { renderLearningPDF } from "../server/pdf-layout.mjs";

async function createPDF(generation, options) {
  const document = new PDFDocument({
    size: "A4",
    margin: 45,
    bufferPages: true,
  });
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  const writes = [];
  const text = document.text.bind(document);
  document.text = function (value, x, y, options) {
    if (typeof x === "number" && typeof y === "number") {
      writes.push({
        value,
        x,
        y,
        measured: this.widthOfString(String(value)),
        pageWidth: this.page.width,
        pageHeight: this.page.height,
      });
    }
    return text(value, x, y, options);
  };
  const layout = renderLearningPDF(document, generation, options);
  document.end();
  return { data: await completed, layout, writes };
}

test("revision PDF preserves French text, sections, references and readable pagination", async () => {
  const paragraphs = Array.from({ length: 30 }, (_, i) =>
    [
      `## Étape ${i + 1} — méthode de révision`,
      `L’élève étudie une équation et vérifie sa démarche. Repère pédagogique ${i + 1} : connaître les propriétés, expliquer son raisonnement et contrôler le résultat obtenu.`,
      "- **À retenir** : une définition précise accompagne chaque exemple [S1].",
    ].join("\n"),
  ).join("\n\n");
  const output = await createPDF(
    {
      title: "Fiche de révision — équations et progrès",
      content: `# Objectifs du chapitre\n${paragraphs}\n## Dernière vérification\nComprendre avant de mémoriser.`,
    },
    {
      notice: "Contenu généré par IA, non validé par le professeur.",
      obsolete: true,
      sources: [
        {
          citation: "S1",
          title: "Cours du professeur — égalités",
          version: "2026-11-05",
        },
      ],
    },
  );
  const parser = new PDFParse({ data: new Uint8Array(output.data) });
  try {
    const result = await parser.getText();
    const continuousText = result.text.replace(/\s+/gu, " ");
    assert.ok(result.total > 1, "The fixture must really exercise pagination");
    assert.ok(
      result.total < 12,
      "Normal paragraphs must not accidentally create a page for each line",
    );
    assert.equal(result.total, output.layout.pages);
    for (const expected of [
      "Fiche de révision",
      "équations et progrès",
      "Objectifs du chapitre",
      "Étape 30",
      "Dernière vérification",
      "Comprendre avant de mémoriser.",
      "non validé par le professeur",
      "une source a changé",
      "Références",
      "Cours du professeur",
      "égalités",
      "2026-11-05",
    ]) {
      assert.ok(continuousText.includes(expected), `Missing text: ${expected}`);
    }
    assert.ok(
      !result.text.includes("**"),
      "Markdown emphasis markers must not appear in the PDF",
    );
    assert.ok(
      !result.text.includes("## "),
      "Markdown heading markers must not appear in the PDF",
    );
    for (const [i, page] of result.pages.entries()) {
      assert.ok(
        page.text.includes(`Page ${i + 1}`),
        "Every page needs a readable footer",
      );
      const body = page.text
        .replace(
          /ESPACE PÉDAGOGIQUE|Document personnel · IA à vérifier|Page \d+|-- \d+ of \d+ --/g,
          "",
        )
        .trim();
      assert.ok(
        body.length > 30,
        `Unexpected blank or nearly empty page ${i + 1}`,
      );
    }
    for (const write of output.writes) {
      assert.ok(
        write.x >= 45,
        `Text starts outside the left margin: ${write.value}`,
      );
      assert.ok(
        write.x + write.measured <= write.pageWidth - 44,
        `Text exceeds the right margin: ${write.value}`,
      );
      assert.ok(
        write.y >= 45 && write.y < write.pageHeight - 45,
        `Text exceeds vertical margins: ${write.value}`,
      );
    }
  } finally {
    await parser.destroy();
  }
});

test("short sheets and unbroken tokens do not create blank pages or horizontal overflow", async () => {
  const longToken = "abcdefghijklmnopqrstuvwxyz".repeat(8);
  const output = await createPDF(
    {
      title: "Mémo élève",
      content: `## Définition\n- **Réviser** à son rythme.\n${longToken}`,
    },
    { notice: "À vérifier." },
  );
  const parser = new PDFParse({ data: new Uint8Array(output.data) });
  try {
    const result = await parser.getText();
    assert.equal(result.total, 1);
    assert.equal(output.layout.pages, 1);
    assert.ok(result.text.includes("Mémo élève"));
    assert.ok(result.text.includes("Réviser"));
    const tokenWrites = output.writes.filter((write) =>
      /^[a-z]+$/.test(write.value),
    );
    assert.ok(
      tokenWrites.length > 1,
      "Long tokens must wrap into more than one bounded line",
    );
    for (const write of tokenWrites)
      assert.ok(write.x + write.measured <= write.pageWidth - 45);
  } finally {
    await parser.destroy();
  }
});
