// src/components/CameraView.tsx
// RHDocScan - Vista de Cámara en Pantalla Completa con Guía de Encuadre Folio / Oficio,
// captura manual por defecto, compensación de desfase de coordenadas y HUD en tiempo real.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  Flashlight,
  FlashlightOff,
  Settings,
  Sparkles,
  Layers,
  Upload,
  RefreshCw,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Scan,
} from 'lucide-react';
import { DocumentDetector, calculateFolioQuad, sensorToScreenPoint } from '../utils/cvEngine';
import { playShutterSound, playFocusLockTone } from '../utils/audioFeedback';
import { Quad, ScanMode, ScannedPage, ScanFilter, ExportFormat } from '../types';

interface CameraViewProps {
  onCaptureFrame: (imageDataUrl: string, detectedQuad: Quad, width: number, height: number) => void;
  onOpenSettings: () => void;
  onOpenReview: () => void;
  pages: ScannedPage[];
  maxPages: number;
  isQuotaExceeded: boolean;
  scanMode: ScanMode;
  onToggleScanMode: (mode: ScanMode) => void;
  preferredFilter: ScanFilter;
  exportFormat?: ExportFormat;
  onChangeExportFormat?: (format: ExportFormat) => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onCaptureFrame,
  onOpenSettings,
  onOpenReview,
  pages,
  maxPages,
  isQuotaExceeded,
  scanMode,
  onToggleScanMode,
  exportFormat = 'pdf',
  onChangeExportFormat,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState<boolean>(false);
  const [torchActive, setTorchActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Detección y estabilidad temporal continua
  const [isStable, setIsStable] = useState<boolean>(false);
  const [stabilityProgress, setStabilityProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('Encuadra la hoja dentro del marco Folio');
  const [isProperlyLit, setIsProperlyLit] = useState<boolean>(true);

  // Vértices del sensor normalizados [0..1]
  const currentQuadRef = useRef<Quad>([
    { x: 0.12, y: 0.14 },
    { x: 0.88, y: 0.14 },
    { x: 0.88, y: 0.86 },
    { x: 0.12, y: 0.86 },
  ]);

  const detectorRef = useRef<DocumentDetector>(new DocumentDetector());
  const animationFrameRef = useRef<number | null>(null);
  const isCapturingRef = useRef<boolean>(false);
  const prevStableStateRef = useRef<boolean>(false);

  // Iniciar flujo de cámara
  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }

      // Soporte de linterna (Torch)
      const track = newStream.getVideoTracks()[0];
      const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as { torch?: boolean };
      setTorchAvailable(Boolean(capabilities && capabilities.torch));
      setTorchActive(false);
    } catch (err: unknown) {
      const error = err as Error;
      console.warn('Error accediendo a cámara:', error);
      setCameraError(error.message || 'No se pudo acceder a la cámara');
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [facingMode]);

  // Alternar linterna / torch
  const toggleTorch = async () => {
    if (!stream || !torchAvailable) return;
    try {
      const track = stream.getVideoTracks()[0];
      const nextState = !torchActive;
      await track.applyConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet],
      });
      setTorchActive(nextState);
    } catch (e) {
      console.warn('Fallo al alternar linterna:', e);
    }
  };

  // Captura garantizada de fotograma
  const triggerCapture = useCallback(() => {
    if (isCapturingRef.current || isQuotaExceeded) return;
    if (pages.length >= maxPages) return;

    const video = videoRef.current;
    if (!video) return;

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      console.warn('Video aún no ha decodificado el fotograma actual.');
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || vw <= 0 || vh <= 0) {
      console.warn('Dimensiones de video nulas (0x0). Cancelando para evitar pantalla blanca.');
      return;
    }

    isCapturingRef.current = true;
    playShutterSound();

    try {
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = vw;
      captureCanvas.height = vh;
      const ctx = captureCanvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) {
        throw new Error('No se pudo inicializar contexto 2D para captura');
      }

      // Dibujar fotograma decodificado completo
      ctx.drawImage(video, 0, 0, vw, vh);

      const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.95);

      onCaptureFrame(dataUrl, currentQuadRef.current, vw, vh);
    } catch (e) {
      console.error('Error al capturar fotograma:', e);
    } finally {
      setTimeout(() => {
        isCapturingRef.current = false;
        detectorRef.current.reset();
      }, 500);
    }
  }, [isQuotaExceeded, pages.length, maxPages, onCaptureFrame]);

  // Bucle de análisis de Computer Vision y dibujo del marco Folio / HUD en tiempo real
  useEffect(() => {
    const video = videoRef.current;
    const hudCanvas = hudCanvasRef.current;
    if (!video || !hudCanvas) return;

    let isRunning = true;

    const processFrame = () => {
      if (!isRunning) return;

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.paused && !video.ended) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        if (vw > 0 && vh > 0) {
          const cw = hudCanvas.clientWidth;
          const ch = hudCanvas.clientHeight;

          if (hudCanvas.width !== cw || hudCanvas.height !== ch) {
            hudCanvas.width = cw;
            hudCanvas.height = ch;
          }

          const ctx = hudCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, cw, ch);

            // 1. Calcular el marco de encuadre Folio / Oficio (proporción 1:1.45)
            const folio = calculateFolioQuad(cw, ch, vw, vh);

            // 2. Analizar estabilidad con el motor de Visión
            const analysis = detectorRef.current.analyzeFrame(video);
            setIsStable(analysis.isStable);
            setStabilityProgress(analysis.stabilityProgress);
            setStatusMessage(analysis.statusMessage);
            setIsProperlyLit(analysis.isProperlyLit);

            // Si no hay contorno de alto contraste detectado, usar el marco Folio por defecto
            currentQuadRef.current = folio.sensorQuad;

            if (analysis.isStable && !prevStableStateRef.current) {
              playFocusLockTone();
            }
            prevStableStateRef.current = analysis.isStable;

            // 3. DIBUJAR MÁSCARA DE ENCUADRE INICIAL (Marco Folio / Oficio)
            const [fTL, fTR, fBR, fBL] = folio.screenQuad;

            ctx.save();

            // Sombra translúcida exterior que resalta el área de encuadre central
            ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
            // Superior
            ctx.fillRect(0, 0, cw, fTL.y);
            // Inferior
            ctx.fillRect(0, fBL.y, cw, ch - fBL.y);
            // Izquierda
            ctx.fillRect(0, fTL.y, fTL.x, fBL.y - fTL.y);
            // Derecha
            ctx.fillRect(fTR.x, fTR.y, cw - fTR.x, fBR.y - fTR.y);

            // Borde del marco Folio con resplandor suave
            ctx.strokeStyle = analysis.isStable ? '#10b981' : 'rgba(255, 255, 255, 0.28)';
            ctx.lineWidth = analysis.isStable ? 2.5 : 1.5;
            ctx.setLineDash([6, 6]);
            ctx.strokeRect(fTL.x, fTL.y, fTR.x - fTL.x, fBL.y - fTL.y);
            ctx.setLineDash([]);

            // Esquinas táctiles acentuadas (L-brackets estilizados de 24px)
            const bracketLen = 28;
            const cornerColor = analysis.isStable ? '#10b981' : '#38bdf8';
            ctx.strokeStyle = cornerColor;
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'round';

            // Superior Izquierda
            ctx.beginPath();
            ctx.moveTo(fTL.x, fTL.y + bracketLen);
            ctx.lineTo(fTL.x, fTL.y);
            ctx.lineTo(fTL.x + bracketLen, fTL.y);
            ctx.stroke();

            // Superior Derecha
            ctx.beginPath();
            ctx.moveTo(fTR.x - bracketLen, fTR.y);
            ctx.lineTo(fTR.x, fTR.y);
            ctx.lineTo(fTR.x, fTR.y + bracketLen);
            ctx.stroke();

            // Inferior Derecha
            ctx.beginPath();
            ctx.moveTo(fBR.x, fBR.y - bracketLen);
            ctx.lineTo(fBR.x, fBR.y);
            ctx.lineTo(fBR.x - bracketLen, fBR.y);
            ctx.stroke();

            // Inferior Izquierda
            ctx.beginPath();
            ctx.moveTo(fBL.x + bracketLen, fBL.y);
            ctx.lineTo(fBL.x, fBL.y);
            ctx.lineTo(fBL.x, fBL.y - bracketLen);
            ctx.stroke();

            // Insignia descriptiva sobre el marco Folio
            ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = analysis.isStable ? '#34d399' : 'rgba(255, 255, 255, 0.7)';
            ctx.fillText('ENFOQUE TAMAÑO FOLIO / OFICIO', cw / 2, fTL.y - 10);

            // Barra de progreso de estabilidad si está estabilizando
            if (!analysis.isStable && analysis.stabilityProgress > 0) {
              const pW = (fTR.x - fTL.x) * analysis.stabilityProgress;
              ctx.strokeStyle = '#38bdf8';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(fTL.x, fTL.y);
              ctx.lineTo(fTL.x + pW, fTL.y);
              ctx.stroke();
            }

            ctx.restore();

            // Auto-disparo ÚNICAMENTE en modo Automático si se activa expresamente
            if (scanMode === 'auto' && analysis.isStable && !isCapturingRef.current && !isQuotaExceeded && pages.length < maxPages) {
              triggerCapture();
            }
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [scanMode, triggerCapture, isQuotaExceeded, pages.length, maxPages]);

  // Carga de archivo desde galería o almacenamiento
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const defaultQuad: Quad = [
          { x: 0.08, y: 0.08 },
          { x: 0.92, y: 0.08 },
          { x: 0.92, y: 0.92 },
          { x: 0.08, y: 0.92 },
        ];
        onCaptureFrame(dataUrl, defaultQuad, img.naturalWidth || img.width, img.naturalHeight || img.height);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Generador de documento de prueba
  const handleLoadSampleDocument = () => {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1240;
    sampleCanvas.height = 1754;
    const ctx = sampleCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, 1240, 1754);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(80, 80, 1080, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('RHDocScan — DOCUMENTO TAMAÑO OFICIO', 120, 155);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('CERTIFICADO DE ARQUITECTURA ZERO-KNOWLEDGE', 100, 300);

    ctx.fillStyle = '#334155';
    ctx.font = '20px sans-serif';
    const lines = [
      'Documento escaneado de forma 100% privada y procesado localmente con RHDocScan.',
      '• Ninguna imagen es enviada a servidores externos ni almacenada en la nube.',
      '• Marco de encuadre Folio / Oficio con proporción calibrada en pantalla.',
      '• Corrección homográfica sin desfase de coordenadas ni pantallas en blanco.',
      '• Compilación en memoria a PDF multi-página con la librería jsPDF.',
      '• Envío directo mediante Web Share API Nivel 2 a WhatsApp, Gmail o Telegram.',
      '',
      'Fecha: ' + new Date().toLocaleDateString('es-ES'),
      'Identificador: RHD-' + Math.floor(100000 + Math.random() * 900000),
    ];

    let y = 360;
    lines.forEach((line) => {
      ctx.fillText(line, 100, y);
      y += 42;
    });

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 6;
    ctx.strokeRect(780, 800, 360, 160);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('VERIFICADO LOCAL', 810, 860);
    ctx.font = '16px sans-serif';
    ctx.fillText('100% CLIENT-SIDE PRIVACY', 830, 910);

    const dataUrl = sampleCanvas.toDataURL('image/jpeg', 0.95);
    const sampleQuad: Quad = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];
    onCaptureFrame(dataUrl, sampleQuad, 1240, 1754);
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none touch-none">
      {/* Video de Cámara en Pantalla Completa */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover z-0"
      />

      {/* Canvas HUD con Marco Folio / Oficio en tiempo real */}
      <canvas
        ref={hudCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* BARRA SUPERIOR MINIMALISTA */}
      <div className="absolute top-0 inset-x-0 z-20 pt-safe px-safe flex items-center justify-between pb-3 bg-gradient-to-b from-black/85 via-black/45 to-transparent">
        {/* Título e Identidad RHDocScan */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/20">
            RH
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-sm tracking-tight text-white leading-none">RHDocScan</span>
            <span className="text-[10px] text-emerald-400 font-medium tracking-wider">Zero-Knowledge</span>
          </div>
        </div>

        {/* Selector de formato: [PDF (predeterminado) | JPG] */}
        <div className="flex items-center rounded-xl bg-slate-900/80 p-0.5 border border-white/10 backdrop-blur shadow-sm">
          <button
            type="button"
            onClick={() => onChangeExportFormat?.('pdf')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
              (exportFormat || 'pdf') === 'pdf'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => onChangeExportFormat?.('jpg')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
              exportFormat === 'jpg'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            JPG
          </button>
        </div>

        {/* Acciones superiores */}
        <div className="flex items-center gap-2">
          {/* Linterna / Torch */}
          {torchAvailable && (
            <button
              onClick={toggleTorch}
              className={`p-2.5 rounded-full transition glass-panel ${
                torchActive ? 'text-amber-300 bg-amber-500/20 border-amber-400/40' : 'text-slate-300 hover:text-white'
              }`}
              title="Linterna"
            >
              {torchActive ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
            </button>
          )}

          {/* Cambiar cámara */}
          <button
            onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
            className="p-2.5 rounded-full text-slate-300 hover:text-white glass-panel transition active:scale-95"
            title="Cambiar Cámara"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          {/* Botón de Ajustes (Engranaje) */}
          <button
            onClick={onOpenSettings}
            className="p-2.5 rounded-full text-slate-300 hover:text-white glass-panel transition active:scale-95 relative"
            title="Ajustes y Cuenta"
          >
            <Settings className="w-5 h-5" />
            {isQuotaExceeded && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-black animate-ping" />
            )}
          </button>
        </div>
      </div>

      {/* Fallback de cámara */}
      {cameraError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-slate-950/95 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-xl">
            <Camera className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Cámara en espera</h3>
          <p className="text-sm text-slate-400 max-w-xs mb-6">
            Concede permisos de cámara o prueba el escáner cargando una imagen o un documento de prueba.
          </p>

          <div className="flex flex-col w-full max-w-xs gap-3">
            <button
              onClick={startCamera}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-semibold text-white shadow-lg shadow-emerald-500/25 transition active:scale-98 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar Cámara
            </button>

            <button
              onClick={handleLoadSampleDocument}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 font-medium text-slate-200 transition border border-slate-700 active:scale-98 flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              Probar Documento Folio
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm transition border border-slate-800 active:scale-98 flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4 text-slate-400" />
              Cargar Foto desde Galería
            </button>
          </div>
        </div>
      )}

      {/* BARRA INFERIOR DE CONTROLES */}
      <div className="absolute bottom-0 inset-x-0 z-20 pb-safe px-safe pt-3 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col items-center gap-2.5">
        {/* Selector de modo: Predeterminado MANUAL vs Automático */}
        <div className="flex items-center justify-between w-full max-w-sm px-2">
          {/* Conmutador secundario discreto */}
          <div className="flex items-center p-0.5 rounded-full glass-panel text-xs font-semibold">
            <button
              onClick={() => onToggleScanMode('manual')}
              className={`px-3 py-1.5 rounded-full transition ${
                scanMode === 'manual'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Manual (predeterminado)
            </button>
            <button
              onClick={() => onToggleScanMode('auto')}
              className={`px-3 py-1.5 rounded-full transition ${
                scanMode === 'auto'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Automático
            </button>
          </div>

          {/* Contador de páginas */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-panel text-xs font-mono-numbers text-slate-300">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Página {pages.length} de {maxPages}</span>
          </div>
        </div>

        {/* Mensaje de guía dinámico */}
        <div className="text-center text-[11px] font-medium tracking-wide">
          {isStable ? (
            <span className="text-emerald-400 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Marco listo — Presiona el obturador para capturar
            </span>
          ) : (
            <span className="text-slate-400">
              {statusMessage}
            </span>
          )}
        </div>

        {/* Fila central: Cargar archivo | OBTURADOR MANUAL | Terminar y Compartir */}
        <div className="flex items-center justify-between w-full max-w-sm px-4 pb-2">
          {/* Botón izquierdo: Cargar archivo */}
          <div className="w-16 flex items-center justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-12 h-12 rounded-2xl glass-panel flex flex-col items-center justify-center text-slate-300 hover:text-white transition active:scale-95"
              title="Cargar archivo"
            >
              <Upload className="w-5 h-5" />
            </button>
          </div>

          {/* OBTURADOR CENTRAL MANUAL AMPLIO Y REACTIVO */}
          <div className="relative flex items-center justify-center">
            {/* Anillo de progreso si hay estabilización continua */}
            <svg className="absolute -inset-3 w-26 h-26 -rotate-90 pointer-events-none">
              <circle
                cx="52"
                cy="52"
                r="44"
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="4"
              />
              <circle
                cx="52"
                cy="52"
                r="44"
                fill="none"
                stroke={isStable ? '#10b981' : '#38bdf8'}
                strokeWidth="4"
                strokeDasharray="276.4"
                strokeDashoffset={276.4 * (1 - stabilityProgress)}
                strokeLinecap="round"
                className="transition-all duration-100"
              />
            </svg>

            <button
              disabled={isQuotaExceeded || pages.length >= maxPages}
              onClick={triggerCapture}
              className={`w-20 h-20 rounded-full flex items-center justify-center p-1.5 transition active:scale-90 ${
                isQuotaExceeded || pages.length >= maxPages
                  ? 'bg-slate-800/80 border-2 border-slate-700 cursor-not-allowed opacity-60'
                  : isStable
                  ? 'bg-emerald-500/25 border-3 border-emerald-400 shadow-[0_0_28px_rgba(16,185,129,0.65)] scale-105'
                  : 'bg-white/10 border-2 border-slate-300 hover:border-white shadow-lg'
              }`}
              title="Pulsar para capturar página"
            >
              <div
                className={`w-full h-full rounded-full transition-all duration-200 flex items-center justify-center ${
                  isQuotaExceeded || pages.length >= maxPages
                    ? 'bg-slate-700'
                    : isStable
                    ? 'bg-emerald-400 shadow-inner'
                    : 'bg-white/95'
                }`}
              >
                {!isStable && stabilityProgress > 0 && stabilityProgress < 1 && (
                  <span className="text-[10px] font-mono-numbers font-bold text-slate-800">
                    {Math.round(stabilityProgress * 100)}%
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Botón derecho: Terminar y Compartir (N) */}
          <div className="w-16 flex items-center justify-center">
            {pages.length > 0 ? (
              <button
                onClick={onOpenReview}
                className="relative w-14 h-14 rounded-2xl overflow-hidden ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/30 active:scale-95 transition"
                title={`Terminar y Compartir (${pages.length})`}
              >
                <img
                  src={pages[pages.length - 1].warpedDataUrl}
                  alt="Miniatura"
                  className="w-full h-full object-cover"
                />
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-slate-950 font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow">
                  {pages.length}
                </span>
              </button>
            ) : (
              <button
                onClick={handleLoadSampleDocument}
                className="w-12 h-12 rounded-2xl glass-panel flex flex-col items-center justify-center text-slate-400 hover:text-emerald-400 transition text-[10px] font-medium text-center leading-tight active:scale-95"
                title="Cargar documento Folio de prueba"
              >
                <Sparkles className="w-4 h-4 mb-0.5 text-emerald-400" />
                Demo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Input oculto para carga de imágenes */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
};
