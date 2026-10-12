// src/components/AppearanceModal.tsx
// Flujo modal de comparecencia digital en dos pasos:
// Paso A: Foto frontal del otorgante (cámara frontal 'user', marco ovalado, botón grande).
// Paso B: Lienzo táctil de firma manuscrita (trazo azul documental #000080, limpiar, estampar).

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Camera,
  PenTool,
  RotateCcw,
  CheckCircle2,
  User,
  ShieldCheck,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { AppearanceData } from '../types';
import { triggerHaptic } from '../utils/audioFeedback';

interface AppearanceModalProps {
  onClose: () => void;
  onConfirm: (data: AppearanceData) => void;
}

export const AppearanceModal: React.FC<AppearanceModalProps> = ({
  onClose,
  onConfirm,
}) => {
  const [step, setStep] = useState<'photo' | 'signature'>('photo');
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [grantorName, setGrantorName] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const [hasDrawnSignature, setHasDrawnSignature] = useState<boolean>(false);

  // Iniciar cámara frontal para la fotografía del otorgante
  const startFrontCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraError(null);
    } catch (e: unknown) {
      const err = e as Error;
      console.warn('Error accediendo a cámara frontal:', err);
      setCameraError('No se pudo acceder a la cámara frontal. Puedes usar una foto de prueba.');
    }
  }, []);

  useEffect(() => {
    if (step === 'photo') {
      startFrontCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [step, startFrontCamera]);

  // Tomar fotografía frontal
  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;

    triggerHaptic(40);
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    const snapCanvas = document.createElement('canvas');
    // Relación de aspecto 3:4 estándar para carnet/otorgante
    snapCanvas.width = 450;
    snapCanvas.height = 550;
    const ctx = snapCanvas.getContext('2d');
    if (ctx) {
      // Dibujar centrado recortando el área ovalada
      const scale = Math.max(snapCanvas.width / vw, snapCanvas.height / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (snapCanvas.width - dw) / 2;
      const dy = (snapCanvas.height - dh) / 2;

      // Invertir horizontalmente para efecto espejo natural
      ctx.translate(snapCanvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, dx, dy, dw, dh);
    }

    const snapUrl = snapCanvas.toDataURL('image/jpeg', 0.92);
    setSelfieDataUrl(snapUrl);

    // Detener la cámara de video
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Avanzar a Paso B (Firma)
    setStep('signature');
  };

  // Usar foto de demostración si la cámara falla o está bloqueada
  const handleUseSamplePhoto = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 450;
    canvas.height = 550;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 450, 550);
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(225, 220, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(225, 420, 160, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OTORGANTE VERIFICADO', 225, 510);
    }
    setSelfieDataUrl(canvas.toDataURL('image/jpeg', 0.9));
    setStep('signature');
  };

  // Inicializar canvas de firma
  useEffect(() => {
    if (step === 'signature' && canvasRef.current) {
      const cvs = canvasRef.current;
      const rect = cvs.getBoundingClientRect();
      cvs.width = rect.width * (window.devicePixelRatio || 2);
      cvs.height = rect.height * (window.devicePixelRatio || 2);
      const ctx = cvs.getContext('2d');
      if (ctx) {
        ctx.scale(window.devicePixelRatio || 2, window.devicePixelRatio || 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.strokeStyle = '#000080'; // Trazo azul documental notarial
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [step]);

  // Dibujo táctil en el canvas
  const getCanvasPos = (e: React.TouchEvent | React.MouseEvent) => {
    const cvs = canvasRef.current;
    if (!cvs) return { x: 0, y: 0 };
    const rect = cvs.getBoundingClientRect();
    if ('touches' in e && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else if ('clientX' in e) {
      return {
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top,
      };
    }
    return { x: 0, y: 0 };
  };

  const handleStartDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    isDrawingRef.current = true;
    setHasDrawnSignature(true);
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handleMoveDraw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const handleEndDraw = () => {
    isDrawingRef.current = false;
  };

  const handleClearSignature = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const rect = cvs.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawnSignature(false);
    triggerHaptic(20);
  };

  const handleFinish = () => {
    if (!selfieDataUrl) return;
    const cvs = canvasRef.current;
    let signatureUrl = '';
    if (cvs && hasDrawnSignature) {
      signatureUrl = cvs.toDataURL('image/png');
    }
    triggerHaptic(50);
    onConfirm({
      selfieDataUrl,
      signatureDataUrl: signatureUrl,
      grantorName: grantorName.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl glass-panel p-5 shadow-2xl border border-white/10 relative flex flex-col max-h-[92vh] overflow-y-auto">
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Comparecencia Digital</h3>
              <p className="text-[11px] text-emerald-400 font-semibold">
                {step === 'photo' ? 'Paso 1 de 2: Fotografía del Otorgante' : 'Paso 2 de 2: Firma Táctil'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PASO A: FOTO FRONTAL */}
        {step === 'photo' && (
          <div className="flex flex-col items-center space-y-4">
            <p className="text-xs text-slate-300 text-center leading-relaxed">
              Ubica el rostro del otorgante dentro del marco ovalado para la constancia visual notarial.
            </p>

            <div className="relative w-full flex items-center justify-center py-2">
              <div className="oval-face-guide flex items-center justify-center bg-black">
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
              </div>
            </div>

            {cameraError && (
              <div className="w-full p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs text-center">
                {cameraError}
              </div>
            )}

            <div className="w-full space-y-2.5 pt-2">
              <button
                type="button"
                onClick={handleCapturePhoto}
                className="btn-touch-primary w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5 stroke-[2.5]" />
                <span>Tomar Foto Frontal</span>
              </button>

              <button
                type="button"
                onClick={handleUseSamplePhoto}
                className="w-full py-2.5 px-4 rounded-xl text-slate-400 hover:text-white text-xs font-semibold transition"
              >
                Continuar con foto de muestra
              </button>
            </div>
          </div>
        )}

        {/* PASO B: FIRMA TÁCTIL */}
        {step === 'signature' && (
          <div className="flex flex-col space-y-4">
            <p className="text-xs text-slate-300 text-center leading-relaxed">
              Firma con el dedo o stylus en el lienzo en blanco. Trazo azul notarial (<span className="text-cyan-400 font-mono">#000080</span>).
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Nombre del Otorgante / Compareciente:</span>
              </label>
              <input
                type="text"
                value={grantorName}
                onChange={(e) => setGrantorName(e.target.value)}
                placeholder="Ej. Roberto Hernández"
                className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
              />
            </div>

            {/* Canvas de Firma */}
            <div className="relative">
              <canvas
                ref={canvasRef}
                onMouseDown={handleStartDraw}
                onMouseMove={handleMoveDraw}
                onMouseUp={handleEndDraw}
                onMouseLeave={handleEndDraw}
                onTouchStart={handleStartDraw}
                onTouchMove={handleMoveDraw}
                onTouchEnd={handleEndDraw}
                className="signature-canvas"
              />
              <span className="absolute bottom-2 left-3 text-[10px] text-slate-400 select-none pointer-events-none">
                Lienzo de firma manuscrita digital
              </span>
            </div>

            {/* Botones de acción del paso de firma */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleClearSignature}
                className="btn-touch-action flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>Limpiar Firma</span>
              </button>

              <button
                type="button"
                onClick={handleFinish}
                className="btn-touch-primary flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                <span>Aceptar y Estampar</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
