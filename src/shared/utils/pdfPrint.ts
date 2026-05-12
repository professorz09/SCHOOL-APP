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

/** Manual OKLCH → sRGB converter. Used as the parsing fallback when
 *  the browser's canvas can't resolve oklch() values (iOS Safari < 16,
 *  some Android WebViews). Without this, html2canvas would render every
 *  Tailwind v4 colour as solid black because canvas.fillStyle silently
 *  refuses unknown colour spaces and our previous `rgb(0,0,0)` fallback
 *  catastrophically blanketed the whole document in black.
 *
 *  Math: CSS Color Module Level 4 — OKLCH→OKLab→linear sRGB→sRGB.
 *  ~50 lines, no deps.
 */
function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const toSrgb = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  r = toSrgb(r); g = toSrgb(g); bb = toSrgb(bb);
  return [
    Math.round(Math.max(0, Math.min(1, r)) * 255),
    Math.round(Math.max(0, Math.min(1, g)) * 255),
    Math.round(Math.max(0, Math.min(1, bb)) * 255),
  ];
}

/** Parse "oklch(L% C H)" / "oklch(L C H / alpha)" strings — returns
 *  rgb()/rgba() string, or null if the input isn't oklch-shaped. */
function parseOklch(val: string): string | null {
  const m = val.match(/^\s*oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)\s*$/i);
  if (!m) return null;
  const L = m[2] === '%' ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  const C = parseFloat(m[3]);
  const H = parseFloat(m[4]);
  const [r, g, b] = oklchToRgb(L, C, H);
  if (m[5] !== undefined) {
    const a = m[6] === '%' ? parseFloat(m[5]) / 100 : parseFloat(m[5]);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

/** Property-aware fallback when even the manual OKLCH parser fails.
 *  Catastrophic black-everywhere is the worst outcome — better to lose
 *  one specific tint than the entire document. */
function safeFallback(prop: string): string {
  if (prop === 'color' || prop === 'fill' || prop === 'caretColor') return 'rgb(15, 23, 42)'; // slate-900
  if (prop.startsWith('border') || prop.startsWith('outline') || prop === 'columnRuleColor') {
    return 'rgb(226, 232, 240)'; // slate-200
  }
  // backgrounds / shadows / decorations
  return 'rgba(0, 0, 0, 0)';
}

/** Tailwind v4 emits modern color spaces (oklch, oklab, color-mix, lab,
 *  lch, hwb, color()) that html2canvas v1 can't parse — capture either
 *  fails or returns blank/black.
 *
 *  Workaround: inside the cloned DOM, walk every element, read its
 *  *computed* color via getComputedStyle, and unconditionally rewrite each
 *  color-bearing property as an inline rgb()/rgba() string so html2canvas
 *  only ever sees legacy formats. The browser does the parse for us via
 *  ctx.fillStyle (which always returns a legacy form); when that fails
 *  (older iOS Safari), the manual oklch parser steps in.
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

  const resolveSingleColor = (val: string, prop?: string): string => {
    // Try canvas first — modern browsers convert oklch → rgb here.
    try {
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillStyle = val;
      const out = ctx.fillStyle as string;
      // Canvas returns the SET sentinel if it rejected the value.
      if (typeof out === 'string' && out !== 'rgba(0, 0, 0, 0)' && !MODERN_COLOR_RE.test(out)) {
        return out;
      }
    } catch { /* fall through to manual parser */ }
    // Canvas refused (iOS Safari < 16 etc) — try the manual oklch parser.
    const manual = parseOklch(val);
    if (manual) return manual;
    // Last resort: property-aware fallback so we never blanket-black.
    return safeFallback(prop || 'backgroundColor');
  };

  const toRgb = (val: string, prop: string): string | null => {
    if (!val) return null;
    if (val === 'transparent' || val === 'none' || val === 'currentcolor') return val;
    return resolveSingleColor(val, prop);
  };

  const rewriteComposite = (val: string, prop: string): string => {
    if (!val || !MODERN_COLOR_RE.test(val)) return val;
    return val.replace(COLOR_FN_GLOBAL, fn => resolveSingleColor(fn, prop));
  };

  const walker = clonedDoc.createTreeWalker(clonedDoc.body, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node instanceof HTMLElement) {
      const style = clonedDoc.defaultView?.getComputedStyle(node);
      if (style) {
        for (const p of colorProps) {
          const v = style.getPropertyValue(p);
          const replacement = toRgb(v, p);
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
          const rewritten = rewriteComposite(v, p);
          if (rewritten !== v) {
            (node.style as unknown as Record<string, string>)[p] = rewritten;
          }
        }
      }
    }
    node = walker.nextNode();
  }

  // Final layer: html2canvas v1 also reads raw stylesheet rules (not just
  // computed styles) to resolve some properties — Tailwind v4 ships its
  // theme tokens as CSS variables whose values are `oklch(...)`, and the
  // parser blows up on them with "Attempting to parse an unsupported color
  // function 'oklch'" before our inline overrides are even consulted.
  //
  // So nuke every modern colour function out of every <style> tag and
  // adopted stylesheet in the cloned document. We replace each function
  // call with the canvas-resolved rgb() form (or rgb(0,0,0) as a last
  // resort). Inline style rewrites above still win for actual element
  // colour — this just keeps the parser from throwing on theme tokens.
  const sanitizeCssText = (css: string): string => {
    if (!MODERN_COLOR_RE.test(css)) return css;
    // No property context here (we're scanning raw CSS text), so we
    // default to a safe transparent fallback. Inline-style overrides
    // above still win for actual visible elements; this just keeps
    // html2canvas's stylesheet parser from throwing on theme tokens.
    return css.replace(COLOR_FN_GLOBAL, fn => resolveSingleColor(fn, 'backgroundColor'));
  };
  for (const styleEl of Array.from(clonedDoc.querySelectorAll('style'))) {
    if (styleEl.textContent) {
      styleEl.textContent = sanitizeCssText(styleEl.textContent);
    }
  }
  // Also nuke CSS custom properties on :root that resolve to oklch — some
  // Tailwind v4 utilities reference them via var(--tw-*).
  const root = clonedDoc.documentElement;
  if (root && clonedDoc.defaultView) {
    const rootStyle = clonedDoc.defaultView.getComputedStyle(root);
    for (let i = 0; i < rootStyle.length; i++) {
      const prop = rootStyle.item(i);
      if (!prop.startsWith('--')) continue;
      const val = rootStyle.getPropertyValue(prop);
      if (MODERN_COLOR_RE.test(val)) {
        const fixed = sanitizeCssText(val);
        if (fixed !== val) root.style.setProperty(prop, fixed);
      }
    }
  }
}

/** A4 portrait at 96dpi ≈ 794×1123 px. Capturing at this width ensures
 *  the rendered content fills the PDF page properly. Before this pin,
 *  the printable was captured at whatever the live viewport gave it
 *  (often ~360px on a mobile), which placed a thin centered strip on
 *  an otherwise empty A4 page (~30% page width occupied). */
const PRINT_CAPTURE_WIDTH = 794;

/** Walk the clone and strip every Tailwind max-w-* / mx-auto contribution
 *  via inline style. Class-list driven rather than computed-style driven
 *  because the `.pdf-staging` CSS rule already neutralises max-width
 *  via specificity, which makes computed-style inspection useless for
 *  detecting "which elements originally HAD a constraint". Inline
 *  overrides always win regardless. */
function neutralizeWidthConstraints(root: HTMLElement): void {
  const apply = (el: HTMLElement) => {
    let hasMaxW = false;
    el.classList.forEach(c => { if (c.startsWith('max-w-')) hasMaxW = true; });
    if (hasMaxW) el.style.setProperty('max-width', 'none', 'important');
    if (el.classList.contains('mx-auto')) {
      el.style.setProperty('margin-left', '0', 'important');
      el.style.setProperty('margin-right', '0', 'important');
    }
  };
  apply(root);
  root.querySelectorAll<HTMLElement>('*').forEach(apply);
}

/** Stage `node` for capture inside an offscreen wrapper pinned to A4
 *  width. We clone (not move) the node so the live UI doesn't reflow.
 *  Returns the cloned root + a teardown to remove it. */
function stageForCapture(node: HTMLElement): { stage: HTMLElement; teardown: () => void } {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: -10000px',
    `width: ${PRINT_CAPTURE_WIDTH}px`,
    'background: #ffffff',
    'z-index: -1',
    'pointer-events: none',
  ].join(';');
  wrapper.className = 'pdf-staging';
  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.width = '100%';
  clone.style.maxWidth = 'none';
  clone.style.margin = '0';
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  // Walk AFTER attach so getComputedStyle has a live layout context.
  neutralizeWidthConstraints(clone);
  return {
    stage: clone,
    teardown: () => { document.body.removeChild(wrapper); },
  };
}

/** Collect atomic-block boundaries in the staged DOM. These are points
 *  the page slicer should avoid cutting through — questions, paragraphs,
 *  section headers, table rows, etc. Returns vertical extents in DOM
 *  pixels relative to the stage top, sorted by `top` ascending.
 *
 *  Heuristic: leaf-ish elements with text content and reasonable height.
 *  We exclude giant containers (they're just wrappers) and zero-height
 *  decorative elements. The list is used as advisory hints — the slicer
 *  shifts the cut to a block's `top` if the cut would otherwise bisect
 *  the block, as long as the resulting page isn't <30% utilised. */
function collectAtomicBlocks(stage: HTMLElement): { top: number; bottom: number }[] {
  const stageRect = stage.getBoundingClientRect();
  const blocks: { top: number; bottom: number }[] = [];
  stage.querySelectorAll<HTMLElement>('*').forEach(el => {
    const r = el.getBoundingClientRect();
    // Skip wrappers (too tall to be atomic) and decorative bits (too short).
    if (r.height < 8 || r.height > 600) return;
    // Need actual text to qualify as "atomic content".
    if (!(el.textContent?.trim().length)) return;
    // Skip elements that have grandchildren — these are containers, not
    // atomic blocks. Keep elements with up to 3 immediate children (a
    // typical "Q1." + question text + marks chip row).
    if (el.childElementCount > 3) return;
    blocks.push({
      top: r.top - stageRect.top,
      bottom: r.bottom - stageRect.top,
    });
  });
  blocks.sort((a, b) => a.top - b.top);
  return blocks;
}

/** Render one DOM node and place it (top-aligned, full-width) on a new A4 page. */
async function placeNodeOnPdf(pdf: JsPDFInstance, node: HTMLElement, html2canvas: typeof import('html2canvas').default): Promise<void> {
  const { stage, teardown } = stageForCapture(node);
  // Snapshot block boundaries BEFORE capture — after teardown the
  // stage is gone and getBoundingClientRect would return zeros.
  const atomicBlocks = collectAtomicBlocks(stage);
  const stageWidth = stage.getBoundingClientRect().width || PRINT_CAPTURE_WIDTH;
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(stage, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: PRINT_CAPTURE_WIDTH,
      onclone: (doc) => srgbify(doc),
    });
  } catch (e) {
    teardown();
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[pdfPrint] html2canvas failed:', e);
    throw new Error(`PDF render failed: ${msg}`);
  }
  teardown();

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 30; // pt
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const drawW = maxW;
  // Convert "one A4 content page" into the captured-canvas pixel space.
  // `pxPerPdfPt` scales canvas px ↔ PDF pt; the printable area maxH (pt)
  // corresponds to `sliceHeightPx` pixels of the source canvas.
  const pxPerPdfPt = canvas.width / drawW;
  const sliceHeightPx = Math.floor(maxH * pxPerPdfPt);

  // Single-page fast path: full image fits, no slicing needed.
  if (canvas.height <= sliceHeightPx) {
    const drawH = (canvas.height / canvas.width) * drawW;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageW - drawW) / 2, margin, drawW, drawH);
    return;
  }

  // Multi-page slicing — atomic-block aware. Earlier the slicer cut
  // every `sliceHeightPx` pixels which sometimes bisected a question
  // (half on page 1, other half on page 2). Now we shift the cut up to
  // the nearest block boundary so atoms stay whole. Min utilisation
  // floor of 30% prevents one giant block (e.g. an oversized image)
  // from causing 80% blank pages.
  // canvasScale: how many canvas pixels per source-DOM pixel.
  const canvasScale = canvas.width / stageWidth;
  let yOffset = 0;
  let firstSlice = true;
  const MIN_UTIL = 0.3;
  while (yOffset < canvas.height) {
    if (!firstSlice) pdf.addPage();
    firstSlice = false;
    let sliceH = Math.min(sliceHeightPx, canvas.height - yOffset);

    // Only shift cut if we're NOT on the final slice (avoid orphan tail).
    if (yOffset + sliceH < canvas.height && atomicBlocks.length > 0) {
      const cutCanvasY = yOffset + sliceH;
      const cutDomY = cutCanvasY / canvasScale;
      // Find a block that the proposed cut would bisect.
      for (const blk of atomicBlocks) {
        if (blk.top >= cutDomY) break; // sorted — nothing later can bisect
        if (blk.bottom > cutDomY && blk.top < cutDomY) {
          const safeDomCut = blk.top - 2; // tiny buffer above block
          const safeCanvasCut = Math.floor(safeDomCut * canvasScale);
          const candidateH = safeCanvasCut - yOffset;
          // Accept only if remaining page utilisation is reasonable.
          if (candidateH >= sliceHeightPx * MIN_UTIL) {
            sliceH = candidateH;
          }
          break;
        }
      }
    }

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceH;
    const sctx = sliceCanvas.getContext('2d');
    if (!sctx) throw new Error('PDF slice canvas context unavailable');
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, canvas.width, sliceH);
    sctx.drawImage(canvas, 0, -yOffset);
    const drawSliceH = (sliceH / canvas.width) * drawW;
    pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', (pageW - drawW) / 2, margin, drawW, drawSliceH);
    yOffset += sliceH;
  }
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

/** Open a fresh tab/window containing the given self-contained HTML
 *  string and auto-fire the native print dialog. The HTML must include
 *  ALL its own CSS inline — we do NOT copy parent stylesheets, which
 *  is the reliability win over the iframe approach. No Tailwind v4
 *  oklch parsing issues, no cross-context layout shifts, no popup
 *  blocker dance with the auth chain (this is invoked from a click
 *  handler so popups are allowed).
 *
 *  Use case: principal-facing print documents (admit cards, ID cards,
 *  bonafide, TC, marksheet) where we want the print to look IDENTICAL
 *  across every browser / device and we control the HTML.
 *
 *  @param html   Self-contained <!DOCTYPE html> document string.
 *  @param title  Browser tab/window title shown in the print dialog.
 */
export function printHtmlInNewWindow(html: string, title = 'Print'): void {
  const win = window.open('', '_blank');
  if (!win) {
    // Popup blocked — open in same tab as fallback. The user can hit
    // Cmd/Ctrl+P themselves from that tab.
    const blob = new Blob([html], { type: 'text/html' });
    location.href = URL.createObjectURL(blob);
    return;
  }
  win.document.title = title;
  win.document.open();
  win.document.write(html);
  win.document.close();
  const trigger = () => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      // Don't swallow — log so the user can see the cause in console.
      // eslint-disable-next-line no-console
      console.error('[pdfPrint] window.print() failed in new window:', e);
    }
  };
  // 300ms settle window lets images (logo, signature) decode before the
  // browser snapshots the page for the print preview. Faster triggers
  // were causing iOS Safari to print blank logo slots.
  if (win.document.readyState === 'complete') {
    setTimeout(trigger, 300);
  } else {
    win.addEventListener('load', () => setTimeout(trigger, 300));
  }
}

/** Print one or more DOM nodes via the browser's native print dialog
 *  (which exposes "Save as PDF" on every modern browser). Uses a hidden
 *  same-page iframe instead of a popup window — no popup blocker, no
 *  cross-origin pain on codespaces / iOS Safari, and the print sheet
 *  shows ONLY the iframe contents which gives clean A4 output.
 *
 *  Browser-native rendering means:
 *    • OKLCH colours resolve correctly (no html2canvas black blocks)
 *    • Pagination respects `page-break-inside: avoid` (no bisected
 *      questions)
 *    • Hindi / Devanagari fonts render through the system stack
 *    • Tailwind utilities work identically because we copy the
 *      parent's full <head>
 *
 *  @param nodes  One DOM node or an array of nodes. Multiple nodes are
 *                stacked with `.print-page` wrappers so each occupies
 *                its own A4 sheet (CSS `page-break-after: always`).
 *  @param title  Tab/document title shown in the print dialog header.
 */
export function printNodeInNewWindow(nodes: HTMLElement | HTMLElement[], title = 'Print'): void {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  if (list.length === 0) return;

  const headHtml = document.head.innerHTML;
  const bodyHtml = list.length === 1
    ? list[0].outerHTML
    : list.map(n => `<div class="print-page">${n.outerHTML}</div>`).join('');
  const safeTitle = title.replace(/[<>]/g, '');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <base href="${location.origin}/" />
  ${headHtml}
  <style>
    /* Override the parent's @media print { body * { visibility: hidden } }
       rule — in the iframe everything IS print content, so we want
       full visibility back. The parent rule was designed for a single-
       page on-screen scope, not a print-only iframe. */
    @page { size: A4; margin: 12mm; }
    html, body { margin: 0; padding: 0; background: #fff; visibility: visible !important; }
    body { padding: 16px; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    body, body * { visibility: visible !important; }
    /* Strip mobile-card width constraints so printables fill the A4 sheet. */
    body > *, body > * > * { max-width: none !important; }
    body > .printable, body > .print-page > .printable { margin-left: 0 !important; margin-right: 0 !important; }
    .mx-auto { margin-left: 0 !important; margin-right: 0 !important; }
    [class*="max-w-"] { max-width: none !important; }
    /* Multi-doc: each .print-page on its own sheet. */
    .print-page { page-break-after: always; break-after: page; }
    .print-page:last-child { page-break-after: auto; break-after: auto; }
    .no-print, [data-no-print] { display: none !important; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;

  // Hidden same-page iframe — works around codespaces popup blocker
  // and iOS Safari popup restrictions. Cleaned up after print sheet
  // dismisses (regardless of save/cancel choice — we can't tell which
  // happened, so use a generous timeout that covers slow-print users).
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const iwin = iframe.contentWindow;
  const idoc = iframe.contentDocument || iwin?.document;
  if (!idoc || !iwin) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  idoc.open();
  idoc.write(html);
  idoc.close();

  const trigger = () => {
    try {
      iwin.focus();
      iwin.print();
    } catch (e) {
      console.error('[pdfPrint] iframe print() failed:', e);
    }
    // Tear down after a delay long enough that the print dialog has
    // captured the iframe contents. Removing too early aborts the
    // dialog on some browsers.
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 5000);
  };

  if (idoc.readyState === 'complete') {
    setTimeout(trigger, 300);
  } else {
    iwin.addEventListener('load', () => setTimeout(trigger, 300));
  }
}
