// src/components/DocumentReviewModal.tsx
// Resumen del documento multi-página, reordenamiento, compilación de PDF y compartir nativo.

import React, { useState } from 'react';
import {
  Share2,
  Download,
  Trash2,
  RotateCw,
  Plus,
  ArrowLeft,
  FileCheck2,
  CheckCircle,
  Eye,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { ScannedPage } from '../types';
import { shareOrDownloadPdf, generatePdfBlob, downloadBlobDirectly } from '../utils/pdfGenerator';
import { triggerHaptic } from '../utils/audioFeedback';

interface DocumentReviewModalProps {
  pages: ScannedPage[];
  maxPages: number;
  onClose: () => void;
  onAddMorePages: () => void;
  onDeletePage: (id: string) => void;
  onRotatePage: (id: string) => void;
  onCompleteScan: () => void;
}

export const DocumentReviewModal: React.FC<DocumentReviewModalProps> = ({
  pages,
  maxPages,
  onClose,
  onAddMorePages,
  onDeletePage,
  onRotatePage,
  onCompleteScan,
}) => {
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [shareSuccessMessage, setShareSuccessMessage] = useState<string | null>(null);

  const activePage = pages[selectedPageIndex] || pages[0];

  const handleShare = async () => {
    if (pages.length === 0 || isGenerating) return;

    setIsGenerating(true);
    triggerHaptic(40);

    try {
      const result = await shareOrDownloadPdf(pages);
      if (result.sharedViaNativeSheet) {
        setShareSuccessMessage('¡Documento enviado mediante la hoja nativa!');
      } else {
        setShareSuccessMessage(`¡Descargado exitosamente como ${result.fileName}!`);
      }
      onCompleteScan();
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Error al compartir PDF:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0f18] flex flex-col select-none touch-none">
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
          <h2 className="text-sm font-bold text-white tracking-wide">Revisar Documento</h2>
          <p className="text-[11px] text-emerald-400 font-mono-numbers">
            {pages.length} de {maxPages} páginas
          </p>
        </div>

        {pages.length < maxPages ? (
          <button
            onClick={onAddMorePages}
            className="p-2 rounded-xl bg-slate-800 text-emerald-400 hover:text-white text-xs font-semibold flex items-center gap-1 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Añadir</span>
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* VISOR PRINCIPAL DE PÁGINA SELECCIONADA */}
      <div className="flex-1 w-full relative overflow-hidden bg-black/60 flex items-center justify-center p-4">
        {activePage ? (
          <div className="relative max-w-md w-full h-full flex flex-col items-center justify-center">
            <img
              src={activePage.warpedDataUrl}
              alt={`Página ${selectedPageIndex + 1}`}
              className="max-h-[62vh] max-w-full object-contain rounded-xl shadow-2xl border border-white/10"
            />

            {/* Controles sobre la página actual */}
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
                  title="Eliminar esta página"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Indicador de página */}
            <div className="absolute bottom-2 px-3 py-1 rounded-full glass-panel text-[11px] font-mono-numbers text-slate-300">
              Página {selectedPageIndex + 1} de {pages.length}
            </div>
          </div>
        ) : (
          <div className="text-center text-slate-500">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No hay páginas escaneadas.</p>
          </div>
        )}
      </div>

      {/* CARRUSEL DE MINIATURAS INFERIOR */}
      <div className="px-safe py-2 bg-[#0c0f14] border-t border-white/5 overflow-x-auto flex items-center gap-3">
        {pages.map((p, idx) => (
          <button
            key={p.id}
            onClick={() => setSelectedPageIndex(idx)}
            className={`relative flex-shrink-0 w-14 h-18 rounded-lg overflow-hidden border-2 transition ${
              selectedPageIndex === idx
                ? 'border-emerald-400 ring-2 ring-emerald-400/30 scale-105'
                : 'border-slate-800 opacity-60 hover:opacity-100'
            }`}
          >
            <img src={p.warpedDataUrl} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" />
            <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center font-mono-numbers text-white py-0.5">
              {idx + 1}
            </span>
          </button>
        ))}

        {/* Botón rápido para agregar más páginas */}
        {pages.length < maxPages && (
          <button
            onClick={onAddMorePages}
            className="flex-shrink-0 w-14 h-18 rounded-lg border-2 border-dashed border-slate-700 hover:border-emerald-400/50 flex flex-col items-center justify-center text-slate-500 hover:text-emerald-400 transition"
          >
            <Plus className="w-5 h-5 mb-1" />
            <span className="text-[9px] font-bold">Añadir</span>
          </button>
        )}
      </div>

      {/* MENSAJE DE ÉXITO O TOAST */}
      {shareSuccessMessage && (
        <div className="mx-4 my-1 p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{shareSuccessMessage}</span>
        </div>
      )}

      {/* BARRA INFERIOR DE ACCIÓN: COMPARTIR Y DESCARGAR */}
      <div className="pb-safe px-safe pt-2 bg-[#0a0f18] border-t border-white/10 flex flex-col gap-2 z-20">
        <button
          onClick={handleShare}
          disabled={isGenerating || pages.length === 0}
          className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 active:scale-98"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Compilando PDF...</span>
            </>
          ) : (
            <>
              <Share2 className="w-5 h-5" />
              <span>Enviar / Compartir PDF ({pages.length})</span>
            </>
          )}
        </button>

        <button
          onClick={async () => {
            if (pages.length === 0 || isGenerating) return;
            setIsGenerating(true);
            try {
              const { blob } = await generatePdfBlob(pages);
              downloadBlobDirectly(blob, 'RHDocScan_Documento.pdf');
              setShareSuccessMessage('¡PDF descargado en el almacenamiento local!');
              onCompleteScan();
            } finally {
              setIsGenerating(false);
            }
          }}
          disabled={isGenerating || pages.length === 0}
          className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-xs transition border border-white/10 flex items-center justify-center gap-2 active:scale-98"
        >
          <Download className="w-4 h-4 text-emerald-400" />
          <span>Descargar PDF en el teléfono</span>
        </button>
      </div>
    </div>
  );
};
