// src/utils/pdfGenerator.ts
// Generación de PDF multi-página client-side y Web Share API Nivel 2

import { jsPDF } from 'jspdf';
import { ScannedPage } from '../types';

export interface ShareResult {
  sharedViaNativeSheet: boolean;
  downloadTriggered: boolean;
  fileName: string;
}

/**
 * Compila las páginas escaneadas en un único archivo PDF optimizado
 */
export async function generatePdfBlob(pages: ScannedPage[]): Promise<{ blob: Blob; fileName: string }> {
  if (!pages || pages.length === 0) {
    throw new Error('No hay páginas para generar el documento PDF.');
  }

  // Dimensiones A4 estándar en milímetros: 210 x 297
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const a4Width = 210;
  const a4Height = 297;

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    const page = pages[i];
    const imgData = page.warpedDataUrl;

    // Calcular proporción para encajar en A4 con márgenes mínimos de 4mm
    const margin = 4;
    const targetW = a4Width - margin * 2;
    const targetH = a4Height - margin * 2;

    pdf.addImage(imgData, 'JPEG', margin, margin, targetW, targetH, undefined, 'FAST');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `PocketScan_Zero_${timestamp}.pdf`;
  const blob = pdf.output('blob');

  return { blob, fileName };
}

/**
 * Comparte el PDF generado utilizando la Web Share API (Nivel 2) con archivos,
 * o ejecuta la descarga directa como respaldo para navegadores de escritorio/incompatibles.
 */
export async function shareOrDownloadPdf(pages: ScannedPage[]): Promise<ShareResult> {
  const { blob, fileName } = await generatePdfBlob(pages);

  // Crear objeto File estándar
  const pdfFile = new File([blob], fileName, { type: 'application/pdf' });

  // 1. Probar Web Share API Nivel 2 (Nativo de iOS y Android)
  if (typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator) {
    try {
      const shareData = {
        title: 'Documento Escaneado - PocketScan Zero',
        text: 'Documento escaneado de forma 100% privada y procesado localmente con PocketScan Zero.',
        files: [pdfFile],
      };

      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return {
          sharedViaNativeSheet: true,
          downloadTriggered: false,
          fileName,
        };
      }
    } catch (shareError: unknown) {
      const error = shareError as Error;
      // Si el usuario canceló la hoja nativa de compartir, no forzar descarga
      if (error.name === 'AbortError') {
        return {
          sharedViaNativeSheet: true,
          downloadTriggered: false,
          fileName,
        };
      }
      console.warn('Web Share API falló, usando descarga de respaldo:', error);
    }
  }

  // 2. Respaldo: Descarga directa al almacenamiento del dispositivo
  downloadBlobDirectly(blob, fileName);
  return {
    sharedViaNativeSheet: false,
    downloadTriggered: true,
    fileName,
  };
}

/**
 * Descarga directa del archivo en el dispositivo
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
