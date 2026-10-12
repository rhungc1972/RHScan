// src/components/DocumentReviewModal.tsx
// Galería de Páginas Acumuladas, tarjeta "[+ 📷 Tomar otra página]",
// botón "Guardar / Enviar", casilla de metadatos SHA-256 y botón "💬 Comentarios y Sugerencias".

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
} from 'lucide-react';
import { ScannedPage, ExportFormat } from '../types';
import { shareOrDownloadDocument } from '../utils/pdfGenerator';
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
  const [includeMetadata, setIncludeMetadata] = useState<boolean>(false);
  const [postSendSuccess, setPostSendSuccess] = useState<boolean>(false);
  const [successInfo, setSuccessInfo] = useState<{ fileName: string; format: string } | null>(null);

  const activeFormat: ExportFormat = currentFormat || exportFormat || 'pdf';
  const activePage = pages[selectedPageIndex] || pages[0];

  const handleExecuteSaveAndSend = async () => {
    if (pages.length === 0 || isGenerating) return;

    setIsGenerating(true);
    triggerHaptic(40);

    try {
      const result = await shareOrDownloadDocument(pages, activeFormat, includeMetadata);
      setSuccessInfo({
        fileName: result.fileName,
        format: (result.format || activeFormat).toUpperCase(),
      });
      setPostSendSuccess(true);
      onCompleteScan();
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Error al despachar documento:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="w-full h-full bg-[#0a0f18] flex flex-col select-none touch-none app-viewport"
      style={{ height: '100dvh', minHeight: '-webkit-fill-available' }}
    >
      {/* BARRA SUPERIOR */}
      <div className="pt-safe px-safe py-3 flex items-center justify-between border-b border-white/10 glass-panel z-20">
        <button
          onClick={onClose}
          className="p-2 rounded-full text-slate-400 hover:text-white transition flex items-center gap-1 text-xs"
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

        <div className="w-10" />
      </div>

      {/* PANTALLA POST-ENVÍO CONFIRMADA */}
      {postSendSuccess && successInfo ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 animate-scaleUp">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-xl shadow-emerald-500/20">
            <CheckCircle className="w-12 h-12" />
          </div>

          <div className="space-y-1">
            <h3 className="text-xl font-bold text-white">¡Documento Despachado!</h3>
            <p className="text-xs text-slate-300 max-w-xs">
              Tu archivo <strong className="text-emerald-400">{successInfo.fileName}</strong> ha sido generado y compartido exitosamente.
            </p>
          </div>

          {includeMetadata && (
            <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 max-w-xs text-left">
              <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <span>Acta de Certificación y Hash SHA-256 adjuntados con éxito.</span>
            </div>
          )}

          {/* Botón Prominente: Observaciones y Sugerencias */}
          <div className="w-full max-w-xs pt-4 space-y-3">
            <button
              onClick={onOpenFeedback}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-slate-950 font-bold text-sm tracking-wide transition shadow-lg shadow-emerald-500/25 active:scale-98 flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              <span>💬 Observaciones y Sugerencias</span>
            </button>

            <button
              onClick={onClose}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
            >
              Nuevo Escaneo
            </button>
          </div>
        </div>
      ) : (
        /* VISTA DE REVISIÓN Y GALERÍA */
        <>
          {/* VISOR PRINCIPAL DE PÁGINA SELECCIONADA */}
          <div className="flex-1 w-full relative overflow-hidden bg-black/60 flex items-center justify-center p-4">
            {activePage ? (
              <div className="relative max-w-md w-full h-full flex flex-col items-center justify-center">
                <img
                  src={activePage.warpedDataUrl}
                  alt={`Página ${selectedPageIndex + 1}`}
                  className="max-h-[50vh] max-w-full object-contain rounded-xl shadow-2xl border border-white/10"
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

                  {pages.length > 1 && (
                    <button
                      onClick={() => {
                        onDeletePage(activePage.id);
                        if (selectedPageIndex >= pages.length - 1) {
                          setSelectedPageIndex(Math.max(0, pages.length - 2));
                        }
                      }}
                      className="p-2.5 rounded-full bg-red-950/80 backdrop-blur text-red-300 hover:text-red-100 border border-red-500/20 shadow-lg active:scale-95 transition"
                      title="Eliminar página"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="absolute bottom-2 px-3 py-1 rounded-full glass-panel text-[11px] font-mono-numbers text-slate-300">
                  Página {selectedPageIndex + 1} de {pages.length}
                </div>
              </div>
            ) : null}
          </div>

          {/* CARRUSEL DE MINIATURAS + TARJETA [+ 📷 Tomar otra página] */}
          <div className="px-safe py-2.5 bg-[#0c0f14] border-t border-white/5 overflow-x-auto flex items-center gap-3">
            {/* Tarjeta Destacada: [+ 📷 Tomar otra página] */}
            {pages.length < maxPages && (
              <button
                onClick={onAddMorePages}
                className="flex-shrink-0 w-24 h-20 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border-2 border-dashed border-emerald-400/60 hover:border-emerald-400 flex flex-col items-center justify-center text-emerald-300 p-2 transition active:scale-95 shadow-md"
              >
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center mb-1">
                  <Camera className="w-4 h-4 text-emerald-300" />
                </div>
                <span className="text-[10px] font-bold text-center leading-tight">
                  + 📷 Tomar otra página
                </span>
              </button>
            )}

            {/* Miniaturas de las páginas ya escaneadas */}
            {pages.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => setSelectedPageIndex(idx)}
                className={`relative flex-shrink-0 w-16 h-20 rounded-xl overflow-hidden border-2 transition ${
                  selectedPageIndex === idx
                    ? 'border-emerald-400 ring-2 ring-emerald-400/30 scale-105'
                    : 'border-slate-800 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={p.warpedDataUrl} alt={`Página ${idx + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] text-center font-mono-numbers text-white py-0.5">
                  {idx + 1}
                </span>
              </button>
            ))}
          </div>

          {/* CASILLA DE VERIFICACIÓN DE METADATOS Y HASH SHA-256 */}
          <div className="px-safe py-2.5 bg-[#0e131d] border-t border-white/5 flex items-center justify-between">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-200 select-none">
              <input
                type="checkbox"
                checked={includeMetadata}
                onChange={(e) => setIncludeMetadata(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer accent-emerald-500"
              />
              <span className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                Generar archivo de metadatos y Hash (SHA-256)
              </span>
            </label>
          </div>

          {/* BARRA INFERIOR DE ACCIÓN ERGONÓMICA: GUARDAR / ENVIAR */}
          <div className="pb-safe px-safe pt-3 pb-4 bg-[#0a0f18] border-t border-white/10 flex flex-col gap-2 z-20">
            <button
              onClick={handleExecuteSaveAndSend}
              disabled={isGenerating || pages.length === 0}
              className="btn-touch-primary w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base min-h-[52px] py-[14px] px-[28px] rounded-2xl shadow-xl shadow-emerald-500/30 active:scale-98 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Procesando {activeFormat.toUpperCase()}...</span>
                </>
              ) : (
                <>
                  <Share2 className="w-5 h-5 stroke-[2.2]" />
                  <span>Guardar / Enviar</span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
