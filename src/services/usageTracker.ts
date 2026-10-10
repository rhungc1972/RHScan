// src/services/usageTracker.ts
// Gestión de límites diarios, persistencia local y cuenta regresiva a medianoche

import { ScanTrackerState } from '../types';

const STORAGE_KEY = 'scan_tracker';
export const ANONYMOUS_DAILY_LIMIT = 3;
export const REGISTERED_DAILY_LIMIT = 10;
export const MAX_PAGES_PER_DOCUMENT = 10;

/**
 * Obtiene la fecha actual en formato local YYYY-MM-DD
 */
export function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Carga o inicializa el estado del rastreador desde localStorage
 */
export function getUsageState(): ScanTrackerState {
  const today = getLocalDateString();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: ScanTrackerState = JSON.parse(raw);
      // Si la fecha guardada es de un día anterior, reiniciamos el conteo a 0
      // pero conservamos el estado de registro y datos del usuario
      if (parsed.date !== today) {
        const resetState: ScanTrackerState = {
          date: today,
          count: 0,
          isRegistered: Boolean(parsed.isRegistered),
          userEmail: parsed.userEmail || '',
          userName: parsed.userName || '',
        };
        saveUsageState(resetState);
        return resetState;
      }
      return parsed;
    }
  } catch (e) {
    console.warn('Error leyendo scan_tracker:', e);
  }

  // Estado por defecto
  const defaultState: ScanTrackerState = {
    date: today,
    count: 0,
    isRegistered: false,
    userEmail: '',
    userName: '',
  };
  saveUsageState(defaultState);
  return defaultState;
}

/**
 * Guarda el estado en localStorage
 */
export function saveUsageState(state: ScanTrackerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Error guardando scan_tracker en localStorage:', e);
  }
}

/**
 * Incrementa el conteo de documentos escaneados hoy
 */
export function incrementScanCount(): ScanTrackerState {
  const current = getUsageState();
  const updated: ScanTrackerState = {
    ...current,
    count: current.count + 1,
  };
  saveUsageState(updated);
  return updated;
}

/**
 * Registra formalmente al usuario tras validar el código OTP
 */
export function setRegisteredUser(name: string, email: string): ScanTrackerState {
  const current = getUsageState();
  const updated: ScanTrackerState = {
    ...current,
    isRegistered: true,
    userName: name,
    userEmail: email,
  };
  saveUsageState(updated);
  return updated;
}

/**
 * Comprueba si el usuario tiene cupo disponible hoy
 */
export function hasQuotaAvailable(state: ScanTrackerState): boolean {
  const maxLimit = state.isRegistered ? REGISTERED_DAILY_LIMIT : ANONYMOUS_DAILY_LIMIT;
  return state.count < maxLimit;
}

/**
 * Obtiene el cupo restante y el límite máximo
 */
export function getQuotaInfo(state: ScanTrackerState): {
  used: number;
  max: number;
  remaining: number;
  isRegistered: boolean;
  isExceeded: boolean;
} {
  const max = state.isRegistered ? REGISTERED_DAILY_LIMIT : ANONYMOUS_DAILY_LIMIT;
  const remaining = Math.max(0, max - state.count);
  return {
    used: state.count,
    max,
    remaining,
    isRegistered: state.isRegistered,
    isExceeded: state.count >= max,
  };
}

/**
 * Calcula los milisegundos restantes hasta la medianoche local (00:00:00 del día siguiente)
 */
export function getMsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, midnight.getTime() - now.getTime());
}

/**
 * Formatea el tiempo restante en formato HHh MMm SSs
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');

  return `${hStr}h ${mStr}m ${sStr}s`;
}

