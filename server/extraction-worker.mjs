import { parentPort, workerData } from "node:worker_threads";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
async function extract(buffer, ext) {
  let value = "";
  if (ext === ".txt") {
    if (buffer.includes(0)) throw new Error("Texte binaire refusé");
    value = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } else if (ext === ".docx") {
    if (buffer.readUInt16LE(0) !== 0x4b50) throw new Error("DOCX invalide");
    // Check ZIP central-directory sizes before parsing, including compression bombs.
    let expanded = 0,
      entries = 0;
    for (let i = 0; i + 46 <= buffer.length; i++)
      if (buffer.readUInt32LE(i) === 0x02014b50) {
        expanded += buffer.readUInt32LE(i + 24);
        entries++;
        if (expanded > 30 * 1024 * 1024 || entries > 2000)
          throw new Error("Document décompressé trop volumineux");
      }
    if (!entries) throw new Error("DOCX invalide");
    value = (await mammoth.extractRawText({ buffer })).value;
  } else {
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw new Error("PDF invalide");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const info = await parser.getInfo();
      if (info.total > 100) throw new Error("PDF limité à 100 pages");
      // pdf-parse ajoute « -- 1 of 3 -- » : un PDF sans texte ne doit pas passer pour « prêt ».
      value = (await parser.getText()).text.replace(
        /^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim,
        "",
      );
    } finally {
      await parser.destroy();
    }
  }
  return value
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 150000);
}

try {
  parentPort.postMessage({
    text: await extract(Buffer.from(workerData.buffer), workerData.ext),
  });
} catch (error) {
  const message = String(error?.message || "");
  const reason = /UTF|encoded|fatal|binaire/i.test(message)
    ? "encoding"
    : /PDF invalide/.test(message)
      ? "pdf"
      : /PDF limité/.test(message)
        ? "pages"
        : /DOCX invalide|décompressé/.test(message)
          ? "docx"
          : "other";
  parentPort.postMessage({ error: true, reason });
}
