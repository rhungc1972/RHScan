// src/components/AdminPanelModal.tsx
// Panel de Control de Administración Oculto ("xx") con acceso protegido por clave 2089227

import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  Users,
  FileSpreadsheet,
  Download,
  KeyRound,
  CheckCircle2,
  Lock,
  Activity,
  Calendar,
  Layers,
} from 'lucide-react';
import { ScanTrackerState } from '../types';

interface AdminPanelModalProps {
  onClose: () => void;
  trackerState: ScanTrackerState;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  onClose,
  trackerState,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const MASTER_PASSWORD = '2089227';
  const registeredUsers = trackerState.registeredUsersList || [];

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.trim() === MASTER_PASSWORD) {
      setIsAuthenticated(true);
      setErrorMsg(null);
    } else {
      setErrorMsg('Clave maestra incorrecta. Acceso denegado.');
    }
  };

  const handleExportCsv = () => {
    // Generar archivo CSV en memoria
    const headers = ['ID', 'Nombre Completo', 'Correo Electrónico', 'Fecha de Registro'];
    const rows = registeredUsers.map((u) => [
      `"${u.id}"`,
      `"${u.name.replace(/"/g, '""')}"`,
      `"${u.email.replace(/"/g, '""')}"`,
      `"${u.registeredAt}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Inscritos.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl glass-panel-heavy p-6 shadow-2xl border border-white/10 relative max-h-[92vh] flex flex-col overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Panel de Control</h3>
              <p className="text-[10px] text-slate-400">Administración del Sistema RHDocScan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PANTALLA 1: SOLICITUD DE CLAVE MAESTRA */}
        {!isAuthenticated ? (
          <form onSubmit={handleLogin} className="space-y-4 my-auto py-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center mx-auto text-purple-400">
              <Lock className="w-7 h-7" />
            </div>

            <div className="text-center">
              <h4 className="text-sm font-bold text-white mb-1">Acceso Administrativo Protegido</h4>
              <p className="text-xs text-slate-400">Ingresa la clave maestra para consultar métricas y usuarios.</p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs text-center font-medium">
                {errorMsg}
              </div>
            )}

            <div>
              <input
                type="password"
                required
                autoFocus
                placeholder="Clave maestra..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full py-3 px-4 rounded-xl bg-slate-900 border border-slate-700 text-center font-mono text-base text-white focus:outline-none focus:border-purple-400 transition"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm tracking-wide transition shadow-lg shadow-purple-600/25 active:scale-98 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>Desbloquear Panel</span>
            </button>
          </form>
        ) : (
          /* PANTALLA 2: DASHBOARD DE MÉTRICAS Y TABLA DE INSCRITOS */
          <div className="flex-1 flex flex-col overflow-hidden space-y-4">
            {/* Tarjetas de Métricas */}
            <div className="grid grid-cols-3 gap-2.5 flex-shrink-0">
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/5 text-center">
                <span className="text-[11px] text-slate-400 block mb-0.5">Escaneos Hoy</span>
                <span className="text-xl font-bold font-mono-numbers text-emerald-400">
                  {trackerState.count}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/5 text-center">
                <span className="text-[11px] text-slate-400 block mb-0.5">Inscritos</span>
                <span className="text-xl font-bold font-mono-numbers text-purple-400">
                  {registeredUsers.length}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/5 text-center">
                <span className="text-[11px] text-slate-400 block mb-0.5">Estado App</span>
                <span className="text-xs font-bold text-cyan-400 block mt-1">Activo 100%</span>
              </div>
            </div>

            {/* Encabezado de la tabla y botón de exportar CSV */}
            <div className="flex items-center justify-between pt-2 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-200">Usuarios Registrados ({registeredUsers.length})</span>
              </div>

              <button
                onClick={handleExportCsv}
                className="py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 active:scale-95 shadow-md shadow-emerald-500/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar Inscritos.csv</span>
              </button>
            </div>

            {/* Tabla con scroll de usuarios inscritos */}
            <div className="flex-1 overflow-y-auto rounded-2xl bg-slate-900/80 border border-white/5 p-2">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="pb-2 pl-2">Nombre</th>
                    <th className="pb-2">Correo</th>
                    <th className="pb-2 pr-2 text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {registeredUsers.map((u) => (
                    <tr key={u.id} className="text-slate-300 hover:bg-white/5 transition">
                      <td className="py-2.5 pl-2 font-medium text-white">{u.name}</td>
                      <td className="py-2.5 text-slate-400 truncate max-w-[140px]">{u.email}</td>
                      <td className="py-2.5 pr-2 text-right font-mono-numbers text-[10px] text-slate-500">
                        {u.registeredAt}
                      </td>
                    </tr>
                  ))}
                  {registeredUsers.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-slate-500">
                        No hay usuarios inscritos aún.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pie de seguridad */}
            <div className="pt-2 text-center text-[10px] text-slate-500 flex-shrink-0">
              Sesión de administrador activa. Todos los datos residen en almacenamiento local seguro.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
