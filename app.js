/**
 * app.js - RHDocScan (Zero-Knowledge Client-Side Document Scanner)
 * Arquitectura 100% Client-Side lista para producción y Netlify.
 * Optimizado para iOS Safari (iPhone), Android y PWA:
 * - Corrección de altura 100dvh / -webkit-fill-available
 * - Barra inferior de controles fijada en calc(25px + env(safe-area-inset-bottom)) con aceleración 3D translateZ(0)
 * - Compatibilidad de cámara con playsinline, webkit-playsinline y restricciones resilientes
 * - Homografía proyectiva (warp perspective) con interpolación bilineal
 * - Web Share API Nivel 2 y fallback de descarga
 * - Módulo de Observaciones y Sugerencias ('rhdocscan_feedback') con descarga CSV (BOM UTF-8)
 * - Registro simplificado por correo electrónico
 * - Compartir aplicación y aviso de disponibilidad en tiendas
 */

// 1. CONSTANTES Y CONFIGURACIÓN
const DAILY_LIMITS = {
  ANONYMOUS: 3,
  REGISTERED: 10,
  MAX_PAGES_PER_DOC: 10,
};

const STORAGE_KEY = 'scan_tracker';
const FEEDBACK_STORAGE_KEY = 'rhdocscan_feedback';

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

// 3. MÓDULO MATEMÁTICO: HOMOGRAFÍA PROYECTIVA Y RECORTE
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
   * Endereza la perspectiva de la imagen con interpolación bilineal
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

// 4. MÓDULO DE GESTIÓN DE OBSERVACIONES Y SUGERENCIAS
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

// 5. MÓDULO DE DESPACHO Y WEB SHARE API
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

  static async shareApp(onToast) {
    const shareData = {
      title: 'RHDocScan - Escáner Móvil Seguro',
      text: 'Escanea documentos en PDF con calidad profesional, 100% privado y sin servidores.',
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }

    // Fallback: copiar al portapapeles
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
      }
      if (typeof onToast === 'function') {
        onToast('¡Enlace copiado al portapapeles!');
      } else {
        alert('¡Enlace copiado al portapapeles!');
      }
    } catch (clipErr) {
      console.warn('Error al copiar portapapeles:', clipErr);
    }
  }

  static getAppStoreToastMessage() {
    return '📱 RHDocScan estará disponible muy pronto en Google Play Store y Apple App Store. ¡Por ahora puedes usarla directamente desde la web!';
  }
}

// 6. CONTROLADOR DE CÁMARA Y ADAPTACIONES PARA SAFARI iOS
class SafariCameraAdapter {
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

    // Asegurar atributos requeridos por WebKit / iOS Safari
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
      console.warn('Fallo getUserMedia con resolución ideal, intentando fallback iOS:', e);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingMode } },
      });
    }

    videoElement.srcObject = stream;
    try {
      await videoElement.play();
    } catch (playErr) {
      console.warn('AutoPlay bloqueado hasta interacción:', playErr);
    }

    return stream;
  }

  /**
   * Captura robusta directa por Canvas para WebKit / iOS Safari
   * Evita APIs incompatibles como ImageCapture.takePhoto() y bucles congelados
   */
  static async captureFrame(video, detectionAnimationId, onRecorteCallback) {
    try {
      if (!video || video.readyState < 2) {
        console.warn("Video aún no listo");
        return null;
      }
      // Crear canvas temporal con la resolución nativa del sensor
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth || 1920;
      captureCanvas.height = video.videoHeight || 1080;
      const ctx = captureCanvas.getContext('2d');
      if (!ctx) {
        throw new Error("No se pudo obtener contexto 2D para la captura.");
      }
      ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
      
      // Guardar la imagen capturada en memoria
      const capturedImageData = captureCanvas.toDataURL('image/jpeg', 0.95);
      
      // Detener temporalmente el loop de auto-detección
      if (detectionAnimationId) {
        cancelAnimationFrame(detectionAnimationId);
      }
      
      // Pasar a la pantalla de recorte y ajuste fino
      if (typeof onRecorteCallback === 'function') {
        onRecorteCallback(capturedImageData);
      } else if (typeof window.mostrarPantallaRecorte === 'function') {
        window.mostrarPantallaRecorte(capturedImageData);
      }
      return capturedImageData;
    } catch (err) {
      console.error("Error al capturar en iOS:", err);
      alert("Error al capturar imagen: " + err.message);
      return null;
    }
  }

  /**
   * Auto-ajuste automático del marco verde al capturar
   * Si la visión artificial detectó 4 esquinas las toma directamente;
   * de lo contrario, aplica los 4 vértices del marco Folio/Oficio como fallback inicial.
   */
  static getAutoAdjustedCorners(detectedCorners, viewportWidth, viewportHeight, sensorWidth, sensorHeight) {
    if (detectedCorners && Array.isArray(detectedCorners) && detectedCorners.length === 4) {
      return detectedCorners;
    }
    // Fallback: Marco tamaño Folio/Oficio (proporción 1:1.45)
    const folioAspect = 1.45;
    const marginRatio = 0.84;
    let frameW = (viewportWidth || 360) * marginRatio;
    let frameH = frameW * folioAspect;
    const maxAvailableH = (viewportHeight || 640) * 0.74;
    if (frameH > maxAvailableH) {
      frameH = maxAvailableH;
      frameW = frameH / folioAspect;
    }
    const startX = ((viewportWidth || 360) - frameW) / 2;
    const startY = ((viewportHeight || 640) - frameH) / 2 - 12;

    const screenQuad = [
      { x: startX, y: startY },
      { x: startX + frameW, y: startY },
      { x: startX + frameW, y: startY + frameH },
      { x: startX, y: startY + frameH },
    ];

    return screenQuad.map(pt => GeometryEngine.screenToSensor(
      pt.x, pt.y, viewportWidth, viewportHeight, sensorWidth || 1920, sensorHeight || 1080
    ));
  }
}

/**
 * Transición de pantalla a recorte y ajuste fino en el DOM
 */
function mostrarPantallaRecorte(imgData) {
  const cameraScreen = document.querySelector('.camera-screen, .camera-view, #camera-container');
  if (cameraScreen) {
    cameraScreen.style.display = 'none';
  }
  const cropScreen = document.querySelector('.crop-screen, .perspective-editor, #crop-container');
  if (cropScreen) {
    cropScreen.style.display = 'flex';
    cropScreen.style.position = 'fixed';
    cropScreen.style.inset = '0';
    cropScreen.style.zIndex = '100000';
  }
  const previewImg = document.querySelector('#captured-preview-img, .captured-preview');
  if (previewImg && imgData) {
    previewImg.src = imgData;
  }
}

// Inicialización automática de adaptaciones
if (typeof window !== 'undefined') {
  SafariCameraAdapter.initViewportFix();
  window.captureFrame = SafariCameraAdapter.captureFrame;
  window.mostrarPantallaRecorte = mostrarPantallaRecorte;
  window.RHDocScan = {
    UsageTracker,
    GeometryEngine,
    FeedbackService,
    DocumentShareService,
    SafariCameraAdapter,
    captureFrame: SafariCameraAdapter.captureFrame,
    mostrarPantallaRecorte,
  };
}
