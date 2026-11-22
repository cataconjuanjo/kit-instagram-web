// Lista canónica de pestañas de la ficha /admin/restaurante/[id].
// El query param ?tab=<id> es la fuente de verdad. Si viene vacío o
// con un valor no reconocido, cae a 'resumen'.
export const TABS_VALIDOS = ['resumen', 'inteligencia', 'hallazgos', 'matching', 'propuestas', 'seleccion', 'informe']
export const TAB_POR_DEFECTO = 'resumen'

export function resolverTab(param) {
  if (!param) return TAB_POR_DEFECTO
  const limpio = String(param).toLowerCase()
  return TABS_VALIDOS.includes(limpio) ? limpio : TAB_POR_DEFECTO
}

// Contrato: qué propiedades del objeto `analisis` (el output de
// analizarRestaurante) lee cada pestaña. Si una de estas propiedades
// deja de existir en el output, la pestaña correspondiente puede
// romperse por .map/.length. Los tests de contrato recorren esta tabla.
export const CAMPOS_POR_PESTANA = {
  resumen: {
    directos: ['score', 'prioridad', 'siguienteMovimiento', 'propuestasAbiertas', 'metricas'],
    metricas: ['vinos', 'copa', 'margenMedio', 'precioMedioVino', 'escaneos30', 'sommelier30', 'valorCoste'],
  },
  inteligencia: {
    // Esta pestaña consume `consultoriaFase1` (viene de BD, aparte del analisis).
    directos: [],
  },
  hallazgos: {
    directos: ['alertas', 'diagnostico'],
    diagnostico: ['ticket', 'wineMapping', 'salud', 'equilibrio', 'brechaCocina'],
    wineMapping: ['gamas', 'desajustes', 'referencias', 'reequilibrio'],
    gamaItem: ['label', 'vinos', 'vinosDetalle', 'delta', 'objetivoNumero', 'real', 'rangoTexto'],
  },
  matching: {
    // Pestaña matching no consume campos de `analisis` directamente, usa
    // vinos + vinosCatalogo (cargados aparte). Dejamos lista vacía
    // para mantener la tabla completa.
    directos: [],
  },
  propuestas: {
    directos: ['propuestasAbiertas'],
  },
  seleccion: {
    // La selección especial se carga aparte (tabla seleccion_especial).
    directos: [],
  },
  informe: {
    directos: ['score', 'prioridad', 'alertas', 'metricas'],
    metricas: ['valorVenta', 'valorCoste'],
  },
}
