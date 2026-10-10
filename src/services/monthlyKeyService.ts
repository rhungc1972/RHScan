// src/services/monthlyKeyService.ts
// Algoritmo de Claves Dinámicas Mensuales para Acceso Ilimitado

/**
 * Obtiene el código de 2 dígitos del mes calendario actual (ej: "10" para Octubre, "11" para Noviembre)
 */
export function getCurrentMonthCode(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1..12
  return String(month).padStart(2, '0');
}

/**
 * Valida la clave mensual de 6 dígitos:
 * - Debe tener exactamente 6 caracteres numéricos.
 * - El 2.º y 3.º dígito (índices 1 y 2) deben coincidir con el mes calendario actual.
 */
export function validateMonthlyKey(key: string): { isValid: boolean; message: string; currentMonth: number } {
  const clean = key.trim();
  const currentMonthCode = getCurrentMonthCode();
  const currentMonth = new Date().getMonth() + 1;

  if (!/^\d{6}$/.test(clean)) {
    return {
      isValid: false,
      message: 'La clave debe constar de exactamente 6 dígitos numéricos.',
      currentMonth,
    };
  }

  // Extraer el 2.° y 3.° dígito (índice 1 y 2)
  const keyMonthCode = clean.substring(1, 3);

  if (keyMonthCode !== currentMonthCode) {
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const monthName = monthNames[currentMonth - 1];
    return {
      isValid: false,
      message: `Clave no válida para ${monthName}. El 2.° y 3.° dígito deben ser "${currentMonthCode}".`,
      currentMonth,
    };
  }

  return {
    isValid: true,
    message: `¡Clave válida! Has desbloqueado escaneos ilimitados para este mes (${currentMonthCode}).`,
    currentMonth,
  };
}

/**
 * Genera una clave mensual de demostración válida para el mes actual
 */
export function generateSampleMonthlyKey(): string {
  const monthCode = getCurrentMonthCode();
  const d1 = Math.floor(1 + Math.random() * 9);
  const d4 = Math.floor(Math.random() * 10);
  const d5 = Math.floor(Math.random() * 10);
  const d6 = Math.floor(Math.random() * 10);
  return `${d1}${monthCode}${d4}${d5}${d6}`;
}
