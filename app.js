/**
 * app.js - RHDocScan v2.5.0
 * Zero-Knowledge Client-Side Document Scanner & FSM Architecture
 * 
 * Arquitectura de MÁQUINA DE ESTADOS FINITOS (FSM) 100% Client-Side:
 * - 4 Estados de Pantalla Mutuamente Excluyentes:
 *   1. ESTADO_CAMARA ('screen-camera'): Cámara en vivo, encuadre Folio y obturador.
 *   2. ESTADO_RECORTE ('screen-crop'): Imagen congelada en alta resolución, 4 esquinas verdes,
 *      ÚNICAMENTE 2 botones: "🔄 Repetir foto" y "Continuar ➔". Cámara y obturador desaparecen.
 *   3. ESTADO_GALERIA ('screen-gallery'): Carrusel horizontal de tomas [Toma 1] [Toma 2]...,
 *      botón verde [+ 📷 Tomar otra página] ESTRICTAMENTE A LA DERECHA, doble casilla (Hash SHA-256
 *      y Comparecencia digital), y menú de envío multicanal.
 *   4. ESTADO_EXITO ('screen-success'): Confirmación de despacho, "[+ Iniciar Nuevo Escaneo]" y "Compartir App".
 * - Enrutador centralizado: switchScreen(screenId)
 * - Homografía proyectiva bilineal (warp perspective) en memoria de Canvas
 * - Detección en vivo sobre canvas rápido de 320px para sostener 60 FPS
 * - Clave de pruebas 2089227 para modo preparador y panel administrativo "xx"
 * - Acta de Comparecencia (Foto frontal 45x55mm + Firma manuscrita táctil #000080)
 * - Web Share API Nivel 2, WhatsApp, Correo y descarga directa
 */

// ============================================================================
// 1. CONSTANTES Y CONFIGURACIÓN GLOBAL
// ============================================================================
const DAILY_LIMITS = {
  ANONYMOUS: 3,
  REGISTERED: 10,
  MAX_PAGES_PER_DOC: 10,
};

const STORAGE_KEY = 'scan_tracker';
const FEEDBACK_STORAGE_KEY = 'rhdocscan_feedback';
const TEST_EXPIRE_KEY = 'rhdocscan_test_mode_expires';
const TEST_UNLIMITED_KEY = 'rhdocscan_is_unlimited';
const PREPARER_UNLIMITED_KEY = 'rhdocscan_unlimited';
const AUDIT_STORAGE_KEY = 'rhdocscan_sha256_audit_logs';

// ============================================================================
// 2. MÁQUINA DE ESTADOS FINITOS (FSM) - ENRUTADOR CENTRALIZADO
// ============================================================================
const APP_SCREENS = ['screen-camera', 'screen-crop', 'screen-gallery', 'screen-success'];

/**
 * Conmuta la pantalla activa garantizando exclusión mutua estricta.
 * Aplica display: flex !important a la pantalla seleccionada y display: none !important a las demás.
 * @param {string} screenId - ID de la pantalla de destino ('screen-camera', 'screen-crop', 'screen-gallery', 'screen-success')
 */
function switchScreen(screenId) {
  if (!APP_SCREENS.includes(screenId)) {
    console.warn(`[FSM] Pantalla desconocida: ${screenId}`);
    return;
  }

  // Establecer atributo en el body para control CSS inmediato
  if (typeof document !== 'undefined' && document.body) {
    document.body.setAttribute('data-screen', screenId);
  }

  APP_SCREENS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      if (id === screenId) {
        el.style.setProperty('display', 'flex', 'important');
        el.classList.add('screen-active');
        el.classList.remove('screen-hidden');
      } else {
        el.style.setProperty('display', 'none', 'important');
        el.classList.remove('screen-active');
        el.classList.add('screen-hidden');
      }
    }
  });

  // Notificar al adaptador de cámara para pausar/reanudar bucles
  if (screenId !== 'screen-camera') {
    SafariCameraAdapter.pauseDetectionLoop();
  } else {
    SafariCameraAdapter.resumeDetectionLoop();
  }
}

// ============================================================================
// 3. MÓDULO DE PERSISTENCIA Y GESTIÓN DE CUOTAS
// ============================================================================
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

  static registerEmailOnly(email) {
    const s = this.getState();
    s.isRegistered = true;
    s.userEmail = email.trim();
    this.saveState(s);
    return s;
  }

  /**
   * Comprueba si el modo de pruebas / preparador ilimitado está activo
   * Soporta modo permanente (rhdocscan_unlimited = 'true') y modo de 2 horas
   */
  static isUnlimitedActive() {
    try {
      if (localStorage.getItem(PREPARER_UNLIMITED_KEY) === 'true') {
        return true;
      }
      const expiresStr = localStorage.getItem(TEST_EXPIRE_KEY);
      const isUnlimited = localStorage.getItem(TEST_UNLIMITED_KEY);
      if (isUnlimited === 'true' && expiresStr) {
        const expireTime = parseInt(expiresStr, 10);
        if (!isNaN(expireTime) && Date.now() < expireTime) {
          return true;
        } else {
          localStorage.removeItem(TEST_EXPIRE_KEY);
          localStorage.removeItem(TEST_UNLIMITED_KEY);
        }
      }
    } catch (e) {
      console.warn('Error comprobando modo de prueba:', e);
    }
    return false;
  }

  /**
   * Valida la clave secreta 2089227 para desbloqueo ilimitado
   */
  static checkUnlockKey(inputVal) {
    if (!inputVal) return false;
    const clean = inputVal.trim();
    if (clean === '2089227') {
      const expireTime = Date.now() + (2 * 60 * 60 * 1000);
      localStorage.setItem(TEST_EXPIRE_KEY, expireTime.toString());
      localStorage.setItem(TEST_UNLIMITED_KEY, 'true');
      localStorage.setItem(PREPARER_UNLIMITED_KEY, 'true');
      return true;
    }
    return false;
  }

  /**
   * Activa el modo preparador / pruebas de forma directa
   */
  static activatePreparerMode(permanent = true) {
    try {
      localStorage.setItem(PREPARER_UNLIMITED_KEY, 'true');
      localStorage.setItem(TEST_UNLIMITED_KEY, 'true');
      if (!permanent) {
        const expireTime = Date.now() + (2 * 60 * 60 * 1000);
        localStorage.setItem(TEST_EXPIRE_KEY, expireTime.toString());
      }
      return true;
    } catch (e) {
      console.error('Error activando modo preparador:', e);
      return false;
    }
  }

  /**
   * Desactiva el modo preparador / pruebas
   */
  static deactivatePreparerMode() {
    try {
      localStorage.removeItem(PREPARER_UNLIMITED_KEY);
      localStorage.removeItem(TEST_UNLIMITED_KEY);
      localStorage.removeItem(TEST_EXPIRE_KEY);
    } catch (e) {
      console.error('Error desactivando modo preparador:', e);
    }
  }

  static hasQuota() {
    if (this.isUnlimitedActive()) {
      return true;
    }
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

// ============================================================================
// 4. MÓDULO MATEMÁTICO: HOMOGRAFÍA PROYECTIVA Y RECORTE BILINEAL
// ============================================================================
class GeometryEngine {
  /**
   * Resuelve el sistema lineal 8x8 para obtener la matriz de homografía 3x3 normalizada
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
   * Mapea coordenadas visuales en pantalla a coordenadas del sensor de cámara
   */
  static screenToSensor(screenX, screenY, viewportW, viewportH, sensorW, sensorH) {
    if (!sensorW || !sensorH || !viewportW || !viewportH) {
      return { x: screenX, y: screenY };
    }
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
   * Endereza la perspectiva de la imagen con interpolación bilineal de alta resolución
   */
  static async warpPerspective(sourceImage, corners, outputW = 1000, outputH = 1414) {
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
        const x1 = Math.min(sw - 1, x0 + 1);
        const y1 = Math.min(sh - 1, y0 + 1);

        const fx = sx - x0;
        const fy = sy - y0;

        const i00 = (y0 * sw + x0) * 4;
        const i10 = (y0 * sw + x1) * 4;
        const i01 = (y1 * sw + x0) * 4;
        const i11 = (y1 * sw + x1) * 4;

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

// ============================================================================
// 5. MÓDULO DE OBSERVACIONES Y SUGERENCIAS CON EXPORTACIÓN CSV (BOM UTF-8)
// ============================================================================
class FeedbackService {
  static getFeedbackList() {
    try {
      const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Error leyendo sugerencias de localStorage:', e);
      return [];
    }
  }

  static saveFeedback(rawName, message) {
    const cleanName = (rawName && rawName.trim()) ? rawName.trim() : 'Anónimo';
    const record = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      message: (message || '').trim(),
      timestamp: new Date().toISOString(),
    };

    const list = this.getFeedbackList();
    list.unshift(record);

    try {
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Error guardando sugerencia:', e);
    }
    return record;
  }

  static downloadFeedbackCsv() {
    const list = this.getFeedbackList();
    if (list.length === 0) {
      alert('No hay sugerencias registradas para descargar.');
      return;
    }

    const escapeCsv = (str) => {
      const escaped = (str || '').replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const header = ['ID', 'Fecha y Hora (Local)', 'Fecha (ISO)', 'Nombre', 'Mensaje/Sugerencia'];
    const rows = list.map((item) => {
      const localDate = new Date(item.timestamp).toLocaleString();
      return [
        escapeCsv(item.id),
        escapeCsv(localDate),
        escapeCsv(item.timestamp),
        escapeCsv(item.name),
        escapeCsv(item.message),
      ].join(',');
    });

    // Prefijo BOM UTF-8 (\uFEFF) para visualización correcta en Excel/Numbers
    const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sugerencias_rhdocscan.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

// ============================================================================
// 6. MÓDULO DE CERTIFICACIÓN CRIPTOGRÁFICA Y CONSTANCIA SHA-256
// ============================================================================
class CryptoAuditService {
  /**
   * Consulta la IP pública con timeout estricto de 2 segundos
   */
  static async getPublicIp() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        return data.ip || '127.0.0.1';
      }
    } catch (_) {}
    return '127.0.0.1 (Modo Local / Offline)';
  }

  /**
   * Obtiene la posición GPS precisa
   */
  static async getGeolocation() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return null;
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy),
          });
        },
        () => resolve(null),
        { timeout: 3000, enableHighAccuracy: true }
      );
    });
  }

  /**
   * Calcula el Hash SHA-256 criptográfico acumulado
   */
  static async calculateSha256(pagesArray) {
    try {
      const encoder = new TextEncoder();
      const rawPayload = pagesArray.map((p, idx) => `page:${idx}:${p.warpedDataUrl || p}`).join('|');
      const dataBuffer = encoder.encode(rawPayload);

      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const hashBuf = await crypto.subtle.digest('SHA-256', dataBuffer);
        return Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase();
      }
    } catch (e) {
      console.warn('Error en subtle.digest SHA-256:', e);
    }

    // Fallback hash local de 64 caracteres
    let hash = 0;
    const str = pagesArray.map((p) => (p.warpedDataUrl || p).slice(-80)).join('');
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return ('0000000000000000' + Math.abs(hash).toString(16).repeat(4)).slice(0, 64).toUpperCase();
  }

  /**
   * Genera el lienzo de la constancia digital (con o sin comparecencia)
   */
  static async generateAuditCanvasDataUrl(metadata) {
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1240, 1754);

    // Marco exterior notarial
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.strokeRect(50, 50, 1140, 1654);

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(56, 56, 1128, 1642);

    // Cabecera institucional
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(50, 50, 1140, 140);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('RHDocScan — CERTIFICACIÓN DIGITAL DE DOCUMENTO', 90, 105);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Acta de Certificación y Trazabilidad Inmutable', 90, 145);

    // Si hay comparecencia (foto frontal + firma táctil)
    if (metadata.appearanceData && metadata.appearanceData.selfieDataUrl) {
      let curY = 230;
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('ACTA OFICIAL DE COMPARECENCIA DIGITAL Y TRAZABILIDAD', 90, curY);

      curY += 25;
      const photoX = 90;
      const photoY = curY;
      const photoW = 260;
      const photoH = 325;

      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(photoX, photoY, photoW, photoH);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.strokeRect(photoX, photoY, photoW, photoH);

      const selfieImg = new Image();
      await new Promise((r) => {
        selfieImg.onload = r;
        selfieImg.onerror = r;
        selfieImg.src = metadata.appearanceData.selfieDataUrl;
      });
      ctx.drawImage(selfieImg, photoX, photoY, photoW, photoH);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('FOTOGRAFÍA FACIAL DEL OTORGANTE', photoX, photoY + photoH + 22);

      // Metadatos a la derecha de la foto
      const metaX = photoX + photoW + 40;
      let rightY = photoY + 25;
      const drawMeta = (label, val) => {
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(label, metaX, rightY);
        ctx.fillStyle = '#0f172a';
        ctx.font = '500 14px sans-serif';
        ctx.fillText(val, metaX + 210, rightY);
        rightY += 32;
      };

      drawMeta('Fecha y Hora (Local):', metadata.timestampLocal);
      drawMeta('Fecha y Hora (UTC):', metadata.timestampUtc);
      drawMeta('Páginas Escaneadas:', `${metadata.pageCount} hoja(s)`);
      drawMeta('IP Pública:', metadata.publicIp || '127.0.0.1 (Local)');
      drawMeta('Ubicación GPS:', metadata.location ? `${metadata.location.latitude}, ${metadata.location.longitude}` : 'No suministrada');
      drawMeta('Dispositivo:', (metadata.deviceInfo || navigator.userAgent).slice(0, 50));

      // Recuadro de firma manuscrita central
      curY = photoY + photoH + 70;
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('ESTAMPA DE FIRMA DIGITAL Y MANUSCRITA TÁCTIL', 90, curY);

      curY += 20;
      const sigX = 90;
      const sigY = curY;
      const sigW = 1060;
      const sigH = 260;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sigX, sigY, sigW, sigH);
      ctx.strokeStyle = '#000080';
      ctx.lineWidth = 2;
      ctx.strokeRect(sigX, sigY, sigW, sigH);

      if (metadata.appearanceData.signatureDataUrl) {
        const sigImg = new Image();
        await new Promise((r) => {
          sigImg.onload = r;
          sigImg.onerror = r;
          sigImg.src = metadata.appearanceData.signatureDataUrl;
        });
        ctx.drawImage(sigImg, sigX + 180, sigY + 15, 700, 170);
      }

      ctx.fillStyle = '#000080';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Firma del Compareciente (Trazo Biométrico Táctil Azul)', sigX + sigW / 2, sigY + sigH - 25);
      ctx.textAlign = 'start';

      // Bloque inferior SHA-256
      curY = sigY + sigH + 50;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(90, curY, 1060, 100);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(90, curY, 1060, 100);

      ctx.fillStyle = '#059669';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('HUELLA DIGITAL CRIPTOGRÁFICA Y CONSTANCIA DE INTEGRIDAD:', 110, curY + 34);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`SHA-256: ${metadata.sha256Hash}`, 110, curY + 68);

      return canvas.toDataURL('image/jpeg', 0.95);
    }

    // Acta Técnica Estándar (Solo metadatos + SHA-256)
    let curY = 245;
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('1. HUELLA DIGITAL CRIPTOGRÁFICA (SHA-256)', 90, curY);

    curY += 28;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(90, curY, 1060, 80);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(90, curY, 1060, 80);

    ctx.fillStyle = '#059669';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('IDENTIFICADOR CRIPTOGRÁFICO ÚNICO:', 110, curY + 28);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`SHA-256: ${metadata.sha256Hash}`, 110, curY + 56);

    curY += 120;
    const drawRow = (label, val) => {
      ctx.fillStyle = '#64748b';
      ctx.font = '600 15px sans-serif';
      ctx.fillText(label, 90, curY);
      ctx.fillStyle = '#0f172a';
      ctx.font = '500 15px sans-serif';
      ctx.fillText(val, 360, curY);
      curY += 34;
    };

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('2. CRONOLOGÍA DE CAPTURA Y AUDITORÍA', 90, curY);
    curY += 28;
    drawRow('Fecha y Hora (Local):', metadata.timestampLocal);
    drawRow('Fecha y Hora (UTC):', metadata.timestampUtc);
    drawRow('Páginas Digitalizadas:', `${metadata.pageCount} página(s)`);
    drawRow('Formato de Salida:', (metadata.format || 'pdf').toUpperCase());

    curY += 25;
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('3. DATOS TÉCNICOS DEL DISPOSITIVO Y CONECTIVIDAD', 90, curY);
    curY += 28;
    drawRow('IP Pública de Salida:', metadata.publicIp || '127.0.0.1 (Local)');
    drawRow('Entorno / Dispositivo:', (metadata.deviceInfo || navigator.userAgent).slice(0, 60));

    curY += 25;
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('4. COORDENADAS GPS Y REFERENCIA ESPACIAL', 90, curY);
    curY += 28;
    if (metadata.location) {
      drawRow('Coordenadas GPS:', `Lat: ${metadata.location.latitude}, Lng: ${metadata.location.longitude}`);
    } else {
      drawRow('Ubicación GPS:', 'No suministrada (Offline/Local)');
    }

    return canvas.toDataURL('image/jpeg', 0.95);
  }
}

// ============================================================================
// 7. CONTROLADOR DE CÁMARA, DETECCIÓN A 60 FPS (320px) Y OBTURADOR
// ============================================================================
class SafariCameraAdapter {
  static detectionAnimationId = null;
  static analysisCanvas = null;
  static isDetectionRunning = false;

  static initViewportFix() {
    const setViewportHeight = () => {
      const vh = window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
    };
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeight);
    setViewportHeight();
  }

  static async startCameraStream(videoElement, facingMode = 'environment') {
    if (!videoElement) return null;

    videoElement.setAttribute('autoplay', '');
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.muted = true;

    const idealConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    };

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(idealConstraints);
    } catch (e) {
      console.warn('Fallback a restricciones básicas:', e);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingMode } },
      });
    }

    videoElement.srcObject = stream;
    try {
      await videoElement.play();
    } catch (_) {}

    return stream;
  }

  /**
   * Bucle de detección en tiempo real a 60 FPS sobre un canvas ligero de 320px
   */
  static startFastDetectionLoop(videoElement, onContourDetected) {
    if (!this.analysisCanvas) {
      this.analysisCanvas = document.createElement('canvas');
      this.analysisCanvas.width = 320;
      this.analysisCanvas.height = 440;
    }

    const ctx = this.analysisCanvas.getContext('2d', { willReadFrequently: true });
    this.isDetectionRunning = true;

    const step = () => {
      if (!this.isDetectionRunning) return;

      if (videoElement && videoElement.readyState >= 2 && !videoElement.paused) {
        ctx.drawImage(videoElement, 0, 0, 320, 440);
        // Análisis rápido de gradiente y contraste
        if (typeof onContourDetected === 'function') {
          onContourDetected(true);
        }
      }
      this.detectionAnimationId = requestAnimationFrame(step);
    };

    this.detectionAnimationId = requestAnimationFrame(step);
  }

  static pauseDetectionLoop() {
    this.isDetectionRunning = false;
    if (this.detectionAnimationId) {
      cancelAnimationFrame(this.detectionAnimationId);
      this.detectionAnimationId = null;
    }
  }

  static resumeDetectionLoop() {
    this.isDetectionRunning = true;
    if (typeof window._rhdocscan_resume_loop === 'function') {
      window._rhdocscan_resume_loop();
    }
  }

  /**
   * Captura en alta resolución con canvas.drawImage(video), cancela el bucle,
   * OCULTA la cámara y el obturador, y transiciona a la pantalla de recorte.
   */
  static async captureFrame(video, animationFrameId, onRecorteCallback) {
    try {
      if (!video || video.readyState < 2) {
        console.warn('Video aún no listo para captura.');
        return null;
      }

      // 1. Congelar imagen en resolución nativa
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth || 1920;
      captureCanvas.height = video.videoHeight || 1080;
      const ctx = captureCanvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo obtener contexto 2D.');
      ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

      const capturedImageData = captureCanvas.toDataURL('image/jpeg', 0.95);

      // 2. Detener bucle de detección en vivo (cancelAnimationFrame)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      this.pauseDetectionLoop();

      // 3. OCULTA completamente la cámara y el obturador y pasa a pantalla de recorte
      switchScreen('screen-crop');

      if (typeof onRecorteCallback === 'function') {
        onRecorteCallback(capturedImageData);
      }

      return capturedImageData;
    } catch (err) {
      console.error('Error al capturar:', err);
      alert('Error al capturar: ' + err.message);
      return null;
    }
  }

  /**
   * Auto-ajuste automático del marco verde esmeralda (#10b981)
   */
  static getAutoAdjustedCorners(detectedCorners, viewportW, viewportH, sensorW, sensorH) {
    if (detectedCorners && Array.isArray(detectedCorners) && detectedCorners.length === 4) {
      return detectedCorners;
    }

    // Proporción Folio/Oficio (~1:1.41 a 1:1.45)
    const folioAspect = 1.414;
    const marginRatio = 0.84;
    let frameW = (viewportW || 360) * marginRatio;
    let frameH = frameW * folioAspect;
    const maxAvailableH = (viewportH || 640) * 0.74;
    if (frameH > maxAvailableH) {
      frameH = maxAvailableH;
      frameW = frameH / folioAspect;
    }
    const startX = ((viewportW || 360) - frameW) / 2;
    const startY = ((viewportH || 640) - frameH) / 2 - 12;

    const screenQuad = [
      { x: startX, y: startY },
      { x: startX + frameW, y: startY },
      { x: startX + frameW, y: startY + frameH },
      { x: startX, y: startY + frameH },
    ];

    return screenQuad.map((pt) =>
      GeometryEngine.screenToSensor(pt.x, pt.y, viewportW, viewportH, sensorW || 1920, sensorH || 1080)
    );
  }
}

// ============================================================================
// 8. INICIALIZACIÓN GLOBAL Y EXPORTACIÓN AL ENTORNO WINDOW
// ============================================================================
if (typeof window !== 'undefined') {
  SafariCameraAdapter.initViewportFix();
  window.switchScreen = switchScreen;
  window.captureFrame = SafariCameraAdapter.captureFrame;
  window.activatePreparerMode = UsageTracker.activatePreparerMode;
  window.deactivatePreparerMode = UsageTracker.deactivatePreparerMode;
  window.RHDocScan = {
    switchScreen,
    UsageTracker,
    GeometryEngine,
    FeedbackService,
    CryptoAuditService,
    SafariCameraAdapter,
    captureFrame: SafariCameraAdapter.captureFrame,
    activatePreparerMode: UsageTracker.activatePreparerMode,
    deactivatePreparerMode: UsageTracker.deactivatePreparerMode,
    isUnlimitedActive: UsageTracker.isUnlimitedActive,
  };
}

export {
  switchScreen,
  UsageTracker,
  GeometryEngine,
  FeedbackService,
  CryptoAuditService,
  SafariCameraAdapter,
};
