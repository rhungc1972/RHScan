// src/components/RegistrationModal.tsx
// Modal de registro y verificación con código OTP de 6 dígitos

import React, { useState } from 'react';
import {
  X,
  Mail,
  User,
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
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [demoCode, setDemoCode] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Paso 1: Enviar OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Por favor ingresa tu nombre completo.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Por favor ingresa una dirección de correo válida.');
      return;
    }

    setIsLoading(true);
    triggerHaptic(30);

    try {
      const response = await sendOtpCode(name.trim(), email.trim());
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

  // Paso 2: Verificar OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (otpCode.length !== 6) {
      setErrorMessage('El código debe contener exactamente 6 dígitos.');
      return;
    }

    setIsLoading(true);
    triggerHaptic(35);

    try {
      const res = await verifyOtpCode(email.trim(), otpCode.trim(), token);
      if (res.success) {
        // Actualizar en localStorage
        setRegisteredUser(name.trim(), email.trim());
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
          onSuccess(name.trim(), email.trim());
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
            <p className="text-xs text-emerald-400 font-medium">Registro 100% Gratuito y Privado</p>
          </div>
        </div>

        {/* Error o Alertas */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* PASO 1: FORMULARIO DE REGISTRO */}
        {step === 'form' && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              Los usuarios anónimos cuentan con 3 escaneos diarios. Regístrate gratis para obtener
              <strong className="text-emerald-400 font-semibold"> 10 escaneos al día</strong>.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre Completo</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="Ej. Carlos Mendoza"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Correo Electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 flex items-start gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Garantía Zero-Knowledge: Tu correo solo se utiliza para validar tu cupo. Ningún documento se guarda en la nube.</span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-98"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando código...</span>
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
              Hemos despachado un código de 6 dígitos a:
              <div className="font-semibold text-white mt-0.5 truncate">{email}</div>
            </div>

            {/* Aviso de código de prueba en modo demostración */}
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
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 border border-slate-700 text-center font-mono-numbers text-2xl font-bold tracking-[8px] text-emerald-400 focus:outline-none focus:border-emerald-400 transition"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setStep('form')}
                className="text-slate-400 hover:text-white transition"
              >
                Cambiar correo
              </button>
              <button
                type="button"
                onClick={(e) => handleRequestOtp(e)}
                className="text-emerald-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Reenviar código
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading || otpCode.length !== 6}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-98 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validando...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Confirmar y Desbloquear</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* PASO 3: REGISTRO COMPLETADO */}
        {step === 'completed' && (
          <div className="py-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-bold text-white">¡Registro Exitoso!</h4>
            <p className="text-xs text-slate-300">
              Bienvenido, <strong className="text-emerald-400">{name}</strong>. Ahora dispones de 10 escaneos diarios.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
