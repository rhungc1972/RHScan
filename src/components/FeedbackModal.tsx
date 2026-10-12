// src/components/FeedbackModal.tsx
// Modal de Observaciones y Sugerencias con almacenamiento en localStorage ('rhdocscan_feedback')
// y opciones de envío directo vía WhatsApp y Correo Electrónico

import React, { useState } from 'react';
import {
  X,
  MessageSquare,
  Send,
  CheckCircle2,
  User,
  Phone,
  Mail,
  Share2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { saveFeedback } from '../utils/feedbackStorage';
import { triggerHaptic } from '../utils/audioFeedback';

interface FeedbackModalProps {
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ onClose }) => {
  const [contact, setContact] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!message.trim()) {
      setError('Por favor escribe tu mensaje o sugerencia.');
      return;
    }

    triggerHaptic(35);
    saveFeedback(contact.trim() || 'Anónimo', message.trim());

    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#10b981', '#38bdf8', '#f59e0b'],
      });
    } catch (e) {}

    setSubmitted(true);
  };

  const handleSendWhatsApp = () => {
    if (!message.trim()) {
      setError('Por favor escribe tu mensaje antes de enviar.');
      return;
    }
    saveFeedback(contact.trim() || 'Anónimo', message.trim());
    triggerHaptic(30);

    const text = encodeURIComponent(
      `*Reporte / Sugerencia RHDocScan*\n` +
      `De: ${contact.trim() || 'Usuario Anónimo'}\n\n` +
      `Mensaje: ${message.trim()}\n\n` +
      `Fecha: ${new Date().toLocaleString()}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    setSubmitted(true);
  };

  const handleSendEmail = () => {
    if (!message.trim()) {
      setError('Por favor escribe tu mensaje antes de enviar.');
      return;
    }
    saveFeedback(contact.trim() || 'Anónimo', message.trim());
    triggerHaptic(30);

    const subject = encodeURIComponent('Sugerencia RHDocScan');
    const body = encodeURIComponent(
      `Contacto: ${contact.trim() || 'Anónimo'}\n\n` +
      `Mensaje:\n${message.trim()}\n\n` +
      `Fecha: ${new Date().toLocaleString()}`
    );
    window.location.href = `mailto:rhungc@gmail.com?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl glass-panel-heavy p-6 shadow-2xl border border-white/10 relative max-h-[90dvh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-white transition"
          title="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10 flex-shrink-0">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Observaciones y Sugerencias</h3>
                <p className="text-xs text-slate-400">Tu retroalimentación optimiza RHDocScan</p>
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
                <span>Contacto (Nombre / Teléfono / Correo)</span>
                <span className="text-[10px] text-slate-500 font-normal">(Opcional)</span>
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Ej. Roberto H. / 555-1234 / email@ejemplo.com"
                style={{ fontSize: '16px' }}
                className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-700 text-base text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Mensaje, Error o Sugerencia</span>
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
                placeholder="Describe tu observación o mejora..."
                style={{ fontSize: '16px' }}
                className="w-full p-3.5 rounded-2xl bg-slate-900 border border-slate-700 text-base text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition resize-none"
              />
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="submit"
                className="btn-touch-primary w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base min-h-[52px] tracking-wide transition shadow-lg shadow-emerald-500/25 active:scale-98 flex items-center justify-center gap-2"
              >
                <Send className="w-5 h-5 stroke-[2.2]" />
                <span>Guardar Sugerencia / Reporte</span>
              </button>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="p-3 rounded-2xl bg-[#128c7e] hover:bg-[#075e54] text-white text-xs font-bold flex items-center justify-center gap-1.5 min-h-[46px] transition active:scale-95"
                >
                  <span>📱 WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendEmail}
                  className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 min-h-[46px] border border-white/10 transition active:scale-95"
                >
                  <Mail className="w-4 h-4 text-cyan-400" />
                  <span>✉️ Correo</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="py-6 text-center space-y-4 animate-scaleUp">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-bold text-white">¡Sugerencia Registrada!</h4>
            <p className="text-xs text-slate-300">
              Muchas gracias por tu reporte. Los datos quedaron almacenados localmente en el registro del dispositivo.
            </p>
            <button
              onClick={onClose}
              className="btn-touch-primary w-full bg-emerald-500 text-slate-950 font-bold text-sm min-h-[48px]"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
