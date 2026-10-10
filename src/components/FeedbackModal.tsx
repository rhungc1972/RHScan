// src/components/FeedbackModal.tsx
// Modal de Comentarios y Sugerencias con pantalla amigable de confirmación post-envío

import React, { useState } from 'react';
import {
  X,
  MessageSquare,
  Send,
  CheckCircle2,
  Heart,
  Smile,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface FeedbackModalProps {
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ onClose }) => {
  const [comment, setComment] = useState<string>('');
  const [rating, setRating] = useState<number>(5);
  const [submitted, setSubmitted] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

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
    }, 2200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-sm rounded-3xl glass-panel-heavy p-6 shadow-2xl border border-white/10 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Comentarios & Sugerencias</h3>
                <p className="text-xs text-slate-400">Ayúdanos a mejorar RHDocScan</p>
              </div>
            </div>

            {/* Valoración por estrellas/puntos */}
            <div className="py-2 flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  className={`text-2xl transition transform hover:scale-110 active:scale-95 ${
                    star <= rating ? 'opacity-100' : 'opacity-30 grayscale'
                  }`}
                >
                  ⭐
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                ¿Qué te gustaría ver en la próxima versión?
              </label>
              <textarea
                required
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Escribe aquí tu experiencia, dudas o sugerencias de mejora..."
                className="w-full p-3 rounded-2xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm tracking-wide transition shadow-lg shadow-emerald-500/25 active:scale-98 flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Enviar Comentarios</span>
            </button>
          </form>
        ) : (
          <div className="py-6 text-center space-y-3 animate-scaleUp">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-bold text-white">¡Muchas Gracias!</h4>
            <p className="text-xs text-slate-300">
              Tus sugerencias nos ayudan a mantener RHDocScan como el escáner privado más rápido y seguro.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
