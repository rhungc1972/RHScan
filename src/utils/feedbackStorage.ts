// src/utils/feedbackStorage.ts
// Gestión de observaciones y sugerencias almacenadas en localStorage bajo la clave 'rhdocscan_feedback'

import { FeedbackRecord } from '../types';

export const FEEDBACK_STORAGE_KEY = 'rhdocscan_feedback';

/**
 * Obtiene la lista de observaciones y sugerencias almacenadas en localStorage
 */
export function getFeedbackList(): FeedbackRecord[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('Error al leer sugerencias de localStorage:', err);
    return [];
  }
}

/**
 * Guarda una nueva sugerencia en localStorage
 * Si el nombre viene vacío, se guarda como "Anónimo"
 */
export function saveFeedback(rawName: string, message: string): FeedbackRecord {
  const cleanName = rawName.trim() ? rawName.trim() : 'Anónimo';
  const newRecord: FeedbackRecord = {
    id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: cleanName,
    message: message.trim(),
    timestamp: new Date().toISOString(),
  };

  const list = getFeedbackList();
  list.unshift(newRecord);

  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Error al guardar sugerencia en localStorage:', err);
  }

  return newRecord;
}

/**
 * Elimina todas las sugerencias almacenadas
 */
export function clearFeedbackList(): void {
  try {
    localStorage.removeItem(FEEDBACK_STORAGE_KEY);
  } catch (err) {
    console.error('Error al limpiar sugerencias:', err);
  }
}

/**
 * Descarga las sugerencias en formato CSV con codificación limpia UTF-8 y nombre sugerencias_rhdocscan.csv
 */
export function downloadFeedbackCsv(): void {
  const list = getFeedbackList();
  if (list.length === 0) {
    alert('No hay sugerencias registradas para descargar.');
    return;
  }

  const escapeCsv = (str: string) => {
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

  // Prefijo BOM UTF-8 (\uFEFF) para visualización correcta de tildes y caracteres en Excel/Sheets
  const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'sugerencias_rhdocscan.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
