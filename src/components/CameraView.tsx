// src/components/CameraView.tsx
// Pantalla completa de cámara con HUD en tiempo real, detección de polígono,
// auto-disparo con estabilidad de 800ms y selector de modo.

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
} from 'lucide-react';
import { DocumentDetector } from '../utils/cvEngine';
import { playShutterSound, playFocusLockTone } from '../utils/audioFeedback';
import { Quad, ScanMode, ScannedPage, ScanFilter } from '../types';

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
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState<boolean>(false);
  const [torchActive, setTorchActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Detección y estabilidad
  const [isStable, setIsStable] = useState<boolean>(false);
  const [stabilityProgress, setStabilityProgress] = useState<number>(0);
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
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }

      // Comprobar soporte de linterna (Torch)
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

  // Capturar fotograma de alta resolución
  const triggerCapture = useCallback(() => {
    if (isCapturingRef.current || isQuotaExceeded) return;
    if (pages.length >= maxPages) return;

    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    isCapturingRef.current = true;
    playShutterSound();

    try {
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth || 1280;
      captureCanvas.height = video.videoHeight || 720;
      const ctx = captureCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
        const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.95);
        onCaptureFrame(dataUrl, currentQuadRef.current, captureCanvas.width, captureCanvas.height);
      }
    } catch (e) {
      console.error('Error al capturar fotograma:', e);
    } finally {
      setTimeout(() => {
        isCapturingRef.current = false;
        detectorRef.current.reset();
      }, 500);
    }
  }, [isQuotaExceeded, pages.length, maxPages, onCaptureFrame]);

  // Bucle de análisis de Computer Vision y dibujo del HUD en tiempo real
  useEffect(() => {
    const video = videoRef.current;
    const hudCanvas = hudCanvasRef.current;
    if (!video || !hudCanvas) return;

    let isRunning = true;

    const processFrame = () => {
      if (!isRunning) return;

      if (video.readyState >= 2 && !video.paused && !video.ended) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const cw = hudCanvas.clientWidth;
        const ch = hudCanvas.clientHeight;

        if (hudCanvas.width !== cw || hudCanvas.height !== ch) {
          hudCanvas.width = cw;
          hudCanvas.height = ch;
        }

        const ctx = hudCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, cw, ch);

          // Analizar cuadro con CV
          const analysis = detectorRef.current.analyzeFrame(video);
          currentQuadRef.current = analysis.quad;
          setIsStable(analysis.isStable);
          setStabilityProgress(analysis.stabilityProgress);

          // Tono de enfoque al estabilizarse
          if (analysis.isStable && !prevStableStateRef.current) {
            playFocusLockTone();
          }
          prevStableStateRef.current = analysis.isStable;

          // Dibujar cuadrilátero HUD
          // Líneas amarillas: Documento detectado ajustando encuadre
          // Líneas verdes + pulso visual: Documento estable y enfocado
          const [tl, tr, br, bl] = analysis.quad;
          const strokeColor = analysis.isStable ? '#10b981' : '#facc15';
          const fillColor = analysis.isStable ? 'rgba(16, 185, 129, 0.12)' : 'rgba(250, 204, 21, 0.08)';

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(tl.x * cw, tl.y * ch);
          ctx.lineTo(tr.x * cw, tr.y * ch);
          ctx.lineTo(br.x * cw, br.y * ch);
          ctx.lineTo(bl.x * cw, bl.y * ch);
          ctx.closePath();

          ctx.fillStyle = fillColor;
          ctx.fill();

          ctx.lineWidth = analysis.isStable ? 3.5 : 2.5;
          ctx.strokeStyle = strokeColor;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (!analysis.isStable) {
            ctx.setLineDash([8, 6]);
          } else {
            ctx.setLineDash([]);
          }
          ctx.stroke();

          // Marcadores de esquina L estilizados
          const drawCorner = (pt: { x: number; y: number }) => {
            const px = pt.x * cw;
            const py = pt.y * ch;
            const size = 16;
            ctx.fillStyle = strokeColor;
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();
          };

          drawCorner(tl);
          drawCorner(tr);
          drawCorner(br);
          drawCorner(bl);

          // Indicador de estado centrado en el HUD
          ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          const hudText = analysis.isStable
            ? (scanMode === 'auto' ? '✓ Enfocado — Capturando...' : '✓ Documento Estable')
            : 'Alinea el documento dentro del marco';

          ctx.fillStyle = analysis.isStable ? '#10b981' : '#facc15';
          ctx.fillText(hudText, cw / 2, tl.y * ch - 16 > 40 ? tl.y * ch - 16 : 40);

          ctx.restore();

          // Auto-disparo en Modo Automático cuando se alcanza estabilidad continua
          if (scanMode === 'auto' && analysis.isStable && !isCapturingRef.current && !isQuotaExceeded && pages.length < maxPages) {
            triggerCapture();
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

  // Manejo de carga de imagen desde galería / archivo (fallback o prueba)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const defaultQuad: Quad = [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.1 },
          { x: 0.9, y: 0.9 },
          { x: 0.1, y: 0.9 },
        ];
        onCaptureFrame(dataUrl, defaultQuad, img.width, img.height);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Generador de documento de prueba para testing instantáneo
  const handleLoadSampleDocument = () => {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1240;
    sampleCanvas.height = 1754;
    const ctx = sampleCanvas.getContext('2d');
    if (!ctx) return;

    // Fondo de papel crema sutil
    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, 1240, 1754);

    // Borde de membrete
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(80, 80, 1080, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('POCKETSCAN ZERO — DOCUMENTO DE PRUEBA', 120, 155);

    // Contenido del documento
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('CERTIFICADO DE ARQUITECTURA ZERO-KNOWLEDGE', 100, 300);

    ctx.fillStyle = '#334155';
    ctx.font = '20px sans-serif';
    const lines = [
      'Este documento demuestra el procesamiento 100% en el cliente de PocketScan Zero.',
      '• Ninguna imagen es enviada a servidores externos ni almacenada en la nube.',
      '• La detección de perspectiva y corrección homográfica se ejecutan en RAM.',
      '• Los filtros de binarización adaptativa Bradley-Roth limpian sombras locales.',
      '• La compilación de PDF se realiza en memoria utilizando la librería jsPDF.',
      '• La función de compartir invoca de forma nativa la Web Share API del sistema móvil.',
      '',
      'Fecha de emisión: ' + new Date().toLocaleDateString('es-ES'),
      'Identificador criptográfico: PSZ-' + Math.floor(100000 + Math.random() * 900000),
    ];

    let y = 360;
    lines.forEach((line) => {
      ctx.fillText(line, 100, y);
      y += 42;
    });

    // Sello gráfico
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 6;
    ctx.strokeRect(780, 800, 360, 160);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('VERIFICADO LOCALMENTE', 810, 860);
    ctx.font = '16px sans-serif';
    ctx.fillText('100% CLIENT-SIDE PRIVACY', 830, 910);

    const dataUrl = sampleCanvas.toDataURL('image/jpeg', 0.95);
    const sampleQuad: Quad = [
      { x: 0.12, y: 0.14 },
      { x: 0.88, y: 0.14 },
      { x: 0.88, y: 0.86 },
      { x: 0.12, y: 0.86 },
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

      {/* Canvas HUD de Visión en Tiempo Real */}
      <canvas
        ref={hudCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Línea Láser de Escaneo Animada */}
      <div className="absolute inset-x-8 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent pointer-events-none z-10 animate-laser shadow-[0_0_12px_#34d399]" />

      {/* BARRA SUPERIOR MINIMALISTA */}
      <div className="absolute top-0 inset-x-0 z-20 pt-safe px-safe flex items-center justify-between pb-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        {/* Badge Zero-Knowledge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-panel text-xs font-semibold text-emerald-400 border border-emerald-500/20 shadow-lg">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Zero-Knowledge</span>
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

          {/* Cambiar cámara (frontal / trasera) */}
          <button
            onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
            className="p-2.5 rounded-full text-slate-300 hover:text-white glass-panel transition active:scale-95"
            title="Cambiar Cámara"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          {/* Botón de Engranaje (Configuración y Cuenta) */}
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

      {/* Fallback amigable si la cámara falla o no tiene permiso */}
      {cameraError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-slate-950/95 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-xl">
            <Camera className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Cámara no disponible en este entorno</h3>
          <p className="text-sm text-slate-400 max-w-xs mb-6">
            Puedes conceder permisos de cámara o probar el escáner cargando una imagen o un documento de prueba.
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
              Probar Documento de Muestra
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
      <div className="absolute bottom-0 inset-x-0 z-20 pb-safe px-safe pt-4 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex flex-col items-center gap-4">
        {/* Selector discreto de modo [Automático | Manual] y Contador de Páginas */}
        <div className="flex items-center justify-between w-full max-w-sm px-2">
          {/* Selector de modo */}
          <div className="flex items-center p-0.5 rounded-full glass-panel text-xs font-semibold">
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
            <button
              onClick={() => onToggleScanMode('manual')}
              className={`px-3 py-1.5 rounded-full transition ${
                scanMode === 'manual'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Manual
            </button>
          </div>

          {/* Contador de páginas */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-panel text-xs font-mono-numbers text-slate-300">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Páginas: {pages.length} / {maxPages}</span>
          </div>
        </div>

        {/* Fila central: Galería/Muestra | OBTURADOR | Terminar y Compartir */}
        <div className="flex items-center justify-between w-full max-w-sm px-4 pb-2">
          {/* Botón izquierdo: Cargar imagen o documento de prueba */}
          <div className="w-16 flex items-center justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-12 h-12 rounded-2xl glass-panel flex flex-col items-center justify-center text-slate-300 hover:text-white transition active:scale-95"
              title="Cargar archivo"
            >
              <Upload className="w-5 h-5" />
            </button>
          </div>

          {/* OBTURADOR CENTRAL AMPLIO Y REACTIVO */}
          <div className="relative flex items-center justify-center">
            {/* Anillo de progreso en modo automático */}
            {scanMode === 'auto' && stabilityProgress > 0 && (
              <svg className="absolute -inset-2.5 w-24 h-24 -rotate-90 pointer-events-none">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  stroke="rgba(16, 185, 129, 0.2)"
                  strokeWidth="4"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="4"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 * (1 - stabilityProgress)}
                  strokeLinecap="round"
                  className="transition-all duration-100"
                />
              </svg>
            )}

            <button
              disabled={isQuotaExceeded || pages.length >= maxPages}
              onClick={triggerCapture}
              className={`w-20 h-20 rounded-full flex items-center justify-center p-1.5 transition active:scale-90 ${
                isQuotaExceeded || pages.length >= maxPages
                  ? 'bg-slate-800/80 border-2 border-slate-700 cursor-not-allowed opacity-60'
                  : isStable
                  ? 'bg-emerald-500/20 border-3 border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.5)]'
                  : 'bg-white/10 border-3 border-white shadow-xl'
              }`}
              title="Capturar Documento"
            >
              <div
                className={`w-full h-full rounded-full transition-transform ${
                  isQuotaExceeded || pages.length >= maxPages
                    ? 'bg-slate-700'
                    : isStable
                    ? 'bg-emerald-400 scale-95'
                    : 'bg-white'
                }`}
              />
            </button>
          </div>

          {/* Botón derecho: Miniatura y Terminar y Compartir (N) */}
          <div className="w-16 flex items-center justify-center">
            {pages.length > 0 ? (
              <button
                onClick={onOpenReview}
                className="relative w-14 h-14 rounded-2xl overflow-hidden ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/30 active:scale-95 transition"
                title="Terminar y Compartir"
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
                title="Cargar documento de prueba"
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
