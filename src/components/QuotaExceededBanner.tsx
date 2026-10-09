// src/components/QuotaExceededBanner.tsx
// Banner emergente y cuenta regresiva a medianoche en tiempo real cuando se agota el cupo

import React, { useState, useEffect } from 'react';
import { Clock, Sparkles, UserPlus, AlertOctagon } from 'lucide-react';
import { getMsUntilMidnight, formatCountdown } from '../services/usageTracker';

interface QuotaExceededBannerProps {
  isRegistered: boolean;
  onOpenRegistration: () => void;
}

export const QuotaExceededBanner: React.FC<QuotaExceededBannerProps> = ({
  isRegistered,
  onOpenRegistration,
}) => {
  const [countdown, setCountdown] = useState<string>(() => formatCountdown(getMsUntilMidnight()));

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(getMsUntilMidnight()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute top-16 inset-x-4 z-40 animate-slideDown">
      <div className="max-w-md mx-auto p-4 rounded-2xl glass-panel-heavy border border-red-500/30 shadow-2xl space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">
              {isRegistered
                ? 'Límite diario de 10 escaneos alcanzado'
                : 'Has alcanzado tu límite diario gratuito de 3 escaneos.'}
            </h4>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-300">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Tu próximo cupo libre estará disponible en:</span>
              <span className="font-mono-numbers font-bold text-white">{countdown}</span>
            </div>
          </div>
        </div>

        {!isRegistered && (
          <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
            <p className="text-xs text-slate-300">
              ¡Desbloquea <strong className="text-emerald-400">10 escaneos diarios</strong> registrándote gratis con tu nombre y correo!
            </p>
            <button
              onClick={onOpenRegistration}
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 active:scale-98 shadow-md shadow-emerald-500/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Registrarse Gratis Ahora</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
