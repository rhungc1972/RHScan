// src/components/PreparerModeModal.tsx
// Modal de acceso directo disimulado para Modo Preparador / Pruebas (clave 2089227)
// Permite habilitar escaneos ilimitados permanentes o por 2 horas sin límite diario.

import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  Sparkles,
  Lock,
  Unlock,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  activatePreparerMode,
  deactivatePreparerMode,
  isTestModeActive,
} from '../services/usageTracker';
import { triggerHaptic } from '../utils/audioFeedback';

interface PreparerModeModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const PreparerModeModal: React.FC<PreparerModeModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [accessKey, setAccessKey] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [duration, setDuration] = useState<'permanent' | '2hours'>('permanent');
  const isCurrentlyActive = isTestModeActive();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const clean = accessKey.trim();
    if (clean === '2089227') {
      triggerHaptic(60);
      activatePreparerMode(duration === 'permanent');

      try {
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.6 },
          colors: ['#10b981', '#38bdf8', '#34d399', '#f59e0b'],
        });
      } catch {
        // Fallback
      }

      const msg = duration === 'permanent'
        ? '✅ Modo Preparador Activado: Escaneos Ilimitados Permanentes'
        : '✅ Modo Preparador Activado: Escaneos Ilimitados por 2 Horas';
      onSuccess(msg);
      onClose();
    } else {
      setErrorMsg('Clave maestra incorrecta. Ingresa la clave autorizada.');
      triggerHaptic(80);
    }
  };

  const handleDeactivate = () => {
    deactivatePreparerMode();
    triggerHaptic(40);
    onSuccess('Modo Preparador desactivado. Restablecido límite estándar.');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl glass-panel-heavy p-6 shadow-2xl border border-emerald-500/30 relative overflow-hidden">
        {/* Botón de cierre */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white transition"
          title="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Encabezado */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-1.5">
              <span>Modo Preparador / Pruebas</span>
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </h3>
            <p className="text-xs text-slate-400">Testing ilimitado sin restricciones</p>
          </div>
        </div>

        {/* Estado actual */}
        {isCurrentlyActive ? (
          <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Modo Ilimitado ACTIVO</span>
            </div>
            <button
              onClick={handleDeactivate}
              className="py-1 px-2.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 text-[11px] font-bold transition flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Desactivar</span>
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-300 mb-4 leading-relaxed">
            Ingresa la clave general para desbloquear capturas y exportaciones infinitas en este dispositivo.
          </p>
        )}

        {/* Mensaje de error */}
        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Clave General de Control</span>
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={accessKey}
              onChange={(e) => {
                setAccessKey(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Ej. 2089227"
              className="w-full p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700 text-base text-white text-center font-mono tracking-widest placeholder-slate-600 focus:outline-none focus:border-emerald-400 transition"
            />
          </div>

          {/* Opciones de duración */}
          <div className="flex items-center justify-center gap-2 p-1 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setDuration('permanent')}
              className={`flex-1 py-1.5 rounded-lg font-bold transition ${
                duration === 'permanent'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Permanente
            </button>
            <button
              type="button"
              onClick={() => setDuration('2hours')}
              className={`flex-1 py-1.5 rounded-lg font-bold transition ${
                duration === '2hours'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Por 2 Horas
            </button>
          </div>

          <button
            type="submit"
            className="w-full min-h-[52px] py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base shadow-xl shadow-emerald-500/25 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Unlock className="w-5 h-5 stroke-[2.5]" />
            <span>Activar Modo Ilimitado</span>
          </button>
        </form>
      </div>
    </div>
  );
};
