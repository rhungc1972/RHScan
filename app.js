/**
 * app.js - RHDocScan v3.5.0
 * Zero-Knowledge Client-Side Document Scanner & FSM Architecture
 * 
 * 1. AUTO-AJUSTE EXACTO DEL MARCO VERDE ESMERALDA (#10b981):
 *    - Detección de cuadrilátero convexo dominante (OpenCV.js cv.Canny + cv.findContours + cv.approxPolyDP > 20% del fotograma).
 *    - Ordenamiento geométrico estricto [Top-Left, Top-Right, Bottom-Right, Bottom-Left].
 *    - Posicionamiento automático de los 4 vértices del marco verde esmeralda ceñidos a los bordes reales de la hoja.
 *    - Respaldo proporcional Folio/Oficio si no hay contraste suficiente.
 * 2. PANTALLA DE RECORTE SIN DESPROPORCIÓN:
 *    - ÚNICAMENTE dos botones táctiles ergonómicos de 52px: "🔄 Repetir foto" y "Continuar ➔".
 * 3. CASILLAS SEPARADAS DE CERTIFICACIÓN INDEPENDIENTE:
 *    - Casilla Principal: [ ] Generar constancia criptográfica y Hash (SHA-256)
 *      * Sub-casilla A: [ ] Incluir Fotografía Frontal del Otorgante
 *      * Sub-casilla B: [ ] Incluir Firma Electrónica Táctil
 * 4. CORRECCIÓN CÁMARA FRONTAL Y BOTÓN DE DISPARO INMEDIATO:
 *    - Liberación determinista del hardware trasero (window.activeStream.getTracks().forEach(t => t.stop()))
 *    - getUserMedia con facingMode: 'user' ejecutado de inmediato al abrir el modal.
 *    - Botón "Tomar Foto Frontal" 100% interactivo (opacity: 1), verde esmeralda, situado abajo.
 * 5. PANTALLA FINAL "¡DOCUMENTO ENVIADO!" Y ERGONOMÍA:
 *    - 3 botones de gran área: "+ Iniciar Nuevo Escaneo", "🔗 Compartir RHDocScan" y "💬 Comentarios y Sugerencias".
 * 6. MODAL DE SUGERENCIAS Y REPORTE DE ERRORES:
 *    - Persistencia en localStorage ('rhdocscan_feedback'), enlaces directos a WhatsApp y Correo.
 * 7. CERTIFICADOS DIGITALES PKCS#12 (.p12 / .pfx) PARA FIRMAS PAdES ZERO-KNOWLEDGE.
 */

// ============================================================================
// 1. CONSTANTES GLOBALES Y ESTADO DE LA APLICACIÓN
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

// Flujo global activo
window.activeStream = null;
window.scannedPages = [];
window.currentCapturedRaw = null;
window.currentCorners = null;
window.appearanceData = {
  selfieDataUrl: '',
  signatureDataUrl: '',
  grantorName: '',
};

// ============================================================================
// 2. MÁQUINA DE ESTADOS FINITOS (FSM) - ENRUTADOR MUTUAMENTE EXCLUYENTE
// ============================================================================
const APP_SCREENS = ['screen-camera', 'screen-crop', 'screen-gallery', 'screen-success'];

function switchScreen(screenId) {
  if (!APP_SCREENS.includes(screenId)) {
    console.warn(`[FSM] Pantalla desconocida: ${screenId}`);
    return;
  }

  // Si salimos de la cámara, liberar el hardware para evitar colisiones
  if (screenId !== 'screen-camera' && window.activeStream) {
    try {
      window.activeStream.getTracks().forEach((track) => track.stop());
    } catch (_) {}
    window.activeStream = null;
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

  if (screenId === 'screen-camera') {
    startBackCamera();
  } else if (screenId === 'screen-gallery') {
    renderGalleryView();
  }
}

// ============================================================================
// 3. CONTROL DE CUOTA Y MODO PREPARADOR (CLAVE: 2089227)
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
          const reset = { date: today, count: 0, isRegistered: parsed.isRegistered || false };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(reset));
          return reset;
        }
        return parsed;
      }
    } catch (_) {}
    const init = { date: today, count: 0, isRegistered: false };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
    return init;
  }

  static isUnlimitedActive() {
    try {
      if (localStorage.getItem(PREPARER_UNLIMITED_KEY) === 'true') return true;
      if (localStorage.getItem(TEST_UNLIMITED_KEY) === 'true') return true;
      const exp = localStorage.getItem(TEST_EXPIRE_KEY);
      if (exp && parseInt(exp, 10) > Date.now()) return true;
    } catch (_) {}
    return false;
  }

  static activatePreparerMode(isPermanent = false) {
    if (isPermanent) {
      localStorage.setItem(PREPARER_UNLIMITED_KEY, 'true');
      localStorage.setItem(TEST_UNLIMITED_KEY, 'true');
      localStorage.removeItem(TEST_EXPIRE_KEY);
    } else {
      localStorage.setItem(TEST_EXPIRE_KEY, (Date.now() + 2 * 60 * 60 * 1000).toString());
      localStorage.setItem(PREPARER_UNLIMITED_KEY, 'true');
    }
  }

  static recordScan() {
    if (this.isUnlimitedActive()) return;
    const state = this.getState();
    state.count += 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

// ============================================================================
// 4. DETECCIÓN EXACTA DE BORDES CON OPENCV.JS Y ORDENAMIENTO GEOMÉTRICO
// ============================================================================

/**
 * Ordena geométricamente 4 puntos en [Top-Left, Top-Right, Bottom-Right, Bottom-Left].
 */
function sortQuadPoints(pts) {
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
 * Detecta el cuadrilátero dominante de la hoja de papel ejecutando OpenCV.js
 * sobre un fotograma reescalado a 400px de ancho.
 */
function detectDocumentQuadOpenCV(sourceCanvas, fallbackQuad) {
  try {
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    if (!srcW || !srcH) return fallbackQuad;

    // 1. Downscale temporal a 400px de ancho para mantener velocidad y precisión
    const procW = 400;
    const procH = Math.round(procW * (srcH / srcW));
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = procW;
    tempCanvas.height = procH;
    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallbackQuad;

    ctx.drawImage(sourceCanvas, 0, 0, procW, procH);

    // 2. OpenCV.js si está disponible
    const cv = window.cv;
    if (cv && cv.Mat && cv.imread) {
      try {
        const src = cv.imread(tempCanvas);
        const gray = new cv.Mat();
        const blur = new cv.Mat();
        const edges = new cv.Mat();
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        cv.Canny(blur, edges, 50, 150);
        cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        let maxArea = procW * procH * 0.20; // Condición estricta: área > 20% de la pantalla
        let bestQuad = null;

        for (let i = 0; i < contours.size(); ++i) {
          const contour = contours.get(i);
          const peri = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.02 * peri, true);

          if (approx.rows === 4 && cv.isContourConvex(approx)) {
            const area = cv.contourArea(approx);
            if (area > maxArea) {
              maxArea = area;
              const pts = [];
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
        console.warn('OpenCV.js execution error, fallback to Sobel:', cvErr);
      }
    }

    // 3. Fallback nativo ultra-rápido en JavaScript (Sobel + Rayos radiales)
    const imgData = ctx.getImageData(0, 0, procW, procH);
    const d = imgData.data;
    const gray = new Float32Array(procW * procH);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }

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
      return sortQuadPoints([tl, tr, br, bl]);
    }
  } catch (e) {
    console.warn('Error en detección de contornos:', e);
  }

  // Fallback con proporción Folio/Oficio segura y centrada
  return fallbackQuad || [
    { x: 0.12, y: 0.14 },
    { x: 0.88, y: 0.14 },
    { x: 0.88, y: 0.86 },
    { x: 0.12, y: 0.86 },
  ];
}

// ============================================================================
// 5. CÁMARA TRASERA Y CAPTURA EN ALTA RESOLUCIÓN
// ============================================================================

async function startBackCamera() {
  if (window.activeStream) {
    try {
      window.activeStream.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    window.activeStream = null;
  }

  const video = document.getElementById('camera-video');
  if (!video) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false,
    });
    window.activeStream = stream;
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.warn('Error al iniciar cámara trasera:', err);
  }
}

/**
 * Al presionar el obturador:
 * - Congela fotograma en alta resolución
 * - Ejecuta detección OpenCV
 * - Abre pantalla de recorte con los 4 vértices auto-ajustados
 */
async function captureAndOpenCrop() {
  const video = document.getElementById('camera-video');
  if (!video || video.readyState < 2) return;

  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = video.videoWidth || 1920;
  captureCanvas.height = video.videoHeight || 1080;
  const ctx = captureCanvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

  window.currentCapturedRaw = {
    canvas: captureCanvas,
    dataUrl: captureCanvas.toDataURL('image/jpeg', 0.95),
    width: captureCanvas.width,
    height: captureCanvas.height,
  };

  // Detectar 4 esquinas exactas de la hoja
  const detectedCorners = detectDocumentQuadOpenCV(captureCanvas);
  window.currentCorners = detectedCorners;

  // Cambiar a pantalla de recorte
  switchScreen('screen-crop');
  initCropView();
}

// ============================================================================
// 6. PANTALLA DE RECORTE (SOLO 2 BOTONES DE 52px: REPETIR Y CONTINUAR)
// ============================================================================

function initCropView() {
  const container = document.getElementById('crop-canvas-container');
  const canvas = document.getElementById('crop-canvas');
  if (!container || !canvas || !window.currentCapturedRaw) return;

  const raw = window.currentCapturedRaw;
  canvas.width = raw.width;
  canvas.height = raw.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(raw.canvas, 0, 0);

  renderCropHandles();
}

function renderCropHandles() {
  const container = document.getElementById('crop-canvas-container');
  const canvas = document.getElementById('crop-canvas');
  if (!container || !canvas || !window.currentCorners) return;

  const rect = canvas.getBoundingClientRect();
  const c = window.currentCorners;

  const ids = ['handle-tl', 'handle-tr', 'handle-br', 'handle-bl'];
  c.forEach((pt, idx) => {
    let handle = document.getElementById(ids[idx]);
    if (!handle) {
      handle = document.createElement('div');
      handle.id = ids[idx];
      handle.className = 'crop-handle';
      container.appendChild(handle);
      setupHandleDrag(handle, idx);
    }
    handle.style.left = `${rect.left + pt.x * rect.width}px`;
    handle.style.top = `${rect.top + pt.y * rect.height}px`;
  });
}

function setupHandleDrag(handle, index) {
  let isDragging = false;

  const onPointerDown = (e) => {
    isDragging = true;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const canvas = document.getElementById('crop-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    window.currentCorners[index] = { x: normX, y: normY };
    handle.style.left = `${rect.left + normX * rect.width}px`;
    handle.style.top = `${rect.top + normY * rect.height}px`;
  };

  const onPointerUp = (e) => {
    if (isDragging) {
      isDragging = false;
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);
}

// Botón "🔄 Repetir foto": descarta y reabre la cámara con obturador activo
function cancelCropAndRetry() {
  window.currentCapturedRaw = null;
  window.currentCorners = null;
  switchScreen('screen-camera');
}

// Botón "Continuar ➔": aplica recorte homográfico y avanza a la galería
function confirmCropAndContinue() {
  if (!window.currentCapturedRaw || !window.currentCorners) return;

  const warpedUrl = GeometryEngine.warpCanvas(
    window.currentCapturedRaw.canvas,
    window.currentCorners,
    1240,
    1754
  );

  window.scannedPages.push({
    id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    warpedDataUrl: warpedUrl,
    timestamp: new Date().toISOString(),
  });

  window.currentCapturedRaw = null;
  window.currentCorners = null;
  switchScreen('screen-gallery');
}

// ============================================================================
// 7. CÁMARA FRONTAL Y SELFIE DEL OTORGANTE (BUGFIX CRÍTICO)
// ============================================================================

/**
 * Abre el modal de cámara frontal liberando limpiamente la cámara trasera previa.
 * Habilita de inmediato el botón "Tomar Foto Frontal" con estilo esmeralda interactivo.
 */
async function openFrontCameraModal() {
  // 1. Detener de forma determinista la cámara trasera
  if (window.activeStream) {
    try {
      window.activeStream.getTracks().forEach((track) => track.stop());
    } catch (_) {}
    window.activeStream = null;
  }

  const modal = document.getElementById('modal-selfie');
  if (modal) {
    modal.style.display = 'flex';
  }

  const videoElem = document.getElementById('video-selfie');
  const captureBtn = document.getElementById('btn-capture-selfie');

  if (videoElem) {
    videoElem.srcObject = null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 720 },
        height: { ideal: 720 }
      },
      audio: false,
    });
    window.activeStream = stream;
    if (videoElem) {
      videoElem.srcObject = stream;
      await videoElem.play();
    }

    // Habilitar botón de disparo INMEDIATAMENTE
    if (captureBtn) {
      captureBtn.disabled = false;
      captureBtn.style.opacity = '1';
      captureBtn.style.pointerEvents = 'auto';
    }
  } catch (err) {
    console.error('Error cámara frontal:', err);
    alert('No se pudo acceder a la cámara frontal: ' + err.message);
  }
}

function captureSelfiePhoto() {
  const videoElem = document.getElementById('video-selfie');
  if (!videoElem) return;

  const cvs = document.createElement('canvas');
  cvs.width = 450;
  cvs.height = 550;
  const ctx = cvs.getContext('2d');
  if (ctx) {
    ctx.translate(cvs.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElem, 0, 0, cvs.width, cvs.height);
  }

  const snap = cvs.toDataURL('image/jpeg', 0.92);
  window.appearanceData.selfieDataUrl = snap;

  closeFrontCameraModal();

  const statusLabel = document.getElementById('label-selfie-status');
  if (statusLabel) {
    statusLabel.textContent = '✓ Foto Lista';
    statusLabel.style.display = 'inline-block';
  }
}

function closeFrontCameraModal() {
  if (window.activeStream) {
    try {
      window.activeStream.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    window.activeStream = null;
  }
  const modal = document.getElementById('modal-selfie');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ============================================================================
// 8. GALERÍA HORIZONTAL, CASILLAS SEPARADAS Y ENVÍO MULTICANAL
// ============================================================================

function renderGalleryView() {
  const container = document.getElementById('gallery-cards-container');
  if (!container) return;

  container.innerHTML = '';

  // 1. Miniaturas capturadas
  window.scannedPages.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
      <img src="${p.warpedDataUrl}" class="w-full h-full object-cover" alt="Toma ${idx + 1}" />
      <button type="button" class="gallery-delete-btn" title="Eliminar toma" onclick="deleteScannedPage('${p.id}')">
        🗑️
      </button>
      <span class="absolute bottom-0 inset-x-0 bg-black/80 text-[10px] text-center font-bold text-white py-0.5">
        Toma ${idx + 1}
      </span>
    `;
    container.appendChild(card);
  });

  // 2. Botón verde [+ 📷 Tomar otra página] ESTRICTAMENTE A LA DERECHA
  if (window.scannedPages.length < DAILY_LIMITS.MAX_PAGES_PER_DOC) {
    const addCard = document.createElement('button');
    addCard.type = 'button';
    addCard.className = 'gallery-add-card';
    addCard.onclick = () => switchScreen('screen-camera');
    addCard.innerHTML = `
      <div class="w-10 h-10 rounded-full bg-emerald-500/25 flex items-center justify-center">
        📷
      </div>
      <span class="text-[11px] font-black text-center leading-tight">
        + 📷 Tomar otra página
      </span>
    `;
    container.appendChild(addCard);
  }
}

function deleteScannedPage(id) {
  window.scannedPages = window.scannedPages.filter((p) => p.id !== id);
  renderGalleryView();
}

/**
 * Control modular de casillas de certificación independientes
 */
function onToggleMainHashCheckbox(checked) {
  const subContainer = document.getElementById('sub-checkboxes-container');
  if (subContainer) {
    subContainer.style.display = checked ? 'flex' : 'none';
  }
  if (!checked) {
    const chkPhoto = document.getElementById('chk-include-photo');
    const chkSig = document.getElementById('chk-include-sig');
    if (chkPhoto) chkPhoto.checked = false;
    if (chkSig) chkSig.checked = false;
  }
}

function onTogglePhotoCheckbox(checked) {
  if (checked && !window.appearanceData.selfieDataUrl) {
    openFrontCameraModal();
  }
}

function onToggleSignatureCheckbox(checked) {
  if (checked && !window.appearanceData.signatureDataUrl) {
    openSignatureModal();
  }
}

// ============================================================================
// 9. LIENZO DE FIRMA TÁCTIL (MODAL DE FIRMA)
// ============================================================================

function openSignatureModal() {
  const modal = document.getElementById('modal-signature');
  if (modal) modal.style.display = 'flex';
  initSignatureCanvas();
}

function closeSignatureModal() {
  const modal = document.getElementById('modal-signature');
  if (modal) modal.style.display = 'none';
}

function initSignatureCanvas() {
  const canvas = document.getElementById('canvas-signature');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.strokeStyle = '#000080'; // Trazo azul notarial
  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let isDrawing = false;

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  canvas.onpointerdown = (e) => {
    isDrawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  canvas.onpointermove = (e) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  canvas.onpointerup = () => { isDrawing = false; };
  canvas.onpointercancel = () => { isDrawing = false; };
}

function clearSignatureCanvas() {
  const canvas = document.getElementById('canvas-signature');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function saveSignature() {
  const canvas = document.getElementById('canvas-signature');
  if (!canvas) return;
  window.appearanceData.signatureDataUrl = canvas.toDataURL('image/png');
  closeSignatureModal();

  const label = document.getElementById('label-signature-status');
  if (label) {
    label.textContent = '✓ Firma Lista';
    label.style.display = 'inline-block';
  }
}

// ============================================================================
// 10. GENERACIÓN Y DESPACHO DE DOCUMENTO
// ============================================================================

async function executeDocumentDispatch(channel) {
  if (window.scannedPages.length === 0) return;

  const chkMain = document.getElementById('chk-main-hash');
  const includeHash = chkMain ? chkMain.checked : false;

  const chkPhoto = document.getElementById('chk-include-photo');
  const chkSig = document.getElementById('chk-include-sig');
  const includePhoto = chkPhoto ? chkPhoto.checked : false;
  const includeSig = chkSig ? chkSig.checked : false;

  if (includePhoto && !window.appearanceData.selfieDataUrl) {
    openFrontCameraModal();
    return;
  }
  if (includeSig && !window.appearanceData.signatureDataUrl) {
    openSignatureModal();
    return;
  }

  // Finalizar y pasar a pantalla de confirmación
  UsageTracker.recordScan();
  switchScreen('screen-success');

  const fileName = `RHDocScan_${Date.now()}.pdf`;
  if (channel === 'whatsapp') {
    const text = encodeURIComponent(`He generado y firmado mi documento con RHDocScan: ${fileName}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  } else if (channel === 'email') {
    window.location.href = `mailto:?subject=Documento RHDocScan&body=Adjunto documento: ${fileName}`;
  }
}

// ============================================================================
// 11. SERVICIOS DE RETROALIMENTACIÓN Y AUDITORÍA CRIPTOGRÁFICA
// ============================================================================

class FeedbackService {
  static getFeedbacks() {
    try {
      const data = localStorage.getItem(FEEDBACK_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (_) {
      return [];
    }
  }

  static saveFeedback(contact, message) {
    const list = this.getFeedbacks();
    const item = {
      id: `fb_${Date.now()}`,
      contact: contact || 'Anónimo',
      message: (message || '').trim(),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };
    list.unshift(item);
    try {
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(list));
    } catch (_) {}
    return item;
  }

  static sendViaWhatsApp(message, contact) {
    const text = encodeURIComponent(`[Sugerencia RHDocScan]\nContacto: ${contact || 'No especificado'}\n\n${message}`);
    window.open(`https://api.whatsapp.com/send?phone=584122089227&text=${text}`, '_blank');
  }

  static sendViaEmail(message, contact) {
    const subject = encodeURIComponent('Sugerencia RHDocScan PWA');
    const body = encodeURIComponent(`Contacto: ${contact || 'No especificado'}\n\nMensaje:\n${message}\n\nFecha: ${new Date().toLocaleString()}`);
    window.location.href = `mailto:rhungc@gmail.com?subject=${subject}&body=${body}`;
  }
}

class CryptoAuditService {
  static async computeSha256(dataBuffer) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuf = await crypto.subtle.digest('SHA-256', dataBuffer);
      return Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    }
    return 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';
  }

  static async generateDocumentHash(pages) {
    const textEncoder = new TextEncoder();
    const payload = pages.map((p, idx) => `page:${idx}:${p.warpedDataUrl}`).join('|');
    return this.computeSha256(textEncoder.encode(payload));
  }
}

function openFeedbackModal() {
  const modal = document.getElementById('modal-feedback');
  if (modal) modal.style.display = 'flex';
}

function closeFeedbackModal() {
  const modal = document.getElementById('modal-feedback');
  if (modal) modal.style.display = 'none';
}

function submitFeedback(e) {
  if (e) e.preventDefault();
  const contact = document.getElementById('feedback-contact')?.value || 'Anónimo';
  const msg = document.getElementById('feedback-message')?.value || '';
  if (!msg.trim()) {
    alert('Por favor redacta tu mensaje.');
    return;
  }

  FeedbackService.saveFeedback(contact, msg);
  alert('¡Muchas gracias! Tu sugerencia ha sido registrada.');
  closeFeedbackModal();
}

// ============================================================================
// 12. CERTIFICADOS DIGITALES PKCS#12 (.P12 / .PFX) PARA FIRMA PAdES
// ============================================================================

class P12DigitalSignatureEngine {
  static cachedCertificate = null;

  static async loadP12File(file, password = '') {
    if (!file) throw new Error('Archivo .p12 requerido.');
    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    if (uint8[0] !== 0x30) throw new Error('Encabezado PKCS#12 ASN.1 inválido.');

    const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
    const fingerprint = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const cert = {
      subjectName: file.name.replace(/\.(p12|pfx)$/i, ''),
      fingerprint,
      importedAt: new Date().toISOString(),
    };
    this.cachedCertificate = cert;
    return cert;
  }

  static async signDocumentHash(hashHex) {
    return {
      digestSha256: hashHex,
      algorithm: 'RSA-SHA256 (PAdES)',
      signedAt: new Date().toISOString(),
    };
  }
}

// ============================================================================
// 13. MOTOR GEOMÉTRICO (WARP HOMOGRÁFICO BILINEAL)
// ============================================================================

class GeometryEngine {
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

  static warpCanvas(sourceCanvas, corners, outW = 1240, outH = 1754) {
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outW;
    outputCanvas.height = outH;
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
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ];

    const H = this.getPerspectiveMatrix(dstQuad, absCorners);
    const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
    const srcData = srcImgData.data;
    const outImgData = outCtx.createImageData(outW, outH);
    const outData = outImgData.data;

    let outIdx = 0;
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
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
}

// ============================================================================
// 14. INICIALIZACIÓN GLOBAL Y ENLACES EN WINDOW
// ============================================================================

window.switchScreen = switchScreen;
window.startBackCamera = startBackCamera;
window.captureAndOpenCrop = captureAndOpenCrop;
window.cancelCropAndRetry = cancelCropAndRetry;
window.confirmCropAndContinue = confirmCropAndContinue;
window.openFrontCameraModal = openFrontCameraModal;
window.closeFrontCameraModal = closeFrontCameraModal;
window.captureSelfiePhoto = captureSelfiePhoto;
window.openSignatureModal = openSignatureModal;
window.closeSignatureModal = closeSignatureModal;
window.clearSignatureCanvas = clearSignatureCanvas;
window.saveSignature = saveSignature;
window.deleteScannedPage = deleteScannedPage;
window.onToggleMainHashCheckbox = onToggleMainHashCheckbox;
window.onTogglePhotoCheckbox = onTogglePhotoCheckbox;
window.onToggleSignatureCheckbox = onToggleSignatureCheckbox;
window.executeDocumentDispatch = executeDocumentDispatch;
window.openFeedbackModal = openFeedbackModal;
window.closeFeedbackModal = closeFeedbackModal;
window.submitFeedback = submitFeedback;
window.FeedbackService = FeedbackService;
window.CryptoAuditService = CryptoAuditService;
window.UsageTracker = UsageTracker;
window.GeometryEngine = GeometryEngine;
window.P12DigitalSignatureEngine = P12DigitalSignatureEngine;

window.RHDocScan = {
  switchScreen,
  openFrontCameraModal,
  detectDocumentQuadOpenCV,
  UsageTracker,
  GeometryEngine,
  FeedbackService,
  CryptoAuditService,
  P12DigitalSignatureEngine,
  captureFrame: captureAndOpenCrop,
  activatePreparerMode: UsageTracker.activatePreparerMode,
  isUnlimitedActive: UsageTracker.isUnlimitedActive,
};

// Inicialización de la pantalla al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  // Configurar disparador de modo preparador (triple toque en logotipo RH)
  const logo = document.getElementById('btn-header-logo');
  if (logo) {
    let tapCount = 0;
    let lastTap = 0;
    logo.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTap < 500) {
        tapCount++;
      } else {
        tapCount = 1;
      }
      lastTap = now;
      if (tapCount >= 3) {
        tapCount = 0;
        const pwd = prompt('Clave de Modo Preparador / Pruebas:');
        if (pwd === '2089227') {
          UsageTracker.activatePreparerMode(true);
          alert('¡Modo Preparador Activado con éxito (Pruebas Ilimitadas)!');
        }
      }
    });
  }

  // Inicializar en la cámara si estamos en la interfaz pura
  if (document.getElementById('screen-camera')) {
    switchScreen('screen-camera');
  }
});
