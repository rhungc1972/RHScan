// src/components/AdminPanelModal.tsx
// Panel de Control y Auditoría Forense de RHDocScan protegido por clave 2089227

import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  Users,
  Download,
  KeyRound,
  CheckCircle2,
  Lock,
  Activity,
  FileText,
  Copy,
  Trash2,
  RefreshCw,
  Search,
  FileCode,
  Shield,
  Layers,
  MessageSquare,
} from 'lucide-react';
import { ScanTrackerState, Sha256AuditLogRecord, FeedbackRecord } from '../types';
import {
  getSha256AuditLogs,
  clearSha256AuditLogs,
} from '../utils/metadataAudit';
import { saveUsageState, getLocalDateString } from '../services/usageTracker';
import { getFeedbackList, downloadFeedbackCsv } from '../utils/feedbackStorage';
import { triggerHaptic } from '../utils/audioFeedback';

interface AdminPanelModalProps {
  onClose: () => void;
  trackerState: ScanTrackerState;
  onRefreshTracker?: () => void;
}

type AdminTab = 'users' | 'sha256' | 'feedback' | 'maintenance';

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  onClose,
  trackerState,
  onRefreshTracker,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<Sha256AuditLogRecord[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackRecord[]>([]);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [maintenanceSuccess, setMaintenanceSuccess] = useState<string | null>(null);

  const MASTER_PASSWORD = '2089227';
  const registeredUsers = trackerState.registeredUsersList || [];

  useEffect(() => {
    if (isAuthenticated) {
      setAuditLogs(getSha256AuditLogs());
      setFeedbackList(getFeedbackList());
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.trim() === MASTER_PASSWORD) {
      setIsAuthenticated(true);
      setErrorMsg(null);
      triggerHaptic(40);
    } else {
      setErrorMsg('Clave maestra incorrecta. Acceso restringido.');
      triggerHaptic(80);
    }
  };

  const handleExportCsv = () => {
    const headers = ['ID', 'Nombre Completo', 'Correo Electrónico', 'Fecha de Registro'];
    const rows = registeredUsers.map((u) => [
      `"${u.id}"`,
      `"${u.name.replace(/"/g, '""')}"`,
      `"${u.email.replace(/"/g, '""')}"`,
      `"${u.registeredAt}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    downloadBlob(new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }), 'Inscritos.csv');
  };

  const handleExportUsersJson = () => {
    const jsonStr = JSON.stringify(registeredUsers, null, 2);
    downloadBlob(new Blob([jsonStr], { type: 'application/json' }), 'Inscritos.json');
  };

  const handleExportAuditJson = () => {
    const jsonStr = JSON.stringify(auditLogs, null, 2);
    downloadBlob(new Blob([jsonStr], { type: 'application/json' }), 'Auditoria_SHA256.json');
  };

  const handleExportFullDiagnosticsJson = () => {
    const diagnostic = {
      system: 'RHDocScan v2.4 (Zero-Knowledge)',
      timestamp: new Date().toISOString(),
      quota: {
        date: trackerState.date,
        count: trackerState.count,
        isRegistered: trackerState.isRegistered,
        userEmail: trackerState.userEmail,
      },
      registeredUsersCount: registeredUsers.length,
      registeredUsers,
      auditLogsCount: auditLogs.length,
      auditLogs,
      feedbackCount: feedbackList.length,
      feedbackList,
      environment: {
        userAgent: navigator.userAgent,
        screen: `${window.screen.width}x${window.screen.height}`,
      },
    };
    downloadBlob(new Blob([JSON.stringify(diagnostic, null, 2)], { type: 'application/json' }), 'Diagnostico_RHDocScan.json');
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    triggerHaptic(20);
  };

  const handleCopyHash = (hash: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(hash).catch(() => {});
    }
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2500);
    triggerHaptic(15);
  };

  const handleResetDailyQuota = () => {
    const updated: ScanTrackerState = {
      ...trackerState,
      count: 0,
      date: getLocalDateString(),
    };
    saveUsageState(updated);
    onRefreshTracker?.();
    setMaintenanceSuccess('Cupo diario restablecido a 0 escaneos.');
    setTimeout(() => setMaintenanceSuccess(null), 3000);
    triggerHaptic(30);
  };

  const handleClearAuditLogs = () => {
    if (window.confirm('¿Seguro que deseas vaciar el historial de hashes SHA-256?')) {
      clearSha256AuditLogs();
      setAuditLogs([]);
      setMaintenanceSuccess('Registro de auditoría SHA-256 vaciado.');
      setTimeout(() => setMaintenanceSuccess(null), 3000);
      triggerHaptic(40);
    }
  };

  // Filtrado de usuarios
  const filteredUsers = registeredUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filtrado de auditoría
  const filteredLogs = auditLogs.filter(
    (l) =>
      l.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.sha256Hash.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filtrado de sugerencias
  const filteredFeedback = feedbackList.filter(
    (fb) =>
      fb.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl glass-panel-heavy p-5 shadow-2xl border border-white/10 relative max-h-[92vh] flex flex-col overflow-hidden">
        {/* Cabecera del Panel */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                <span>Panel de Control & Auditoría</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  2089227
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Trazabilidad Zero-Knowledge y Gestión Interna</p>
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
              <p className="text-xs text-slate-400">Ingresa la clave maestra para consultar métricas, inscritos, sugerencias y hashes SHA-256.</p>
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
                placeholder="Ingresa clave maestra..."
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
          /* PANTALLA 2: DASHBOARD MULTI-PESTAÑA */
          <div className="flex-1 flex flex-col overflow-hidden space-y-3">
            {/* Tarjetas de Métricas Rápidas */}
            <div className="grid grid-cols-4 gap-2 flex-shrink-0">
              <div className="p-2 rounded-xl bg-slate-900/90 border border-white/5 text-center">
                <span className="text-[9px] text-slate-400 block">Escaneos Hoy</span>
                <span className="text-base font-bold font-mono-numbers text-emerald-400">
                  {trackerState.count}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-900/90 border border-white/5 text-center">
                <span className="text-[9px] text-slate-400 block">Inscritos</span>
                <span className="text-base font-bold font-mono-numbers text-purple-400">
                  {registeredUsers.length}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-900/90 border border-white/5 text-center">
                <span className="text-[9px] text-slate-400 block">Hashes SHA</span>
                <span className="text-base font-bold font-mono-numbers text-cyan-400">
                  {auditLogs.length}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-900/90 border border-white/5 text-center">
                <span className="text-[9px] text-slate-400 block">Sugerencias</span>
                <span className="text-base font-bold font-mono-numbers text-amber-400">
                  {feedbackList.length}
                </span>
              </div>
            </div>

            {/* Pestañas de Navegación */}
            <div className="flex rounded-xl bg-black/40 p-1 border border-white/10 text-xs flex-shrink-0">
              <button
                type="button"
                onClick={() => { setActiveTab('users'); setSearchTerm(''); }}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
                  activeTab === 'users'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Inscritos</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('sha256'); setSearchTerm(''); }}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
                  activeTab === 'sha256'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Hashes</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('feedback');
                  setSearchTerm('');
                  setFeedbackList(getFeedbackList());
                }}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
                  activeTab === 'feedback'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Ver Sugerencias</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('maintenance'); setSearchTerm(''); }}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
                  activeTab === 'maintenance'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Control</span>
              </button>
            </div>

            {/* Aviso de Acción */}
            {maintenanceSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs text-center font-medium animate-fadeIn flex-shrink-0">
                {maintenanceSuccess}
              </div>
            )}

            {/* CONTENIDO DE LA PESTAÑA 1: USUARIOS INSCRITOS */}
            {activeTab === 'users' && (
              <div className="flex-1 flex flex-col overflow-hidden space-y-2">
                <div className="flex items-center justify-between gap-2 flex-shrink-0">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Buscar inscrito..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full py-1.5 pl-8 pr-3 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:border-purple-400"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleExportCsv}
                      className="py-1.5 px-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center gap-1 transition"
                      title="Descargar Inscritos en CSV"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>
                    <button
                      onClick={handleExportUsersJson}
                      className="py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 transition border border-white/10"
                      title="Descargar Inscritos en JSON"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>JSON</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto rounded-xl bg-slate-900/60 border border-white/5 p-2">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-white/10 text-[11px]">
                        <th className="pb-1.5 pl-2">Nombre</th>
                        <th className="pb-1.5">Correo</th>
                        <th className="pb-1.5 pr-2 text-right">Fecha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="text-slate-300 hover:bg-white/5 transition">
                          <td className="py-2 pl-2 font-medium text-white">{u.name}</td>
                          <td className="py-2 text-slate-400 truncate max-w-[130px]">{u.email}</td>
                          <td className="py-2 pr-2 text-right font-mono-numbers text-[10px] text-slate-500">
                            {u.registeredAt}
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-slate-500">
                            No se encontraron usuarios inscritos.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CONTENIDO DE LA PESTAÑA 2: AUDITORÍA FORENSE SHA-256 */}
            {activeTab === 'sha256' && (
              <div className="flex-1 flex flex-col overflow-hidden space-y-2">
                <div className="flex items-center justify-between gap-2 flex-shrink-0">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Buscar por archivo o hash..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full py-1.5 pl-8 pr-3 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:border-purple-400"
                    />
                  </div>
                  <button
                    onClick={handleExportAuditJson}
                    className="py-1.5 px-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs flex items-center gap-1 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON Hashes</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-2xl bg-slate-900/90 border border-white/10 flex flex-col gap-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <FileText className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                          <span className="font-semibold text-white truncate text-[11px]">{log.fileName}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono-numbers flex-shrink-0">
                          {log.timestamp}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-black/40 p-1.5 rounded-xl border border-white/5">
                        <span className="font-mono text-[10px] text-emerald-400 break-all select-all leading-tight">
                          {log.sha256Hash}
                        </span>
                        <button
                          onClick={() => handleCopyHash(log.sha256Hash)}
                          className="p-1 rounded-lg text-slate-400 hover:text-white transition flex-shrink-0"
                          title="Copiar Hash"
                        >
                          {copiedHash === log.sha256Hash ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span>Formato: <strong className="text-slate-300 uppercase">{log.format}</strong></span>
                        <span>Páginas: <strong className="text-slate-300">{log.pageCount}</strong></span>
                      </div>
                    </div>
                  ))}

                  {filteredLogs.length === 0 && (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      No hay registros forenses SHA-256 en este momento.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CONTENIDO DE LA PESTAÑA 3: VER SUGERENCIAS (REQUISITO 3) */}
            {activeTab === 'feedback' && (
              <div className="flex-1 flex flex-col overflow-hidden space-y-2">
                <div className="flex items-center justify-between gap-2 flex-shrink-0">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Buscar en comentarios..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full py-1.5 pl-8 pr-3 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:border-purple-400"
                    />
                  </div>
                  <button
                    onClick={() => {
                      downloadFeedbackCsv();
                      triggerHaptic(20);
                    }}
                    className="py-1.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                    title="Descargar sugerencias_rhdocscan.csv"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Sugerencias (CSV)</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {filteredFeedback.map((fb) => (
                    <div
                      key={fb.id}
                      className="p-3 rounded-2xl bg-slate-900/90 border border-white/10 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-400 flex items-center gap-1">
                          <span>{fb.name}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono-numbers">
                          {fb.timestamp}
                        </span>
                      </div>
                      <p className="text-slate-200 text-xs leading-relaxed bg-black/40 p-2.5 rounded-xl border border-white/5">
                        {fb.message}
                      </p>
                    </div>
                  ))}

                  {filteredFeedback.length === 0 && (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      No hay sugerencias registradas por los usuarios aún.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CONTENIDO DE LA PESTAÑA 4: MANTENIMIENTO & DEBUG */}
            {activeTab === 'maintenance' && (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                <div className="p-3 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                  <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Control de Cuota Diaria (Pruebas)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Restablece el contador de documentos escaneados hoy a 0 para seguir probando el flujo de escaneo ilimitadamente.
                  </p>
                  <button
                    onClick={handleResetDailyQuota}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-semibold transition flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Restablecer Cuota de Hoy a 0</span>
                  </button>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                  <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Descarga de Diagnóstico Completo</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Exporta un reporte completo en JSON con el estado de cuota, usuarios registrados, lista de hashes SHA-256 y metadatos de entorno.
                  </p>
                  <button
                    onClick={handleExportFullDiagnosticsJson}
                    className="w-full py-2 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 font-semibold transition flex items-center justify-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Reporte Diagnóstico (.json)</span>
                  </button>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/80 border border-red-500/20 space-y-2">
                  <h4 className="font-bold text-red-400 text-xs flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpieza de Datos Locales</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Vacía el historial de hashes SHA-256 acumulados en la memoria del navegador.
                  </p>
                  <button
                    onClick={handleClearAuditLogs}
                    className="w-full py-2 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-semibold transition flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Vaciar Historial de Hashes SHA-256</span>
                  </button>
                </div>
              </div>
            )}

            {/* Pie de seguridad */}
            <div className="pt-2 text-center text-[10px] text-slate-500 flex-shrink-0 border-t border-white/5">
              Sesión de administrador activa. Todos los datos residen en memoria local segura (Zero-Knowledge).
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
