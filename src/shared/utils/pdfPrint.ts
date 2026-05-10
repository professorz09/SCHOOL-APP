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

/** Tailwind v4 emits modern color spaces (oklch, oklab, color-mix, lab,
 *  lch, hwb, color()) that html2canvas v1 can't parse — capture either
 *  fails or returns blank/black.
 *
 *  Workaround: inside the cloned DOM, walk every element, read its
 *  *computed* color via getComputedStyle, and unconditionally rewrite each
 *  color-bearing property as an inline rgb()/rgba() string so html2canvas
 *  only ever sees legacy formats. The browser does the parse for us via
 *  ctx.fillStyle (which always returns a legacy form).
 *
 *  We rewrite ALL elements (not just those whose computed value contains
 *  "oklch") because Tailwind v4 also pushes color-mix() and CSS variables
 *  whose substring check is unreliable. The inline-style write is cheap
 *  and html2canvas reads inline styles directly.
 */
function srgbify(clonedDoc: Document): void {
  const probe = clonedDoc.createElement('canvas');
  probe.width = 1; probe.height = 1;
  const ctx = probe.getContext('2d');
  if (!ctx) return;

  // Color-bearing single-value properties. Each becomes one rgb()/rgba()
  // inline declaration.
  const colorProps = [
    'color', 'backgroundColor', 'borderTopColor', 'borderRightColor',
    'borderBottomColor', 'borderLeftColor', 'outlineColor', 'fill', 'stroke',
    'textDecorationColor', 'caretColor', 'columnRuleColor',
  ] as const;

  // Composite properties whose value is a string that may contain ONE OR MORE
  // colour functions (gradients in backgrounds, multiple shadows, etc).
  // We regex-replace each modern colour function in place instead of
  // nuking the whole declaration like we used to — that was eating real
  // shadows and making exported pages look flat.
  const compositeProps = ['backgroundImage', 'boxShadow', 'textShadow', 'borderImageSource'] as const;

  const MODERN_COLOR_RE = /(oklch|oklab|lab|lch|hwb|color-mix|color)\(/i;
  // Match a balanced colour-function call. Greedy enough for common cases
  // but not nested function args (oklab(from var(--x) 50% 0 0) is rare).
  const COLOR_FN_GLOBAL = /(?:oklch|oklab|lab|lch|hwb|color-mix|color)\([^()]*\)/gi;

  const resolveSingleColor = (val: string): string => {
    try {
      ctx.fillStyle = '#000';
      ctx.fillStyle = val;
      const out = ctx.fillStyle as string;
      return typeof out === 'string' ? out : val;
    } catch { return val; }
  };

  const toRgb = (val: string): string | null => {
    if (!val) return null;
    if (val === 'transparent' || val === 'none' || val === 'currentcolor') return val;
    // ALWAYS run the value through canvas parsing — even values that
    // look legacy ("rgb(...)") were silently kept earlier, but Tailwind
    // v4 sometimes returns "rgb(...) ; --foo: oklch(...)"-style strings
    // from getComputedStyle on certain shorthand binds. Round-tripping
    // through canvas normalises to a clean rgb()/rgba() unconditionally.
    return resolveSingleColor(val);
  };

  const rewriteComposite = (val: string): string => {
    if (!val || !MODERN_COLOR_RE.test(val)) return val;
    return val.replace(COLOR_FN_GLOBAL, fn => {
      const resolved = resolveSingleColor(fn);
      // If canvas couldn't parse (rare — nested var() etc), drop to a
      // safe black so html2canvas doesn't blow up the whole capture.
      return MODERN_COLOR_RE.test(resolved) ? 'rgb(0,0,0)' : resolved;
    });
  };

  const walker = clonedDoc.createTreeWalker(clonedDoc.body, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node instanceof HTMLElement) {
      const style = clonedDoc.defaultView?.getComputedStyle(node);
      if (style) {
        for (const p of colorProps) {
          const v = style.getPropertyValue(p);
          const replacement = toRgb(v);
          if (replacement && replacement !== v) {
            (node.style as unknown as Record<string, string>)[p] = replacement;
          }
        }
        for (const p of compositeProps) {
          const v = style.getPropertyValue(p === 'backgroundImage' ? 'background-image'
                  : p === 'boxShadow' ? 'box-shadow'
                  : p === 'textShadow' ? 'text-shadow'
                  : 'border-image-source');
          if (!v) continue;
          const rewritten = rewriteComposite(v);
          if (rewritten !== v) {
            (node.style as unknown as Record<string, string>)[p] = rewritten;
          }
        }
      }
    }
    node = walker.nextNode();
  }
}

/** Render one DOM node and place it (centered, fit-to-page) on a new A4 page. */
async function placeNodeOnPdf(pdf: JsPDFInstance, node: HTMLElement, html2canvas: typeof import('html2canvas').default): Promise<void> {
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      onclone: (doc) => srgbify(doc),
    });
  } catch (e) {
    // Surface the real cause — silent failures here historically led the
    // user to think the button "did nothing". Wrap with a friendlier
    // prefix while preserving the original message for diagnosis.
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[pdfPrint] html2canvas failed:', e);
    throw new Error(`PDF render failed: ${msg}`);
  }
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
