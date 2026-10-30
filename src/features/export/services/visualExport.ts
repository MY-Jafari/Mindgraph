import { toPng, toSvg, toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { downloadFile } from './zipBackup';

export interface CanvasNodeBoundingInfo {
  id?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

export interface VisualExportOptions {
  format: 'png' | 'svg' | 'jpeg' | 'pdf';
  scale?: number; // 1, 2, 3
  backgroundColor?: string | null; // null for transparent
  fileName?: string;
  pdfOrientation?: 'portrait' | 'landscape';
  pdfFit?: boolean;
  scope?: 'all' | 'viewport'; // 'all' captures all nodes in project, 'viewport' captures current screen
  nodes?: CanvasNodeBoundingInfo[];
}

/**
 * Calculates the bounding box of all canvas nodes (with padding).
 */
export function calculateCanvasBounds(nodes?: CanvasNodeBoundingInfo[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!nodes || nodes.length === 0) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // Read actual rendered dimensions from DOM nodes if present
  const domNodes = typeof document !== 'undefined'
    ? Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node'))
    : [];
  const domNodeMap = new Map<string, { width: number; height: number }>();

  for (const domNode of domNodes) {
    const id = domNode.getAttribute('data-id');
    if (id) {
      domNodeMap.set(id, {
        width: domNode.offsetWidth || 240,
        height: domNode.offsetHeight || 120,
      });
    }
  }

  for (const node of nodes) {
    const domSize = node.id ? domNodeMap.get(node.id) : undefined;
    const w = node.width || domSize?.width || 240;
    const h = node.height || domSize?.height || 120;

    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + w);
    maxY = Math.max(maxY, node.position.y + h);
  }

  if (minX === Infinity) {
    return { x: 0, y: 0, width: 800, height: 600 };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Captures a DOM container (e.g., React Flow canvas container) and exports as an image or PDF.
 * If scope === 'all', it captures ALL nodes across the canvas without viewport clipping.
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
    scope = 'all',
    nodes = [],
  } = options;

  const isFullMap = scope === 'all' && nodes.length > 0;
  const targetElement = isFullMap
    ? (element.querySelector('.react-flow__viewport') as HTMLElement) || element
    : element;

  let exportWidth: number | undefined;
  let exportHeight: number | undefined;
  let customStyle: Record<string, string> | undefined;

  if (isFullMap && targetElement) {
    const bounds = calculateCanvasBounds(nodes);
    const padding = 80;
    exportWidth = Math.max(400, Math.round(bounds.width + padding * 2));
    exportHeight = Math.max(300, Math.round(bounds.height + padding * 2));
    const transform = `translate(${Math.round(-bounds.x + padding)}px, ${Math.round(-bounds.y + padding)}px) scale(1)`;

    customStyle = {
      width: `${exportWidth}px`,
      height: `${exportHeight}px`,
      transform,
      transformOrigin: 'top left',
    };
  }

  const htmlToImageOptions = {
    quality: 0.95,
    pixelRatio: scale,
    backgroundColor: backgroundColor ?? undefined,
    width: exportWidth,
    height: exportHeight,
    style: customStyle,
    filter: (node: HTMLElement) => {
      // Exclude minimap, controls, and floating toolbars
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
    const dataUrl = await toSvg(targetElement, htmlToImageOptions);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    downloadFile(blob, `${fileName}.svg`);
    return;
  }

  if (format === 'jpeg') {
    const dataUrl = await toJpeg(targetElement, {
      ...htmlToImageOptions,
      backgroundColor: backgroundColor || '#ffffff', // JPEG cannot be transparent
    });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    downloadFile(blob, `${fileName}.jpg`);
    return;
  }

  if (format === 'png') {
    const dataUrl = await toPng(targetElement, htmlToImageOptions);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    downloadFile(blob, `${fileName}.png`);
    return;
  }

  if (format === 'pdf') {
    // Generate high-res PNG first to embed into PDF
    const dataUrl = await toPng(targetElement, {
      ...htmlToImageOptions,
      backgroundColor: backgroundColor || '#ffffff',
      pixelRatio: Math.max(scale, 2),
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
