// src/components/DocumentReviewModal.tsx
// Galería de Páginas Acumuladas con:
// - Carrusel horizontal de tomas [Toma 1] [Toma 2]... y BOTÓN VERDE [+ 📷 Tomar otra página] ESTRICTAMENTE A LA DERECHA
// - Botón flotante papelera roja (🗑️) con fondo circular para eliminar tomas individuales
// - Doble casilla condicional: Casilla 1 (Hash SHA-256) y Casilla 2 (Comparecencia con foto frontal y firma táctil)
// - Menú de Envío Multicanal: "📱 Compartir por WhatsApp", "✉️ Enviar por Correo Electrónico", "💾 Descargar en este Teléfono"

import React, { useState } from 'react';
import {
  Share2,
  Download,
  Trash2,
  RotateCw,
  Plus,
  ArrowLeft,
  Camera,
  CheckCircle,
  FileCheck2,
  ShieldCheck,
  MessageSquare,
  Loader2,
  Lock,
  Mail,
  Send,
  UserCheck,
  FileText,
} from 'lucide-react';
import { ScannedPage, ExportFormat, AppearanceData } from '../types';
import { shareOrDownloadDocument } from '../utils/pdfGenerator';
import { AppearanceModal } from './AppearanceModal';
import { triggerHaptic } from '../utils/audioFeedback';

interface DocumentReviewModalProps {
  pages: ScannedPage[];
  maxPages: number;
  exportFormat?: ExportFormat;
  onChangeExportFormat?: (format: ExportFormat) => void;
  onClose: () => void;
  onAddMorePages: () => void;
  onDeletePage: (id: string) => void;
  onRotatePage: (id: string) => void;
  onCompleteScan: () => void;
  onOpenFeedback?: () => void;
}

export const DocumentReviewModal: React.FC<DocumentReviewModalProps> = ({
  pages,
  maxPages,
  exportFormat = 'pdf',
  onChangeExportFormat,
  onClose,
  onAddMorePages,
  onDeletePage,
  onRotatePage,
  onCompleteScan,
  onOpenFeedback,
}) => {
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [currentFormat, setCurrentFormat] = useState<ExportFormat>(exportFormat || 'pdf');

  // MÓDULO 2: CASILLAS SEPARADAS (FOTOGRAFÍA Y FIRMA TÁCTIL INDEPENDIENTES)
  const [includeMetadata, setIncludeMetadata] = useState<boolean>(false);
  const [includePhoto, setIncludePhoto] = useState<boolean>(false);
  const [includeSignature, setIncludeSignature] = useState<boolean>(false);
  const [appearanceData, setAppearanceData] = useState<AppearanceData | null>(null);
  const [isAppearanceModalOpen, setIsAppearanceModalOpen] = useState<boolean>(false);

  // Menú flotante de método de envío multicanal
  const [showDispatchMenu, setShowDispatchMenu] = useState<boolean>(false);
  const [postSendSuccess, setPostSendSuccess] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<{ fileName: string; format: string } | null>(null);

  const activeFormat: ExportFormat = currentFormat || exportFormat || 'pdf';
  const activePage = pages[selectedPageIndex] || pages[0];

  // Alternar Casilla Principal
  const handleToggleMetadata = (checked: boolean) => {
    setIncludeMetadata(checked);
    if (!checked) {
      setIncludePhoto(false);
      setIncludeSignature(false);
      setAppearanceData(null);
    }
  };

  // Alternar Sub-casilla A: Foto Frontal
  const handleTogglePhoto = (checked: boolean) => {
    setIncludePhoto(checked);
    if (checked && (!appearanceData || !appearanceData.selfieDataUrl)) {
      setIsAppearanceModalOpen(true);
    }
  };

  // Alternar Sub-casilla B: Firma Táctil
  const handleToggleSignature = (checked: boolean) => {
    setIncludeSignature(checked);
    if (checked && (!appearanceData || !appearanceData.signatureDataUrl)) {
      setIsAppearanceModalOpen(true);
    }
  };

  const getAppearanceMode = (): import('./AppearanceModal').AppearanceMode => {
    if (includePhoto && includeSignature) return 'both';
    if (includePhoto) return 'photo_only';
    return 'signature_only';
  };

  // Envío del documento
  const handleExecuteDispatch = async (channel: 'whatsapp' | 'email' | 'download') => {
    if (pages.length === 0 || isGenerating) return;

    // Si se marcó foto o firma pero aún no se completó la captura
    const needsPhoto = includePhoto && (!appearanceData || !appearanceData.selfieDataUrl);
    const needsSig = includeSignature && (!appearanceData || !appearanceData.signatureDataUrl);
    if ((needsPhoto || needsSig)) {
      setIsAppearanceModalOpen(true);
      return;
    }

    setIsGenerating(true);
    setShowDispatchMenu(false);
    triggerHaptic(40);

    try {
      const finalAppearance: AppearanceData | undefined =
        (includePhoto || includeSignature) && appearanceData
          ? {
              selfieDataUrl: includePhoto ? appearanceData.selfieDataUrl : '',
              signatureDataUrl: includeSignature ? appearanceData.signatureDataUrl : '',
              grantorName: appearanceData.grantorName,
            }
          : undefined;

      const result = await shareOrDownloadDocument(
        pages,
        activeFormat,
        includeMetadata,
        finalAppearance,
        channel
      );

      setSuccessInfo({
        fileName: result.fileName,
        format: (result.format || activeFormat).toUpperCase(),
      });
      setPostSendSuccess(true);
      onCompleteScan();
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Error al enviar documento:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="w-full h-full bg-[#0a0f18] flex flex-col select-none touch-none app-viewport"
      style={{ height: '100dvh', minHeight: '-webkit-fill-available' }}
    >
      {/* BARRA SUPERIOR ERGONÓMICA */}
      <div className="pt-safe px-safe py-3 flex items-center justify-between border-b border-white/10 glass-panel z-20">
        <button
          onClick={onClose}
          className="p-2 rounded-full text-slate-400 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Volver</span>
        </button>

        <div className="text-center">
          <h2 className="text-sm font-bold text-white tracking-wide">Galería de Documento</h2>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <span className="text-[11px] text-emerald-400 font-mono-numbers">
              {pages.length} de {maxPages} páginas
            </span>
            <span className="text-slate-600">•</span>
            <div className="inline-flex rounded-lg bg-black/40 p-0.5 border border-white/10 text-[10px]">
              <button
                type="button"
                onClick={() => {
                  setCurrentFormat('pdf');
                  onChangeExportFormat?.('pdf');
                }}
                className={`px-2 py-0.5 rounded font-bold transition ${
                  activeFormat === 'pdf'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentFormat('jpg');
                  onChangeExportFormat?.('jpg');
                }}
                className={`px-2 py-0.5 rounded font-bold transition ${
                  activeFormat === 'jpg'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                JPG
              </button>
            </div>
          </div>
        </div>

        {onOpenFeedback ? (
          <button
            onClick={onOpenFeedback}
            className="p-2 rounded-full text-slate-400 hover:text-emerald-400 transition"
            title="Sugerencias"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-8" />
        )}
      </div>

      {/* PANTALLA POST-ENVÍO CONFIRMADA */}
      {postSendSuccess && successInfo ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 animate-scaleUp">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-xl shadow-emerald-500/20 border border-emerald-500/40">
            <CheckCircle className="w-12 h-12" />
          </div>

          <div className="space-y-1">
            <h3 className="text-xl font-bold text-white">¡Documento Enviado!</h3>
            <p className="text-xs text-slate-300 max-w-xs">
              Tu archivo <strong className="text-emerald-400">{successInfo.fileName}</strong> ha sido generado y enviado exitosamente.
            </p>
          </div>

          {includeMetadata && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 max-w-xs text-left">
              <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <span>
                {includePhoto || includeSignature
                  ? 'Acta de Comparecencia, Firma Digital y Hash SHA-256 incorporados.'
                  : 'Acta técnica de certificación y Hash SHA-256 adjuntados con éxito.'}
              </span>
            </div>
          )}

          {/* Botón Prominente: Observaciones y Sugerencias */}
          <div className="w-full max-w-xs pt-4 space-y-3">
            {onOpenFeedback && (
              <button
                onClick={onOpenFeedback}
                className="btn-touch-primary w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-slate-950 font-bold text-sm tracking-wide transition shadow-lg shadow-emerald-500/25 active:scale-98 flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span>💬 Observaciones y Sugerencias</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="btn-restart w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition"
            >
              + Iniciar Nuevo Escaneo
            </button>
          </div>
        </div>
      ) : (
        /* VISTA DE REVISIÓN Y GALERÍA */
        <>
          {/* VISOR PRINCIPAL DE PÁGINA SELECCIONADA */}
          <div className="flex-1 w-full relative overflow-hidden bg-black/70 flex items-center justify-center p-4">
            {activePage ? (
              <div className="relative max-w-md w-full h-full flex flex-col items-center justify-center">
                <img
                  src={activePage.warpedDataUrl}
                  alt={`Página ${selectedPageIndex + 1}`}
                  className="max-h-[46vh] max-w-full object-contain rounded-xl shadow-2xl border border-white/10"
                />

                {/* Acciones sobre la página actual */}
                <div className="absolute top-4 right-4 flex flex-col gap-2">
                  <button
                    onClick={() => onRotatePage(activePage.id)}
                    className="p-2.5 rounded-full bg-slate-900/80 backdrop-blur text-slate-200 hover:text-white border border-white/10 shadow-lg active:scale-95 transition"
                    title="Girar 90°"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="absolute bottom-2 px-3 py-1 rounded-full glass-panel text-[11px] font-mono-numbers text-slate-300">
                  Página {selectedPageIndex + 1} de {pages.length}
                </div>
              </div>
            ) : null}
          </div>

          {/* ====================================================================
              MÓDULO 2: CARRUSEL HORIZONTAL Y BOTÓN VERDE A LA DERECHA
              Contenedor con scroll horizontal de izquierda a derecha [Toma 1] [Toma 2]...
              Y el botón verde [+ 📷 Tomar otra página] ESTRICTAMENTE AL FINAL DERECHO
              ==================================================================== */}
          <div className="gallery-carousel bg-[#0c0f14] border-t border-white/10">
            {/* 1. Tomas ya capturadas de izquierda a derecha con papelera flotante individual */}
            {pages.map((p, idx) => (
              <div
                key={p.id}
                className={`gallery-card ${selectedPageIndex === idx ? 'selected' : ''}`}
                onClick={() => setSelectedPageIndex(idx)}
              >
                <img
                  src={p.warpedDataUrl}
                  alt={`Toma ${idx + 1}`}
                  className="w-full h-full object-cover"
                />

                {/* Botón flotante papelera roja (🗑️) con fondo circular para eliminar tomas individuales */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic(25);
                    onDeletePage(p.id);
                    if (selectedPageIndex >= pages.length - 1) {
                      setSelectedPageIndex(Math.max(0, pages.length - 2));
                    }
                  }}
                  className="gallery-delete-btn"
                  title="Eliminar esta toma"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Contador de toma */}
                <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[10px] text-center font-bold font-mono-numbers text-white py-0.5">
                  Toma {idx + 1}
                </span>
              </div>
            ))}

            {/* 2. BOTÓN VERDE [+ 📷 Tomar otra página] ESTRICTAMENTE A LA DERECHA DE TODAS LAS TOMAS */}
            {pages.length < maxPages && (
              <button
                type="button"
                onClick={onAddMorePages}
                className="gallery-add-card"
                title="Tomar otra página"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/25 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-emerald-300" />
                </div>
                <span className="text-[11px] font-black text-center leading-tight">
                  + 📷 Tomar otra página
                </span>
              </button>
            )}
          </div>

          {/* ====================================================================
              MÓDULO 2: CASILLAS SEPARADAS (FOTOGRAFÍA Y FIRMA TÁCTIL INDEPENDIENTES)
              Casilla Principal: [ ] Generar constancia criptográfica y Hash (SHA-256)
              Sub-casilla A: [ ] Incluir Fotografía Frontal del Otorgante
              Sub-casilla B: [ ] Incluir Firma Electrónica Táctil
              ==================================================================== */}
          <div className="px-safe py-3 bg-[#0e131d] border-t border-white/5 flex flex-col gap-2.5">
            {/* Casilla Principal */}
            <label className="touch-checkbox-label">
              <input
                type="checkbox"
                checked={includeMetadata}
                onChange={(e) => handleToggleMetadata(e.target.checked)}
                className="touch-checkbox"
              />
              <div className="flex-1 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Generar constancia criptográfica y Hash (SHA-256)</span>
                </span>
              </div>
            </label>

            {/* Sub-casillas independientes (Desplegadas al marcar Casilla Principal) */}
            {includeMetadata && (
              <div className="pl-6 flex flex-col gap-2 animate-fadeIn">
                {/* Sub-casilla A: Fotografía Frontal */}
                <label className="touch-checkbox-label bg-emerald-950/20 border-emerald-500/30 text-emerald-200">
                  <input
                    type="checkbox"
                    checked={includePhoto}
                    onChange={(e) => handleTogglePhoto(e.target.checked)}
                    className="touch-checkbox"
                  />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <Camera className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Incluir Fotografía Frontal del Otorgante</span>
                    </span>
                    {appearanceData?.selfieDataUrl && (
                      <span className="text-[10px] bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                        ✓ Foto Lista
                      </span>
                    )}
                  </div>
                </label>

                {/* Sub-casilla B: Firma Electrónica Táctil */}
                <label className="touch-checkbox-label bg-emerald-950/20 border-emerald-500/30 text-emerald-200">
                  <input
                    type="checkbox"
                    checked={includeSignature}
                    onChange={(e) => handleToggleSignature(e.target.checked)}
                    className="touch-checkbox"
                  />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <UserCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                      <span>Incluir Firma Electrónica Táctil</span>
                    </span>
                    {appearanceData?.signatureDataUrl && (
                      <span className="text-[10px] bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full font-black">
                        ✓ Firma Lista
                      </span>
                    )}
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* ====================================================================
              MÓDULO 4: MENÚ DE ENVÍO MULTICANAL (WHATSAPP, CORREO, DESCARGA)
              ==================================================================== */}
          <div className="pb-safe px-safe pt-3 pb-4 bg-[#0a0f18] border-t border-white/10 flex flex-col gap-2 z-20">
            {!showDispatchMenu ? (
              <button
                type="button"
                onClick={() => setShowDispatchMenu(true)}
                disabled={isGenerating || pages.length === 0}
                className="btn-touch-primary w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Compilando documento...</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-5 h-5 stroke-[2.2]" />
                    <span>Guardar / Enviar</span>
                  </>
                )}
              </button>
            ) : (
              /* MENÚ MULTICANAL ABIERTO CON 3 BOTONES TÁCTILES GRANDES */
              <div className="flex flex-col gap-2.5 animate-scaleUp">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                  <span className="font-bold text-white">Método de Envío:</span>
                  <button
                    type="button"
                    onClick={() => setShowDispatchMenu(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>

                {/* Opción 1: WhatsApp */}
                <button
                  type="button"
                  onClick={() => handleExecuteDispatch('whatsapp')}
                  className="btn-touch-action w-full bg-[#128c7e] hover:bg-[#075e54] text-white font-bold flex items-center justify-center gap-2.5 shadow-md"
                >
                  <Send className="w-5 h-5 text-emerald-200" />
                  <span>📱 Compartir por WhatsApp</span>
                </button>

                {/* Opción 2: Correo Electrónico */}
                <button
                  type="button"
                  onClick={() => handleExecuteDispatch('email')}
                  className="btn-touch-action w-full bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center gap-2.5 border border-white/10"
                >
                  <Mail className="w-5 h-5 text-cyan-400" />
                  <span>✉️ Enviar por Correo Electrónico</span>
                </button>

                {/* Opción 3: Descargar en este Teléfono */}
                <button
                  type="button"
                  onClick={() => handleExecuteDispatch('download')}
                  className="btn-touch-action w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/20"
                >
                  <Download className="w-5 h-5 stroke-[2.5]" />
                  <span>💾 Descargar en este Teléfono</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* MODAL DE COMPARECENCIA DIGITAL (PASO A: FOTO, PASO B: FIRMA) */}
      {isAppearanceModalOpen && (
        <AppearanceModal
          mode={getAppearanceMode()}
          onClose={() => {
            setIsAppearanceModalOpen(false);
            if (!appearanceData?.selfieDataUrl) {
              setIncludePhoto(false);
            }
            if (!appearanceData?.signatureDataUrl) {
              setIncludeSignature(false);
            }
          }}
          onConfirm={(data) => {
            setAppearanceData((prev) => ({
              selfieDataUrl: data.selfieDataUrl || prev?.selfieDataUrl || '',
              signatureDataUrl: data.signatureDataUrl || prev?.signatureDataUrl || '',
              grantorName: data.grantorName || prev?.grantorName,
            }));
            setIsAppearanceModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
