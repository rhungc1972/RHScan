/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { CameraView } from './components/CameraView';
import { PerspectiveEditor } from './components/PerspectiveEditor';
import { DocumentReviewModal } from './components/DocumentReviewModal';
import { SettingsModal } from './components/SettingsModal';
import { RegistrationModal } from './components/RegistrationModal';
import { QuotaExceededBanner } from './components/QuotaExceededBanner';
import { FeedbackModal } from './components/FeedbackModal';
import {
  Quad,
  ScanMode,
  ScanFilter,
  ScannedPage,
  ScanTrackerState,
  ExportFormat,
} from './types';
import {
  getUsageState,
  incrementScanCount,
  hasQuotaAvailable,
  MAX_PAGES_PER_DOCUMENT,
} from './services/usageTracker';
import { triggerHaptic } from './utils/audioFeedback';

export default function App() {
  // Estado de límites y uso diario
  const [trackerState, setTrackerState] = useState<ScanTrackerState>(() => getUsageState());
  const isQuotaExceeded = !hasQuotaAvailable(trackerState);

  // Estado del documento actual (multi-página)
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [scanMode, setScanMode] = useState<ScanMode>('manual');
  const [preferredFilter, setPreferredFilter] = useState<ScanFilter>('color');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');

  // Estado de modales y flujo
  const [capturedImage, setCapturedImage] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    initialQuad: Quad;
  } | null>(null);

  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState<boolean>(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<boolean>(false);

  // Comprobar periódicamente cambio de día a medianoche
  useEffect(() => {
    const interval = setInterval(() => {
      setTrackerState(getUsageState());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // 1. Manejo de captura de fotograma desde la cámara
  const handleCaptureFrame = useCallback(
    (imageDataUrl: string, detectedQuad: Quad, width: number, height: number) => {
      if (isQuotaExceeded) {
        setIsSettingsOpen(true);
        return;
      }
      setCapturedImage({
        dataUrl: imageDataUrl,
        width,
        height,
        initialQuad: detectedQuad,
      });
    },
    [isQuotaExceeded]
  );

  // 2. Guardar página procesada desde el editor de perspectiva
  const handleSavePage = useCallback(
    (newPage: ScannedPage, continueScanning: boolean) => {
      setPages((prev) => [...prev, newPage]);
      setCapturedImage(null);

      if (!continueScanning) {
        setIsReviewOpen(true);
      }
    },
    []
  );

  // 3. Cancelar ajuste de perspectiva y volver a la cámara
  const handleCancelPerspective = useCallback(() => {
    setCapturedImage(null);
  }, []);

  // 4. Eliminar página del documento
  const handleDeletePage = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
    triggerHaptic(20);
  }, []);

  // 5. Rotar página 90 grados
  const handleRotatePage = useCallback((id: string) => {
    setPages((prev) =>
      prev.map((page) => {
        if (page.id !== id) return page;

        // Rotar canvas 90 grados en memoria
        const img = new Image();
        img.src = page.warpedDataUrl;
        const canvas = document.createElement('canvas');
        canvas.width = img.height || 1000;
        canvas.height = img.width || 1414;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((90 * Math.PI) / 180);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);
        }
        const rotatedUrl = canvas.toDataURL('image/jpeg', 0.92);

        return {
          ...page,
          warpedDataUrl: rotatedUrl,
          rotation: ((page.rotation || 0) + 90) % 360,
        };
      })
    );
    triggerHaptic(25);
  }, []);

  // 6. Finalización del escaneo tras compartir / descargar PDF
  const handleCompleteScan = useCallback(() => {
    const updated = incrementScanCount();
    setTrackerState(updated);
    setPages([]);
    setIsReviewOpen(false);
  }, []);

  // 7. Registro exitoso tras validar OTP
  const handleRegistrationSuccess = useCallback((name: string, email: string) => {
    const updated = getUsageState();
    setTrackerState(updated);
    setIsRegistrationOpen(false);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0f18] text-white">
      {/* VISTA PRINCIPAL DE CÁMARA */}
      <CameraView
        onCaptureFrame={handleCaptureFrame}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReview={() => setIsReviewOpen(true)}
        pages={pages}
        maxPages={MAX_PAGES_PER_DOCUMENT}
        isQuotaExceeded={isQuotaExceeded}
        scanMode={scanMode}
        onToggleScanMode={setScanMode}
        preferredFilter={preferredFilter}
        exportFormat={exportFormat}
        onChangeExportFormat={setExportFormat}
      />

      {/* BANNER EN CASO DE CUPO EXCEDIDO CON CUENTA REGRESIVA */}
      {isQuotaExceeded && (
        <QuotaExceededBanner
          isRegistered={trackerState.isRegistered}
          onOpenRegistration={() => setIsRegistrationOpen(true)}
        />
      )}

      {/* EDITOR INTERACTIVO DE PERSPECTIVA (CROP / DESKEW) */}
      {capturedImage && (
        <PerspectiveEditor
          capturedImage={capturedImage}
          preferredFilter={preferredFilter}
          onSavePage={handleSavePage}
          onCancel={handleCancelPerspective}
          currentPageCount={pages.length}
          maxPages={MAX_PAGES_PER_DOCUMENT}
        />
      )}

      {/* MODAL DE REVISIÓN Y COMPILACIÓN DE PDF */}
      {isReviewOpen && (
        <DocumentReviewModal
          pages={pages}
          maxPages={MAX_PAGES_PER_DOCUMENT}
          exportFormat={exportFormat}
          onChangeExportFormat={setExportFormat}
          onClose={() => setIsReviewOpen(false)}
          onAddMorePages={() => setIsReviewOpen(false)}
          onDeletePage={handleDeletePage}
          onRotatePage={handleRotatePage}
          onCompleteScan={handleCompleteScan}
          onOpenFeedback={() => setIsFeedbackOpen(true)}
        />
      )}

      {/* MODAL FLOTANTE DE AJUSTES Y CUOTA */}
      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          preferredFilter={preferredFilter}
          onChangeFilter={setPreferredFilter}
          trackerState={trackerState}
          onOpenRegistration={() => setIsRegistrationOpen(true)}
        />
      )}

      {/* MODAL DE REGISTRO CON CÓDIGO OTP */}
      {isRegistrationOpen && (
        <RegistrationModal
          onClose={() => setIsRegistrationOpen(false)}
          onSuccess={handleRegistrationSuccess}
        />
      )}

      {/* MODAL DE COMENTARIOS Y SUGERENCIAS */}
      {isFeedbackOpen && (
        <FeedbackModal onClose={() => setIsFeedbackOpen(false)} />
      )}
    </div>
  );
}
