/**
 * ═══════════════════════════════════════════════════════════════
 *  SEED — BAR PILOTO "La Taberna del Puerto"
 *  Restaurante ficticio completamente precargado para demos
 *
 *  Uso:  node scripts/seed-demo-bar.js
 *
 *  ⚠️  ANTES DE EJECUTAR: corre el SQL en Supabase Dashboard:
 *      supabase/add_dashboard_policies.sql
 *
 *  Genera:
 *   • 1  restaurante premium con branding completo
 *   • 29 vinos con todos los campos (coste, stock, proveedor...)
 *   • 18 platos con categoría, descripción y precio
 *   • ~5.000 estadísticas (90 días histórico + datos de HOY)
 *   • movimientos de stock históricos por vino
 *   • 6 hub links + 3 propuestas de consultor
 *   • Usuario auth demo@taberna-del-puerto.com (si es posible)
 * ═══════════════════════════════════════════════════════════════
 */

const { createClient } = require('@supabase/supabase-js')

// ── Config ────────────────────────────────────────────────────
// Carga desde variables de entorno o .env.local
require('dotenv').config({ path: '.env.local' })
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const DEMO_EMAIL    = 'demo@taberna-del-puerto.com'
const DEMO_PASSWORD = 'TabernaPiloto24!'
const DEMO_SLUG     = 'taberna-del-puerto'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

// ── Helpers ───────────────────────────────────────────────────
const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const pick  = arr => arr[rand(0, arr.length - 1)]
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Fecha N días atrás a una hora aleatoria del servicio */
function daysAgo(n) {
  const d = new Date()           // fecha real del sistema
  d.setDate(d.getDate() - n)
  // horario de bar: entre 10:00 y 00:30
  const hora = rand(0, 1) === 0
    ? rand(12, 16)   // comida
    : rand(20, 23)   // cena
  d.setHours(hora, rand(0, 59), rand(0, 59), 0)
  return d.toISOString()
}

/** Timestamp para HOY en una hora de servicio */
function hoyHora(hora, min) {
  const d = new Date()
  d.setHours(hora, min || rand(0, 59), rand(0, 59), 0)
  return d.toISOString()
}

// ── 1. RESTAURANTE ────────────────────────────────────────────
const RESTAURANTE = {
  nombre: 'La Taberna del Puerto',
  slug:   DEMO_SLUG,
  email:  DEMO_EMAIL,
  ciudad: 'Málaga',
  plan:   'premium',
  subscription_status: 'active',
  subscription_ends_at: '2027-06-01T00:00:00Z',
  ticket_medio_comida: 38,

  // Branding
  color_primario: '#3D2B1F',   // marrón oscuro cálido
  color_fondo:    '#FAF5EE',   // crema suave
  color_acento:   '#B5451B',   // terracota andaluza
  tipografia:     'serif',
  logo_url:    null,
  banner_url:  null,

  // Hub público
  hub_activo:   true,
  hub_titulo:   'La Taberna del Puerto',
  hub_subtitulo:'Vinos de autor · Tapas malagueñas',
  hub_overlay:  0.52,
  hub_estilo:   'nubes',
  hub_mostrar_logo:      false,
  hub_mostrar_nombre:    true,
  hub_mostrar_direccion: true,

  // Social
  instagram_url: 'https://instagram.com/tabernadelPuerto',
  facebook_url:  null,

  // Camarero
  camarero_pin: '2847',
}

// ── 2. VINOS ──────────────────────────────────────────────────
const VINOS = [
  // ── TINTOS ──────────────────────────────────────────────────
  {
    nombre: 'Muga Reserva', bodega: 'Bodegas Muga', tipo: 'tinto',
    region: 'Rioja', uva: 'Tempranillo, Garnacha, Mazuelo, Graciano', anada: '2019',
    precio_copa: 5.50, precio_botella: 32, coste_compra: 13.50,
    stock: 12, stock_minimo: 4,
    proveedor: 'Vinos Alhambra SL', referencia_proveedor: 'MUG-RES-19',
    formato_compra: 'Caja 6',
    notas_cata: 'tánico, estructurado, fruta negra, madera, largo',
    activo: true,
  },
  {
    nombre: 'Protos Reserva', bodega: 'Bodegas Protos', tipo: 'tinto',
    region: 'Ribera del Duero', uva: 'Tempranillo', anada: '2018',
    precio_copa: 6.00, precio_botella: 36, coste_compra: 16.00,
    stock: 8, stock_minimo: 3,
    proveedor: 'Vinos Alhambra SL', referencia_proveedor: 'PRO-RES-18',
    formato_compra: 'Caja 6',
    notas_cata: 'tánico, potente, fruta negra, tostado, larga crianza',
    activo: true,
  },
  {
    nombre: 'Viña Zaco Tempranillo', bodega: 'Bodegas Bilbaínas', tipo: 'tinto',
    region: 'Rioja', uva: 'Tempranillo', anada: '2021',
    precio_copa: 3.50, precio_botella: 19, coste_compra: 7.80,
    stock: 22, stock_minimo: 6,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'VZA-TEM-21',
    formato_compra: 'Caja 12',
    notas_cata: 'frutal, ligero, cereza, fácil beber, joven',
    activo: true,
  },
  {
    nombre: 'Casa Castillo Pie Franco', bodega: 'Casa Castillo', tipo: 'tinto',
    region: 'Jumilla', uva: 'Monastrell', anada: '2020',
    precio_copa: 7.00, precio_botella: 42, coste_compra: 18.50,
    stock: 6, stock_minimo: 2,
    proveedor: 'Vinos Alhambra SL', referencia_proveedor: 'CCF-PIE-20',
    formato_compra: 'Caja 6',
    notas_cata: 'cuerpo pleno, fruta negra, minerales, especias, concentrado',
    activo: true,
  },
  {
    nombre: 'Descendientes Pétalos del Bierzo', bodega: 'Descendientes J. Palacios', tipo: 'tinto',
    region: 'Bierzo', uva: 'Mencía', anada: '2021',
    precio_copa: 6.50, precio_botella: 38, coste_compra: 16.50,
    stock: 9, stock_minimo: 3,
    proveedor: 'Vinos Alhambra SL', referencia_proveedor: 'DJP-PET-21',
    formato_compra: 'Caja 6',
    notas_cata: 'elegante, frutal, violetas, mineral, acidez viva',
    activo: true,
  },
  {
    nombre: 'Cortijo Los Aguilares', bodega: 'Cortijo Los Aguilares', tipo: 'tinto',
    region: 'Serranía de Ronda', uva: 'Tempranillo, Cabernet', anada: '2021',
    precio_copa: 5.00, precio_botella: 28, coste_compra: 11.00,
    stock: 16, stock_minimo: 5,
    proveedor: 'Bodegas de Ronda', referencia_proveedor: 'CLA-TIN-21',
    formato_compra: 'Caja 6',
    notas_cata: 'fresco, montaña, frutal, taninos amables, especias',
    activo: true,
  },
  {
    nombre: 'El Nido', bodega: 'Casa Castillo & Egly-Ouriet', tipo: 'tinto',
    region: 'Jumilla', uva: 'Cabernet Sauvignon, Monastrell', anada: '2019',
    precio_copa: 9.00, precio_botella: 54, coste_compra: 25.00,
    stock: 3, stock_minimo: 1,
    proveedor: 'Vinos Alhambra SL', referencia_proveedor: 'ELN-TIN-19',
    formato_compra: 'Caja 6',
    notas_cata: 'grandioso, concentrado, muy tánico, profundo, largo',
    activo: true,
  },
  {
    nombre: 'Contador', bodega: 'Bodegas Contador', tipo: 'tinto',
    region: 'Rioja', uva: 'Tempranillo', anada: '2020',
    precio_copa: 14.00, precio_botella: 85, coste_compra: 40.00,
    stock: 2, stock_minimo: 1,
    proveedor: 'Vinos Alhambra SL', referencia_proveedor: 'CNT-TIN-20',
    formato_compra: 'Caja 6',
    notas_cata: 'icónico, sedoso, complejísimo, larga crianza, ático',
    activo: true,
  },
  {
    nombre: 'Telmo Rodríguez Lanzaga', bodega: 'Telmo Rodríguez', tipo: 'tinto',
    region: 'Rioja', uva: 'Tempranillo', anada: '2020',
    precio_copa: 6.00, precio_botella: 35, coste_compra: 14.50,
    stock: 10, stock_minimo: 3,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'TRL-LAN-20',
    formato_compra: 'Caja 6',
    notas_cata: 'elegante, frutal, fresco, poca madera, terroir riojano',
    activo: true,
  },
  {
    nombre: 'Finca Allende Rioja', bodega: 'Finca Allende', tipo: 'tinto',
    region: 'Rioja', uva: 'Tempranillo', anada: '2019',
    precio_copa: 5.50, precio_botella: 31, coste_compra: 13.00,
    stock: 11, stock_minimo: 4,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'FAL-RIO-19',
    formato_compra: 'Caja 6',
    notas_cata: 'equilibrado, fruta roja madura, roble fino, persistente',
    activo: true,
  },

  // ── BLANCOS ─────────────────────────────────────────────────
  {
    nombre: 'Martín Códax Albariño', bodega: 'Martín Códax', tipo: 'blanco',
    region: 'Rías Baixas', uva: 'Albariño', anada: '2023',
    precio_copa: 4.50, precio_botella: 26, coste_compra: 10.50,
    stock: 20, stock_minimo: 6,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'MCA-ALB-23',
    formato_compra: 'Caja 6',
    notas_cata: 'fresco, cítrico, alta acidez, floral, salino',
    activo: true,
  },
  {
    nombre: 'Godello Valdesil', bodega: 'Bodegas Valdesil', tipo: 'blanco',
    region: 'Valdeorras', uva: 'Godello', anada: '2022',
    precio_copa: 5.00, precio_botella: 29, coste_compra: 12.00,
    stock: 14, stock_minimo: 4,
    proveedor: 'Vinos Alhambra SL', referencia_proveedor: 'GVL-GOD-22',
    formato_compra: 'Caja 6',
    notas_cata: 'graso, mineral, manzana verde, larga acidez, elegante',
    activo: true,
  },
  {
    nombre: 'Ariyanas Natural', bodega: 'Bodegas Bentomiz', tipo: 'blanco',
    region: 'Málaga', uva: 'Moscatel de Alejandría', anada: '2022',
    precio_copa: 6.00, precio_botella: 34, coste_compra: 14.00,
    stock: 8, stock_minimo: 2,
    proveedor: 'Bodegas de Ronda', referencia_proveedor: 'ARI-NAT-22',
    formato_compra: 'Caja 6',
    notas_cata: 'floral intenso, fresco, naranja, moscatel seco, original',
    activo: true,
  },
  {
    nombre: 'Pazo Señorans Selección de Añada', bodega: 'Pazo de Señorans', tipo: 'blanco',
    region: 'Rías Baixas', uva: 'Albariño', anada: '2019',
    precio_copa: 7.00, precio_botella: 42, coste_compra: 19.00,
    stock: 5, stock_minimo: 2,
    proveedor: 'Vinos Alhambra SL', referencia_proveedor: 'PSA-SEL-19',
    formato_compra: 'Caja 6',
    notas_cata: 'complejo, cítrico evolucionado, salino, volumen, largo',
    activo: true,
  },
  {
    nombre: 'Gramona La Plana', bodega: 'Gramona', tipo: 'blanco',
    region: 'Penedès', uva: 'Xarello', anada: '2021',
    precio_copa: 5.50, precio_botella: 32, coste_compra: 13.50,
    stock: 9, stock_minimo: 3,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'GRA-PLA-21',
    formato_compra: 'Caja 6',
    notas_cata: 'mineral, almendra, hinojo, estructura, fermentado en barrica',
    activo: true,
  },
  {
    nombre: 'El Grifo Canari Malvasía', bodega: 'El Grifo', tipo: 'blanco',
    region: 'Lanzarote', uva: 'Malvasía Volcánica', anada: '2022',
    precio_copa: 5.00, precio_botella: 28, coste_compra: 11.50,
    stock: 10, stock_minimo: 3,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'EGC-MAL-22',
    formato_compra: 'Caja 6',
    notas_cata: 'volcánico, mineral, limón, sal, singular y sorprendente',
    activo: true,
  },
  {
    nombre: 'Viña Esmeralda', bodega: 'Torres', tipo: 'blanco',
    region: 'Penedès', uva: 'Moscatel, Gewürztraminer', anada: '2023',
    precio_copa: 3.50, precio_botella: 19, coste_compra: 7.50,
    stock: 24, stock_minimo: 8,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'VES-MOS-23',
    formato_compra: 'Caja 12',
    notas_cata: 'aromático, floral, rosas, lichis, fresco, dulzor residual leve',
    activo: true,
  },

  // ── ROSADOS ─────────────────────────────────────────────────
  {
    nombre: 'Muga Rosado', bodega: 'Bodegas Muga', tipo: 'rosado',
    region: 'Rioja', uva: 'Garnacha, Viura, Tempranillo', anada: '2023',
    precio_copa: 4.00, precio_botella: 22, coste_compra: 9.00,
    stock: 18, stock_minimo: 5,
    proveedor: 'Vinos Alhambra SL', referencia_proveedor: 'MUG-ROS-23',
    formato_compra: 'Caja 6',
    notas_cata: 'fresco, fresa, floral, ligero, ideal aperitivo',
    activo: true,
  },
  {
    nombre: 'Ochoa Rosado de Lágrima', bodega: 'Bodegas Ochoa', tipo: 'rosado',
    region: 'Navarra', uva: 'Garnacha', anada: '2023',
    precio_copa: 3.50, precio_botella: 19, coste_compra: 7.50,
    stock: 20, stock_minimo: 6,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'OCH-ROS-23',
    formato_compra: 'Caja 12',
    notas_cata: 'fresco, fresa, frambuesa, acidez viva, agradable',
    activo: true,
  },
  {
    nombre: 'Naveran Rosé', bodega: 'Naveran', tipo: 'rosado',
    region: 'Penedès', uva: 'Pinot Noir', anada: '2022',
    precio_copa: 5.00, precio_botella: 28, coste_compra: 11.50,
    stock: 10, stock_minimo: 3,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'NAV-ROS-22',
    formato_compra: 'Caja 6',
    notas_cata: 'delicado, fresa silvestre, pétalos de rosa, fresco, elegante',
    activo: true,
  },

  // ── ESPUMOSOS ───────────────────────────────────────────────
  {
    nombre: 'Juvé & Camps Reserva de la Familia', bodega: 'Juvé & Camps', tipo: 'espumoso',
    region: 'Cava DO', uva: 'Macabeo, Xarello, Parellada', anada: null,
    precio_copa: 6.00, precio_botella: 35, coste_compra: 15.00,
    stock: 14, stock_minimo: 4,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'JVC-RES-NV',
    formato_compra: 'Caja 6',
    notas_cata: 'burbuja fina, brioche, manzana, cremoso, persistente',
    activo: true,
  },
  {
    nombre: 'Gramona Gran Cuvée', bodega: 'Gramona', tipo: 'espumoso',
    region: 'Cava DO', uva: 'Xarello, Macabeo', anada: '2019',
    precio_copa: 8.00, precio_botella: 48, coste_compra: 22.00,
    stock: 5, stock_minimo: 2,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'GRA-GRC-19',
    formato_compra: 'Caja 6',
    notas_cata: 'complejo, levaduras, nuez, burbuja elegante, gran persistencia',
    activo: true,
  },
  {
    nombre: 'Segura Viudas Brut Reserva', bodega: 'Segura Viudas', tipo: 'espumoso',
    region: 'Cava DO', uva: 'Macabeo, Parellada', anada: null,
    precio_copa: 4.00, precio_botella: 22, coste_compra: 9.00,
    stock: 20, stock_minimo: 6,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'SEG-BRU-NV',
    formato_compra: 'Caja 12',
    notas_cata: 'fresco, manzana, limón, burbuja activa, accesible',
    activo: true,
  },
  {
    nombre: 'Raventós i Blanc De Nit', bodega: 'Raventós i Blanc', tipo: 'espumoso',
    region: 'Conca del Riu Anoia', uva: 'Macabeo, Xarello, Parellada, Monastrell', anada: '2021',
    precio_copa: 7.00, precio_botella: 42, coste_compra: 18.50,
    stock: 7, stock_minimo: 2,
    proveedor: 'Vinos Alhambra SL', referencia_proveedor: 'RAV-NIT-21',
    formato_compra: 'Caja 6',
    notas_cata: 'rosado espumoso, fresa, frutos rojos, fresco, elegantísimo',
    activo: true,
  },

  // ── GENEROSOS ───────────────────────────────────────────────
  {
    nombre: 'Barbadillo Manzanilla Solear', bodega: 'Barbadillo', tipo: 'generoso',
    region: 'Manzanilla-Sanlúcar', uva: 'Palomino Fino', anada: null,
    precio_copa: 3.50, precio_botella: 18, coste_compra: 6.50,
    stock: 24, stock_minimo: 8,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'BAR-MAN-SL',
    formato_compra: 'Caja 6',
    notas_cata: 'salino, seco, punzante, manzanilla, brisa marina',
    activo: true,
  },
  {
    nombre: 'Valdespino Fino Inocente', bodega: 'Valdespino', tipo: 'generoso',
    region: 'Jerez DO', uva: 'Palomino Fino', anada: null,
    precio_copa: 4.00, precio_botella: 22, coste_compra: 8.50,
    stock: 18, stock_minimo: 5,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'VAL-FIN-INO',
    formato_compra: 'Caja 6',
    notas_cata: 'seco, almendra, manzana oxidada, fino, larga evolución',
    activo: true,
  },
  {
    nombre: 'González Byass Apóstoles', bodega: 'González Byass', tipo: 'generoso',
    region: 'Jerez DO', uva: 'Palomino, Pedro Ximénez', anada: null,
    precio_copa: 5.50, precio_botella: 32, coste_compra: 13.00,
    stock: 9, stock_minimo: 3,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'GBY-APO-AP',
    formato_compra: 'Caja 6',
    notas_cata: 'palo cortado, nueces, caramelo, rancio, complejo',
    activo: true,
  },

  // ── DULCES ──────────────────────────────────────────────────
  {
    nombre: 'Toro Albalá Don PX', bodega: 'Toro Albalá', tipo: 'dulce',
    region: 'Montilla-Moriles', uva: 'Pedro Ximénez', anada: '2010',
    precio_copa: 5.00, precio_botella: 30, coste_compra: 12.00,
    stock: 10, stock_minimo: 3,
    proveedor: 'Distribuciones Sur', referencia_proveedor: 'TAL-PX-10',
    formato_compra: 'Caja 6',
    notas_cata: 'dulce intenso, pasas, higos, regaliz, cremoso, muy largo',
    activo: true,
  },
  {
    nombre: 'Dimobe Lágrima Real', bodega: 'Dimobe', tipo: 'dulce',
    region: 'Málaga DO', uva: 'Moscatel de Alejandría', anada: '2021',
    precio_copa: 4.50, precio_botella: 26, coste_compra: 9.50,
    stock: 13, stock_minimo: 4,
    proveedor: 'Bodegas de Ronda', referencia_proveedor: 'DIM-LAG-21',
    formato_compra: 'Caja 6',
    notas_cata: 'dulce moscatel, naranja confitada, miel, suave, malagueño',
    activo: true,
  },
]

// ── 3. PLATOS ─────────────────────────────────────────────────
const PLATOS = [
  { nombre: 'Jamón ibérico de bellota D.O. Jabugo', categoria: 'Charcutería', descripcion: 'Loncheado en mesa, grasa infiltrada, curación 48 meses', precio: 28, activo: true },
  { nombre: 'Tabla de quesos malagueños', categoria: 'Charcutería', descripcion: 'Quesos frescos, semicurados y añejos de Málaga con miel y nueces', precio: 14, activo: true },
  { nombre: 'Gazpacho andaluz', categoria: 'Sopas frías', descripcion: 'Tomate, pepino, pimiento, con aceite de oliva virgen extra', precio: 6, activo: true },
  { nombre: 'Ajoblanco malagueño con uvas y jamón', categoria: 'Sopas frías', descripcion: 'Crema fría de almendra y ajo, uvas de Málaga, jamón ibérico', precio: 8, activo: true },
  { nombre: 'Porra antequerana con bacalao', categoria: 'Sopas frías', descripcion: 'Gazpacho espeso, bacalao desmigado, huevo cocido, jamón', precio: 8, activo: true },
  { nombre: 'Croquetas de pringá malagueña', categoria: 'Fritos', descripcion: 'Bechamel cremosa con pringá de cerdo y pavo, empanadas al momento', precio: 9, activo: true },
  { nombre: 'Berenjenas con miel de caña', categoria: 'Verduras', descripcion: 'Berenjenas fritas y rebozadas, miel de caña de Frigiliana', precio: 8, activo: true },
  { nombre: 'Torta de aceite con anchoas del Cantábrico', categoria: 'Entrantes', descripcion: 'Torta crujiente de aceite, anchoas 00, alcaparras y tomillo', precio: 10, activo: true },
  { nombre: 'Boquerones en vinagre de Málaga', categoria: 'Pescados', descripcion: 'Marinados en vinagre de Málaga, ajo y perejil, aceite de oliva', precio: 9, activo: true },
  { nombre: 'Atún rojo a la brasa', categoria: 'Pescados', descripcion: 'Ventresca marcada, salmorejo de base, reducción de vinagre de Jerez', precio: 18, activo: true },
  { nombre: 'Fritura malagueña del día', categoria: 'Pescados', descripcion: 'Mezcla de pescaíto según lonja: boquerones, salmonetes, calamares', precio: 14, activo: true },
  { nombre: 'Gamba blanca de Málaga a la plancha', categoria: 'Mariscos', descripcion: 'Gambas del litoral malagueño, sal gorda, limón', precio: 17, activo: true },
  { nombre: 'Pulpo a la brasa', categoria: 'Mariscos', descripcion: 'Pulpo gallego, cachelos, aceite de pimentón ahumado', precio: 17, activo: true },
  { nombre: 'Carrillada ibérica al Pedro Ximénez', categoria: 'Carnes', descripcion: 'Guisada 6 horas en PX Toro Albalá, patata asada con romero', precio: 16, activo: true },
  { nombre: 'Solomillo al Pedro Ximénez con Manzanilla', categoria: 'Carnes', descripcion: 'Solomillo ibérico, reducción de PX y Manzanilla, espárragos trigueros', precio: 20, activo: true },
  { nombre: 'Secreto ibérico a la brasa', categoria: 'Carnes', descripcion: 'Corte largo, brasa de encina, chimichurri de hierbas frescas', precio: 17, activo: true },
  { nombre: 'Tarta de queso al Pedro Ximénez', categoria: 'Postres', descripcion: 'Base de galleta, queso cremoso al horno, gelée de PX Toro Albalá', precio: 7, activo: true },
  { nombre: 'Crema catalana de naranja', categoria: 'Postres', descripcion: 'Crema brulée, ralladura de naranja de Málaga, azúcar caramelizado', precio: 6, activo: true },
]

// ── 4. HUB LINKS ──────────────────────────────────────────────
const HUB_LINKS = [
  { titulo: '🍷 Ver Carta de Vinos', url: '#carta', tipo: 'carta', orden: 1, visible: true },
  { titulo: '📅 Reservar Mesa', url: 'https://reservas.tabernadelPuerto.com', tipo: 'reservas', orden: 2, visible: true },
  { titulo: '📍 Cómo Llegar', url: 'https://maps.google.com/?q=Muelle+Uno+Malaga', tipo: 'link', orden: 3, visible: true },
  { titulo: '📱 Instagram', url: 'https://instagram.com/tabernadelPuerto', tipo: 'social', orden: 4, visible: true },
  { titulo: '🌐 Nuestra Web', url: 'https://tabernadelPuerto.com', tipo: 'link', orden: 5, visible: true },
  { titulo: '📞 Llamar', url: 'tel:+34952123456', tipo: 'link', orden: 6, visible: true },
]

// ── Objetivos y platos para detalles realistas ────────────────
const OBJETIVOS = ['maridaje', 'ticket', 'copas', 'rotar', 'local']
const PLATOS_NOMBRES = PLATOS.map(p => p.nombre)

// ── 5. MAIN ───────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════')
  console.log('  SEED — La Taberna del Puerto (Bar Piloto)')
  console.log('══════════════════════════════════════════════════\n')

  // ── 5.0 Crear usuario demo en Supabase Auth ───────────────
  console.log('👤  Creando usuario demo en Supabase Auth...')
  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { nombre: 'Demo — La Taberna del Puerto' },
    })
    if (authError) {
      if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
        console.log('   ℹ  El usuario demo ya existe (no se recrea)\n')
      } else {
        console.warn(`   ⚠️  No se pudo crear usuario auth: ${authError.message}`)
        console.log('      → Accede al restaurante desde el panel admin como admin\n')
      }
    } else {
      console.log(`   ✓ Usuario auth creado: ${DEMO_EMAIL}\n`)
    }
  } catch (e) {
    console.warn(`   ⚠️  Auth admin no disponible: ${e.message}`)
    console.log('      → Accede vía impersonación desde /admin o crea el usuario manualmente\n')
  }

  // ── 5.1 Limpiar datos anteriores ──────────────────────────
  console.log('🧹  Limpiando datos anteriores del demo...')
  const { data: existing } = await supabase
    .from('restaurantes')
    .select('id')
    .eq('email', DEMO_EMAIL)
    .maybeSingle()

  if (existing) {
    const restId = existing.id
    await supabase.from('estadisticas').delete().eq('restaurante_id', restId)
    await supabase.from('movimientos_stock').delete().eq('restaurante_id', restId)
    await supabase.from('platos').delete().eq('restaurante_id', restId)
    await supabase.from('vinos').delete().eq('restaurante_id', restId)
    await supabase.from('restaurante_links').delete().eq('restaurante_id', restId)
    await supabase.from('consultor_propuestas').delete().eq('restaurante_id', restId)
    await supabase.from('restaurantes').delete().eq('id', restId)
    console.log('   ✓ Datos anteriores eliminados\n')
  }

  // ── 5.2 Crear restaurante ─────────────────────────────────
  console.log('🏠  Creando restaurante...')
  const { data: rest, error: errRest } = await supabase
    .from('restaurantes')
    .insert(RESTAURANTE)
    .select()
    .single()

  if (errRest) {
    console.error('❌ Error al crear restaurante:', errRest.message)
    process.exit(1)
  }
  const restId = rest.id
  console.log(`   ✓ Restaurante creado: ${rest.nombre} (${restId})\n`)

  // ── 5.3 Insertar vinos ────────────────────────────────────
  console.log(`🍷  Insertando ${VINOS.length} vinos...`)
  const vinosConRestaurante = VINOS.map(v => ({ ...v, restaurante_id: restId }))
  const { data: vinosInsertados, error: errVinos } = await supabase
    .from('vinos')
    .insert(vinosConRestaurante)
    .select()

  if (errVinos) {
    console.error('❌ Error al insertar vinos:', errVinos.message)
    process.exit(1)
  }
  console.log(`   ✓ ${vinosInsertados.length} vinos insertados\n`)

  // ── 5.4 Insertar platos ───────────────────────────────────
  console.log(`🍽️   Insertando ${PLATOS.length} platos...`)
  const platosConRestaurante = PLATOS.map(p => ({ ...p, restaurante_id: restId }))
  const { error: errPlatos } = await supabase.from('platos').insert(platosConRestaurante)
  if (errPlatos) {
    console.error('❌ Error al insertar platos:', errPlatos.message)
    process.exit(1)
  }
  console.log(`   ✓ ${PLATOS.length} platos insertados\n`)

  // ── 5.5 Hub links ─────────────────────────────────────────
  console.log('🔗  Insertando hub links...')
  const linksConRestaurante = HUB_LINKS.map(l => ({ ...l, restaurante_id: restId }))
  const { error: errLinks } = await supabase.from('restaurante_links').insert(linksConRestaurante)
  if (errLinks) {
    console.warn('⚠️  Hub links:', errLinks.message)
  } else {
    console.log(`   ✓ ${HUB_LINKS.length} hub links\n`)
  }

  // ── 5.6 Estadísticas históricas (90 días) ─────────────────
  console.log('📊  Generando estadísticas históricas (días 1-90)...')
  const todasLasEstadisticas = []

  for (let dia = 90; dia >= 1; dia--) {
    const esFinDeSemana = (new Date().getDay() + dia) % 7 < 2
    const factor = esFinDeSemana ? 1.6 : 1.0

    // Escaneos QR
    const numEscaneos = Math.round(rand(12, 38) * factor)
    for (let i = 0; i < numEscaneos; i++) {
      todasLasEstadisticas.push({
        restaurante_id: restId,
        tipo: 'escaneo',
        detalle: null,
        created_at: daysAgo(dia),
      })
    }

    // Consultas sommelier (con nombre de plato real)
    const numSommelier = Math.round(rand(4, 16) * factor)
    for (let i = 0; i < numSommelier; i++) {
      todasLasEstadisticas.push({
        restaurante_id: restId,
        tipo: 'sommelier',
        detalle: pick(PLATOS_NOMBRES),
        created_at: daysAgo(dia),
      })
    }

    // Recomendaciones (mix camarero/cliente)
    const numRec = Math.round(rand(3, 12) * factor)
    for (let i = 0; i < numRec; i++) {
      const vino = pick(vinosInsertados)
      todasLasEstadisticas.push({
        restaurante_id: restId,
        tipo: 'recomendacion',
        detalle: JSON.stringify({
          vino_id:  vino.id,
          vino:     vino.nombre,
          origen:   rand(0, 2) === 0 ? 'camarero' : 'cliente',
          modo:     'auto',
          posicion: rand(1, 3),
          precio:   vino.precio_botella,
        }),
        created_at: daysAgo(dia),
      })
    }

    // Ventas — detalle completo con plato y objetivo
    const numVentas = Math.round(rand(3, 9) * factor)
    for (let i = 0; i < numVentas; i++) {
      const vino    = pick(vinosInsertados)
      const rnd     = Math.random()
      const resultado = rnd < 0.74 ? 'vendida'
                      : rnd < 0.86 ? 'no_convence'
                      : rnd < 0.94 ? 'no_stock'
                      : 'otra'
      const cantidad  = resultado === 'vendida' ? rand(1, 2) : 0
      todasLasEstadisticas.push({
        restaurante_id: restId,
        tipo: 'venta',
        detalle: JSON.stringify({
          vino_id:   vino.id,
          vino:      vino.nombre,
          resultado,
          cantidad,
          origen:    'camarero',
          plato:     pick(PLATOS_NOMBRES),
          objetivo:  pick(OBJETIVOS),
        }),
        created_at: daysAgo(dia),
      })
    }
  }

  // ── 5.7 Estadísticas de HOY ───────────────────────────────
  // Necesario para Cierre de servicio y métricas "hoy"
  console.log('📅  Generando estadísticas de HOY...')
  const hoyStats = []

  // Comida (12:00–16:00)
  const escaneoComida = rand(18, 30)
  for (let i = 0; i < escaneoComida; i++) {
    hoyStats.push({ restaurante_id: restId, tipo: 'escaneo', detalle: null,
      created_at: hoyHora(rand(12, 15)) })
  }
  const sommelierComida = rand(5, 9)
  for (let i = 0; i < sommelierComida; i++) {
    hoyStats.push({ restaurante_id: restId, tipo: 'sommelier', detalle: pick(PLATOS_NOMBRES),
      created_at: hoyHora(rand(12, 15)) })
  }

  // Ventas comida — mix de resultados para demo de Cierre
  const ventasComida = [
    { vino: vinosInsertados[0],  resultado: 'vendida',    plato: 'Jamón ibérico de bellota D.O. Jabugo', objetivo: 'maridaje' },
    { vino: vinosInsertados[10], resultado: 'vendida',    plato: 'Gamba blanca de Málaga a la plancha',   objetivo: 'maridaje' },
    { vino: vinosInsertados[16], resultado: 'vendida',    plato: 'Gazpacho andaluz',                       objetivo: 'copas' },
    { vino: vinosInsertados[17], resultado: 'vendida',    plato: 'Boquerones en vinagre de Málaga',        objetivo: 'local' },
    { vino: vinosInsertados[24], resultado: 'no_stock',   plato: 'Fritura malagueña del día',               objetivo: 'maridaje' },
    { vino: vinosInsertados[1],  resultado: 'no_convence', plato: 'Carrillada ibérica al Pedro Ximénez',   objetivo: 'ticket' },
    { vino: vinosInsertados[10], resultado: 'vendida',    plato: 'Pulpo a la brasa',                       objetivo: 'maridaje' },
    { vino: vinosInsertados[11], resultado: 'vendida',    plato: 'Atún rojo a la brasa',                   objetivo: 'maridaje' },
    { vino: vinosInsertados[6],  resultado: 'no_stock',   plato: 'Secreto ibérico a la brasa',              objetivo: 'ticket' },
  ]
  for (const v of ventasComida) {
    hoyStats.push({
      restaurante_id: restId,
      tipo: 'venta',
      detalle: JSON.stringify({
        vino_id: v.vino.id, vino: v.vino.nombre,
        resultado: v.resultado, cantidad: v.resultado === 'vendida' ? 1 : 0,
        origen: 'camarero', plato: v.plato, objetivo: v.objetivo,
      }),
      created_at: hoyHora(rand(12, 15)),
    })
    // Recomendación ligada a cada venta vendida
    if (v.resultado === 'vendida') {
      hoyStats.push({
        restaurante_id: restId, tipo: 'recomendacion',
        detalle: JSON.stringify({ vino_id: v.vino.id, vino: v.vino.nombre, origen: 'camarero', posicion: 1, precio: v.vino.precio_botella }),
        created_at: hoyHora(rand(12, 15)),
      })
    }
  }

  // Cena (20:00–23:30)
  const escaneoCena = rand(22, 38)
  for (let i = 0; i < escaneoCena; i++) {
    hoyStats.push({ restaurante_id: restId, tipo: 'escaneo', detalle: null,
      created_at: hoyHora(rand(20, 23)) })
  }
  const sommelierCena = rand(7, 13)
  for (let i = 0; i < sommelierCena; i++) {
    hoyStats.push({ restaurante_id: restId, tipo: 'sommelier', detalle: pick(PLATOS_NOMBRES),
      created_at: hoyHora(rand(20, 23)) })
  }

  // Ventas cena — más variedad para que Cierre tenga de todo
  const ventasCena = [
    { vino: vinosInsertados[0],  resultado: 'vendida',    plato: 'Carrillada ibérica al Pedro Ximénez', objetivo: 'maridaje' },
    { vino: vinosInsertados[0],  resultado: 'vendida',    plato: 'Solomillo al Pedro Ximénez con Manzanilla', objetivo: 'maridaje' },
    { vino: vinosInsertados[2],  resultado: 'vendida',    plato: 'Croquetas de pringá malagueña',         objetivo: 'copas' },
    { vino: vinosInsertados[4],  resultado: 'vendida',    plato: 'Tabla de quesos malagueños',             objetivo: 'maridaje' },
    { vino: vinosInsertados[20], resultado: 'vendida',    plato: 'Atún rojo a la brasa',                   objetivo: 'maridaje' },
    { vino: vinosInsertados[25], resultado: 'vendida',    plato: 'Ajoblanco malagueño con uvas y jamón',   objetivo: 'local' },
    { vino: vinosInsertados[28], resultado: 'vendida',    plato: 'Tarta de queso al Pedro Ximénez',        objetivo: 'maridaje' },
    { vino: vinosInsertados[3],  resultado: 'no_convence', plato: 'Secreto ibérico a la brasa',            objetivo: 'ticket' },
    { vino: vinosInsertados[7],  resultado: 'no_convence', plato: 'Jamón ibérico de bellota D.O. Jabugo',  objetivo: 'ticket' },
    { vino: vinosInsertados[6],  resultado: 'agotado',    plato: 'Carrillada ibérica al Pedro Ximénez',   objetivo: 'maridaje' },
    { vino: vinosInsertados[12], resultado: 'vendida',    plato: 'Boquerones en vinagre de Málaga',        objetivo: 'local' },
    { vino: vinosInsertados[13], resultado: 'vendida',    plato: 'Pulpo a la brasa',                       objetivo: 'maridaje' },
    { vino: vinosInsertados[1],  resultado: 'vendida',    plato: 'Solomillo al Pedro Ximénez con Manzanilla', objetivo: 'ticket' },
    { vino: vinosInsertados[22], resultado: 'vendida',    plato: 'Jamón ibérico de bellota D.O. Jabugo',  objetivo: 'copas' },
    { vino: vinosInsertados[11], resultado: 'otra',       plato: 'Gamba blanca de Málaga a la plancha',   objetivo: 'maridaje' },
  ]
  for (const v of ventasCena) {
    hoyStats.push({
      restaurante_id: restId,
      tipo: 'venta',
      detalle: JSON.stringify({
        vino_id: v.vino.id, vino: v.vino.nombre,
        resultado: v.resultado, cantidad: v.resultado === 'vendida' ? 1 : 0,
        origen: 'camarero', plato: v.plato, objetivo: v.objetivo,
      }),
      created_at: hoyHora(rand(20, 23)),
    })
    if (v.resultado === 'vendida') {
      hoyStats.push({
        restaurante_id: restId, tipo: 'recomendacion',
        detalle: JSON.stringify({ vino_id: v.vino.id, vino: v.vino.nombre, origen: rand(0, 1) === 0 ? 'camarero' : 'cliente', posicion: rand(1, 2), precio: v.vino.precio_botella }),
        created_at: hoyHora(rand(20, 23)),
      })
    }
  }

  // Insertar en lotes de 500
  const LOTE = 500
  const todosStats = [...todasLasEstadisticas, ...hoyStats]
  let insertadas = 0
  for (let i = 0; i < todosStats.length; i += LOTE) {
    const lote = todosStats.slice(i, i + LOTE)
    const { error } = await supabase.from('estadisticas').insert(lote)
    if (error) {
      console.error('❌ Error estadísticas lote', Math.floor(i / LOTE), ':', error.message)
    } else {
      insertadas += lote.length
      process.stdout.write(`\r   ✓ ${insertadas}/${todosStats.length} estadísticas...`)
    }
    await sleep(150)
  }
  console.log(`\n   ✓ ${insertadas} estadísticas (${hoyStats.length} de hoy)\n`)

  // ── 5.8 Movimientos de stock ──────────────────────────────
  console.log('📦  Generando movimientos de stock...')
  const movimientos = []

  for (const vino of vinosInsertados) {
    // Entrada inicial
    const stockInicial = vino.stock + rand(10, 30)
    movimientos.push({
      restaurante_id: restId, vino_id: vino.id,
      tipo: 'entrada', cantidad: stockInicial,
      stock_anterior: 0, stock_nuevo: stockInicial,
      motivo: 'Stock inicial — apertura temporada',
      created_at: daysAgo(rand(85, 90)),
    })

    let stockActual = stockInicial

    // Ventas periódicas (2-3 veces por semana, 12 semanas)
    for (let semana = 12; semana >= 1; semana--) {
      const diaEnSemana = semana * 7 + rand(0, 4)
      const vendidas = rand(1, 4)
      if (stockActual - vendidas < 0) continue
      movimientos.push({
        restaurante_id: restId, vino_id: vino.id,
        tipo: 'venta', cantidad: -vendidas,
        stock_anterior: stockActual, stock_nuevo: stockActual - vendidas,
        motivo: 'Venta servicio sala',
        created_at: daysAgo(diaEnSemana),
      })
      stockActual -= vendidas
    }

    // Reposición (50% de los vinos)
    if (rand(0, 1) === 0) {
      const reposicion = rand(6, 12)
      movimientos.push({
        restaurante_id: restId, vino_id: vino.id,
        tipo: 'entrada', cantidad: reposicion,
        stock_anterior: stockActual, stock_nuevo: stockActual + reposicion,
        motivo: `Pedido proveedor: ${vino.proveedor || 'Proveedor'}`,
        created_at: daysAgo(rand(40, 50)),
      })
      stockActual += reposicion
    }

    // Merma o cata ocasional (20% de los vinos)
    if (rand(0, 4) === 0) {
      const tipo     = pick(['merma', 'cata', 'invitacion'])
      const cantidad = rand(1, 2)
      if (stockActual - cantidad >= 0) {
        movimientos.push({
          restaurante_id: restId, vino_id: vino.id,
          tipo, cantidad: -cantidad,
          stock_anterior: stockActual, stock_nuevo: stockActual - cantidad,
          motivo: tipo === 'merma'      ? 'Botella rota en servicio'
                : tipo === 'cata'       ? 'Cata de formación personal sala'
                : 'Invitación mesa especial',
          created_at: daysAgo(rand(10, 30)),
        })
        stockActual -= cantidad
      }
    }
  }

  let movInsertados = 0
  for (let i = 0; i < movimientos.length; i += LOTE) {
    const lote = movimientos.slice(i, i + LOTE)
    const { error } = await supabase.from('movimientos_stock').insert(lote)
    if (error) {
      console.error('❌ Error movimientos lote', Math.floor(i / LOTE), ':', error.message)
    } else {
      movInsertados += lote.length
      process.stdout.write(`\r   ✓ ${movInsertados}/${movimientos.length} movimientos...`)
    }
    await sleep(100)
  }
  console.log(`\n   ✓ ${movInsertados} movimientos de stock\n`)

  // ── 5.9 Propuestas del consultor ──────────────────────────
  console.log('📝  Insertando propuestas del consultor...')
  const PROPUESTAS = [
    {
      restaurante_id: restId,
      titulo: 'Ampliar sección de Málaga DO',
      vino: 'Bodegas Málaga Virgen Málaga Dulce Reserva',
      tipo: 'dulce', zona: 'Málaga DO',
      proveedor_sugerido: 'Bodegas de Ronda',
      coste_estimado: 11.50, precio_recomendado: 28.00, margen_objetivo: 59,
      plato_objetivo: 'Tarta de queso al Pedro Ximénez',
      motivo: 'Reforzar la identidad local. Los vinos de Málaga son un activo diferenciador clave para el bar.',
      prioridad: 'alta', estado: 'propuesta',
    },
    {
      restaurante_id: restId,
      titulo: 'Incorporar Champagne de entrada',
      vino: 'Moët & Chandon Impérial Brut',
      tipo: 'espumoso', zona: 'Champagne AOC',
      proveedor_sugerido: 'Vinos Alhambra SL',
      coste_estimado: 28.00, precio_recomendado: 75.00, margen_objetivo: 63,
      plato_objetivo: 'Jamón ibérico de bellota D.O. Jabugo',
      motivo: 'Completar la propuesta de espumosos de alto margen para mesas especiales.',
      prioridad: 'media', estado: 'interesa',
    },
    {
      restaurante_id: restId,
      titulo: 'Rotar Contador por Roda I Reserva',
      vino: 'Roda I Reserva',
      tipo: 'tinto', zona: 'Rioja',
      proveedor_sugerido: 'Vinos Alhambra SL',
      coste_estimado: 18.00, precio_recomendado: 55.00, margen_objetivo: 67,
      plato_objetivo: 'Carrillada ibérica al Pedro Ximénez',
      motivo: 'El Contador tiene poca rotación (2 botellas). Roda I ofrece calidad similar con mayor accesibilidad y mejor margen.',
      prioridad: 'baja', estado: 'propuesta',
    },
  ]
  const { error: errProp } = await supabase.from('consultor_propuestas').insert(PROPUESTAS)
  if (errProp) {
    console.warn('⚠️  Propuestas:', errProp.message)
  } else {
    console.log(`   ✓ ${PROPUESTAS.length} propuestas del consultor\n`)
  }

  // ── 5.10 Resumen ──────────────────────────────────────────
  const vinosHoy = ventasComida.filter(v => v.resultado === 'vendida').length +
                   ventasCena.filter(v => v.resultado === 'vendida').length
  const incidenciasHoy = [...ventasComida, ...ventasCena]
    .filter(v => ['no_stock','agotado','no_convence','otra'].includes(v.resultado)).length

  console.log('═══════════════════════════════════════════════════')
  console.log('  ✅  BAR PILOTO CREADO CON ÉXITO')
  console.log('═══════════════════════════════════════════════════')
  console.log('')
  console.log(`  Restaurante : ${rest.nombre}`)
  console.log(`  Email/login : ${DEMO_EMAIL}`)
  console.log(`  Contraseña  : ${DEMO_PASSWORD}`)
  console.log(`  Slug/URL    : /c/${DEMO_SLUG}`)
  console.log(`  Plan        : ${RESTAURANTE.plan} (activo)`)
  console.log(`  PIN camarero: ${RESTAURANTE.camarero_pin}`)
  console.log('')
  console.log('  Datos generados:')
  console.log(`    🍷  ${vinosInsertados.length} vinos (todos los tipos, 100% campos`)
  console.log(`    🍽️   ${PLATOS.length} platos (carta completa con precios)`)
  console.log(`    📊  ${insertadas} estadísticas (90 días + HOY)`)
  console.log(`         • Hoy: ${hoyStats.filter(s=>s.tipo==='escaneo').length} escaneos, ${hoyStats.filter(s=>s.tipo==='sommelier').length} consultas`)
  console.log(`         • Hoy: ${vinosHoy} ventas marcadas, ${incidenciasHoy} incidencias/dudas`)
  console.log(`    📦  ${movInsertados} movimientos de stock (entradas, ventas, mermas)`)
  console.log(`    🔗  ${HUB_LINKS.length} hub links`)
  console.log(`    📝  ${PROPUESTAS.length} propuestas del consultor`)
  console.log('')
  console.log('  Pestañas que ahora tienen datos:')
  console.log('    ✓  Rentabilidad de carta — ventas con vino_id + costes')
  console.log('    ✓  Cierre de servicio   — ventas de hoy con plato y resultado')
  console.log('    ✓  Estadísticas         — 90 días + métricas de hoy')
  console.log('    ✓  Inventario semanal   — actividad últimos 7 días')
  console.log('    ✓  Bodega               — movimientos, propuestas, valor bodega')
  console.log('')
  console.log('  ⚠️  Si alguna pestaña sigue vacía:')
  console.log('     1. Ejecuta supabase/add_dashboard_policies.sql en Supabase')
  console.log(`     2. Inicia sesión como ${DEMO_EMAIL} (contraseña arriba)`)
  console.log('        en lugar de impersonar desde el panel admin')
  console.log('')
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message)
  process.exit(1)
})
