// src/services/usageTracker.ts
// Gestión de límites diarios, claves mensuales y persistencia local

import { ScanTrackerState, RegisteredUserRecord } from '../types';

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

const DEFAULT_USERS: RegisteredUserRecord[] = [
  { id: 'usr_1', name: 'Roberto Hernández', email: 'rhungc@gmail.com', registeredAt: '2026-10-08 09:30' },
  { id: 'usr_2', name: 'Laura Gómez', email: 'laura.gomez@notaria21.com', registeredAt: '2026-10-09 11:15' },
  { id: 'usr_3', name: 'Carlos Morales', email: 'cmorales@legalgroup.pe', registeredAt: '2026-10-09 16:42' },
];

/**
 * Carga o inicializa el estado del rastreador desde localStorage
 */
export function getUsageState(): ScanTrackerState {
  const today = getLocalDateString();
  const currentMonth = new Date().getMonth() + 1;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: ScanTrackerState = JSON.parse(raw);
      const userList = parsed.registeredUsersList && parsed.registeredUsersList.length > 0
        ? parsed.registeredUsersList
        : DEFAULT_USERS;

      // Si la fecha guardada es de un día anterior, reiniciamos el conteo a 0
      if (parsed.date !== today) {
        const resetState: ScanTrackerState = {
          date: today,
          count: 0,
          isRegistered: Boolean(parsed.isRegistered),
          userEmail: parsed.userEmail || '',
          userName: parsed.userName || '',
          registeredAt: parsed.registeredAt || '',
          unlimitedUntilMonth: parsed.unlimitedUntilMonth === currentMonth ? currentMonth : undefined,
          registeredUsersList: userList,
        };
        saveUsageState(resetState);
        return resetState;
      }

      if (!parsed.registeredUsersList) {
        parsed.registeredUsersList = userList;
        saveUsageState(parsed);
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
    registeredUsersList: DEFAULT_USERS,
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
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);

  const newUser: RegisteredUserRecord = {
    id: 'usr_' + Date.now(),
    name,
    email,
    registeredAt: nowStr,
  };

  const existingList = current.registeredUsersList || [];
  const updatedList = existingList.some(u => u.email === email)
    ? existingList
    : [newUser, ...existingList];

  const updated: ScanTrackerState = {
    ...current,
    isRegistered: true,
    userName: name,
    userEmail: email,
    registeredAt: nowStr,
    registeredUsersList: updatedList,
  };
  saveUsageState(updated);
  return updated;
}

/**
 * Activa acceso ilimitado para el mes especificado mediante clave mensual
 */
export function setUnlimitedMonth(month: number): ScanTrackerState {
  const current = getUsageState();
  const updated: ScanTrackerState = {
    ...current,
    unlimitedUntilMonth: month,
  };
  saveUsageState(updated);
  return updated;
}

/**
 * Comprueba si el modo de pruebas / preparador ilimitado está activo
 * Soporta modo permanente (rhdocscan_unlimited = 'true') y modo 2 horas
 */
export function isTestModeActive(): boolean {
  try {
    // 1. Clave permanente de modo preparador
    if (localStorage.getItem('rhdocscan_unlimited') === 'true') {
      return true;
    }

    // 2. Clave de pruebas con expiración temporal (2 horas)
    const expiresStr = localStorage.getItem('rhdocscan_test_mode_expires');
    const isUnlimited = localStorage.getItem('rhdocscan_is_unlimited');
    if (isUnlimited === 'true' && expiresStr) {
      const expires = parseInt(expiresStr, 10);
      if (Date.now() < expires) {
        return true;
      } else {
        localStorage.removeItem('rhdocscan_test_mode_expires');
        localStorage.removeItem('rhdocscan_is_unlimited');
      }
    }
  } catch (e) {
    console.warn('Error comprobando modo de pruebas:', e);
  }
  return false;
}

/**
 * Activa modo de pruebas ilimitado por 2 horas mediante clave 2089227
 */
export function activateTestMode2Hours(): void {
  const expireTime = Date.now() + 2 * 60 * 60 * 1000;
  localStorage.setItem('rhdocscan_test_mode_expires', expireTime.toString());
  localStorage.setItem('rhdocscan_is_unlimited', 'true');
  localStorage.setItem('rhdocscan_unlimited', 'true');
}

/**
 * Activa modo preparador / pruebas con la clave maestra '2089227'
 * @param permanent Si es true, activa modo permanente sin expiración
 */
export function activatePreparerMode(permanent = true): boolean {
  try {
    localStorage.setItem('rhdocscan_unlimited', 'true');
    localStorage.setItem('rhdocscan_is_unlimited', 'true');
    if (!permanent) {
      const expireTime = Date.now() + 2 * 60 * 60 * 1000;
      localStorage.setItem('rhdocscan_test_mode_expires', expireTime.toString());
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
export function deactivatePreparerMode(): void {
  try {
    localStorage.removeItem('rhdocscan_unlimited');
    localStorage.removeItem('rhdocscan_is_unlimited');
    localStorage.removeItem('rhdocscan_test_mode_expires');
  } catch (e) {
    console.error('Error desactivando modo preparador:', e);
  }
}

/**
 * Comprueba si el usuario tiene cupo disponible hoy (o acceso ilimitado)
 */
export function hasQuotaAvailable(state: ScanTrackerState): boolean {
  if (isTestModeActive()) {
    return true; // Acceso ilimitado por modo de pruebas (clave 2089227)
  }
  const currentMonth = new Date().getMonth() + 1;
  if (state.unlimitedUntilMonth === currentMonth) {
    return true; // Acceso ilimitado por clave mensual
  }
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
  isUnlimited: boolean;
} {
  if (isTestModeActive()) {
    return {
      used: state.count,
      max: 999,
      remaining: 999,
      isRegistered: true,
      isExceeded: false,
      isUnlimited: true,
    };
  }

  const currentMonth = new Date().getMonth() + 1;
  const isUnlimited = state.unlimitedUntilMonth === currentMonth;

  if (isUnlimited) {
    return {
      used: state.count,
      max: 999,
      remaining: 999,
      isRegistered: true,
      isExceeded: false,
      isUnlimited: true,
    };
  }

  const max = state.isRegistered ? REGISTERED_DAILY_LIMIT : ANONYMOUS_DAILY_LIMIT;
  const remaining = Math.max(0, max - state.count);
  return {
    used: state.count,
    max,
    remaining,
    isRegistered: state.isRegistered,
    isExceeded: state.count >= max,
    isUnlimited: false,
  };
}

/**
 * Calcula los milisegundos restantes hasta la medianoche local
 */
export function getMsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, midnight.getTime() - now.getTime());
}

/**
 * Formatea el tiempo restante en formato HH:MM:SS o HHh MMm SSs
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
