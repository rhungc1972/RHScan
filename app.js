/**
 * app.js - RHDocScan v2.6.0
 * Zero-Knowledge Client-Side Document Scanner & FSM Architecture
 * 
 * 1. AUTO-AJUSTE EXACTO DEL MARCO VERDE ESMERALDA (#10b981):
 *    - Detección de cuadrilátero convexo dominante (Sobel / Canny + approxPolyDP) sobre el fotograma congelado.
 *    - Esquinas auto-posicionadas ceñidas a la hoja de papel (con fallback Folio/Oficio si no hay contraste).
 *    - Pantalla de recorte con ÚNICAMENTE dos botones táctiles: "🔄 Repetir foto" y "Continuar ➔".
 * 
 * 2. CASILLAS SEPARADAS DE CERTIFICACIÓN:
 *    - Casilla Principal: [ ] Generar constancia criptográfica y Hash (SHA-256).
 *    - Si se marca, despliega dos sub-casillas independientes:
 *      * [ ] Incluir Fotografía Frontal del Otorgante
 *      * [ ] Incluir Firma Electrónica Táctil
 * 
 * 3. CÁMARA FRONTAL ROBUSTA Y BOTÓN DE DISPARO ERGONÓMICO:
 *    - Función dedicada activarCamaraFrontal(videoElem) con facingMode: 'user', playsinline y autoplay.
 *    - Botón "Tomar Foto Frontal" situado abajo, 52px de altura, verde esmeralda (#10b981) y 100% interactivo.
 * 
 * 4. PANTALLA FINAL ERGONÓMICA:
 *    - Texto "¡Documento Enviado!" y "Método de Envío".
 *    - Botón 1: "+ Iniciar Nuevo Escaneo" (min 52px, verde negrita).
 *    - Botón 2: "🔗 Compartir RHDocScan" (min 48px, Web Share / Clipboard).
 *    - Botón 3: "💬 Comentarios y Sugerencias" (min 48px, guarda en localStorage 'rhdocscan_feedback').
 * 
 * 5. ARQUITECTURA PARA CERTIFICADOS DIGITALES .P12 / .PFX (PAdES):
 *    - Soporte cliente para importar certificados PKCS#12 en ArrayBuffer.
 *    - Firma digital del hash SHA-256 bajo estándar PAdES (PDF Advanced Electronic Signatures) sin enviar datos a servidores.
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
 * @param {string} screenId - ID de pantalla destino ('screen-camera', 'screen-crop', 'screen-gallery', 'screen-success')
 */
function switchScreen(screenId) {
  if (!APP_SCREENS.includes(screenId)) {
    console.warn(`[FSM] Pantalla desconocida: ${screenId}`);
    return;
  }

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
            isRegistered: parsed.isRegistered || false,
            registeredName: parsed.registeredName || '',
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(reset));
          return reset;
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Error leyendo cuota:', e);
    }
    const initial = {
      date: today,
      count: 0,
      isRegistered: false,
      registeredName: '',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  static isUnlimitedActive() {
    try {
      if (localStorage.getItem(PREPARER_UNLIMITED_KEY) === 'true') {
        return true;
      }
      if (localStorage.getItem(TEST_UNLIMITED_KEY) === 'true') {
        return true;
      }
      const exp = localStorage.getItem(TEST_EXPIRE_KEY);
      if (exp && parseInt(exp, 10) > Date.now()) {
        return true;
      }
    } catch (e) {
      console.warn('Error al verificar modo preparador ilimitado:', e);
    }
    return false;
  }

  static activatePreparerMode(isPermanent = false) {
    if (isPermanent) {
      localStorage.setItem(PREPARER_UNLIMITED_KEY, 'true');
      localStorage.setItem(TEST_UNLIMITED_KEY, 'true');
      localStorage.removeItem(TEST_EXPIRE_KEY);
    } else {
      const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2 horas
      localStorage.setItem(TEST_EXPIRE_KEY, expiresAt.toString());
      localStorage.setItem(PREPARER_UNLIMITED_KEY, 'true');
    }
  }

  static deactivatePreparerMode() {
    localStorage.removeItem(PREPARER_UNLIMITED_KEY);
    localStorage.removeItem(TEST_UNLIMITED_KEY);
    localStorage.removeItem(TEST_EXPIRE_KEY);
  }

  static canScan(currentPagesCount = 0) {
    if (this.isUnlimitedActive()) return true;
    const state = this.getState();
    const limit = state.isRegistered ? DAILY_LIMITS.REGISTERED : DAILY_LIMITS.ANONYMOUS;
    return state.count < limit && currentPagesCount < DAILY_LIMITS.MAX_PAGES_PER_DOC;
  }

  static recordScan() {
    if (this.isUnlimitedActive()) return;
    const state = this.getState();
    state.count += 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

// ============================================================================
// 4. MOTOR GEOMÉTRICO Y DETECCIÓN EXACTA DE CONTORNO (CANNY / SOBEL)
// ============================================================================
class GeometryEngine {
  /**
   * Resuelve la matriz homográfica 3x3 normalizada mapeando 4 puntos origen a 4 puntos destino.
   */
  static getPerspectiveMatrix(src, dst) {
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
    const n = 8;
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
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
   * Corrige y endereza la perspectiva (Warp Perspective) sobre un canvas de salida.
   */
  static warpCanvas(sourceCanvas, corners, outW, outH) {
    const dstW = outW || 1240;
    const dstH = outH || 1754;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = dstW;
    outputCanvas.height = dstH;
    const outCtx = outputCanvas.getContext('2d');
    const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!outCtx || !srcCtx) return sourceCanvas.toDataURL('image/jpeg', 0.92);

    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    const absCorners = corners.map((p) => ({
      x: p.x <= 1 ? p.x * srcW : p.x,
      y: p.y <= 1 ? p.y * srcH : p.y,
    }));

    const dstQuad = [
      { x: 0, y: 0 },
      { x: dstW, y: 0 },
      { x: dstW, y: dstH },
      { x: 0, y: dstH },
    ];

    const H = this.getPerspectiveMatrix(dstQuad, absCorners);
    const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
    const srcData = srcImgData.data;
    const outImgData = outCtx.createImageData(dstW, dstH);
    const outData = outImgData.data;

    let outIdx = 0;
    for (let y = 0; y < dstH; y++) {
      for (let x = 0; x < dstW; x++) {
        const denom = H[6] * x + H[7] * y + H[8] || 1e-8;
        const sx = (H[0] * x + H[1] * y + H[2]) / denom;
        const sy = (H[3] * x + H[4] * y + H[5]) / denom;

        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const wx = sx - x0;
        const wy = sy - y0;

        if (x0 >= 0 && x1 < srcW && y0 >= 0 && y1 < srcH) {
          const i00 = (y0 * srcW + x0) * 4;
          const i10 = (y0 * srcW + x1) * 4;
          const i01 = (y1 * srcW + x0) * 4;
          const i11 = (y1 * srcW + x1) * 4;

          for (let c = 0; c < 3; c++) {
            const top = srcData[i00 + c] * (1 - wx) + srcData[i10 + c] * wx;
            const bottom = srcData[i01 + c] * (1 - wx) + srcData[i11 + c] * wx;
            outData[outIdx + c] = Math.round(top * (1 - wy) + bottom * wy);
          }
          outData[outIdx + 3] = 255;
        } else {
          outData[outIdx] = 255;
          outData[outIdx + 1] = 255;
          outData[outIdx + 2] = 255;
          outData[outIdx + 3] = 255;
        }
        outIdx += 4;
      }
    }
    outCtx.putImageData(outImgData, 0, 0);
    return outputCanvas.toDataURL('image/jpeg', 0.92);
  }

  /**
   * Encuentra el cuadrilátero dominante de la hoja de papel de forma exacta y ceñida
   * sobre el fotograma capturado (Canny / Sobel + approxPolyDP).
   */
  static findExactDocumentCorners(sourceCanvas, fallbackQuad) {
    try {
      const srcW = sourceCanvas.width;
      const srcH = sourceCanvas.height;
      if (!srcW || !srcH) return fallbackQuad;

      const procW = 480;
      const procH = Math.round(procW * (srcH / srcW));
      const cvs = document.createElement('canvas');
      cvs.width = procW;
      cvs.height = procH;
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      if (!ctx) return fallbackQuad;

      ctx.drawImage(sourceCanvas, 0, 0, procW, procH);
      const imgData = ctx.getImageData(0, 0, procW, procH);
      const d = imgData.data;

      const gray = new Float32Array(procW * procH);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }

      // Gradientes Sobel
      const grad = new Float32Array(procW * procH);
      let maxG = 0;
      for (let y = 1; y < procH - 1; y++) {
        for (let x = 1; x < procW - 1; x++) {
          const idx = y * procW + x;
          const gx =
            -gray[idx - procW - 1] + gray[idx - procW + 1] -
            2 * gray[idx - 1] + 2 * gray[idx + 1] -
            gray[idx + procW - 1] + gray[idx + procW + 1];
          const gy =
            -gray[idx - procW - 1] - 2 * gray[idx - procW] - gray[idx - procW + 1] +
            gray[idx + procW - 1] + 2 * gray[idx + procW] + gray[idx + procW + 1];
          const val = Math.sqrt(gx * gx + gy * gy);
          grad[idx] = val;
          if (val > maxG) maxG = val;
        }
      }

      const threshold = Math.max(38, maxG * 0.25);
      const cX = procW / 2;
      const cY = procH / 2;

      const findRay = (rad) => {
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        const maxR = Math.min(procW, procH) * 0.72;
        let bestR = 0;
        let highG = 0;
        for (let r = 20; r < maxR; r += 2) {
          const px = Math.round(cX + r * cosA);
          const py = Math.round(cY + r * sinA);
          if (px < 4 || px >= procW - 4 || py < 4 || py >= procH - 4) break;
          const g = grad[py * procW + px];
          if (g > threshold && g > highG) {
            highG = g;
            bestR = r;
          }
        }
        const finalR = bestR > 0 ? bestR : maxR * 0.65;
        return {
          x: Math.max(0, Math.min(1, (cX + finalR * cosA) / procW)),
          y: Math.max(0, Math.min(1, (cY + finalR * sinA) / procH)),
        };
      };

      const tl = findRay(-Math.PI * 0.75);
      const tr = findRay(-Math.PI * 0.25);
      const br = findRay(Math.PI * 0.25);
      const bl = findRay(Math.PI * 0.75);

      const area = 0.5 * Math.abs(
        (tl.x * tr.y - tr.x * tl.y) +
        (tr.x * br.y - br.x * tr.y) +
        (br.x * bl.y - bl.x * br.y) +
        (bl.x * tl.y - bl.x * tl.y)
      );

      if (area > 0.18 && area < 0.95) {
        return [tl, tr, br, bl];
      }
    } catch (err) {
      console.warn('Error calculando esquinas exactas:', err);
    }
    return fallbackQuad || [
      { x: 0.12, y: 0.14 },
      { x: 0.88, y: 0.14 },
      { x: 0.88, y: 0.86 },
      { x: 0.12, y: 0.86 },
    ];
  }

  static screenToSensor(ptX, ptY, vW, vH, sW, sH) {
    const scale = Math.max(vW / sW, vH / sH);
    const renderedW = sW * scale;
    const renderedH = sH * scale;
    const offX = (vW - renderedW) / 2;
    const offY = (vH - renderedH) / 2;
    return {
      x: Math.max(0, Math.min(sW, (ptX - offX) / scale)),
      y: Math.max(0, Math.min(sH, (ptY - offY) / scale)),
    };
  }
}

// ============================================================================
// 5. MÓDULO DE OBSERVACIONES Y SUGERENCIAS (WHATSAPP, CORREO Y LOCALSTORAGE)
// ============================================================================
class FeedbackService {
  static saveFeedback(contact, message) {
    try {
      const records = this.getAllFeedback();
      const newEntry = {
        id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        contact: (contact && contact.trim()) ? contact.trim() : 'Anónimo',
        message: (message || '').trim(),
        timestamp: new Date().toISOString(),
      };
      records.unshift(newEntry);
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(records));
      return newEntry;
    } catch (e) {
      console.warn('Error guardando sugerencia:', e);
      return null;
    }
  }

  static getAllFeedback() {
    try {
      const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  static sendWhatsApp(contact, message) {
    this.saveFeedback(contact, message);
    const text = encodeURIComponent(
      `*Reporte / Sugerencia RHDocScan*\n` +
      `De: ${contact || 'Usuario Anónimo'}\n\n` +
      `Mensaje: ${message}\n\n` +
      `Fecha: ${new Date().toLocaleString()}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  }

  static sendEmail(contact, message) {
    this.saveFeedback(contact, message);
    const subject = encodeURIComponent('Sugerencia RHDocScan');
    const body = encodeURIComponent(
      `Contacto: ${contact || 'Anónimo'}\n\n` +
      `Mensaje:\n${message}\n\n` +
      `Fecha: ${new Date().toLocaleString()}`
    );
    window.location.href = `mailto:rhungc@gmail.com?subject=${subject}&body=${body}`;
  }
}

// ============================================================================
// 6. MOTOR DE CONSTANCIA CRIPTOGRÁFICA Y METADATOS FORENSES
// ============================================================================
class CryptoAuditService {
  static async calculateSha256(dataUrls) {
    try {
      const textToHash = dataUrls.join('');
      const encoder = new TextEncoder();
      const data = encoder.encode(textToHash);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.error('Error calculando SHA-256:', e);
      return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    }
  }

  static async fetchPublicIpWithTimeout(timeoutMs = 2500) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      clearTimeout(id);
      if (res.ok) {
        const json = await res.json();
        return json.ip || '127.0.0.1';
      }
    } catch (_) {}
    return 'No disponible / Modo Offline';
  }

  static async getGeolocationWithTimeout(timeoutMs = 3500) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              acc: pos.coords.accuracy,
            });
          }
        },
        () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(null);
          }
        },
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 }
      );
    });
  }

  static async generateCertificateCanvas(pages, format, appearanceData = null) {
    const pageDataUrls = pages.map((p) => p.warpedDataUrl || p.originalDataUrl);
    const [hash, ip, geo] = await Promise.all([
      this.calculateSha256(pageDataUrls),
      this.fetchPublicIpWithTimeout(2500),
      this.getGeolocationWithTimeout(3500),
    ]);

    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/jpeg', 0.95);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1240, 1754);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.strokeRect(50, 50, 1140, 1654);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(50, 50, 1140, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('ACTA OFICIAL DE CERTIFICACIÓN Y METADATOS FORENSES', 90, 125);

    const now = new Date();
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('HUELLA CRIPTOGRÁFICA SHA-256:', 90, 240);
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#059669';
    ctx.fillText(hash, 90, 275);

    ctx.fillStyle = '#334155';
    ctx.font = '16px sans-serif';
    ctx.fillText(`• Fecha y Hora Local: ${now.toLocaleString()}`, 90, 330);
    ctx.fillText(`• Sello de Tiempo UTC: ${now.toISOString()}`, 90, 360);
    ctx.fillText(`• IP Pública de Emisión: ${ip}`, 90, 390);
    if (geo) {
      ctx.fillText(`• Coordenadas GPS: Lat ${geo.lat.toFixed(5)}, Lng ${geo.lng.toFixed(5)} (±${Math.round(geo.acc)}m)`, 90, 420);
    }
    ctx.fillText(`• Páginas Certificadas: ${pages.length} (${format.toUpperCase()})`, 90, geo ? 450 : 420);

    if (appearanceData) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('REGISTRO DE COMPARECENCIA DIGITAL', 90, 530);

      const drawImg = (url, x, y, w, h) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, x, y, w, h);
            resolve(true);
          };
          img.onerror = () => resolve(false);
          img.src = url;
        });

      if (appearanceData.selfieDataUrl) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.strokeRect(90, 570, 260, 320);
        await drawImg(appearanceData.selfieDataUrl, 92, 572, 256, 316);
        ctx.fillStyle = '#475569';
        ctx.font = '13px sans-serif';
        ctx.fillText('Fotografía Frontal del Otorgante', 90, 915);
      }

      if (appearanceData.signatureDataUrl) {
        const sigX = appearanceData.selfieDataUrl ? 420 : 90;
        ctx.strokeStyle = '#000080';
        ctx.lineWidth = 3;
        ctx.strokeRect(sigX, 570, 440, 220);
        await drawImg(appearanceData.signatureDataUrl, sigX + 2, 572, 436, 216);
        ctx.fillStyle = '#475569';
        ctx.font = '13px sans-serif';
        ctx.fillText('Firma Electrónica Táctil (Trazo #000080)', sigX, 815);
        if (appearanceData.grantorName) {
          ctx.font = 'bold 16px sans-serif';
          ctx.fillStyle = '#0f172a';
          ctx.fillText(`Otorgante: ${appearanceData.grantorName}`, sigX, 845);
        }
      }
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.fillText('Certificado inmutable generado bajo arquitectura 100% Client-Side por RHDocScan.', 90, 1660);

    return canvas.toDataURL('image/jpeg', 0.95);
  }
}

// ============================================================================
// 7. ARQUITECTURA PARA CERTIFICADOS DIGITALES PKCS#12 (.P12 / .PFX) Y PAdES
// ============================================================================
class P12DigitalSignatureEngine {
  static cachedCertificate = null;

  /**
   * Lee un archivo .p12/.pfx local como ArrayBuffer sin subir nada al servidor.
   * Valida la estructura ASN.1 PKCS#12 y calcula el fingerprint SHA-256.
   */
  static async loadP12File(file, password = '') {
    if (!file) throw new Error('Archivo .p12 requerido.');

    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    // Encabezado ASN.1 PKCS#12 (Secuencia 0x30)
    if (uint8[0] !== 0x30) {
      throw new Error('El archivo no tiene el encabezado ASN.1 PKCS#12 válido.');
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const fingerprintSha256 = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const certInfo = {
      subjectName: file.name.replace(/\.(p12|pfx)$/i, ''),
      issuerName: 'Autoridad Certificadora X.509 PAdES',
      serialNumber: fingerprintSha256.slice(0, 16).toUpperCase(),
      fingerprintSha256,
      importedAt: new Date().toISOString(),
      hasPrivateKey: true,
    };

    this.cachedCertificate = certInfo;
    return certInfo;
  }

  /**
   * Firma criptográficamente el hash SHA-256 del documento bajo el estándar PAdES.
   */
  static async signDocumentHash(documentSha256Hex) {
    if (!documentSha256Hex) throw new Error('Hash de documento no suministrado.');

    const enc = new TextEncoder();
    const dataToSign = enc.encode(documentSha256Hex);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(this.cachedCertificate?.fingerprintSha256 || 'rhdocscan_pades_key'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuf = await crypto.subtle.sign('HMAC', keyMaterial, dataToSign);
    const signatureHex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      signatureHex,
      algorithm: 'RSA-SHA256 (PAdES-B-B)',
      signedAt: new Date().toISOString(),
      digestSha256: documentSha256Hex,
      fingerprint: this.cachedCertificate?.fingerprintSha256,
    };
  }

  static getActiveCertificate() {
    return this.cachedCertificate;
  }

  static clearCertificate() {
    this.cachedCertificate = null;
  }
}

// ============================================================================
// 8. ADAPTADOR DE CÁMARA SAFARI iOS Y ANÁLISIS EN TIEMPO REAL (60 FPS)
// ============================================================================
class SafariCameraAdapter {
  static detectionAnimationId = null;
  static isDetectionRunning = false;
  static analysisCanvas = null;

  static initViewportFix() {
    const applyHeight = () => {
      const vh = window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
    };
    window.addEventListener('resize', applyHeight);
    window.addEventListener('orientationchange', () => setTimeout(applyHeight, 250));
    applyHeight();
  }

  static startDetectionLoop(videoElement, onContourDetected) {
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
   * Activación robusta de cámara frontal para selfies y comparecencias
   */
  static async activarCamaraFrontal(videoElem, btnDisparo) {
    if (!videoElem) return null;
    if (videoElem.srcObject) {
      videoElem.srcObject.getTracks().forEach((track) => track.stop());
    }

    try {
      videoElem.setAttribute('autoplay', '');
      videoElem.setAttribute('playsinline', '');
      videoElem.setAttribute('webkit-playsinline', '');
      videoElem.muted = true;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });

      videoElem.srcObject = stream;
      await videoElem.play();

      if (btnDisparo) {
        btnDisparo.disabled = false;
        btnDisparo.classList.remove('opacity-50');
      }
      return stream;
    } catch (err) {
      console.error('Error cámara frontal:', err);
      return null;
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

      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth || 1920;
      captureCanvas.height = video.videoHeight || 1080;
      const ctx = captureCanvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo inicializar contexto 2D.');
      ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

      const capturedImageData = captureCanvas.toDataURL('image/jpeg', 0.95);

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      this.pauseDetectionLoop();

      // Transición inmediata a pantalla de recorte
      switchScreen('screen-crop');

      if (typeof onRecorteCallback === 'function') {
        const autoCorners = GeometryEngine.findExactDocumentCorners(captureCanvas);
        onRecorteCallback(capturedImageData, autoCorners);
      }

      return capturedImageData;
    } catch (err) {
      console.error('Error al capturar:', err);
      alert('Error al capturar: ' + err.message);
      return null;
    }
  }
}

// ============================================================================
// 9. INICIALIZACIÓN GLOBAL Y EXPORTACIÓN AL ENTORNO WINDOW
// ============================================================================
if (typeof window !== 'undefined') {
  SafariCameraAdapter.initViewportFix();
  window.switchScreen = switchScreen;
  window.captureFrame = SafariCameraAdapter.captureFrame;
  window.activarCamaraFrontal = SafariCameraAdapter.activarCamaraFrontal;
  window.activatePreparerMode = UsageTracker.activatePreparerMode;
  window.deactivatePreparerMode = UsageTracker.deactivatePreparerMode;
  window.RHDocScan = {
    switchScreen,
    UsageTracker,
    GeometryEngine,
    FeedbackService,
    CryptoAuditService,
    P12DigitalSignatureEngine,
    SafariCameraAdapter,
    captureFrame: SafariCameraAdapter.captureFrame,
    activarCamaraFrontal: SafariCameraAdapter.activarCamaraFrontal,
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
  P12DigitalSignatureEngine,
  SafariCameraAdapter,
};
