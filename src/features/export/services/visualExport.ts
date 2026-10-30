import { toPng, toSvg, toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { downloadFile } from './zipBackup';

export interface VisualExportOptions {
  format: 'png' | 'svg' | 'jpeg' | 'pdf';
  scale?: number; // 1, 2, 3
  backgroundColor?: string | null; // null for transparent
  fileName?: string;
  pdfOrientation?: 'portrait' | 'landscape';
  pdfFit?: boolean;
}

/**
 * Captures a DOM container (e.g., React Flow canvas container) and exports as an image or PDF
 */
export async function exportVisualCanvas(
  element: HTMLElement,
  options: VisualExportOptions
): Promise<void> {
  const {
    format,
    scale = 2,
    backgroundColor = '#0f172a',
    fileName = 'mindgraph-canvas',
    pdfOrientation = 'landscape',
    pdfFit = true,
  } = options;

  const htmlToImageOptions = {
    quality: 0.95,
    pixelRatio: scale,
    backgroundColor: backgroundColor ?? undefined,
    filter: (node: HTMLElement) => {
      // Exclude minimap, controls, and floating toolbars if present
      if (node.classList) {
        if (
          node.classList.contains('react-flow__minimap') ||
          node.classList.contains('react-flow__controls') ||
          node.classList.contains('react-flow__panel') ||
          node.getAttribute?.('data-export-ignore') === 'true'
        ) {
          return false;
        }
      }
      return true;
    },
  };

  if (format === 'svg') {
    const dataUrl = await toSvg(element, htmlToImageOptions);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    downloadFile(blob, `${fileName}.svg`);
    return;
  }

  if (format === 'jpeg') {
    const dataUrl = await toJpeg(element, {
      ...htmlToImageOptions,
      backgroundColor: backgroundColor || '#ffffff', // JPEG cannot be transparent
    });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    downloadFile(blob, `${fileName}.jpg`);
    return;
  }

  if (format === 'png') {
    const dataUrl = await toPng(element, htmlToImageOptions);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    downloadFile(blob, `${fileName}.png`);
    return;
  }

  if (format === 'pdf') {
    // Generate high-res PNG first to embed into PDF
    const dataUrl = await toPng(element, {
      ...htmlToImageOptions,
      backgroundColor: backgroundColor || '#ffffff',
      pixelRatio: 2,
    });

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = dataUrl;
    });

    const pdf = new jsPDF({
      orientation: pdfOrientation,
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;

    let renderWidth = maxWidth;
    let renderHeight = (img.height * maxWidth) / img.width;

    if (pdfFit && renderHeight > maxHeight) {
      renderHeight = maxHeight;
      renderWidth = (img.width * maxHeight) / img.height;
    }

    const x = margin + (maxWidth - renderWidth) / 2;
    const y = margin + (maxHeight - renderHeight) / 2;

    pdf.addImage(dataUrl, 'PNG', x, y, renderWidth, renderHeight);
    pdf.save(`${fileName}.pdf`);
  }
}
