# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**B2B — Restaurantes y hospitality:** Propietarios, jefes de sala y sumilleres que buscan gestionar mejor su bodega, su carta de vinos, su rentabilidad y el criterio de venta del equipo. Toman decisiones de inversión y necesitan resultados medibles: más control, mejor margen, menos improvisación.

**B2B — Tiendas de vino y vinotecas:** Dueños de tiendas que necesitan un puesto digital tipo autoservicio para que el cliente explore vinos y simule su pedido, mientras el negocio controla catálogo, stock, actividad e informes.

**B2C — Clientes finales:** Comensales en sala que consultan una carta pública QR y clientes de tienda que usan el Kiosko para preparar o simular un pedido. No contratan nada; viven la experiencia del producto.

Las audiencias B2B son quienes pagan y operan. Las audiencias B2C validan la experiencia.

## Product Purpose

**cataconjuanjo.com** es la web de marca personal y consultoría de vino de Juanjo García Pozo, sumiller. Ofrece servicios directos a restaurantes (auditoría de carta, rediseño, formación de sala, activaciones) y es el escaparate de **Carta Viva**.

**Carta Viva Restaurantes** es un SaaS de gestión de bodega para restaurantes. Incluye carta pública QR con Armonia, argumentos para sala, stock, margen y seguimiento con datos reales del restaurante.

**Carta Viva Sumiller** es una versión de gestión interna para sumilleres, jefes de sala o dueños de restaurantes que quieren controlar directamente el vino del negocio sin publicar una carta pública al cliente. Mantiene inventario, stock, margen, compras, proveedores y argumentos internos.

**Kiosko** es una experiencia digital para tiendas de vino y vinotecas: un puesto tipo autoservicio donde el cliente explora vinos y simula su pedido. El dueño de la tienda usa el dashboard para controlar catálogo, stock, actividad, pedidos asistidos e informes.

El éxito es: el negocio vende vino con más criterio y control; el equipo entiende qué tiene, qué margen deja, qué falta y cómo orientar mejor al cliente.

## Positioning

**Criterio de sumiller real + inteligencia de datos propios del negocio.**

Ningún competidor (Menteora, Tspoon, cartas QR genéricas o catálogos digitales genéricos) firma el producto con un sumiller consultor que también trabaja sobre el terreno. Y ninguno cierra el bucle con datos reales de uso del negocio: qué se consulta, qué rota, qué alerta y qué conviene reponer. Juntas, esas dos cosas son incopiables.

## Operating Context

- El restaurante accede vía dashboard web (Next.js/Supabase) desde cualquier dispositivo.
- El camarero usa la vista de sala desde móvil en el servicio.
- El comensal usa la carta pública QR y Armonia durante la visita al restaurante.
- El sumiller, jefe de sala o dueño usa Carta Viva Sumiller como herramienta interna, sin carta pública.
- La tienda de vino usa Kiosko en un puesto digital para que el cliente simule su pedido, y el dueño revisa stock, actividad e informes desde dashboard.
- Juanjo accede al panel de administración para gestionar clientes, informes y propuestas de consultoría.
- La sincronización de stock puede venir del TPV Square (integración activa) o de entrada manual.
- Los informes y analíticas son el puente entre Juanjo y cada cliente.

## Capabilities and Constraints

**Carta Viva Restaurantes incluye:**
- Catálogo de vinos con stock, precios, stock mínimo y alertas
- Trazabilidad de movimientos (entradas, salidas, consumo)
- Analítica: sparklines de tendencia, top ventas, rotación, margen
- Sincronización TPV Square
- Carta pública QR para el comensal con Armonia y maridajes
- Vista de camarero (selección destacada, info de producto)
- Planes Básico (59 €/mes) y Premium (129 €/mes)

**Carta Viva Sumiller incluye:**
- Gestión interna de bodega, stock, costes, margen, proveedores y compras
- Argumentos de servicio y criterio profesional sin carta pública
- Herramientas para sumilleres, jefes de sala o dueños que gestionan vino directamente

**Kiosko incluye:**
- Puesto digital para tiendas de vino y vinotecas
- Catálogo guiado para que el cliente explore vinos y simule un pedido
- Dashboard de tienda para stock, actividad, pedidos asistidos e informes
- Planes Kiosko Básico/Premium activos en Stripe

**Límites duros confirmados:**
- Solo datos reales del negocio — nunca inventados, generados o imputados
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
3. **Útil en el servicio o en tienda.** El camarero, el comensal, el cliente de vinoteca y el gestor tienen vistas distintas porque tienen jobs distintos.
4. **Margen primero.** Las alertas, la trazabilidad y la analítica existen para que el restaurante gane más con lo que ya tiene.
5. **Sin fricción de onboarding.** Una carta existente es el único requisito para empezar.
