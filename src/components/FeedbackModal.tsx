// src/components/FeedbackModal.tsx
// Modal de Observaciones y Sugerencias con almacenamiento en localStorage ('rhdocscan_feedback')

import React, { useState } from 'react';
import {
  X,
  MessageSquare,
  Send,
  CheckCircle2,
  Sparkles,
  User,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { saveFeedback } from '../utils/feedbackStorage';
import { triggerHaptic } from '../utils/audioFeedback';

interface FeedbackModalProps {
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ onClose }) => {
  const [name, setName] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Por favor escribe tu mensaje o sugerencia.');
      return;
    }

    triggerHaptic(35);
    saveFeedback(name, message);

    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#10b981', '#38bdf8', '#f59e0b'],
      });
    } catch (e) {}

    setSubmitted(true);
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl glass-panel-heavy p-6 shadow-2xl border border-white/10 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white transition"
          title="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Observaciones y Sugerencias</h3>
                <p className="text-xs text-slate-400">Tu opinión nos ayuda a optimizar RHDocScan</p>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Nombre</span>
                <span className="text-[10px] text-slate-500 font-normal">(Opcional, por defecto "Anónimo")</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Roberto H. o déjalo vacío"
                style={{ fontSize: '16px' }}
                className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-700 text-base text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Mensaje / Sugerencia</span>
                <span className="text-[10px] text-emerald-400 font-semibold">* Requerido</span>
              </label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Escribe aquí tu experiencia, mejoras deseadas o comentarios..."
                style={{ fontSize: '16px' }}
                className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-700 text-base text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition resize-none"
              />
            </div>

            <button
              type="submit"
              className="btn-touch-primary w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base min-h-[50px] tracking-wide transition shadow-lg shadow-emerald-500/25 active:scale-98 flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5 stroke-[2.2]" />
              <span>Guardar Sugerencia</span>
            </button>
          </form>
        ) : (
          <div className="py-6 text-center space-y-3 animate-scaleUp">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-bold text-white">¡Sugerencia Registrada!</h4>
            <p className="text-xs text-slate-300">
              Muchas gracias por tu aporte. Tu sugerencia ha sido guardada en la memoria local del sistema.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
