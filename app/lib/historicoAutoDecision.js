import { compararHistoricoConflicto } from './compararHistoricoConflicto.js'

/**
 * Decide si hacer upsert en historico_mensual con datos 'auto'.
 * Protege filas manuales: si origen='manual' y hay diff, devuelve el conflicto
 * sin hacer upsert para que el caller lo exponga al usuario.
 */
export function decidirHistoricoAuto(payload, filaExistente) {
  if (!filaExistente || filaExistente.origen !== 'manual') {
    return { upsert: true, conflicto: null }
  }
  const conflicto = compararHistoricoConflicto(payload, filaExistente)
  return { upsert: false, conflicto: conflicto ?? null }
}
