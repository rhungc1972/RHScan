// src/utils/pdfGenerator.ts
// Compilación de PDF multi-página, exportación a JPG y Web Share API Nivel 2

import { jsPDF } from 'jspdf';
import { ScannedPage, ExportFormat, DocumentMetadata } from '../types';
import { collectDocumentMetadata, generateAuditPageDataUrl } from './metadataAudit';

export interface ExportResult {
  sharedViaNativeSheet: boolean;
  downloadTriggered: boolean;
  fileName: string;
  format: ExportFormat;
  metadata?: DocumentMetadata;
}

/**
 * Compila las páginas escaneadas en un archivo PDF optimizado con opción de Acta de Metadatos
 */
export async function generatePdfBlob(
  pages: ScannedPage[],
  includeMetadata: boolean = false
): Promise<{ blob: Blob; fileName: string; metadata?: DocumentMetadata }> {
  if (!pages || pages.length === 0) {
    throw new Error('No hay páginas para generar el documento PDF.');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const a4Width = 210;
  const a4Height = 297;
  const margin = 4;
  const targetW = a4Width - margin * 2;
  const targetH = a4Height - margin * 2;

  // 1. Añadir las páginas del documento
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }
    const page = pages[i];
    pdf.addImage(page.warpedDataUrl, 'JPEG', margin, margin, targetW, targetH, undefined, 'FAST');
  }

  // 2. Si se solicita metadatos y Hash, adjuntar el Acta Oficial como última página
  let metadata: DocumentMetadata | undefined;
  if (includeMetadata) {
    metadata = await collectDocumentMetadata(pages, 'pdf');
    const auditPageUrl = generateAuditPageDataUrl(metadata);
    pdf.addPage('a4', 'portrait');
    pdf.addImage(auditPageUrl, 'JPEG', margin, margin, targetW, targetH, undefined, 'FAST');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `RHDocScan_Documento_${timestamp}.pdf`;
  const blob = pdf.output('blob');

  return { blob, fileName, metadata };
}

/**
 * Genera el paquete o imagen principal en formato JPG con opción de Acta de Metadatos
 */
export async function generateJpgBlob(
  pages: ScannedPage[],
  includeMetadata: boolean = false
): Promise<{ blob: Blob; fileName: string; metadata?: DocumentMetadata }> {
  if (!pages || pages.length === 0) {
    throw new Error('No hay páginas para generar el archivo JPG.');
  }

  let metadata: DocumentMetadata | undefined;
  if (includeMetadata) {
    metadata = await collectDocumentMetadata(pages, 'jpg');
  }

  // Si hay una sola página y no hay metadatos, exportar directamente
  if (pages.length === 1 && !includeMetadata) {
    const res = await fetch(pages[0].warpedDataUrl);
    const blob = await res.blob();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return { blob, fileName: `RHDocScan_${timestamp}.jpg`, metadata };
  }

  // Si hay múltiples páginas o metadatos, coserlas verticalmente en una imagen de rollo continua
  const loadedImgs: HTMLImageElement[] = [];
  const imgUrls = pages.map((p) => p.warpedDataUrl);
  if (includeMetadata && metadata) {
    imgUrls.push(generateAuditPageDataUrl(metadata));
  }

  await Promise.all(
    imgUrls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            loadedImgs.push(img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        })
    )
  );

  const canvas = document.createElement('canvas');
  const width = 1240;
  const singleHeight = 1754;
  canvas.width = width;
  canvas.height = singleHeight * loadedImgs.length;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    loadedImgs.forEach((img, idx) => {
      ctx.drawImage(img, 0, idx * singleHeight, width, singleHeight);
    });
  }

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.92);
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return { blob, fileName: `RHDocScan_${timestamp}.jpg`, metadata };
}

/**
 * Comparte o descarga el archivo según el formato elegido (PDF o JPG)
 */
export async function shareOrDownloadDocument(
  pages: ScannedPage[],
  format: ExportFormat = 'pdf',
  includeMetadata: boolean = false
): Promise<ExportResult> {
  const { blob, fileName, metadata } =
    format === 'pdf'
      ? await generatePdfBlob(pages, includeMetadata)
      : await generateJpgBlob(pages, includeMetadata);

  const mimeType = format === 'pdf' ? 'application/pdf' : 'image/jpeg';
  const file = new File([blob], fileName, { type: mimeType });

  // 1. Probar Web Share API Nivel 2
  if (typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator) {
    try {
      const shareData = {
        title: fileName,
        text: `Documento escaneado de forma 100% privada con RHDocScan (${(format || 'pdf').toUpperCase()}).`,
        files: [file],
      };

      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return {
          sharedViaNativeSheet: true,
          downloadTriggered: false,
          fileName,
          format,
          metadata,
        };
      }
    } catch (shareError: unknown) {
      const error = shareError as Error;
      if (error.name === 'AbortError') {
        return {
          sharedViaNativeSheet: true,
          downloadTriggered: false,
          fileName,
          format,
          metadata,
        };
      }
      console.warn('Web Share API falló, ejecutando descarga de respaldo:', error);
    }
  }

  // 2. Respaldo: Descarga directa al teléfono
  downloadBlobDirectly(blob, fileName);
  return {
    sharedViaNativeSheet: false,
    downloadTriggered: true,
    fileName,
    format,
    metadata,
  };
}

/**
 * Descarga directa de archivo Blob
 */
export function downloadBlobDirectly(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
