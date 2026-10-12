/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Share2,
  Plus,
  MessageSquare,
  ShieldCheck,
  FileText,
  Sparkles,
} from 'lucide-react';
import { CameraView } from './components/CameraView';
import { PerspectiveEditor } from './components/PerspectiveEditor';
import { DocumentReviewModal } from './components/DocumentReviewModal';
import { SettingsModal } from './components/SettingsModal';
import { RegistrationModal } from './components/RegistrationModal';
import { QuotaExceededBanner } from './components/QuotaExceededBanner';
import { FeedbackModal } from './components/FeedbackModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { PreparerModeModal } from './components/PreparerModeModal';
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

export type AppScreenState = 'screen-camera' | 'screen-crop' | 'screen-gallery' | 'screen-success';

export default function App() {
  // 1. MÁQUINA DE ESTADOS FINITOS CENTRALIZADA
  const [currentScreen, setCurrentScreen] = useState<AppScreenState>('screen-camera');

  // Estado de límites y uso diario
  const [trackerState, setTrackerState] = useState<ScanTrackerState>(() => getUsageState());
  const isQuotaExceeded = !hasQuotaAvailable(trackerState);

  // Estado del documento actual (multi-página)
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [scanMode, setScanMode] = useState<ScanMode>('manual');
  const [preferredFilter, setPreferredFilter] = useState<ScanFilter>('color');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');

  // Fotograma congelado en alta resolución para el estado de recorte
  const [capturedImage, setCapturedImage] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    initialQuad: Quad;
  } | null>(null);

  // Modales secundarios flotantes (no compiten con las pantallas principales)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isRegistrationOpen, setIsRegistrationOpen] = useState<boolean>(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isPreparerModalOpen, setIsPreparerModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Información del último despacho
  const [lastDispatchedInfo, setLastDispatchedInfo] = useState<{
    pageCount: number;
    format: string;
  } | null>(null);

  // Función de enrutamiento y cambio de pantalla
  const switchScreen = useCallback((screenId: AppScreenState) => {
    setCurrentScreen(screenId);
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-screen', screenId);
      ['screen-camera', 'screen-crop', 'screen-gallery', 'screen-success'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          if (id === screenId) {
            el.style.setProperty('display', 'flex', 'important');
            el.classList.add('screen-active');
            el.classList.remove('screen-hidden');
          } else {
            el.style.setProperty('display', 'none', 'important');
            el.classList.remove('screen-active');
            el.classList.add('screen-hidden');
          }
        }
      });
    }
    triggerHaptic(15);
  }, []);

  // Sincronizar atributo inicial en el body
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-screen', 'screen-camera');
    }
    // Exportar función switchScreen al objeto global window para interoperabilidad
    if (typeof window !== 'undefined') {
      (window as unknown as { switchScreen: typeof switchScreen }).switchScreen = switchScreen;
    }
  }, [switchScreen]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Compartir aplicación mediante Web Share API
  const handleShareApp = useCallback(async () => {
    triggerHaptic(25);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'RHDocScan - Escáner Móvil Seguro',
          text: 'Escanea documentos en PDF con calidad profesional, 100% privado y sin servidores.',
          url: window.location.href,
        });
        return;
      } catch (err: unknown) {
        const error = err as Error;
        if (error.name === 'AbortError') return;
      }
    }
    // Fallback portapapeles
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
    showToast('¡Enlace de RHDocScan copiado al portapapeles!');
  }, [showToast]);

  // Atajo secreto de teclado ("xx" o "admin") para abrir el panel de administración
  useEffect(() => {
    let keyBuffer = '';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      keyBuffer = (keyBuffer + e.key.toLowerCase()).slice(-6);
      if (keyBuffer.endsWith('xx') || keyBuffer.endsWith('admin')) {
        setIsAdminOpen(true);
        keyBuffer = '';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Comprobar periódicamente cambio de día a medianoche
  useEffect(() => {
    const interval = setInterval(() => {
      setTrackerState(getUsageState());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // 1. CAPTURA DE FOTOGRAMA DESDE LA CÁMARA -> TRANSICIÓN A ESTADO_RECORTE
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
      switchScreen('screen-crop');
    },
    [isQuotaExceeded, switchScreen]
  );

  // 2. CANCELAR RECORTE ("Repetir foto") -> RETORNO A ESTADO_CAMARA
  const handleCancelPerspective = useCallback(() => {
    setCapturedImage(null);
    switchScreen('screen-camera');
  }, [switchScreen]);

  // 3. GUARDAR PÁGINA ("Continuar ➔") -> TRANSICIÓN A ESTADO_GALERIA
  const handleSavePage = useCallback(
    (newPage: ScannedPage, continueScanning: boolean) => {
      setPages((prev) => [...prev, newPage]);
      setCapturedImage(null);

      if (continueScanning) {
        switchScreen('screen-camera');
      } else {
        switchScreen('screen-gallery');
      }
    },
    [switchScreen]
  );

  // 4. ELIMINAR PÁGINA DEL DOCUMENTO
  const handleDeletePage = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
    triggerHaptic(20);
  }, []);

  // 5. ROTAR PÁGINA 90 GRADOS
  const handleRotatePage = useCallback((id: string) => {
    setPages((prev) =>
      prev.map((page) => {
        if (page.id !== id) return page;

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

  // 6. FINALIZACIÓN TRAS GUARDAR/ENVIAR -> TRANSICIÓN A ESTADO_EXITO
  const handleCompleteScan = useCallback(() => {
    const pageCount = pages.length;
    const format = exportFormat.toUpperCase();
    const updated = incrementScanCount();
    setTrackerState(updated);
    setLastDispatchedInfo({ pageCount, format });
    switchScreen('screen-success');
  }, [pages.length, exportFormat, switchScreen]);

  // 7. INICIAR NUEVO ESCANEO DESDE ESTADO_EXITO
  const handleStartNewScan = useCallback(() => {
    setPages([]);
    setCapturedImage(null);
    setLastDispatchedInfo(null);
    switchScreen('screen-camera');
  }, [switchScreen]);

  // 8. REGISTRO EXITOSO TRAS VALIDAR OTP O CLAVE DE PRUEBAS 2089227
  const handleRegistrationSuccess = useCallback((name: string, email: string) => {
    const updated = getUsageState();
    setTrackerState(updated);
    setIsRegistrationOpen(false);
    if (email.includes('2089227') || email.includes('tester')) {
      showToast('✅ Modo Pruebas Activado: Escaneos Ilimitados por 2 Horas');
    } else {
      showToast(`¡Registro verificado! Bienvenido, ${name}`);
    }
  }, [showToast]);

  return (
    <div
      className="relative w-full overflow-hidden bg-[#0a0f18] text-white app-viewport select-none"
      style={{
        height: '100dvh',
        minHeight: '-webkit-fill-available',
      }}
    >
      {/* ========================================================
          1. ESTADO_CAMARA (#screen-camera)
          Vista de cámara en vivo limpia, marco Folio y obturador.
          ======================================================== */}
      <div
        id="screen-camera"
        className={`screen-state ${currentScreen === 'screen-camera' ? 'screen-active' : 'screen-hidden'}`}
        style={{
          display: currentScreen === 'screen-camera' ? 'flex' : 'none',
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 10,
        }}
      >
        <CameraView
          onCaptureFrame={handleCaptureFrame}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenReview={() => switchScreen('screen-gallery')}
          onShareApp={handleShareApp}
          onOpenFeedback={() => setIsFeedbackOpen(true)}
          onOpenPreparerMode={() => setIsPreparerModalOpen(true)}
          pages={pages}
          maxPages={MAX_PAGES_PER_DOCUMENT}
          isQuotaExceeded={isQuotaExceeded}
          scanMode={scanMode}
          onToggleScanMode={setScanMode}
          preferredFilter={preferredFilter}
          exportFormat={exportFormat}
          onChangeExportFormat={setExportFormat}
        />
      </div>

      {/* ========================================================
          2. ESTADO_RECORTE (#screen-crop)
          Imagen congelada, 4 esquinas verdes, SOLO 2 BOTONES:
          "🔄 Repetir foto" y "Continuar ➔".
          Cámara y obturador NO EXISTEN en esta pantalla.
          ======================================================== */}
      <div
        id="screen-crop"
        className={`screen-state ${currentScreen === 'screen-crop' ? 'screen-active' : 'screen-hidden'}`}
        style={{
          display: currentScreen === 'screen-crop' ? 'flex' : 'none',
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 50,
        }}
      >
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
      </div>

      {/* ========================================================
          3. ESTADO_GALERIA (#screen-gallery)
          Miniaturas de páginas acumuladas, botón "[+ 📷 Tomar otra página]",
          casilla de metadatos SHA-256 y botón "Guardar / Enviar".
          Cámara y obturador estrictamente ocultos.
          ======================================================== */}
      <div
        id="screen-gallery"
        className={`screen-state ${currentScreen === 'screen-gallery' ? 'screen-active' : 'screen-hidden'}`}
        style={{
          display: currentScreen === 'screen-gallery' ? 'flex' : 'none',
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 60,
        }}
      >
        {currentScreen === 'screen-gallery' && (
          <DocumentReviewModal
            pages={pages}
            maxPages={MAX_PAGES_PER_DOCUMENT}
            exportFormat={exportFormat}
            onChangeExportFormat={setExportFormat}
            onClose={() => switchScreen('screen-camera')}
            onAddMorePages={() => switchScreen('screen-camera')}
            onDeletePage={handleDeletePage}
            onRotatePage={handleRotatePage}
            onCompleteScan={handleCompleteScan}
            onOpenFeedback={() => setIsFeedbackOpen(true)}
          />
        )}
      </div>

      {/* ========================================================
          4. ESTADO_EXITO (#screen-success)
          Confirmación de documento despachado, botón para nuevo
          escaneo, compartir app y observaciones.
          ======================================================== */}
      <div
        id="screen-success"
        className={`screen-state ${currentScreen === 'screen-success' ? 'screen-active' : 'screen-hidden'}`}
        style={{
          display: currentScreen === 'screen-success' ? 'flex' : 'none',
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 70,
          backgroundColor: '#0a0f18',
        }}
      >
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6 animate-scaleUp max-w-sm mx-auto">
          {/* Badge circular con halo esmeralda */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-2xl shadow-emerald-500/25 border border-emerald-500/40">
              <CheckCircle2 className="w-14 h-14" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white tracking-tight">¡Documento Despachado!</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Tu archivo {lastDispatchedInfo?.format || 'PDF'} ({lastDispatchedInfo?.pageCount || 1} {lastDispatchedInfo?.pageCount === 1 ? 'página' : 'páginas'}) fue procesado y compartido de forma 100% privada sin tocar servidores externos.
            </p>
          </div>

          {/* Sello de integridad Zero-Knowledge */}
          <div className="w-full p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3 text-left">
            <ShieldCheck className="w-6 h-6 flex-shrink-0 text-emerald-400" />
            <div className="flex-1">
              <div className="font-semibold text-emerald-200">Seguridad Zero-Knowledge</div>
              <div className="text-[11px] text-emerald-400/80">Procesado 100% en el procesador local de tu dispositivo.</div>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col gap-3 w-full pt-2">
            <button
              type="button"
              onClick={handleStartNewScan}
              className="w-full py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base shadow-xl shadow-emerald-500/30 active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
              <span>+ Iniciar Nuevo Escaneo</span>
            </button>

            <button
              type="button"
              onClick={handleShareApp}
              className="w-full py-3 px-6 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm border border-white/15 active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-cyan-400" />
              <span>Compartir RHDocScan</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFeedbackOpen(true)}
              className="w-full py-2.5 px-4 rounded-xl text-slate-400 hover:text-white font-medium text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>💬 Comentarios y Sugerencias</span>
            </button>
          </div>
        </div>
      </div>

      {/* TOAST DE NOTIFICACIÓN GLOBAL */}
      {toastMessage && (
        <div className="fixed top-16 inset-x-4 z-[9999999] flex items-center justify-center pointer-events-none animate-fadeIn">
          <div className="bg-slate-900/95 border border-emerald-500/50 text-white px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* BANNER EN CASO DE CUPO EXCEDIDO CON CUENTA REGRESIVA */}
      {isQuotaExceeded && currentScreen === 'screen-camera' && (
        <QuotaExceededBanner
          isRegistered={trackerState.isRegistered}
          onOpenRegistration={() => setIsRegistrationOpen(true)}
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
          onOpenFeedback={() => {
            setIsSettingsOpen(false);
            setIsFeedbackOpen(true);
          }}
          onOpenAdmin={() => {
            setIsSettingsOpen(false);
            setIsAdminOpen(true);
          }}
        />
      )}

      {/* MODAL DE REGISTRO CON CÓDIGO OTP O CLAVE 2089227 */}
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

      {/* MODAL MODO PREPARADOR / PRUEBAS (DISPARADOR DISIMULADO TRIPLE TOQUE O CLAVE 2089227) */}
      {isPreparerModalOpen && (
        <PreparerModeModal
          onClose={() => setIsPreparerModalOpen(false)}
          onSuccess={(msg) => {
            setTrackerState(getUsageState());
            showToast(msg);
          }}
        />
      )}

      {/* PANEL DE CONTROL DE ADMINISTRACIÓN Y AUDITORÍA FORENSE SHA-256 */}
      {isAdminOpen && (
        <AdminPanelModal
          onClose={() => setIsAdminOpen(false)}
          trackerState={trackerState}
          onRefreshTracker={() => setTrackerState(getUsageState())}
        />
      )}
    </div>
  );
}
