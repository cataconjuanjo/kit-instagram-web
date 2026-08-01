# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**B2B — Restaurantes y hospitality:** Propietarios, jefes de sala y sumilleres que buscan consultoría para mejorar su carta de vinos, su rentabilidad y la formación de su equipo. Toman decisiones de inversión y necesitan resultados medibles: más rotación, mejor margen, equipo que vende.

**B2C — Comensales en sala:** Clientes finales del restaurante que interactúan con la carta digital (QR), el kiosko o la guía de maridaje. No contratan nada; viven la experiencia del producto.

Ambas audiencias son primarias: el restaurante paga y opera, el comensal valida la experiencia.

## Product Purpose

**cataconjuanjo.com** es la web de marca personal y consultoría de vino de Juanjo García Pozo, sumiller. Ofrece servicios directos a restaurantes (auditoría de carta, rediseño, formación de sala, activaciones) y es el escaparate de **Carta Viva**.

**Carta Viva** es un SaaS de gestión de carta de vinos para restaurantes y hospitality. Digitaliza la carta con QR, expone inteligencia real de uso (rotación, stock, márgenes, alertas), integra sincronización con TPV (Square), y asiste al equipo de sala con criterio de sumiller: maridajes, selección del sumiller, vista de camarero, y guías de producto.

**Kiosko** es un módulo de venta de vinos por copas en sala, con gestión de pedidos, informes y control de stock.

El éxito es: el restaurante vende más vino, con mejor margen, y su sala lo defiende con argumentos reales.

## Positioning

**Criterio de sumiller real + inteligencia de datos propios del restaurante.**

Ningún competidor (Menteora, Tspoon, cartas QR genéricas) firma el producto con un sumiller consultor que también trabaja sobre el terreno en los restaurantes. Y ninguno cierra el bucle con datos reales de uso del restaurante (qué se vende, qué rota, qué alerta). Juntas, esas dos cosas son incopiables.

## Operating Context

- El restaurante accede vía dashboard web (Next.js/Supabase) desde cualquier dispositivo.
- El camarero usa la vista de sala desde móvil en el servicio.
- El comensal usa el QR o el kiosko durante la visita al restaurante.
- Juanjo accede al panel de administración para gestionar restaurantes clientes, informes y propuestas de consultoría.
- La sincronización de stock puede venir del TPV Square (integración activa) o de entrada manual.
- Los informes y analíticas son el puente entre Juanjo y el restaurante cliente.

## Capabilities and Constraints

**Carta Viva (dashboard) incluye:**
- Catálogo de vinos con stock, precios, stock mínimo y alertas
- Trazabilidad de movimientos (entradas, salidas, consumo)
- Analítica: sparklines de tendencia, top ventas, rotación, margen
- Sincronización TPV Square
- QR público para el comensal con maridajes
- Vista de camarero (selección destacada, info de producto)
- Kiosko (pedidos por copa en sala)
- Planes Básico (59 €/mes) y Premium (129 €/mes)

**Límites duros confirmados:**
- Solo datos reales del restaurante — nunca inventados, generados o imputados
- La IA y las sugerencias asisten, no sustituyen el criterio del sumiller
- Carta Viva no es TPV ni ERP: es capa de inteligencia sobre la carta existente

## Brand Commitments

- **Nombre:** Cata con Juanjo / cataconjuanjo.com
- **Producto:** Carta Viva
- **Voz:** directa, sin impostura, con criterio y sin jerga de startup
- **Tipografía:** Cormorant Garamond — editorial, mundo del vino, no tech genérico
- **Persona:** Juanjo García Pozo — el producto lleva su nombre y su criterio real

## Evidence on Hand

- Web pública operativa en cataconjuanjo.com
- Dashboard completo funcionando (Next.js + Supabase + Vercel)
- Integración Square activa en producción
- Restaurante piloto activo (Sibaris, con oferta fundador 99 €/mes bloqueada hasta 08/2026)
- Kiosko con tiers Básico/Premium activos en Stripe

## Product Principles

1. **Datos reales o nada.** El producto nunca fabrica cifras; si no hay dato, lo dice.
2. **El sumiller firma, la tecnología ejecuta.** Cada recomendación tiene criterio humano detrás.
3. **Útil en el servicio.** El camarero, el comensal y el gestor tienen vistas distintas porque tienen jobs distintos.
4. **Margen primero.** Las alertas, la trazabilidad y la analítica existen para que el restaurante gane más con lo que ya tiene.
5. **Sin fricción de onboarding.** Una carta existente es el único requisito para empezar.
