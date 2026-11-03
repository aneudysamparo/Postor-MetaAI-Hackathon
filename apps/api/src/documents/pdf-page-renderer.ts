import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Scanned pliegos are JBIG2/JPEG images inside the PDF. pdfjs decodes JBIG2
// through a wasm module and draws text with its bundled standard fonts; both
// ship inside pdfjs-dist but must be pointed at explicitly in Node, or the
// scanned layer renders washed out (seen on case D before this fix).
export interface PdfjsAssetOptions {
  wasmUrl: string;
  standardFontDataUrl: string;
}

export function pdfjsAssetOptions(): PdfjsAssetOptions {
  const packageRoot = dirname(require.resolve('pdfjs-dist/package.json'));
  return {
    wasmUrl: `${join(packageRoot, 'wasm')}/`,
    standardFontDataUrl: `${join(packageRoot, 'standard_fonts')}/`,
  };
}

export interface RenderedPage {
  page: number;
  widthPx: number;
  heightPx: number;
  // data:image/png;base64,... — the exact payload sent to the vision model.
  dataUrl: string;
}

// 1.5x of the PDF point size (~108 dpi): table text stays legible for the
// vision model while one page stays well under a megabyte of PNG.
const RENDER_SCALE = 1.5;
const PNG_MIME_TYPE = 'image/png';

interface NodeCanvas {
  toBuffer(mime: string): Buffer;
}

interface CanvasFactoryLike {
  create(width: number, height: number): { canvas: NodeCanvas; context: unknown };
}

// Renders single PDF pages to PNG for the visual evidence route (T5,
// TECH section 6 step 4c). Uses the canvas factory pdfjs wires up in Node
// (@napi-rs/canvas), so no system tools such as poppler are required.
@Injectable()
export class PdfPageRenderer {
  public async renderPage(absolutePath: string, pageNumber: number): Promise<RenderedPage> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(readFileSync(absolutePath));
    const document = await pdfjs.getDocument({ data, ...pdfjsAssetOptions() }).promise;
    try {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const factory = (document as unknown as { canvasFactory: CanvasFactoryLike }).canvasFactory;
      const { canvas, context } = factory.create(viewport.width, viewport.height);
      await page.render({
        canvasContext: context as CanvasRenderingContext2D,
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      const png = canvas.toBuffer(PNG_MIME_TYPE);
      return {
        page: pageNumber,
        widthPx: Math.round(viewport.width),
        heightPx: Math.round(viewport.height),
        dataUrl: `data:${PNG_MIME_TYPE};base64,${png.toString('base64')}`,
      };
    } finally {
      await document.cleanup();
    }
  }
}
