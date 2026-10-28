/**
 * Excepciones de disponibilidad — editar aquí sin tocar la lógica de slots.
 *
 * blockedDates   Días completos cerrados (YYYY-MM-DD).
 * blockedSlots   Franjas concretas cerradas ({ date, time }) — horario Europe/Madrid.
 * extraDates     Días abiertos fuera del horario habitual ({ date, slots: ['HH:MM', ...] }).
 *
 * Cerrar un día:  añadir su fecha a blockedDates y desplegar.
 * Abrir un día:   añadir { date, slots } a extraDates y desplegar.
 * Cerrar una hora: añadir { date, time } a blockedSlots y desplegar.
 */

/** @type {string[]} */
export const blockedDates = [
  // TODO(semana 26/10–01/11/2026): rellenar días completos cerrados — formato 'YYYY-MM-DD'
  // Ejemplo: '2026-10-28',
]

/** @type {{ date: string, time: string }[]} */
export const blockedSlots = [
  // TODO(semana 26/10–01/11/2026): rellenar franjas concretas cerradas — horario Europe/Madrid
  // Ejemplo: { date: '2026-10-29', time: '10:00' },
]

/** @type {{ date: string, slots: string[] }[]} */
export const extraDates = [
  // TODO(semana 26/10–01/11/2026): rellenar días abiertos puntualmente con sus horas
  // Ejemplo: { date: '2026-11-01', slots: ['10:00', '10:30', '11:00'] },
]
