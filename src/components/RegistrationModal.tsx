// src/components/RegistrationModal.tsx
// Modal de registro y verificación simplificado: solicita ÚNICAMENTE correo electrónico
// Despacha código OTP de 6 dígitos mediante send-otp.js y desbloquea 10 escaneos diarios

import React, { useState } from 'react';
import {
  X,
  Mail,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { sendOtpCode, verifyOtpCode } from '../services/otpService';
import { setRegisteredUser } from '../services/usageTracker';
import { triggerHaptic } from '../utils/audioFeedback';

interface RegistrationModalProps {
  onClose: () => void;
  onSuccess: (name: string, email: string) => void;
}

export const RegistrationModal: React.FC<RegistrationModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<'form' | 'verify' | 'completed'>('form');
  const [email, setEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [demoCode, setDemoCode] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Paso 1: Enviar OTP únicamente con correo electrónico o activar clave de pruebas
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const inputVal = email.trim();

    // CLAVE DE DESBLOQUEO POR 2 HORAS: 2089227 (EN CAMPO DE CORREO)
    if (inputVal === '2089227') {
      const expireTime = Date.now() + 2 * 60 * 60 * 1000;
      localStorage.setItem('rhdocscan_test_mode_expires', expireTime.toString());
      localStorage.setItem('rhdocscan_is_unlimited', 'true');
      triggerHaptic(60);

      // Lanzar confeti de celebración
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#38bdf8', '#34d399', '#f59e0b'],
        });
      } catch {
        // Fallback si no está disponible canvas-confetti
      }

      onSuccess('Modo Pruebas 2H', 'tester-2089227@rhdocscan.internal');
      onClose();
      return;
    }

    if (!inputVal || !inputVal.includes('@') || !inputVal.includes('.')) {
      setErrorMessage('Por favor ingresa una dirección de correo válida o código de acceso.');
      return;
    }

    setIsLoading(true);
    triggerHaptic(30);

    try {
      // Nombre derivado del correo (ej: "roberto" de "roberto@gmail.com")
      const derivedName = inputVal.split('@')[0];
      const response = await sendOtpCode(inputVal, derivedName);

      if (response.success && response.token) {
        setToken(response.token);
        if (response.demoCode) {
          setDemoCode(response.demoCode);
        }
        setInfoMessage(response.message || 'Código de 6 dígitos enviado.');
        setStep('verify');
      } else {
        setErrorMessage(response.error || 'No se pudo enviar el código. Intenta de nuevo.');
      }
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(error.message || 'Error de conexión.');
    } finally {
      setIsLoading(false);
    }
  };

  // Paso 2: Verificar OTP de 6 dígitos
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (otpCode.length !== 6) {
      setErrorMessage('El código debe contener exactamente 6 dígitos numéricos.');
      return;
    }

    setIsLoading(true);
    triggerHaptic(35);

    try {
      const res = await verifyOtpCode(email.trim(), otpCode.trim(), token);
      if (res.success) {
        const derivedName = email.trim().split('@')[0];
        // Guardar isRegistered: true y correo en localStorage inmediatamente
        setRegisteredUser(derivedName, email.trim());
        triggerHaptic(60);

        // Disparar confetti de celebración
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#10b981', '#34d399', '#06b6d4', '#ffffff'],
          });
        } catch (e) {}

        setStep('completed');
        setTimeout(() => {
          onSuccess(derivedName, email.trim());
        }, 1500);
      } else {
        setErrorMessage(res.error || 'Código incorrecto o expirado.');
      }
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(error.message || 'Error validando código.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl glass-panel-heavy p-6 shadow-2xl border border-white/10 relative overflow-hidden">
        {/* Botón de cierre */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white transition"
          title="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Encabezado */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white leading-tight">Desbloquear 10 Escaneos</h3>
            <p className="text-xs text-emerald-400 font-medium">Registro Inmediato solo con Correo</p>
          </div>
        </div>

        {/* Error o Alertas */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* PASO 1: FORMULARIO DE REGISTRO SOLO CON CORREO */}
        {step === 'form' && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Los usuarios anónimos tienen 3 escaneos diarios. Ingresa tu correo electrónico para recibir un código de acceso y desbloquear
              <strong className="text-emerald-400 font-semibold"> 10 escaneos diarios</strong>.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  autoFocus
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-start gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Garantía Zero-Knowledge: Tu correo solo se utiliza para validar tu cuota. Ningún documento o imagen se guarda en la nube.</span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-98 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Despachando código...</span>
                </>
              ) : (
                <>
                  <span>Enviar Código de Verificación</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* PASO 2: VERIFICACIÓN DEL CÓDIGO OTP */}
        {step === 'verify' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="text-xs text-slate-300">
              Hemos despachado un código OTP de 6 dígitos a:
              <div className="font-semibold text-white mt-0.5 truncate">{email}</div>
            </div>

            {/* Código Demo en caso de servidor de desarrollo / contingencia */}
            {demoCode && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold">Código Demo: </span>
                  <span className="font-mono-numbers font-bold text-sm tracking-widest">{demoCode}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOtpCode(demoCode)}
                  className="px-2 py-1 rounded bg-emerald-500/20 text-[10px] font-bold hover:bg-emerald-500/30 transition text-emerald-200"
                >
                  Rellenar
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 text-center">
                Ingresa los 6 dígitos
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  placeholder="••••••"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 border border-slate-700 text-center font-mono-numbers text-2xl tracking-[0.4em] text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || otpCode.length !== 6}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-98 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Confirmar y Desbloquear</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('form');
                setOtpCode('');
                setErrorMessage(null);
              }}
              className="w-full text-center text-xs text-slate-400 hover:text-white transition flex items-center justify-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Cambiar correo electrónico</span>
            </button>
          </form>
        )}

        {/* PASO 3: CONFIRMACIÓN EXITOSA */}
        {step === 'completed' && (
          <div className="py-6 text-center space-y-3 animate-scaleUp">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center shadow-xl shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-bold text-white">¡10 Escaneos Desbloqueados!</h4>
            <p className="text-xs text-slate-300">
              Tu cuenta ha quedado verificada. Ahora cuentas con hasta 10 documentos por día.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
