// src/components/SettingsModal.tsx
// Panel flotante de ajustes, filtros, estado de cuenta y botón Descargar App

import React, { useState } from 'react';
import {
  X,
  Shield,
  Palette,
  SunMedium,
  Sparkles,
  UserCheck,
  UserPlus,
  Download,
  Info,
  Clock,
  ExternalLink,
  Smartphone,
  KeyRound,
  Store,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';
import { ScanFilter, ScanTrackerState } from '../types';
import { getQuotaInfo, ANONYMOUS_DAILY_LIMIT, REGISTERED_DAILY_LIMIT } from '../services/usageTracker';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { triggerHaptic } from '../utils/audioFeedback';

interface SettingsModalProps {
  onClose: () => void;
  preferredFilter: ScanFilter;
  onChangeFilter: (filter: ScanFilter) => void;
  trackerState: ScanTrackerState;
  onOpenRegistration: () => void;
  onOpenAdmin?: () => void;
  onOpenFeedback?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  preferredFilter,
  onChangeFilter,
  trackerState,
  onOpenRegistration,
  onOpenAdmin,
  onOpenFeedback,
}) => {
  const quota = getQuotaInfo(trackerState);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [appToast, setAppToast] = useState<string | null>(null);

  const handleDownloadAppClick = async () => {
    triggerHaptic(25);

    // Si el navegador soporta el prompt PWA nativo (Android Chrome / Edge), dispararlo directamente
    if (isInstallable) {
      const installed = await install();
      if (installed) {
        setAppToast('¡RHDocScan se ha instalado en tu pantalla de inicio!');
        setTimeout(() => setAppToast(null), 4000);
        return;
      }
    }

    if (isIOS) {
      setShowIOSPrompt(true);
    }

    // Mostrar el toast informativo elegante requerido
    setAppToast(
      '📱 RHDocScan estará disponible muy pronto en Google Play Store y Apple App Store. ¡Por ahora puedes usarla directamente desde la web!'
    );
    setTimeout(() => {
      setAppToast(null);
    }, 6000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl glass-panel-heavy p-6 shadow-2xl border border-white/10 relative max-h-[90vh] overflow-y-auto">
        {/* Toast Notificación flotante dentro del modal */}
        {appToast && (
          <div className="absolute top-4 inset-x-4 z-30 p-3.5 rounded-2xl bg-slate-900/95 border border-emerald-500/40 text-emerald-300 text-xs shadow-2xl backdrop-blur-md animate-scaleUp flex items-start gap-2.5">
            <Info className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
            <div className="flex-1 text-[11px] leading-relaxed text-slate-200">
              {appToast}
            </div>
            <button
              onClick={() => setAppToast(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Encabezado */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-white text-base">Ajustes & Privacidad</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ESTADO DE CUOTA Y PLAN */}
        <div className="mb-5 p-4 rounded-2xl bg-slate-900/80 border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Plan de Uso Diario</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                trackerState.isRegistered
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {trackerState.isRegistered ? 'Verificado (10/día)' : 'Anónimo (3/día)'}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Escaneos utilizados hoy:</span>
              <span className="font-mono-numbers font-bold text-white">
                {trackerState.count} / {quota.max}
              </span>
            </div>
            {/* Barra de progreso */}
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  quota.remaining > 0 ? 'bg-emerald-500' : 'bg-red-500'
                }`}
                style={{
                  width: `${Math.min(100, (trackerState.count / quota.max) * 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Restantes: <strong className="text-emerald-400">{quota.remaining}</strong></span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>Reinicia a medianoche</span>
              </span>
            </div>
          </div>

          {!trackerState.isRegistered && (
            <button
              onClick={() => {
                onClose();
                onOpenRegistration();
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-slate-950 font-bold text-xs tracking-wide transition flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-98"
            >
              <UserPlus className="w-4 h-4" />
              <span>Desbloquear 10 Escaneos Gratis</span>
            </button>
          )}

          {trackerState.isRegistered && trackerState.userEmail && (
            <p className="text-[11px] text-slate-400">
              Correo verificado: <span className="text-slate-200 font-medium">{trackerState.userEmail}</span>
            </p>
          )}
        </div>

        {/* FILTRO DE IMAGEN PREDETERMINADO */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Filtro de Imagen Predeterminado
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onChangeFilter('color')}
              className={`p-2.5 rounded-xl text-center text-xs font-medium transition border flex flex-col items-center gap-1.5 ${
                preferredFilter === 'color'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Palette className="w-4 h-4 text-emerald-400" />
              <span>Color</span>
            </button>

            <button
              onClick={() => onChangeFilter('grayscale')}
              className={`p-2.5 rounded-xl text-center text-xs font-medium transition border flex flex-col items-center gap-1.5 ${
                preferredFilter === 'grayscale'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <SunMedium className="w-4 h-4 text-emerald-400" />
              <span>Grises</span>
            </button>

            <button
              onClick={() => onChangeFilter('binary')}
              className={`p-2.5 rounded-xl text-center text-xs font-medium transition border flex flex-col items-center gap-1.5 ${
                preferredFilter === 'binary'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>B/N Texto</span>
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            El filtro B/N aplica binarización local Bradley-Roth para texto hiper nítido.
          </p>
        </div>

        {/* SECCIÓN DESCARGAR APP */}
        <div className="mb-5 p-3 rounded-2xl bg-slate-900/60 border border-white/5 space-y-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">Aplicación Móvil</span>
          </div>

          <button
            onClick={handleDownloadAppClick}
            className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 transition border border-white/10 shadow-sm flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 text-left">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white leading-tight">Descargar App</div>
                <div className="text-[10px] text-emerald-400 font-medium leading-tight">Próximamente en tiendas</div>
              </div>
            </div>
            <span className="text-[10px] py-1 px-2 rounded-md bg-white/10 text-slate-300 font-semibold group-hover:bg-emerald-500 group-hover:text-slate-950 transition">
              Instalar
            </span>
          </button>

          {showIOSPrompt && (
            <p className="mt-2 text-[11px] text-slate-400 bg-black/40 p-2.5 rounded-lg border border-white/5">
              1. Pulsa el botón <strong>Compartir</strong> en Safari.<br />
              2. Desplázate hacia abajo y selecciona <strong>Añadir a pantalla de inicio</strong>.
            </p>
          )}
        </div>

        {/* SECCIÓN OBSERVACIONES Y SUGERENCIAS */}
        {onOpenFeedback && (
          <div className="mb-5 p-3 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-cyan-950/40 border border-emerald-500/30 space-y-2">
            <button
              onClick={() => {
                onClose();
                onOpenFeedback();
              }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-slate-950 font-bold text-xs tracking-wide transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-98"
            >
              <MessageSquare className="w-4 h-4 text-slate-950" />
              <span>💬 Observaciones y Sugerencias</span>
            </button>
            <p className="text-[10px] text-center text-slate-400">
              Tu opinión nos ayuda a perfeccionar RHDocScan para toda la comunidad.
            </p>
          </div>
        )}

        {/* PRINCIPIOS ZERO-KNOWLEDGE */}
        <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
            <Shield className="w-4 h-4" />
            <span>Arquitectura Zero-Knowledge</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            RHDocScan no almacena ni transmite tus fotos, cuadrantes ni documentos PDF a ningún servidor. Todo el procesamiento de Computer Vision se ejecuta en la memoria RAM y Canvas del navegador.
          </p>
        </div>

        {/* OPCIÓN XX PARA PANEL DE CONTROL Y ESTADÍSTICAS (CLAVE 2089227) */}
        {onOpenAdmin && (
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-mono">v2.5</span>
            <button
              onClick={() => {
                onClose();
                onOpenAdmin();
              }}
              className="text-xs text-slate-400 hover:text-emerald-400 font-mono transition inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-white/5 active:scale-95"
              title="Panel de control xx"
            >
              <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
              <span>xx</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
