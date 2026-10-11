// src/components/PerspectiveEditor.tsx
// Editor interactivo de perspectiva con 4 vértices táctiles arrastrables,
// lupa de precisión (magnifying loupe), transformación homográfica y filtros de imagen.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  RotateCw,
  Sliders,
  Check,
  X,
  Plus,
  RefreshCw,
  Sparkles,
  SunMedium,
  Palette,
  FileCheck,
  Maximize2,
} from 'lucide-react';
import { Quad, Point, ScanFilter, ScannedPage } from '../types';
import { warpPerspective, applyImageFilter } from '../utils/cvEngine';
import { triggerHaptic } from '../utils/audioFeedback';

interface PerspectiveEditorProps {
  capturedImage: {
    dataUrl: string;
    width: number;
    height: number;
    initialQuad: Quad;
  };
  preferredFilter: ScanFilter;
  onSavePage: (page: ScannedPage, continueScanning: boolean) => void;
  onCancel: () => void;
  currentPageCount: number;
  maxPages: number;
}

export const PerspectiveEditor: React.FC<PerspectiveEditorProps> = ({
  capturedImage,
  preferredFilter,
  onSavePage,
  onCancel,
  currentPageCount,
  maxPages,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 4 vértices normalizados (0 a 1)
  const [corners, setCorners] = useState<Quad>(capturedImage.initialQuad);
  const [selectedFilter, setSelectedFilter] = useState<ScanFilter>(preferredFilter);
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [activeHandleIndex, setActiveHandleIndex] = useState<number | null>(null);
  const [loupePoint, setLoupePoint] = useState<Point | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);
  const [showPreviewMode, setShowPreviewMode] = useState<boolean>(false);

  // Dimensiones del contenedor y escala
  const [imageBounds, setImageBounds] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  // Calcular la posición renderizada de la imagen en pantalla
  const updateImageBounds = useCallback(() => {
    if (!containerRef.current || !imageRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const naturalW = capturedImage.width;
    const naturalH = capturedImage.height;

    const imgAspect = naturalW / naturalH;
    const containerAspect = container.width / container.height;

    let renderW = container.width;
    let renderH = container.height;
    let offsetX = 0;
    let offsetY = 0;

    if (imgAspect > containerAspect) {
      renderH = container.width / imgAspect;
      offsetY = (container.height - renderH) / 2;
    } else {
      renderW = container.height * imgAspect;
      offsetX = (container.width - renderW) / 2;
    }

    setImageBounds({
      x: offsetX,
      y: offsetY,
      width: renderW,
      height: renderH,
    });
  }, [capturedImage.width, capturedImage.height]);

  useEffect(() => {
    updateImageBounds();
    window.addEventListener('resize', updateImageBounds);
    return () => window.removeEventListener('resize', updateImageBounds);
  }, [updateImageBounds]);

  // Manejo de arrastre de vértices (Touch & Mouse)
  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    setActiveHandleIndex(index);
    triggerHaptic(25);
    updateLoupe(index);
  };

  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    e.preventDefault();
    setActiveHandleIndex(index);
    triggerHaptic(25);
    updateLoupe(index);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeHandleIndex === null || !containerRef.current) return;
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const touchX = e.clientX - rect.left;
    const touchY = e.clientY - rect.top;

    // Convertir coordenadas de pantalla a coordenadas normalizadas [0..1] relativas a la imagen
    const normX = Math.max(0, Math.min(1, (touchX - imageBounds.x) / imageBounds.width));
    const normY = Math.max(0, Math.min(1, (touchY - imageBounds.y) / imageBounds.height));

    const updated = [...corners] as Quad;
    updated[activeHandleIndex] = { x: normX, y: normY };
    setCorners(updated);

    // Actualizar lupa de aumento
    setLoupePoint({ x: touchX, y: touchY });
    renderLoupe(normX, normY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (activeHandleIndex === null || !containerRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;

    const rect = containerRef.current.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    const normX = Math.max(0, Math.min(1, (touchX - imageBounds.x) / imageBounds.width));
    const normY = Math.max(0, Math.min(1, (touchY - imageBounds.y) / imageBounds.height));

    const updated = [...corners] as Quad;
    updated[activeHandleIndex] = { x: normX, y: normY };
    setCorners(updated);

    setLoupePoint({ x: touchX, y: touchY });
    renderLoupe(normX, normY);
  };

  const handlePointerUp = () => {
    setActiveHandleIndex(null);
    setLoupePoint(null);
  };

  // Renderizar lupa de aumento sobre la esquina arrastrada
  const updateLoupe = (index: number) => {
    const pt = corners[index];
    const px = imageBounds.x + pt.x * imageBounds.width;
    const py = imageBounds.y + pt.y * imageBounds.height;
    setLoupePoint({ x: px, y: py });
    renderLoupe(pt.x, pt.y);
  };

  const renderLoupe = (normX: number, normY: number) => {
    const canvas = loupeCanvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sourceX = normX * img.naturalWidth;
    const sourceY = normY * img.naturalHeight;
    const zoomSize = 70; // Área de muestreo en píxeles

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      img,
      sourceX - zoomSize / 2,
      sourceY - zoomSize / 2,
      zoomSize,
      zoomSize,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // Dibujar cruz reticular de precisión en la lupa
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  };

  // Restablecer esquinas a los bordes rectangulares
  const handleResetCorners = () => {
    setCorners([
      { x: 0.05, y: 0.05 },
      { x: 0.95, y: 0.05 },
      { x: 0.95, y: 0.95 },
      { x: 0.05, y: 0.95 },
    ]);
    triggerHaptic(30);
  };

  // Ejecuta la transformación homográfica y aplica el filtro seleccionado
  const generateProcessedPage = async (): Promise<ScannedPage> => {
    setIsProcessing(true);
    try {
      // Cargar la imagen fuente de forma asíncrona garantizando dimensiones reales completas
      const sourceImg = new Image();
      sourceImg.crossOrigin = 'anonymous';
      sourceImg.src = capturedImage.dataUrl;

      await new Promise<void>((resolve, reject) => {
        if (sourceImg.complete && (sourceImg.naturalWidth > 0 || sourceImg.width > 0)) {
          resolve();
        } else {
          sourceImg.onload = () => resolve();
          sourceImg.onerror = () => reject(new Error('Error cargando fotograma fuente'));
        }
      });

      const fullW = sourceImg.naturalWidth || capturedImage.width || 1280;
      const fullH = sourceImg.naturalHeight || capturedImage.height || 720;

      // Escalar esquinas normalizadas [0..1] a píxeles absolutos reales de la imagen
      const absCorners: Quad = [
        { x: corners[0].x * fullW, y: corners[0].y * fullH },
        { x: corners[1].x * fullW, y: corners[1].y * fullH },
        { x: corners[2].x * fullW, y: corners[2].y * fullH },
        { x: corners[3].x * fullW, y: corners[3].y * fullH },
      ];

      // 1. Warp perspective homográfico con sujeción de coordenadas
      const warpedBase = await warpPerspective(sourceImg, absCorners);

      // 2. Aplicar filtro visual
      const filteredResult = await applyImageFilter(warpedBase, selectedFilter);

      const newPage: ScannedPage = {
        id: 'page_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        originalDataUrl: capturedImage.dataUrl,
        warpedDataUrl: filteredResult,
        corners,
        filter: selectedFilter,
        timestamp: Date.now(),
        width: fullW,
        height: fullH,
        rotation: rotationAngle,
      };

      return newPage;
    } finally {
      setIsProcessing(false);
    }
  };

  // Previsualizar resultado aplanado
  const handleTogglePreview = async () => {
    if (!showPreviewMode) {
      const page = await generateProcessedPage();
      setProcessedPreview(page.warpedDataUrl);
      setShowPreviewMode(true);
    } else {
      setShowPreviewMode(false);
    }
  };

  // Confirmar y guardar página
  const handleConfirmSave = async (continueScanning: boolean) => {
    triggerHaptic(40);
    const page = await generateProcessedPage();
    onSavePage(page, continueScanning);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0a0f18] flex flex-col select-none touch-none app-viewport"
      style={{ height: '100dvh', minHeight: '-webkit-fill-available' }}
    >
      {/* BARRA SUPERIOR */}
      <div className="pt-safe px-safe py-3 flex items-center justify-between border-b border-white/10 glass-panel z-20">
        <button
          onClick={onCancel}
          className="p-2 rounded-full text-slate-400 hover:text-white transition"
          title="Descartar captura"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h2 className="text-sm font-bold text-white tracking-wide">Ajuste Fino de Perspectiva</h2>
          <p className="text-[11px] text-slate-400">Marco Folio / Oficio con lupa táctil</p>
        </div>

        <button
          onClick={handleResetCorners}
          className="p-2 rounded-full text-slate-400 hover:text-emerald-400 transition"
          title="Restablecer esquinas"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ÁREA CENTRAL DE EDICIÓN Y CROPPING */}
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerUp}
        className="relative flex-1 w-full h-full overflow-hidden bg-black flex items-center justify-center touch-none"
      >
        {/* Imagen congelada capturada */}
        <img
          ref={imageRef}
          src={capturedImage.dataUrl}
          alt="Captura"
          onLoad={updateImageBounds}
          className={`max-w-full max-h-full object-contain pointer-events-none transition-opacity duration-200 ${
            showPreviewMode ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* Previsualización aplanada si está activa */}
        {showPreviewMode && processedPreview && (
          <div className="absolute inset-0 flex items-center justify-center p-4 z-10 bg-black/90 animate-fadeIn">
            <img
              src={processedPreview}
              alt="Vista previa aplanada"
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg border border-white/20"
            />
          </div>
        )}

        {/* POLÍGONO Y GUÍAS DE ESQUINAS */}
        {!showPreviewMode && imageBounds.width > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            {/* Máscara oscura semitransparente fuera del documento */}
            <defs>
              <mask id="docMask">
                <rect width="100%" height="100%" fill="white" />
                <polygon
                  points={corners
                    .map(
                      (c) =>
                        `${imageBounds.x + c.x * imageBounds.width},${
                          imageBounds.y + c.y * imageBounds.height
                        }`
                    )
                    .join(' ')}
                  fill="black"
                />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#docMask)" />

            {/* Borde del documento */}
            <polygon
              points={corners
                .map(
                  (c) =>
                    `${imageBounds.x + c.x * imageBounds.width},${
                      imageBounds.y + c.y * imageBounds.height
                    }`
                )
                .join(' ')}
              fill="rgba(16, 185, 129, 0.15)"
              stroke="#10b981"
              strokeWidth="2.5"
            />

            {/* Líneas guía cuadriculadas sutiles dentro del documento */}
            <line
              x1={(imageBounds.x + corners[0].x * imageBounds.width + imageBounds.x + corners[1].x * imageBounds.width) / 2}
              y1={(imageBounds.y + corners[0].y * imageBounds.height + imageBounds.y + corners[1].y * imageBounds.height) / 2}
              x2={(imageBounds.x + corners[3].x * imageBounds.width + imageBounds.x + corners[2].x * imageBounds.width) / 2}
              y2={(imageBounds.y + corners[3].y * imageBounds.height + imageBounds.y + corners[2].y * imageBounds.height) / 2}
              stroke="rgba(16, 185, 129, 0.4)"
              strokeDasharray="4 4"
            />
            <line
              x1={(imageBounds.x + corners[0].x * imageBounds.width + imageBounds.x + corners[3].x * imageBounds.width) / 2}
              y1={(imageBounds.y + corners[0].y * imageBounds.height + imageBounds.y + corners[3].y * imageBounds.height) / 2}
              x2={(imageBounds.x + corners[1].x * imageBounds.width + imageBounds.x + corners[2].x * imageBounds.width) / 2}
              y2={(imageBounds.y + corners[1].y * imageBounds.height + imageBounds.y + corners[2].y * imageBounds.height) / 2}
              stroke="rgba(16, 185, 129, 0.4)"
              strokeDasharray="4 4"
            />
          </svg>
        )}

        {/* 4 PUNTOS TÁCTILES ARRASTRABLES (HANDLES) */}
        {!showPreviewMode &&
          imageBounds.width > 0 &&
          corners.map((c, idx) => {
            const posX = imageBounds.x + c.x * imageBounds.width;
            const posY = imageBounds.y + c.y * imageBounds.height;
            const isDragging = activeHandleIndex === idx;

            return (
              <div
                key={idx}
                onPointerDown={(e) => handlePointerDown(idx, e)}
                onTouchStart={(e) => handleTouchStart(idx, e)}
                style={{
                  transform: `translate3d(${posX - 24}px, ${posY - 24}px, 0)`,
                }}
                className={`absolute top-0 left-0 w-12 h-12 flex items-center justify-center cursor-pointer z-30 touch-none ${
                  isDragging ? 'scale-125' : ''
                }`}
              >
                {/* Anillo táctil exterior transparente para mayor diana de toque */}
                <div className="w-8 h-8 rounded-full bg-emerald-400/30 flex items-center justify-center animate-pulse">
                  {/* Punto central sólido */}
                  <div className="w-4 h-4 rounded-full bg-emerald-400 border-2 border-white shadow-lg" />
                </div>
              </div>
            );
          })}

        {/* LUPA DE AUMENTO (MAGNIFYING LOUPE) FLOTANTE */}
        {activeHandleIndex !== null && loupePoint && (
          <div
            style={{
              left: Math.max(16, Math.min(window.innerWidth - 116, loupePoint.x - 50)),
              top: Math.max(70, loupePoint.y - 120),
            }}
            className="absolute z-40 pointer-events-none w-24 h-24 rounded-full overflow-hidden border-3 border-emerald-400 shadow-2xl bg-black ring-4 ring-black/50 transition-transform"
          >
            <canvas ref={loupeCanvasRef} width={96} height={96} className="w-full h-full" />
          </div>
        )}
      </div>

      {/* SELECTOR DE FILTRO DE IMAGEN PREFERIDO */}
      <div className="px-safe py-2 glass-panel border-t border-white/10 flex items-center justify-around z-20">
        <button
          onClick={() => setSelectedFilter('color')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
            selectedFilter === 'color'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          Color Original
        </button>

        <button
          onClick={() => setSelectedFilter('grayscale')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
            selectedFilter === 'grayscale'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <SunMedium className="w-3.5 h-3.5" />
          Escala de Grises
        </button>

        <button
          onClick={() => setSelectedFilter('binary')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
            selectedFilter === 'binary'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Binarización adaptativa Bradley-Roth para texto nítido"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          B/N Contraste
        </button>
      </div>

      {/* BARRA INFERIOR DE ACCIONES */}
      <div className="pb-safe px-safe pt-2 bg-[#0c0f14] border-t border-white/5 flex items-center justify-between gap-3 z-20">
        {/* Botón de alternar previsualización aplanada */}
        <button
          onClick={handleTogglePreview}
          disabled={isProcessing}
          className="py-3 px-3.5 rounded-xl glass-panel text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5 active:scale-95"
        >
          <Maximize2 className="w-4 h-4 text-emerald-400" />
          <span>{showPreviewMode ? 'Editar' : 'Vista Previa'}</span>
        </button>

        {/* Botón: Añadir otra página (si páginas < 10) */}
        {currentPageCount + 1 < maxPages && (
          <button
            onClick={() => handleConfirmSave(true)}
            disabled={isProcessing}
            className="flex-1 py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition border border-slate-700 flex items-center justify-center gap-1.5 active:scale-95 shadow-md"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Añadir Otra ({currentPageCount + 1}/{maxPages})</span>
          </button>
        )}

        {/* Botón de avance con el texto exacto: Continuar */}
        <button
          onClick={() => handleConfirmSave(false)}
          disabled={isProcessing}
          className="flex-1 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs tracking-wide transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 active:scale-95"
        >
          <Check className="w-4 h-4" />
          <span>{isProcessing ? 'Procesando...' : 'Continuar'}</span>
        </button>
      </div>
    </div>
  );
};
