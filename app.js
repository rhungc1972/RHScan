/**
 * app.js - RHDocScan (Zero-Knowledge Client-Side Document Scanner)
 * Módulos: Cámara & Linterna, Máscara Folio/Oficio, Homografía Proyectiva (Warp Perspective),
 * Gestión de Límites con Cuenta Regresiva a Medianoche, Generación de PDF y Web Share API Nivel 2.
 */

// 1. CONFIGURACIÓN Y CONSTANTES
const DAILY_LIMITS = {
  ANONYMOUS: 3,
  REGISTERED: 10,
  MAX_PAGES_PER_DOC: 10,
};

const STORAGE_KEY = 'scan_tracker';

// 2. MÓDULO DE PERSISTENCIA Y LÍMITES LOCALES
class UsageTracker {
  static getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  static getState() {
    const today = this.getTodayString();
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.date !== today) {
          const reset = {
            date: today,
            count: 0,
            isRegistered: Boolean(parsed.isRegistered),
            userEmail: parsed.userEmail || '',
            userName: parsed.userName || '',
          };
          this.saveState(reset);
          return reset;
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Error accediendo a localStorage:', e);
    }

    const defaultState = {
      date: today,
      count: 0,
      isRegistered: false,
      userEmail: '',
      userName: '',
    };
    this.saveState(defaultState);
    return defaultState;
  }

  static saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
    }
  }

  static increment() {
    const s = this.getState();
    s.count += 1;
    this.saveState(s);
    return s;
  }

  static register(name, email) {
    const s = this.getState();
    s.isRegistered = true;
    s.userName = name;
    s.userEmail = email;
    this.saveState(s);
    return s;
  }

  static hasQuota() {
    const s = this.getState();
    const max = s.isRegistered ? DAILY_LIMITS.REGISTERED : DAILY_LIMITS.ANONYMOUS;
    return s.count < max;
  }

  static getRemainingTime() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const ms = Math.max(0, midnight.getTime() - now.getTime());
    const totalSec = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}h ${m}m ${s}s`;
  }
}

// 3. MÓDULO MATEMÁTICO: HOMOGRAFÍA PROYECTIVA Y CONVERSIÓN DE COORDENADAS
class GeometryEngine {
  /**
   * Resuelve la matriz de homografía 3x3 para transformar 4 puntos cuadrangulares a un rectángulo plano
   */
  static getProjectiveTransform(src, dst) {
    const A = [];
    const b = [];

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
        if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
      }
      const tmpRow = A[i]; A[i] = A[maxRow]; A[maxRow] = tmpRow;
      const tmpB = b[i]; b[i] = b[maxRow]; b[maxRow] = tmpB;

      for (let k = i + 1; k < n; k++) {
        const c = -A[k][i] / (A[i][i] || 1e-8);
        for (let j = i; j < n; j++) {
          if (i === j) A[k][j] = 0;
          else A[k][j] += c * A[i][j];
        }
        b[k] += c * b[i];
      }
    }

    const x = new Array(8).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = b[i];
      for (let j = i + 1; j < n; j++) sum -= A[i][j] * x[j];
      x[i] = sum / (A[i][i] || 1e-8);
    }

    return [x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], 1];
  }

  /**
   * Mapea un punto en pantalla (CSS pixels con object-fit: cover) a píxeles nativos del sensor de cámara
   */
  static screenToSensor(screenX, screenY, viewportW, viewportH, sensorW, sensorH) {
    const scale = Math.max(viewportW / sensorW, viewportH / sensorH);
    const renderedW = sensorW * scale;
    const renderedH = sensorH * scale;
    const offsetX = (viewportW - renderedW) / 2;
    const offsetY = (viewportH - renderedH) / 2;

    const sX = (screenX - offsetX) / scale;
    const sY = (screenY - offsetY) / scale;
    return {
      x: Math.max(0, Math.min(sensorW, sX)),
      y: Math.max(0, Math.min(sensorH, sY)),
    };
  }

  /**
   * Endereza la perspectiva de la imagen fuente dada una selección de 4 puntos
   */
  static async warpPerspective(sourceImage, corners, outputW = 1000, outputH = 1450) {
    const sw = sourceImage.naturalWidth || sourceImage.width;
    const sh = sourceImage.naturalHeight || sourceImage.height;

    const dstQuad = [
      { x: 0, y: 0 },
      { x: outputW, y: 0 },
      { x: outputW, y: outputH },
      { x: 0, y: outputH },
    ];

    const H = this.getProjectiveTransform(dstQuad, corners);

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = sw;
    srcCanvas.height = sh;
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    srcCtx.drawImage(sourceImage, 0, 0, sw, sh);
    const srcData = srcCtx.getImageData(0, 0, sw, sh).data;

    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = outputW;
    dstCanvas.height = outputH;
    const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true });
    const dstImg = dstCtx.createImageData(outputW, outputH);
    const dstData = dstImg.data;

    let dstIdx = 0;
    for (let dy = 0; dy < outputH; dy++) {
      for (let dx = 0; dx < outputW; dx++) {
        const denom = H[6] * dx + H[7] * dy + H[8] || 1e-8;
        let sx = (H[0] * dx + H[1] * dy + H[2]) / denom;
        let sy = (H[3] * dx + H[4] * dy + H[5]) / denom;

        sx = Math.max(0, Math.min(sw - 1.001, sx));
        sy = Math.max(0, Math.min(sh - 1.001, sy));

        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;

        const i00 = (y0 * sw + x0) * 4;
        const i10 = (y0 * sw + Math.min(sw - 1, x0 + 1)) * 4;
        const i01 = (Math.min(sh - 1, y0 + 1) * sw + x0) * 4;
        const i11 = (Math.min(sh - 1, y0 + 1) * sw + Math.min(sw - 1, x0 + 1)) * 4;

        for (let c = 0; c < 3; c++) {
          dstData[dstIdx + c] = Math.round(
            srcData[i00 + c] * (1 - fx) * (1 - fy) +
            srcData[i10 + c] * fx * (1 - fy) +
            srcData[i01 + c] * (1 - fx) * fy +
            srcData[i11 + c] * fx * fy
          );
        }
        dstData[dstIdx + 3] = 255;
        dstIdx += 4;
      }
    }

    dstCtx.putImageData(dstImg, 0, 0);
    return dstCanvas.toDataURL('image/jpeg', 0.95);
  }
}

// 4. MÓDULO DE COMPILACIÓN PDF Y WEB SHARE API (NIVEL 2)
class DocumentShareService {
  static async sharePdf(pdfBlob, filename = 'RHDocScan_Documento.pdf') {
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: filename,
          text: 'Documento escaneado de forma 100% privada con RHDocScan.',
        });
        return { shared: true, downloaded: false };
      } catch (err) {
        if (err.name === 'AbortError') return { shared: true, downloaded: false };
      }
    }

    // Respaldo de descarga
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { shared: false, downloaded: true };
  }
}

// Exportación global
window.RHDocScan = {
  UsageTracker,
  GeometryEngine,
  DocumentShareService,
};
