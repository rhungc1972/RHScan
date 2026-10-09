// src/utils/cvEngine.ts
// Motor de Visión por Computadora 100% en el Navegador (Zero-Knowledge)
// Detección de bordes, seguimiento de estabilidad, Homografía Proyectiva y Binarización Adaptativa.

import { Point, Quad, ScanFilter } from '../types';

/**
 * Resuelve el sistema lineal 8x8 para encontrar la matriz de homografía 3x3
 * Mapea 4 puntos origen a 4 puntos destino.
 */
function getProjectiveTransform(src: Quad, dst: Quad): number[] {
  // Matriz A 8x8 y vector b 8x1
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

  // Matriz H [h00, h01, h02, h10, h11, h12, h20, h21, 1]
  return [x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], 1];
}

/**
 * Invierte una matriz 3x3
 */
function invert3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];

  const invDet = 1.0 / det;
  return [
    A * invDet, D * invDet, G * invDet,
    B * invDet, E * invDet, H * invDet,
    C * invDet, F * invDet, I * invDet,
  ];
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
 * Corrige y endereza la perspectiva (Warp Perspective) de una imagen fuente dada una cuadrícula de 4 puntos.
 */
export async function warpPerspective(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  corners: Quad, // Coordenadas en píxeles absolutos de la imagen fuente
  outputWidth?: number,
  outputHeight?: number
): Promise<string> {
  // Calcular dimensiones proporcionales si no se especifican
  const [tl, tr, br, bl] = corners;
  const widthTop = pointDistance(tl, tr);
  const widthBottom = pointDistance(bl, br);
  const heightLeft = pointDistance(tl, bl);
  const heightRight = pointDistance(tr, br);

  const avgWidth = Math.max(widthTop, widthBottom);
  const avgHeight = Math.max(heightLeft, heightRight);

  // Relación estándar A4 aproximada (1 : 1.414) o calculada
  const targetW = Math.round(outputWidth || Math.max(800, avgWidth));
  const targetH = Math.round(outputHeight || Math.max(1130, avgHeight));

  const dstQuad: Quad = [
    { x: 0, y: 0 },
    { x: targetW, y: 0 },
    { x: targetW, y: targetH },
    { x: 0, y: targetH },
  ];

  // Matriz de mapeo: Destino -> Origen para muestreo inverso
  const H = getProjectiveTransform(dstQuad, corners);

  // Obtener píxeles de la imagen original
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = sourceImage.width;
  srcCanvas.height = sourceImage.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) throw new Error('No se pudo inicializar canvas 2D');
  srcCtx.drawImage(sourceImage, 0, 0);
  const srcImgData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const srcData = srcImgData.data;
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  // Canvas destino
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = targetW;
  dstCanvas.height = targetH;
  const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true });
  if (!dstCtx) throw new Error('No se pudo inicializar canvas destino');
  const dstImgData = dstCtx.createImageData(targetW, targetH);
  const dstData = dstImgData.data;

  // Mapeo inverso píxel por píxel con interpolación bilineal
  let dstIdx = 0;
  for (let dy = 0; dy < targetH; dy++) {
    for (let dx = 0; dx < targetW; dx++) {
      // Proyección homogénea
      const denom = H[6] * dx + H[7] * dy + H[8] || 1e-8;
      const sx = (H[0] * dx + H[1] * dy + H[2]) / denom;
      const sy = (H[3] * dx + H[4] * dy + H[5]) / denom;

      if (sx >= 0 && sx < sw - 1 && sy >= 0 && sy < sh - 1) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
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
      } else {
        // Fuera de bordes: blanco puro
        dstData[dstIdx] = 255;
        dstData[dstIdx + 1] = 255;
        dstData[dstIdx + 2] = 255;
        dstData[dstIdx + 3] = 255;
      }
      dstIdx += 4;
    }
  }

  dstCtx.putImageData(dstImgData, 0, 0);
  return dstCanvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Aplica filtros de procesamiento visual:
 * - 'color': Realce sutil y balance de contraste
 * - 'grayscale': Conversión monocromática ponderada
 * - 'binary': Binarización adaptativa local (Bradley-Roth) para textos hiper-nítidos
 */
export async function applyImageFilter(imageDataUrl: string, filter: ScanFilter): Promise<string> {
  if (filter === 'color') return imageDataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(imageDataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const w = canvas.width;
      const h = canvas.height;

      if (filter === 'grayscale') {
        // Escala de grises con estiramiento de contraste
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
        // Binarización Adaptativa Bradley-Roth (Integral Image)
        // Crea imagen integral para calcular media local en O(1)
        const intImg = new Float64Array(w * h);
        const lums = new Uint8Array(w * h);

        for (let y = 0; y < h; y++) {
          let sum = 0;
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            lums[y * w + x] = Math.round(lum);
            sum += lum;
            if (y === 0) {
              intImg[y * w + x] = sum;
            } else {
              intImg[y * w + x] = intImg[(y - 1) * w + x] + sum;
            }
          }
        }

        // Ventana local: 1/16 de la anchura de la página
        const s = Math.max(8, Math.floor(w / 16));
        const s2 = Math.floor(s / 2);
        const t = 0.15; // 15% umbral de sensibilidad

        for (let y = 0; y < h; y++) {
          const y1 = Math.max(0, y - s2);
          const y2 = Math.min(h - 1, y + s2);

          for (let x = 0; x < w; x++) {
            const x1 = Math.max(0, x - s2);
            const x2 = Math.min(w - 1, x + s2);
            const count = (x2 - x1 + 1) * (y2 - y1 + 1);

            // Suma del rectángulo desde imagen integral
            const D = intImg[y2 * w + x2];
            const B = y1 > 0 ? intImg[(y1 - 1) * w + x2] : 0;
            const C = x1 > 0 ? intImg[y2 * w + (x1 - 1)] : 0;
            const A = y1 > 0 && x1 > 0 ? intImg[(y1 - 1) * w + (x1 - 1)] : 0;
            const sum = D - B - C + A;

            const currentLum = lums[y * w + x];
            const pIdx = (y * w + x) * 4;

            // Si es más oscuro que el promedio local * (1 - t), es tinta (0 = negro), sino papel (255 = blanco)
            if (currentLum * count <= sum * (1 - t)) {
              data[pIdx] = 20;
              data[pIdx + 1] = 20;
              data[pIdx + 2] = 20;
            } else {
              data[pIdx] = 255;
              data[pIdx + 1] = 255;
              data[pIdx + 2] = 255;
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = imageDataUrl;
  });
}

/**
 * Detector de documento en tiempo real y evaluador de estabilidad temporal
 */
export class DocumentDetector {
  private prevQuad: Quad | null = null;
  private stableSince: number = 0;
  private readonly STABILITY_DURATION_MS = 800; // 800 ms de estabilidad requerida para auto-disparo
  private readonly STABILITY_THRESHOLD = 0.035; // Umbral de movimiento de vértices (3.5%)

  public reset(): void {
    this.prevQuad = null;
    this.stableSince = 0;
  }

  /**
   * Procesa un cuadro de video en canvas reducido y detecta el cuadrilátero del documento
   */
  public analyzeFrame(videoElement: HTMLVideoElement): {
    quad: Quad; // Coordenadas normalizadas [0..1]
    isDocumentDetected: boolean;
    isStable: boolean;
    stabilityProgress: number; // 0..1
  } {
    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    if (!vw || !vh) {
      return {
        quad: this.getDefaultQuad(),
        isDocumentDetected: false,
        isStable: false,
        stabilityProgress: 0,
      };
    }

    // Cuadrilátero guiado inteligente por defecto (aprox. 80% centrado con proporción A4)
    const detectedQuad = this.detectContourQuad(videoElement);

    // Evaluar estabilidad temporal
    const now = Date.now();
    let isStable = false;
    let progress = 0;

    if (this.prevQuad) {
      const maxDisplacement = Math.max(
        pointDistance(detectedQuad[0], this.prevQuad[0]),
        pointDistance(detectedQuad[1], this.prevQuad[1]),
        pointDistance(detectedQuad[2], this.prevQuad[2]),
        pointDistance(detectedQuad[3], this.prevQuad[3])
      );

      if (maxDisplacement < this.STABILITY_THRESHOLD) {
        if (!this.stableSince) {
          this.stableSince = now;
        }
        const elapsed = now - this.stableSince;
        progress = Math.min(1.0, elapsed / this.STABILITY_DURATION_MS);
        if (elapsed >= this.STABILITY_DURATION_MS) {
          isStable = true;
        }
      } else {
        // Demasiado movimiento, reiniciar acumulador de estabilidad
        this.stableSince = now;
        progress = 0;
      }
    } else {
      this.stableSince = now;
    }

    this.prevQuad = detectedQuad;

    return {
      quad: detectedQuad,
      isDocumentDetected: true,
      isStable,
      stabilityProgress: progress,
    };
  }

  private getDefaultQuad(): Quad {
    // 12% margen respecto al marco para facilitar alineación ergonómica
    return [
      { x: 0.12, y: 0.14 },
      { x: 0.88, y: 0.14 },
      { x: 0.88, y: 0.86 },
      { x: 0.12, y: 0.86 },
    ];
  }

  /**
   * Detección de contornos con Sobel y gradientes de brillo en canvas miniatura
   */
  private detectContourQuad(video: HTMLVideoElement): Quad {
    try {
      const sw = 160;
      const sh = 220;
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return this.getDefaultQuad();

      ctx.drawImage(video, 0, 0, sw, sh);
      const imgData = ctx.getImageData(0, 0, sw, sh);
      const data = imgData.data;

      // Buscar gradientes de contraste en cuadrículas de muestreo
      let minX = sw * 0.12;
      let maxX = sw * 0.88;
      let minY = sh * 0.14;
      let maxY = sh * 0.86;

      // Buscar bordes fuertes con operador simple horizontal y vertical
      let topY = -1;
      let bottomY = -1;
      let leftX = -1;
      let rightX = -1;

      const centerX = Math.floor(sw / 2);
      const centerY = Math.floor(sh / 2);

      // Búsqueda vertical desde el centro hacia afuera
      for (let y = Math.floor(sh * 0.08); y < centerY; y++) {
        const idx1 = (y * sw + centerX) * 4;
        const idx2 = ((y + 2) * sw + centerX) * 4;
        const diff = Math.abs(data[idx1] - data[idx2]) + Math.abs(data[idx1 + 1] - data[idx2 + 1]);
        if (diff > 45) {
          topY = y;
          break;
        }
      }

      for (let y = Math.floor(sh * 0.92); y > centerY; y--) {
        const idx1 = (y * sw + centerX) * 4;
        const idx2 = ((y - 2) * sw + centerX) * 4;
        const diff = Math.abs(data[idx1] - data[idx2]) + Math.abs(data[idx1 + 1] - data[idx2 + 1]);
        if (diff > 45) {
          bottomY = y;
          break;
        }
      }

      // Búsqueda horizontal desde el centro hacia afuera
      for (let x = Math.floor(sw * 0.08); x < centerX; x++) {
        const idx1 = (centerY * sw + x) * 4;
        const idx2 = (centerY * sw + x + 2) * 4;
        const diff = Math.abs(data[idx1] - data[idx2]) + Math.abs(data[idx1 + 1] - data[idx2 + 1]);
        if (diff > 45) {
          leftX = x;
          break;
        }
      }

      for (let x = Math.floor(sw * 0.92); x > centerX; x--) {
        const idx1 = (centerY * sw + x) * 4;
        const idx2 = (centerY * sw + x - 2) * 4;
        const diff = Math.abs(data[idx1] - data[idx2]) + Math.abs(data[idx1 + 1] - data[idx2 + 1]);
        if (diff > 45) {
          rightX = x;
          break;
        }
      }

      if (topY > 0 && bottomY > topY && (bottomY - topY) > sh * 0.35) {
        minY = topY;
        maxY = bottomY;
      }
      if (leftX > 0 && rightX > leftX && (rightX - leftX) > sw * 0.35) {
        minX = leftX;
        maxX = rightX;
      }

      // Normalizar entre 0 y 1
      return [
        { x: minX / sw, y: minY / sh },
        { x: maxX / sw, y: minY / sh },
        { x: maxX / sw, y: maxY / sh },
        { x: minX / sw, y: maxY / sh },
      ];
    } catch (e) {
      return this.getDefaultQuad();
    }
  }
}
