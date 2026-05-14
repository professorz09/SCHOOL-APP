// Print + PDF utilities — verbatim port of Toolsedu's downloadPDF.
// Uses `html-to-image` (toJpeg) for snapshots and `jsPDF` for the
// multi-page A4 output. Smart page splits driven by `.avoid-break`
// markers — cards / questions don't get bisected across pages.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';

/** Tailwind className merge helper — clsx + tailwind-merge. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Browser print — relies on @media print CSS to hide app shell and
 *  show only `.print-only` content. */
export function handlePrint(): void {
  window.print();
}

export interface DownloadPDFOptions {
  /** 'download' (default) saves a file. 'share' opens the OS share sheet. */
  mode?: 'download' | 'share';
}

/** Triggers a direct file download via a hidden anchor click. */
function triggerAnchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Keep URL alive a bit so mobile browsers commit the request.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function downloadPDF(
  elementId: string,
  filename = 'document.pdf',
  onProgress?: (percent: number) => void,
  options?: DownloadPDFOptions,
): Promise<boolean> {
  const original = document.getElementById(elementId);
  if (!original) {
    console.error(`[downloadPDF] Element with id "${elementId}" not found in DOM`);
    alert(`Download failed — element "${elementId}" missing. Try refreshing the page.`);
    return false;
  }
  console.log(`[downloadPDF] start · target=${elementId}`);

  // Operate on a CLONE in a detached body-level container instead of
  // mutating React's live DOM. Previous design wrapped + moved the
  // real element, restoring it in a finally block — and the restore
  // sometimes raced React's reconciliation on re-renders, leaving
  // styles or DOM hierarchy stale. After one run the second run would
  // find the print target in an unexpected state and silently fail.
  //
  // Cloning sidesteps all of that: React's tree is never touched.
  // Cleanup is one `container.remove()`.

  // Defensively clear any leftover stage from a previous run that
  // didn't finish cleaning up (e.g. user closed a modal mid-export).
  document.querySelectorAll('[data-pdf-stage]').forEach(n => n.remove());

  const pxWidth = 794;
  const container = document.createElement('div');
  container.setAttribute('data-pdf-stage', '1');
  container.style.cssText =
    `position: absolute; left: -9999px; top: 0; width: ${pxWidth}px; ` +
    'background: #ffffff; z-index: -1000;';
  document.body.appendChild(container);

  const element = original.cloneNode(true) as HTMLElement;
  // Strip the id from the clone so getElementById on the same id stays
  // pointed at the React-owned original (in case a re-entrant call
  // happens during the snapshot).
  element.removeAttribute('id');
  element.style.backgroundColor = '#ffffff';
  element.style.width = `${pxWidth}px`;
  // Make sure the clone is on-screen for layout calculation. It still
  // sits inside the offscreen container, just not display:none.
  if (element.style.display === 'none') element.style.display = '';
  container.appendChild(element);

  // Wait for images on the CLONE. Cloning a node with display:none
  // ancestors does not duplicate the image's loaded state — even if
  // the original was loaded, the cloned <img> may need to fetch again
  // now that it's been placed in a visible container.
  await new Promise(resolve => setTimeout(resolve, 100));
  const imgs = Array.from(element.querySelectorAll('img')) as HTMLImageElement[];
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 5000);
    });
  }));
  console.log(`[downloadPDF] images settled: ${imgs.length}`);

  // Trigger reflow before reading layout dims.
  void element.getBoundingClientRect();
  const totalHeight = element.scrollHeight;
  const elementRectTop = element.getBoundingClientRect().top;
  console.log(`[downloadPDF] dims · width=${pxWidth} height=${totalHeight} rectTop=${elementRectTop}`);
  if (totalHeight === 0) {
    console.error('[downloadPDF] totalHeight is 0 — element has no rendered content');
    container.remove();
    alert(
      'Cannot generate PDF — the document has no rendered content yet.\n\n' +
      'Try: (1) wait a moment for images to load, (2) switch back to Edit and to Preview again, (3) use Browser Print as a fallback.',
    );
    return false;
  }

  const pdfWidth = 210;
  const pageHeight = 297;
  const pxPageHeight = Math.floor((pxWidth * pageHeight) / pdfWidth);

  // Smart Page Splitting using .avoid-break
  const items = Array.from(element.querySelectorAll('.avoid-break')) as HTMLElement[];
  const pageOffsets: number[] = [0];

  if (items.length > 0) {
    let currentPageBottom = pxPageHeight;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemRect = item.getBoundingClientRect();
      const itemTop = Math.max(0, itemRect.top - elementRectTop);
      const itemBottom = itemTop + itemRect.height;

      if (itemBottom > currentPageBottom) {
        const newOffset = itemTop;
        const lastOffset = pageOffsets[pageOffsets.length - 1];
        if (newOffset <= lastOffset) {
          currentPageBottom += pxPageHeight;
        } else {
          pageOffsets.push(newOffset);
          currentPageBottom = newOffset + pxPageHeight;
        }
      }
    }
  }

  let lastOffset = pageOffsets[pageOffsets.length - 1];
  while (lastOffset + pxPageHeight < totalHeight) {
    lastOffset += pxPageHeight;
    if (lastOffset < totalHeight) pageOffsets.push(lastOffset);
  }

  const numPages = pageOffsets.length;

  // Build the sliding-window wrapper inside the CLONE container —
  // never inside React's tree.
  const wrapper = document.createElement('div');
  wrapper.style.width = pxWidth + 'px';
  wrapper.style.overflow = 'hidden';
  wrapper.style.position = 'relative';
  wrapper.style.backgroundColor = '#ffffff';

  element.style.position = 'absolute';
  element.style.left = '0px';
  element.style.width = pxWidth + 'px';

  container.appendChild(wrapper);
  wrapper.appendChild(element);

  let success = false;
  try {
    const pdf = new jsPDF('p', 'mm', 'a4');

    // PIXEL RATIO TIERS — sharper at low counts, gentler at high counts
    // so the final PDF doesn't blow past browser memory.
    // Pixel-ratio tiers. The old defaults (3 → 1.5) made the main
    // thread block for several hundred ms per snapshot on phones —
    // user experienced it as a hang. 2 is already 300dpi at A4 print
    // size from 794px CSS width, so the visual loss is invisible on
    // paper but the speed-up is large.
    const totalUnits = items.length > 1 ? items.length : numPages;
    let pixelRatio = 2;
    if (totalUnits > 10) pixelRatio = 1.75;
    if (totalUnits > 20) pixelRatio = 1.5;
    if (totalUnits > 50) pixelRatio = 1.25;

    // Yield to the browser's render pipeline between heavy steps so
    // the spinner can paint and the page doesn't feel frozen.
    const yieldToBrowser = () => new Promise<void>(resolve => {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    });

    const placeholderImg =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    // ─── Strategy auto-selection ──────────────────────────────────────
    // Per-item snapshot works great for full-page docs (marksheets,
    // bonafides — each one fills its own page), but breaks two layouts:
    //   (a) grids of small items (ID cards) → many tiny items packed
    //       into one A4. Decide via item width.
    //   (b) long documents made of short avoid-break rows (question
    //       paper — every question carries `.avoid-break` so it isn't
    //       split mid-line). Decide via item height.
    // If items are clearly shorter than half a page, they're meant to
    // FLOW within a sliding window, not occupy a page each.
    const sampleItemWidth = items.length > 0 ? items[0].offsetWidth : 0;
    const sampleItemHeight = items.length > 0 ? items[0].offsetHeight : 0;
    const itemsAreFullPage =
      sampleItemWidth >= pxWidth * 0.7 &&
      sampleItemHeight >= pxPageHeight * 0.5;
    const usePerItem = items.length >= 2 && itemsAreFullPage;

    // ─── STRATEGY A — per-item snapshot (one item per A4 page) ────────
    // For full-page docs (marksheet, bonafide, admit card) where each
    // `.avoid-break` is meant to be its own page. Dramatically more
    // reliable than the sliding window for these — no off-by-one
    // breaks, no memory accumulation between pages.
    if (usePerItem) {
      console.log(`[downloadPDF] strategy=per-item · count=${items.length}`);
      // Configure wrapper to show the FULL element (not a sliced window)
      // so each item's own layout box exists for toJpeg to snapshot.
      // Without this, wrapper height stayed 0 and items rendered but
      // were not in any visible viewport — toJpeg captured blanks.
      wrapper.style.height = totalHeight + 'px';
      wrapper.style.overflow = 'visible';
      element.style.top = '0px';

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Make sure only THIS item is visible to toJpeg. Other items
        // get visibility:hidden so they occupy layout space but don't
        // render pixels.
        items.forEach((it, idx) => { it.style.visibility = idx === i ? 'visible' : 'hidden'; });

        // Yield so style changes hit the renderer.
        await yieldToBrowser();

        // Snapshot the item itself, not the whole element.
        let imgData: string;
        try {
          imgData = await toJpeg(item, {
            pixelRatio, quality: 0.95, backgroundColor: '#ffffff',
            width: item.offsetWidth, height: item.offsetHeight,
            imagePlaceholder: placeholderImg,
          });
        } catch (e) {
          console.warn('[htmlToPdf] per-item snapshot failed, retrying without images:', e);
          imgData = await toJpeg(item, {
            pixelRatio: Math.max(pixelRatio - 1, 1.5),
            quality: 0.9, backgroundColor: '#ffffff',
            width: item.offsetWidth, height: item.offsetHeight,
            filter: (n) => !(n instanceof HTMLImageElement),
          });
        }

        if (i > 0) pdf.addPage();

        // Center the item on A4 page proportionally. Width fits to
        // pdfWidth (210mm); height keeps aspect ratio.
        const aspect = item.offsetWidth / item.offsetHeight;
        const drawWidth = pdfWidth;
        const drawHeight = drawWidth / aspect;
        // If natural height exceeds A4 (very tall item), constrain by
        // height instead so it fits on one page.
        if (drawHeight > pageHeight) {
          const h = pageHeight;
          const w = h * aspect;
          pdf.addImage(imgData, 'JPEG', (pdfWidth - w) / 2, 0, w, h);
        } else {
          pdf.addImage(imgData, 'JPEG', 0, 0, drawWidth, drawHeight);
        }

        if (onProgress) onProgress(Math.round(((i + 1) / items.length) * 100));
        await yieldToBrowser();
      }
    } else {
      // ─── STRATEGY B — single tall element via sliding window ────────
      // Used for question papers, single docs, or anything without
      // `.avoid-break` markers. Slices the rendered element across A4
      // pages and snapshots each slice in turn.
      console.log(`[downloadPDF] strategy=sliding-window · pages=${numPages}`);
      for (let i = 0; i < numPages; i++) {
        const offset = pageOffsets[i];
        const nextOffset = i < numPages - 1 ? pageOffsets[i + 1] : totalHeight;
        const currentChunkHeight = Math.min(pxPageHeight, nextOffset - offset);

        element.style.top = `-${offset}px`;
        wrapper.style.height = currentChunkHeight + 'px';
        await yieldToBrowser();

        let imgData: string;
        try {
          imgData = await toJpeg(wrapper, {
            pixelRatio, quality: 0.95, backgroundColor: '#ffffff',
            width: pxWidth, height: currentChunkHeight,
            imagePlaceholder: placeholderImg,
          });
        } catch (e) {
          console.warn('[htmlToPdf] slice snapshot failed, retrying without images:', e);
          imgData = await toJpeg(wrapper, {
            pixelRatio: Math.max(pixelRatio - 1, 1.5),
            quality: 0.9, backgroundColor: '#ffffff',
            width: pxWidth, height: currentChunkHeight,
            filter: (n) => !(n instanceof HTMLImageElement),
          });
        }

        if (i > 0) pdf.addPage();
        const pdfChunkHeight = (currentChunkHeight * pdfWidth) / pxWidth;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfChunkHeight);

        if (onProgress) onProgress(Math.round(((i + 1) / numPages) * 100));
        // Yield between pages so the spinner can repaint.
        await yieldToBrowser();
      }
    }

    // Download trigger.
    //
    // `mode` ('download' | 'share') decides which channel to use:
    //   - 'download' → anchor click with `download=` attribute. The
    //                  file lands in the user's Downloads folder.
    //                  Subsequent downloads in mobile PWAs sometimes
    //                  silently fail (browser's multi-file gate), but
    //                  the share button is right next to it as a
    //                  workaround.
    //   - 'share'    → navigator.share with a File payload. Opens the
    //                  OS share/save sheet. Reliable across repeated
    //                  invocations because each one is a separate
    //                  user-gesture interaction.
    const safeName = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
    const blob = pdf.output('blob') as Blob;

    if (options?.mode === 'share') {
      const file = new File([blob], safeName, { type: 'application/pdf' });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        try {
          await nav.share({ files: [file], title: safeName });
          success = true;
        } catch (shareErr) {
          // User cancelled — that's fine, treat as success so we
          // don't show an error toast.
          console.log('[downloadPDF] share cancelled', shareErr);
          success = true;
        }
      } else {
        // No share API → fall through to anchor download.
        triggerAnchorDownload(blob, safeName);
        success = true;
      }
    } else {
      // Default: anchor download.
      triggerAnchorDownload(blob, safeName);
      success = true;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[downloadPDF] Failed:', error);
    alert(`PDF generation failed: ${msg}\n\nTry Browser Print as a fallback.`);
  } finally {
    // Cleanup: just nuke the clone container. React's tree was never
    // touched, so nothing to restore.
    try { container.remove(); } catch { /* already gone */ }
  }
  return success;
}
