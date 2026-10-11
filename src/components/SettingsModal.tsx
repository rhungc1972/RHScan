// src/components/SettingsModal.tsx
// Panel flotante de ajustes, filtros, estado de cuenta y botón PWA

import React from 'react';
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
} from 'lucide-react';
import { ScanFilter, ScanTrackerState } from '../types';
import { getQuotaInfo, ANONYMOUS_DAILY_LIMIT, REGISTERED_DAILY_LIMIT } from '../services/usageTracker';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface SettingsModalProps {
  onClose: () => void;
  preferredFilter: ScanFilter;
  onChangeFilter: (filter: ScanFilter) => void;
  trackerState: ScanTrackerState;
  onOpenRegistration: () => void;
  onOpenAdmin?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  preferredFilter,
  onChangeFilter,
  trackerState,
  onOpenRegistration,
  onOpenAdmin,
}) => {
  const quota = getQuotaInfo(trackerState);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSPrompt, setShowIOSPrompt] = React.useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl glass-panel-heavy p-6 shadow-2xl border border-white/10 relative max-h-[90vh] overflow-y-auto">
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

        {/* ESTADO DE CUENTA Y CUPO */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-white/10 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Estado de Cuenta</span>
            {trackerState.isRegistered ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                <UserCheck className="w-3 h-3" />
                Registrado (10/día)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                Anónimo (3/día)
              </span>
            )}
          </div>

          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-2xl font-bold font-mono-numbers text-white">
              {quota.remaining} <span className="text-xs text-slate-400 font-normal">disponibles hoy</span>
            </span>
            <span className="text-xs text-slate-400 font-mono-numbers">
              {quota.used} / {quota.max} usados
            </span>
          </div>

          {/* Barra de progreso de cupo */}
          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mb-3">
            <div
              className={`h-full transition-all duration-300 ${
                quota.isExceeded ? 'bg-red-500' : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min(100, (quota.used / quota.max) * 100)}%` }}
            />
          </div>

          {!trackerState.isRegistered && (
            <button
              onClick={() => {
                onClose();
                onOpenRegistration();
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 active:scale-98 shadow-md shadow-emerald-500/20"
            >
              <UserPlus className="w-4 h-4" />
              <span>Registrarse Gratis (10 escaneos/día)</span>
            </button>
          )}

          {trackerState.isRegistered && trackerState.userName && (
            <p className="text-[11px] text-slate-400">
              Registrado a nombre de: <span className="text-slate-200 font-medium">{trackerState.userName}</span>
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

        {/* INSTALACIÓN PWA */}
        {!isInstalled && (
          <div className="mb-5 p-3 rounded-2xl bg-slate-900/60 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">Instalar como App (PWA)</span>
            </div>

            {isInstallable && (
              <button
                onClick={install}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                Instalar en Pantalla de Inicio
              </button>
            )}

            {isIOS && (
              <>
                <button
                  onClick={() => setShowIOSPrompt(!showIOSPrompt)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  Instalar en iPhone / iPad
                </button>
                {showIOSPrompt && (
                  <p className="mt-2 text-[11px] text-slate-400 bg-black/40 p-2.5 rounded-lg border border-white/5">
                    1. Pulsa el botón <strong>Compartir</strong> en Safari.<br />
                    2. Desplázate hacia abajo y selecciona <strong>Añadir a pantalla de inicio</strong>.
                  </p>
                )}
              </>
            )}
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

        {/* ACCESO A PANEL DE ADMINISTRACIÓN / AUDITORÍA */}
        {onOpenAdmin && (
          <div className="mt-4 pt-3 border-t border-white/10 text-center">
            <button
              onClick={() => {
                onClose();
                onOpenAdmin();
              }}
              className="text-xs text-slate-400 hover:text-purple-400 transition inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-white/5 active:scale-95"
            >
              <KeyRound className="w-3.5 h-3.5 text-purple-400" />
              <span>Panel de Administración & Debug</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
