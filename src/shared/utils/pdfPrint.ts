// Lightweight helpers for printing / downloading on-screen DOM nodes as PDFs.
// Both jspdf and html2canvas are lazy-loaded so the tools don't pay for these
// libs unless the user actually exports something.

interface JsPDFInstance {
  addImage: (d: string, t: string, x: number, y: number, w: number, h: number) => void;
  save: (n: string) => void;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  addPage: () => void;
}

interface JsPDFCtor {
  new (o: object): JsPDFInstance;
}

async function loadPdfDeps(): Promise<{ html2canvas: typeof import('html2canvas').default; jsPDF: JsPDFCtor }> {
  const [{ default: html2canvas }, jspdfMod] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const jsPDF = (jspdfMod as unknown as { jsPDF: JsPDFCtor }).jsPDF;
  return { html2canvas, jsPDF };
}

/** Tailwind v4 emits modern color spaces (oklch, oklab, color-mix) that
 *  html2canvas v1 can't parse — capture either fails or returns blank/black.
 *  Workaround: inside the cloned DOM, we read each element's *computed*
 *  color via getComputedStyle, convert anything non-RGB to RGB by drawing it
 *  on a 1×1 canvas, and apply the rgb() string as an inline style so
 *  html2canvas only ever sees legacy color formats.
 */
function srgbify(clonedDoc: Document): void {
  const probe = clonedDoc.createElement('canvas');
  probe.width = 1; probe.height = 1;
  const ctx = probe.getContext('2d');
  if (!ctx) return;

  const props: Array<keyof CSSStyleDeclaration> = [
    'color', 'backgroundColor', 'borderTopColor', 'borderRightColor',
    'borderBottomColor', 'borderLeftColor', 'outlineColor', 'fill', 'stroke',
  ];

  const toRgb = (val: string): string => {
    if (!val || val === 'transparent' || val === 'none') return val;
    if (val.startsWith('rgb')) return val; // already legacy
    try {
      ctx.fillStyle = '#000';
      ctx.fillStyle = val; // browser parses oklch/lab/etc
      const computed = ctx.fillStyle as string; // returns rgb()/rgba()/#hex
      return computed;
    } catch { return val; }
  };

  const walker = clonedDoc.createTreeWalker(clonedDoc.body, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node instanceof HTMLElement) {
      const style = clonedDoc.defaultView?.getComputedStyle(node);
      if (style) {
        for (const p of props) {
          const v = style.getPropertyValue(p as string);
          if (v && (v.includes('oklch') || v.includes('oklab') || v.includes('color('))) {
            (node.style as unknown as Record<string, string>)[p as string] = toRgb(v);
          }
        }
      }
    }
    node = walker.nextNode();
  }
}

/** Render one DOM node and place it (centered, fit-to-page) on a new A4 page. */
async function placeNodeOnPdf(pdf: JsPDFInstance, node: HTMLElement, html2canvas: typeof import('html2canvas').default): Promise<void> {
  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    onclone: (doc) => srgbify(doc),
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 30; // pt — tight enough to feel "designed", roomy enough to look clean
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = canvas.width / canvas.height;
  const drawW = ratio >= maxW / maxH ? maxW : maxH * ratio;
  const drawH = ratio >= maxW / maxH ? maxW / ratio : maxH;
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageW - drawW) / 2, margin, drawW, drawH);
}

export async function downloadNodeAsPdf(node: HTMLElement, filename: string): Promise<void> {
  const { html2canvas, jsPDF } = await loadPdfDeps();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  await placeNodeOnPdf(pdf, node, html2canvas);
  pdf.save(filename);
}

/** Bundle multiple DOM nodes into a single multi-page PDF — each node on its
 *  own A4 page, fit-to-page. Use for bulk certificates / admit cards. */
export async function downloadNodesAsPdf(nodes: HTMLElement[], filename: string): Promise<void> {
  if (nodes.length === 0) throw new Error('No content to export');
  const { html2canvas, jsPDF } = await loadPdfDeps();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  for (let i = 0; i < nodes.length; i++) {
    if (i > 0) pdf.addPage();
    await placeNodeOnPdf(pdf, nodes[i], html2canvas);
  }
  pdf.save(filename);
}

/** Print the entire current page (browser print dialog).
 *  For multi-page printables prefer this — caller controls page-breaks via CSS. */
export function printCurrentPage(): void {
  window.print();
}
