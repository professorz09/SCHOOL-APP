// Shared Browser-Print + Download-PDF button pair. Used by every tool
// that produces print-ready output. Encapsulates the progress-update
// dance so individual tools don't repeat the same DOM manipulation.

import React from 'react';
import { Printer, Download } from 'lucide-react';
import { handlePrint, downloadPDF } from '@/shared/utils/htmlToPdf';

interface Props {
  /** id of the .print-only target element */
  targetId: string;
  /** file name for the downloaded PDF */
  filename: string;
  /** unique id for the download button (lets us update its label) */
  downloadButtonId?: string;
}

export const ActionButtons: React.FC<Props> = ({ targetId, filename, downloadButtonId }) => {
  const btnId = downloadButtonId ?? `btn-download-${targetId}`;
  const onDownload = async () => {
    const btn = document.getElementById(btnId);
    const originalText = btn?.innerHTML;
    if (btn) btn.textContent = 'Preparing…';
    try {
      await downloadPDF(targetId, filename, (p) => {
        if (btn) btn.textContent = `Generating ${p}%…`;
      });
    } finally {
      if (btn && originalText) btn.innerHTML = originalText;
    }
  };

  return (
    <div className="sticky bottom-0 md:static bg-gradient-to-t md:bg-none from-white via-white to-transparent pt-3 pb-3 md:pb-0 z-10">
      <div className="grid grid-cols-2 md:flex md:justify-end gap-2">
        <button onClick={handlePrint}
          className="py-2.5 px-4 bg-white border border-gray-200 hover:border-gray-900 text-gray-900 rounded-lg font-semibold text-sm flex justify-center items-center gap-2 transition-colors active:scale-[0.98]">
          <Printer size={15} /> Print
        </button>
        <button id={btnId} onClick={onDownload}
          className="py-2.5 px-4 md:px-6 bg-gray-900 hover:bg-black text-white rounded-lg font-semibold text-sm flex justify-center items-center gap-2 transition-colors active:scale-[0.98]">
          <Download size={15} /> Download PDF
        </button>
      </div>
    </div>
  );
};
