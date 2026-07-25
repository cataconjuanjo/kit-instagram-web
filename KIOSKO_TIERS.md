# Kiosko Vinos — Definición de Tiers

> Documento vivo. Actualizar a medida que se defina el pricing y se implementen funciones.

---

## Plan Básico

**Acceso al kiosko y operativa del día a día.**

### Ya implementado
- Kiosko de recomendación (chat con el asistente)
- Catálogo de vinos con gestión manual (alta, edición, foto, stock)
- Fichas de vino manuales (sin IA)
- Filtros y búsqueda en el catálogo admin
- Importación de vinos por Excel
- Personalización del kiosko (colores, tipografía, logo, banner)

### A implementar
- **Modo oferta/promoción** — marcar un vino con precio tachado y precio oferta visible en el kiosko
- **Multi-idioma en el kiosko** — el asistente responde en el idioma que elija el cliente (ES / EN / FR / DE)
- **Historial de movimientos de stock** — log de cambios de stock con fecha y usuario

---

## Plan Premium

**Inteligencia de negocio, automatización y expansión.**

### Ya implementado
- Fichas de vino generadas por IA
- Analítica completa (búsquedas, top vinos recomendados, top consultas)
- BCG de rentabilidad — cuadrante estrella/joya/caballo/revisar cruzando margen y popularidad
- Alertas de stock bajo en vinos frecuentemente recomendados
- Tendencias de uso 8 semanas (wizard vs maridaje)
- Informe semanal por email (cron lunes 8:00)
- Precio de coste + badge de margen en el catálogo admin

### A implementar
- **Alerta instantánea de stock crítico** — email/notificación en el momento en que un vino popular baja del umbral, sin esperar al lunes
- **Sugerencia de pedido de reposición** — lista automática semanal de vinos a pedir con cantidad sugerida, basada en tendencias
- **Predicción de agotamiento** — "a este ritmo, este vino se agota en ~N días"
- **Widget embebible** — snippet `<script>` para incrustar el kiosko en la web propia de la tienda
- **Multi-tienda** — gestión de varias ubicaciones desde un único panel de admin

---

## Descartado / no aplica
- QR por vino — demasiados QRs a imprimir para el volumen de un catálogo de vinoteca
- Valoraciones anónimas en el kiosko — el cliente no puede valorar hasta probar el vino
- Carta de vinos autogenerada — las vinotecas no tienen carta de vinos
