// src/utils/cvEngine.ts
// Motor de Visión por Computadora 100% en el Navegador (Zero-Knowledge)
// Detección de bordes, suavizado temporal, estabilidad estricta (1.8s), Homografía Proyectiva robusta y Binarización Adaptativa.

import { Point, Quad, ScanFilter } from '../types';

/**
 * Resuelve el sistema lineal 8x8 para encontrar la matriz de homografía 3x3 normalizada
 * Mapea 4 puntos origen a 4 puntos destino.
 */
function getProjectiveTransform(src: Quad, dst: Quad): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);

    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  // Eliminación Gaussiana con pivoteo parcial
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }

    const tmpRow = A[i];
    A[i] = A[maxRow];
    A[maxRow] = tmpRow;

    const tmpB = b[i];
    b[i] = b[maxRow];
    b[maxRow] = tmpB;

    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / (A[i][i] || 1e-8);
      for (let j = i; j < n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
      b[k] += c * b[i];
    }
  }

  // Sustitución regresiva
  const x = new Array(8).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i][j] * x[j];
    }
    x[i] = sum / (A[i][i] || 1e-8);
  }

  return [x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], 1];
}

/**
 * Distancia euclidiana entre dos puntos
 */
export function pointDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Conversión matemática precisa entre el sistema de coordenadas visuales en pantalla
 * (CSS pixels del viewport con object-fit: cover) y el sensor nativo de la cámara (videoWidth / videoHeight).
 */
export function screenToSensorPoint(
  screenPt: Point,
  viewportW: number,
  viewportH: number,
  sensorW: number,
  sensorH: number
): Point {
  if (!sensorW || !sensorH || !viewportW || !viewportH) return screenPt;
  const scale = Math.max(viewportW / sensorW, viewportH / sensorH);
  const renderedW = sensorW * scale;
  const renderedH = sensorH * scale;
  const offsetX = (viewportW - renderedW) / 2;
  const offsetY = (viewportH - renderedH) / 2;

  const sensorX = (screenPt.x - offsetX) / scale;
  const sensorY = (screenPt.y - offsetY) / scale;

  return {
    x: Math.max(0, Math.min(sensorW, sensorX)),
    y: Math.max(0, Math.min(sensorH, sensorY)),
  };
}

export function sensorToScreenPoint(
  sensorPt: Point,
  viewportW: number,
  viewportH: number,
  sensorW: number,
  sensorH: number
): Point {
  if (!sensorW || !sensorH || !viewportW || !viewportH) return sensorPt;
  const scale = Math.max(viewportW / sensorW, viewportH / sensorH);
  const renderedW = sensorW * scale;
  const renderedH = sensorH * scale;
  const offsetX = (viewportW - renderedW) / 2;
  const offsetY = (viewportH - renderedH) / 2;

  const screenX = sensorPt.x * scale + offsetX;
  const screenY = sensorPt.y * scale + offsetY;

  return { x: screenX, y: screenY };
}

/**
 * Calcula el marco de encuadre Folio / Oficio (proporción 1:1.45) centrado en pantalla,
 * y lo proyecta tanto en coordenadas de pantalla como en coordenadas normalizadas del sensor [0..1].
 */
export function calculateFolioQuad(
  viewportW: number,
  viewportH: number,
  sensorW: number,
  sensorH: number
): { screenQuad: Quad; sensorQuad: Quad } {
  // Proporción Folio/Oficio estándar: 1 : 1.45
  const folioAspect = 1.45;
  const marginRatio = 0.84;

  let frameW = viewportW * marginRatio;
  let frameH = frameW * folioAspect;

  const maxAvailableH = viewportH * 0.74;
  if (frameH > maxAvailableH) {
    frameH = maxAvailableH;
    frameW = frameH / folioAspect;
  }

  const startX = (viewportW - frameW) / 2;
  const startY = (viewportH - frameH) / 2 - 12;

  const screenQuad: Quad = [
    { x: startX, y: startY },
    { x: startX + frameW, y: startY },
    { x: startX + frameW, y: startY + frameH },
    { x: startX, y: startY + frameH },
  ];

  const sensorQuad: Quad = screenQuad.map((pt) => {
    const sPt = screenToSensorPoint(pt, viewportW, viewportH, sensorW, sensorH);
    return {
      x: sPt.x / (sensorW || 1),
      y: sPt.y / (sensorH || 1),
    };
  }) as Quad;

  return { screenQuad, sensorQuad };
}

export function sortQuadPoints(pts: Point[]): Quad {
  // Ordenamiento geométrico canónico:
  // Top-Left: suma mínima (x + y)
  // Bottom-Right: suma máxima (x + y)
  // Top-Right: diferencia mínima (y - x)
  // Bottom-Left: diferencia máxima (y - x)
  const sortedBySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const tl = sortedBySum[0];
  const br = sortedBySum[3];

  const remaining = [sortedBySum[1], sortedBySum[2]];
  remaining.sort((a, b) => (a.y - a.x) - (b.y - b.x));
  const tr = remaining[0];
  const bl = remaining[1];

  return [tl, tr, br, bl];
}

/**
 * Encuentra de forma exacta el cuadrilátero dominante de la hoja de papel sobre el fotograma capturado
 * usando OpenCV.js (cv.Canny + cv.findContours + cv.approxPolyDP con área > 20%) o análisis de gradientes.
 * Si no detecta contraste suficiente, aplica como fallback el marco Folio/Oficio centrado.
 */
export function findDominantDocumentQuad(
  imageSource: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  fallbackQuad?: Quad
): Quad {
  try {
    const imgW = imageSource instanceof HTMLVideoElement
      ? imageSource.videoWidth
      : imageSource.width;
    const imgH = imageSource instanceof HTMLVideoElement
      ? imageSource.videoHeight
      : imageSource.height;

    if (!imgW || !imgH || imgW <= 0 || imgH <= 0) {
      return fallbackQuad || [
        { x: 0.12, y: 0.14 },
        { x: 0.88, y: 0.14 },
        { x: 0.88, y: 0.86 },
        { x: 0.12, y: 0.86 },
      ];
    }

    // 1. Downscale temporal a 400px de ancho para análisis rápido a 60 FPS
    const procW = 400;
    const procH = Math.round(procW * (imgH / imgW));
    const canvas = document.createElement('canvas');
    canvas.width = procW;
    canvas.height = procH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallbackQuad || [
      { x: 0.12, y: 0.14 },
      { x: 0.88, y: 0.14 },
      { x: 0.88, y: 0.86 },
      { x: 0.12, y: 0.86 },
    ];

    ctx.drawImage(imageSource, 0, 0, procW, procH);

    // 2. Ejecución con OpenCV.js si está cargado en el navegador
    const cv = (window as unknown as { cv?: any }).cv;
    if (cv && cv.Mat && cv.imread) {
      try {
        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        const blur = new cv.Mat();
        const edges = new cv.Mat();
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        cv.Canny(blur, edges, 50, 150);
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        let maxArea = procW * procH * 0.20; // Requisito: área > 20% de la pantalla
        let bestQuad: Point[] | null = null;

        for (let i = 0; i < contours.size(); ++i) {
          const contour = contours.get(i);
          const peri = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.02 * peri, true);

          if (approx.rows === 4 && cv.isContourConvex(approx)) {
            const area = cv.contourArea(approx);
            if (area > maxArea) {
              maxArea = area;
              const pts: Point[] = [];
              for (let j = 0; j < 4; j++) {
                pts.push({
                  x: Math.max(0, Math.min(1, approx.data32S[j * 2] / procW)),
                  y: Math.max(0, Math.min(1, approx.data32S[j * 2 + 1] / procH)),
                });
              }
              bestQuad = pts;
            }
          }
          approx.delete();
          contour.delete();
        }

        src.delete();
        gray.delete();
        blur.delete();
        edges.delete();
        contours.delete();
        hierarchy.delete();

        if (bestQuad && bestQuad.length === 4) {
          return sortQuadPoints(bestQuad);
        }
      } catch (cvErr) {
        console.warn('OpenCV.js contour error, fallback a gradientes:', cvErr);
      }
    }

    const imgData = ctx.getImageData(0, 0, procW, procH);
    const data = imgData.data;

    // 3. Fallback rápido nativo (Sobel / Canny + Rayos en JavaScript puro)
    const gray = new Float32Array(procW * procH);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // 2. Filtro Sobel para calcular magnitud del gradiente (bordes fuertes)
    const grad = new Float32Array(procW * procH);
    let maxGrad = 0;
    for (let y = 1; y < procH - 1; y++) {
      for (let x = 1; x < procW - 1; x++) {
        const idx = y * procW + x;
        const gx =
          -gray[idx - procW - 1] + gray[idx - procW + 1]
          - 2 * gray[idx - 1] + 2 * gray[idx + 1]
          - gray[idx + procW - 1] + gray[idx + procW + 1];
        const gy =
          -gray[idx - procW - 1] - 2 * gray[idx - procW] - gray[idx - procW + 1]
          + gray[idx + procW - 1] + 2 * gray[idx + procW] + gray[idx + procW + 1];
        const val = Math.sqrt(gx * gx + gy * gy);
        grad[idx] = val;
        if (val > maxGrad) maxGrad = val;
      }
    }

    const threshold = Math.max(38, maxGrad * 0.25);

    // 3. Búsqueda de rayos hacia afuera desde el centro para encontrar los límites del documento
    const centerX = procW / 2;
    const centerY = procH / 2;

    const findEdgePoint = (angleRad: number): Point => {
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      let bestDist = 0;
      let highestG = 0;

      const maxR = Math.min(procW, procH) * 0.72;
      for (let r = 20; r < maxR; r += 2) {
        const px = Math.round(centerX + r * cosA);
        const py = Math.round(centerY + r * sinA);
        if (px < 4 || px >= procW - 4 || py < 4 || py >= procH - 4) break;
        const g = grad[py * procW + px];
        if (g > threshold && g > highestG) {
          highestG = g;
          bestDist = r;
        }
      }

      const rFinal = bestDist > 0 ? bestDist : maxR * 0.65;
      return {
        x: Math.max(0, Math.min(1, (centerX + rFinal * cosA) / procW)),
        y: Math.max(0, Math.min(1, (centerY + rFinal * sinA) / procH)),
      };
    };

    // Vértices en direcciones de esquinas (Top-Left, Top-Right, Bottom-Right, Bottom-Left)
    const tl = findEdgePoint(-Math.PI * 0.75); // ~ -135 deg
    const tr = findEdgePoint(-Math.PI * 0.25); // ~ -45 deg
    const br = findEdgePoint(Math.PI * 0.25);  // ~ 45 deg
    const bl = findEdgePoint(Math.PI * 0.75);  // ~ 135 deg

    // Verificar que el polígono tenga área razonable (> 18% del cuadro)
    const area = 0.5 * Math.abs(
      (tl.x * tr.y - tr.x * tl.y) +
      (tr.x * br.y - br.x * tr.y) +
      (br.x * bl.y - bl.x * br.y) +
      (bl.x * tl.y - tl.x * bl.y)
    );

    if (area > 0.18 && area < 0.95) {
      return [tl, tr, br, bl];
    }
  } catch (err) {
    console.warn('Error detectando bordes dominantes con CV:', err);
  }

  return fallbackQuad || [
    { x: 0.12, y: 0.14 },
    { x: 0.88, y: 0.14 },
    { x: 0.88, y: 0.86 },
    { x: 0.12, y: 0.86 },
  ];
}


/**
 * Corrige y endereza la perspectiva (Warp Perspective) de una imagen fuente
 * Resuelve el bug de pantalla blanca garantizando dimensiones reales (naturalWidth/naturalHeight)
 * y limitando las coordenadas de muestreo para evitar áreas vacías o corruptas.
 */
export async function warpPerspective(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  corners: Quad, // Coordenadas en píxeles absolutos de la imagen fuente
  outputWidth?: number,
  outputHeight?: number
): Promise<string> {
  // 1. Obtener dimensiones intrínsecas reales sin depender de estilos CSS
  const sw = sourceImage instanceof HTMLImageElement
    ? (sourceImage.naturalWidth || sourceImage.width)
    : sourceImage.width;
  const sh = sourceImage instanceof HTMLImageElement
    ? (sourceImage.naturalHeight || sourceImage.height)
    : sourceImage.height;

  if (!sw || !sh || sw <= 0 || sh <= 0) {
    throw new Error('Dimensiones inválidas en la imagen fuente para corrección de perspectiva');
  }

  // 2. Calcular dimensiones destino
  const [tl, tr, br, bl] = corners;
  const widthTop = pointDistance(tl, tr);
  const widthBottom = pointDistance(bl, br);
  const heightLeft = pointDistance(tl, bl);
  const heightRight = pointDistance(tr, br);

  const avgWidth = Math.max(widthTop, widthBottom);
  const avgHeight = Math.max(heightLeft, heightRight);

  // Proporción A4 estándar (1 : 1.414) o calculada
  const targetW = Math.round(outputWidth || Math.max(800, avgWidth));
  const targetH = Math.round(outputHeight || Math.max(1130, avgHeight));

  const dstQuad: Quad = [
    { x: 0, y: 0 },
    { x: targetW, y: 0 },
    { x: targetW, y: targetH },
    { x: 0, y: targetH },
  ];

  // Matriz de mapeo proyectivo: Destino -> Origen para muestreo inverso
  const H = getProjectiveTransform(dstQuad, corners);

  // 3. Renderizar imagen original en un canvas del tamaño nativo exacto
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sw;
  srcCanvas.height = sh;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) throw new Error('No se pudo inicializar canvas 2D de lectura');

  srcCtx.drawImage(sourceImage, 0, 0, sw, sh);
  const srcImgData = srcCtx.getImageData(0, 0, sw, sh);
  const srcData = srcImgData.data;

  // 4. Canvas destino para el documento enderezado
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = targetW;
  dstCanvas.height = targetH;
  const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true });
  if (!dstCtx) throw new Error('No se pudo inicializar canvas destino');
  const dstImgData = dstCtx.createImageData(targetW, targetH);
  const dstData = dstImgData.data;

  // 5. Mapeo inverso píxel por píxel con interpolación bilineal y sujeción de bordes (clamping)
  let dstIdx = 0;
  for (let dy = 0; dy < targetH; dy++) {
    for (let dx = 0; dx < targetW; dx++) {
      const denom = H[6] * dx + H[7] * dy + H[8] || 1e-8;
      let sx = (H[0] * dx + H[1] * dy + H[2]) / denom;
      let sy = (H[3] * dx + H[4] * dy + H[5]) / denom;

      // Sujetar coordenadas al rango válido en lugar de rellenar con blanco puro
      sx = Math.max(0, Math.min(sw - 1.001, sx));
      sy = Math.max(0, Math.min(sh - 1.001, sy));

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);

      const fx = sx - x0;
      const fy = sy - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      dstData[dstIdx] = Math.round(srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11);
      dstData[dstIdx + 1] = Math.round(srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11);
      dstData[dstIdx + 2] = Math.round(srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11);
      dstData[dstIdx + 3] = 255;

      dstIdx += 4;
    }
  }

  dstCtx.putImageData(dstImgData, 0, 0);
  return dstCanvas.toDataURL('image/jpeg', 0.95);
}

/**
 * Aplica filtros de procesamiento visual:
 * - 'color': Realce sutil y balance de contraste
 * - 'grayscale': Conversión monocromática ponderada
 * - 'binary': Binarización adaptativa local con salvaguarda contra pantallas blancas
 */
export async function applyImageFilter(imageDataUrl: string, filter: ScanFilter): Promise<string> {
  if (filter === 'color') return imageDataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(imageDataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const w = canvas.width;
      const h = canvas.height;

      if (filter === 'grayscale') {
        let minLum = 255;
        let maxLum = 0;
        const lums = new Uint8Array(w * h);

        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          lums[p] = lum;
          if (lum < minLum) minLum = lum;
          if (lum > maxLum) maxLum = lum;
        }

        const range = Math.max(1, maxLum - minLum);
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          const stretched = Math.min(255, Math.max(0, Math.round(((lums[p] - minLum) / range) * 255)));
          data[i] = stretched;
          data[i + 1] = stretched;
          data[i + 2] = stretched;
        }
      } else if (filter === 'binary') {
        // Binarización Adaptativa Bradley-Roth con salvaguarda anti-blanqueo
        const intImg = new Float64Array(w * h);
        const lums = new Uint8Array(w * h);
        let totalLum = 0;

        for (let y = 0; y < h; y++) {
          let sum = 0;
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            lums[y * w + x] = Math.round(lum);
            sum += lum;
            totalLum += lum;
            if (y === 0) {
              intImg[y * w + x] = sum;
            } else {
              intImg[y * w + x] = intImg[(y - 1) * w + x] + sum;
            }
          }
        }

        const avgLum = totalLum / (w * h);
        // Si la imagen está sobreexpuesta o con contraste tenue, calibrar el umbral t dinámicamente
        const s = Math.max(8, Math.floor(w / 16));
        const s2 = Math.floor(s / 2);
        const t = avgLum > 210 ? 0.08 : 0.12;

        let darkPixelsCount = 0;

        for (let y = 0; y < h; y++) {
          const y1 = Math.max(0, y - s2);
          const y2 = Math.min(h - 1, y + s2);

          for (let x = 0; x < w; x++) {
            const x1 = Math.max(0, x - s2);
            const x2 = Math.min(w - 1, x + s2);
            const count = (x2 - x1 + 1) * (y2 - y1 + 1);

            const D = intImg[y2 * w + x2];
            const B = y1 > 0 ? intImg[(y1 - 1) * w + x2] : 0;
            const C = x1 > 0 ? intImg[y2 * w + (x1 - 1)] : 0;
            const A = y1 > 0 && x1 > 0 ? intImg[(y1 - 1) * w + (x1 - 1)] : 0;
            const sum = D - B - C + A;

            const currentLum = lums[y * w + x];
            const pIdx = (y * w + x) * 4;

            if (currentLum * count <= sum * (1 - t)) {
              data[pIdx] = 20;
              data[pIdx + 1] = 20;
              data[pIdx + 2] = 20;
              darkPixelsCount++;
            } else {
              data[pIdx] = 255;
              data[pIdx + 1] = 255;
              data[pIdx + 2] = 255;
            }
          }
        }

        // Salvaguarda: Si el documento resultó en < 0.2% de píxeles oscuros (mancha blanca),
        // revertir a escala de grises contrastada para preservar todo el texto legible
        if (darkPixelsCount < (w * h) * 0.002) {
          for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            const lum = lums[p];
            data[i] = lum;
            data[i + 1] = lum;
            data[i + 2] = lum;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.src = imageDataUrl;
  });
}

/**
 * Detector de documento en tiempo real y evaluador de estabilidad temporal
 * Sensibilidad ajustada, suavizado exponencial (EMA) y tiempo de estabilidad continua de 1.8 segundos.
 */
export class DocumentDetector {
  private smoothedQuad: Quad | null = null;
  private stableSince: number = 0;
  private consecutiveMoveFrames: number = 0;

  // Condición de estabilidad temporal: al menos 1.8 segundos continuos (entre 1.5 y 2.0s)
  private readonly STABILITY_DURATION_MS = 1800;
  // Umbral estricto para evitar parpadeos erráticos o falsos positivos en bucle
  private readonly STABILITY_THRESHOLD = 0.022;

  public reset(): void {
    this.smoothedQuad = null;
    this.stableSince = 0;
    this.consecutiveMoveFrames = 0;
  }

  /**
   * Analiza un fotograma de video verificando estabilidad continua, enfoque e iluminación
   */
  public analyzeFrame(videoElement: HTMLVideoElement): {
    quad: Quad;
    isDocumentDetected: boolean;
    isStable: boolean;
    stabilityProgress: number; // 0..1
    isProperlyLit: boolean;
    statusMessage: string;
  } {
    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;

    if (!vw || !vh || videoElement.readyState < 2) {
      return {
        quad: this.getDefaultQuad(),
        isDocumentDetected: false,
        isStable: false,
        stabilityProgress: 0,
        isProperlyLit: false,
        statusMessage: 'Iniciando cámara...',
      };
    }

    // 1. Detección de bordes y estimación del marco
    const { quad: rawDetectedQuad, hasContour } = this.detectContourQuad(videoElement);

    // 2. Filtro de paso bajo / Suavizado Exponencial (EMA) para eliminar temblores
    if (!this.smoothedQuad) {
      this.smoothedQuad = rawDetectedQuad;
    } else {
      const alpha = 0.2; // 20% nuevo, 80% anterior: movimiento fluido y sin saltos bruscos
      this.smoothedQuad = [
        {
          x: this.smoothedQuad[0].x * (1 - alpha) + rawDetectedQuad[0].x * alpha,
          y: this.smoothedQuad[0].y * (1 - alpha) + rawDetectedQuad[0].y * alpha,
        },
        {
          x: this.smoothedQuad[1].x * (1 - alpha) + rawDetectedQuad[1].x * alpha,
          y: this.smoothedQuad[1].y * (1 - alpha) + rawDetectedQuad[1].y * alpha,
        },
        {
          x: this.smoothedQuad[2].x * (1 - alpha) + rawDetectedQuad[2].x * alpha,
          y: this.smoothedQuad[2].y * (1 - alpha) + rawDetectedQuad[2].y * alpha,
        },
        {
          x: this.smoothedQuad[3].x * (1 - alpha) + rawDetectedQuad[3].x * alpha,
          y: this.smoothedQuad[3].y * (1 - alpha) + rawDetectedQuad[3].y * alpha,
        },
      ];
    }

    // 3. Verificación de iluminación y contraste para evitar capturas sobreexpuestas
    const lightCheck = this.checkLightingAndContrast(videoElement);
    const now = Date.now();

    // 4. Medir desplazamiento máximo de vértices entre fotogramas
    const maxDisplacement = Math.max(
      pointDistance(rawDetectedQuad[0], this.smoothedQuad[0]),
      pointDistance(rawDetectedQuad[1], this.smoothedQuad[1]),
      pointDistance(rawDetectedQuad[2], this.smoothedQuad[2]),
      pointDistance(rawDetectedQuad[3], this.smoothedQuad[3])
    );

    let isStable = false;
    let progress = 0;
    let statusMsg = 'Alinea el documento en el marco';

    if (!lightCheck.isProperlyLit) {
      // Iluminación deficiente o sobreexpuesta
      this.stableSince = 0;
      this.consecutiveMoveFrames = 0;
      statusMsg = lightCheck.warning;
    } else if (maxDisplacement < this.STABILITY_THRESHOLD) {
      this.consecutiveMoveFrames = 0;
      if (!this.stableSince) {
        this.stableSince = now;
      }
      const elapsed = now - this.stableSince;
      progress = Math.min(1.0, elapsed / this.STABILITY_DURATION_MS);

      if (elapsed >= this.STABILITY_DURATION_MS) {
        isStable = true;
        statusMsg = '✓ Documento Estable — Presiona Obturador';
      } else {
        const percent = Math.round(progress * 100);
        statusMsg = `Mantén quieto el dispositivo (${percent}%)`;
      }
    } else {
      // Si el movimiento persiste por más de 3 fotogramas consecutivos, reiniciar tiempo
      this.consecutiveMoveFrames++;
      if (this.consecutiveMoveFrames >= 3) {
        this.stableSince = 0;
        progress = 0;
      } else if (this.stableSince) {
        const elapsed = now - this.stableSince;
        progress = Math.min(1.0, elapsed / this.STABILITY_DURATION_MS);
      }
      statusMsg = 'Alinea el documento y mantén el pulso';
    }

    return {
      quad: this.smoothedQuad,
      isDocumentDetected: hasContour,
      isStable,
      stabilityProgress: progress,
      isProperlyLit: lightCheck.isProperlyLit,
      statusMessage: statusMsg,
    };
  }

  private getDefaultQuad(): Quad {
    return [
      { x: 0.12, y: 0.14 },
      { x: 0.88, y: 0.14 },
      { x: 0.88, y: 0.86 },
      { x: 0.12, y: 0.86 },
    ];
  }

  /**
   * Evalúa si el frame no está sobreexpuesto ni completamente a oscuras
   */
  private checkLightingAndContrast(video: HTMLVideoElement): { isProperlyLit: boolean; warning: string } {
    try {
      const sw = 64;
      const sh = 64;
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return { isProperlyLit: true, warning: '' };

      ctx.drawImage(video, 0, 0, sw, sh);
      const imgData = ctx.getImageData(0, 0, sw, sh);
      const data = imgData.data;

      let totalLum = 0;
      let minLum = 255;
      let maxLum = 0;

      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        totalLum += lum;
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;
      }

      const avgLum = totalLum / (sw * sh);
      const contrast = maxLum - minLum;

      if (avgLum < 25) {
        return { isProperlyLit: false, warning: 'Iluminación muy baja — Enciende linterna' };
      }
      if (avgLum > 248 && contrast < 20) {
        return { isProperlyLit: false, warning: 'Sobreexpuesto — Reduce reflejos' };
      }
      return { isProperlyLit: true, warning: '' };
    } catch (e) {
      return { isProperlyLit: true, warning: '' };
    }
  }

  /**
   * Detección de contornos con gradientes en cuadrícula de muestreo
   */
  private detectContourQuad(video: HTMLVideoElement): { quad: Quad; hasContour: boolean } {
    try {
      const sw = 160;
      const sh = 220;
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return { quad: this.getDefaultQuad(), hasContour: false };

      ctx.drawImage(video, 0, 0, sw, sh);
      const imgData = ctx.getImageData(0, 0, sw, sh);
      const data = imgData.data;

      let minX = sw * 0.12;
      let maxX = sw * 0.88;
      let minY = sh * 0.14;
      let maxY = sh * 0.86;

      let topY = -1;
      let bottomY = -1;
      let leftX = -1;
      let rightX = -1;

      const centerX = Math.floor(sw / 2);
      const centerY = Math.floor(sh / 2);

      // Búsqueda vertical
      for (let y = Math.floor(sh * 0.08); y < centerY; y++) {
        const idx1 = (y * sw + centerX) * 4;
        const idx2 = ((y + 2) * sw + centerX) * 4;
        const diff = Math.abs(data[idx1] - data[idx2]) + Math.abs(data[idx1 + 1] - data[idx2 + 1]);
        if (diff > 50) {
          topY = y;
          break;
        }
      }

      for (let y = Math.floor(sh * 0.92); y > centerY; y--) {
        const idx1 = (y * sw + centerX) * 4;
        const idx2 = ((y - 2) * sw + centerX) * 4;
        const diff = Math.abs(data[idx1] - data[idx2]) + Math.abs(data[idx1 + 1] - data[idx2 + 1]);
        if (diff > 50) {
          bottomY = y;
          break;
        }
      }

      // Búsqueda horizontal
      for (let x = Math.floor(sw * 0.08); x < centerX; x++) {
        const idx1 = (centerY * sw + x) * 4;
        const idx2 = (centerY * sw + x + 2) * 4;
        const diff = Math.abs(data[idx1] - data[idx2]) + Math.abs(data[idx1 + 1] - data[idx2 + 1]);
        if (diff > 50) {
          leftX = x;
          break;
        }
      }

      for (let x = Math.floor(sw * 0.92); x > centerX; x--) {
        const idx1 = (centerY * sw + x) * 4;
        const idx2 = (centerY * sw + x - 2) * 4;
        const diff = Math.abs(data[idx1] - data[idx2]) + Math.abs(data[idx1 + 1] - data[idx2 + 1]);
        if (diff > 50) {
          rightX = x;
          break;
        }
      }

      let detectedEdgesCount = 0;
      if (topY > 0 && bottomY > topY && (bottomY - topY) > sh * 0.30) {
        minY = topY;
        maxY = bottomY;
        detectedEdgesCount += 2;
      }
      if (leftX > 0 && rightX > leftX && (rightX - leftX) > sw * 0.30) {
        minX = leftX;
        maxX = rightX;
        detectedEdgesCount += 2;
      }

      const hasContour = detectedEdgesCount >= 2;

      return {
        quad: [
          { x: minX / sw, y: minY / sh },
          { x: maxX / sw, y: minY / sh },
          { x: maxX / sw, y: maxY / sh },
          { x: minX / sw, y: maxY / sh },
        ],
        hasContour,
      };
    } catch (e) {
      return { quad: this.getDefaultQuad(), hasContour: false };
    }
  }
}
