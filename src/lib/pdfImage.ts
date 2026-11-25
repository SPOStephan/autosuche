// Holt aus einem Anzeigen-PDF das größte eingebettete Foto (meist das Titelbild).
// Fallback: obere Hälfte der ersten Seite als Bild.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type PdfImage = { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray; kind?: number };

function toCanvas(img: PdfImage): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
    return c;
  }
  if (!img.data) return null;
  const out = ctx.createImageData(img.width, img.height);
  const px = img.width * img.height;
  if (img.kind === 3 && img.data.length >= px * 4) {
    out.data.set(img.data.subarray(0, px * 4));
  } else if (img.kind === 2 && img.data.length >= px * 3) {
    for (let i = 0, j = 0; i < px; i++, j += 3) {
      out.data[i * 4] = img.data[j];
      out.data[i * 4 + 1] = img.data[j + 1];
      out.data[i * 4 + 2] = img.data[j + 2];
      out.data[i * 4 + 3] = 255;
    }
  } else {
    return null;
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function getObj(objs: any, name: string): Promise<PdfImage | null> {
  return new Promise((resolve) => {
    try {
      objs.get(name, (o: PdfImage) => resolve(o ?? null));
    } catch {
      resolve(null);
    }
    setTimeout(() => resolve(null), 3000);
  });
}

function shrink(src: HTMLCanvasElement, maxW = 1200): Promise<Blob | null> {
  const scale = Math.min(1, maxW / src.width);
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * scale);
  c.height = Math.round(src.height * scale);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
}

export async function extractCoverImage(file: File): Promise<Blob | null> {
  try {
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let best: { canvas: HTMLCanvasElement; area: number } | null = null;

    for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) {
      const page = await pdf.getPage(p);
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
        const name = ops.argsArray[i][0] as string;
        const store = name.startsWith("g_") ? page.commonObjs : page.objs;
        const img = await getObj(store, name);
        if (!img || !img.width || !img.height) continue;
        const ratio = img.width / img.height;
        const area = img.width * img.height;
        if (area < 60_000 || ratio < 1.05 || ratio > 2.4) continue; // Logos, Icons, Banner aussortieren
        if (best && area <= best.area) continue;
        const canvas = toCanvas(img);
        if (canvas) best = { canvas, area };
      }
      if (best) break;
    }

    if (best) return shrink(best.canvas);

    // Fallback: obere Hälfte von Seite 1 rendern
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement("canvas");
    c.width = vp.width;
    c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
    const crop = document.createElement("canvas");
    crop.width = c.width;
    crop.height = Math.round(c.height * 0.5);
    crop.getContext("2d")!.drawImage(c, 0, 0);
    return shrink(crop);
  } catch (e) {
    console.warn("PDF-Bild konnte nicht gelesen werden", e);
    return null;
  }
}
