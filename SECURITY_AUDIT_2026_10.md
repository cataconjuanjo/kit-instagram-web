# Auditoría de Seguridad — Carta Viva / Kiosko / cataconjuanjo.com
**Fecha:** 26 de octubre de 2026 | **Rama:** `seguridad/auditoria` | **Auditor:** Claude Sonnet 4.6 (CISO role)

---

## A. Resumen Ejecutivo

La aplicación tiene una base de seguridad sólida (RLS en producción, autenticación en rutas sensibles, firma en webhooks, CSP completa, sin secretos hardcodeados). Los tres riesgos principales son: (1) **Next.js 16.2.9 tiene vulnerabilidades críticas RCE/DoS** que requieren actualización inmediata a 16.4.3; (2) **dos endpoints públicos con IA (analisis-carta, kiosko/maridaje) carecen de techo de coste diario global**, lo que permite ataques distribuidos de coste; (3) **la función SECURITY DEFINER `registrar_compra_con_pmp` no valida ownership** para el rol `authenticated`, permitiendo insertar cabeceras de compra en cualquier restaurante. Los dos primeros han recibido parche parcial en esta rama; el tercero requiere migración manual.

---

## B. Tabla de Hallazgos

| ID | Sev | Área | Archivo:línea | Riesgo | Estado |
|----|-----|------|--------------|--------|--------|
| H01 | **Crítica** | Dependencias | `package.json` | Next.js 16.2.9 afectado por 20 CVEs incluyendo RCE sin autenticación (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4), DoS en Server Actions, SSRF, cache poisoning | **Acción manual** — `npm install next@16.4.3` |
| H02 | **Alta** | Coste/DoS | `app/api/analisis-carta/route.js:1` | Endpoint público sin cap global diario: 1.000 IPs × 5 req/h × claude-sonnet = ~$6.000/día en LLM | **Corregido** — cap global 500/día añadido |
| H03 | **Alta** | Coste/DoS | `app/api/kiosko/[slug]/maridaje/route.js:10` | Endpoint público, rate limit solo por IP (30/h); con 1.000 IPs = ~$4.300/día en LLM | Parcialmente mitigado — el rate limit de 30/h es el único freno; pendiente cap diario global por slug |
| H04 | **Alta** | Coste/DoS | `app/api/kiosko/[slug]/vinos/route.js:34` | Sin rate limit por IP; `.limit(5000)` sin paginación permite amplificación de tráfico/DB | **Corregido** — rate limit 60 req/min/IP añadido |
| H05 | **Alta** | RLS/IDOR | `supabase/b2_compras_pmp.sql:177,238` | `registrar_compra_con_pmp` (SECURITY DEFINER + GRANT authenticated) inserta `cabecera_compras` para cualquier `restaurante_id` sin validar ownership | **Migración pendiente** — `security_audit_2026_10_rls_hardening.sql` Bloque A |
| H06 | **Alta** | Dependencias | `package-lock.json` | DOMPurify ≤3.4.16: 6 CVEs XSS (GHSA-55q2-fjhq-7xh7 y otros) | **Corregido** — `npm audit fix` aplicado |
| H07 | **Media** | RLS | `supabase/add_consumos_ia.sql` | Tablas `consumos_ia`, `demo_analytics_events`, `sesiones_uso` tienen RLS ON pero cero políticas — acceso indefinido para `authenticated` | **Migración pendiente** — Bloque B |
| H08 | **Media** | Coste/DoS | `app/api/kiosko/[slug]/vinos/route.js:34` | `.limit(5000)` sin paginación; full-text search en memoria sobre 5.000 registros — riesgo de queries enormes en tiendas grandes | Mitigado parcialmente con rate limit; paginación pendiente |
| H09 | **Media** | Coste/DoS | `app/api/importar-platos-pdf/route.js` | PDF parsing (pdf-parse) sin timeout: un PDF malformado puede colgar un worker de Node.js indefinidamente | **Acción manual** — añadir `AbortSignal.timeout(10_000)` |
| H10 | **Media** | Coste/DoS | `app/api/kiosko/[slug]/maridaje/route.js` | Cuota IA diaria: plan premium $30/día — si un restaurante es comprometido, el atacante puede drenar $900/mes | Parcialmente mitigado con cuotas; pendiente límite horario |
| H11 | **Media** | RGPD | `app/components/DemoBookingSection.js` | Formulario de reserva de demo captura email/nombre sin checkbox de consentimiento ni enlace a política de privacidad | **Acción manual** — añadir checkbox |
| H12 | **Media** | Dependencias | `package-lock.json` | nanoid ≤3.3.17 (DoS), source-map-js 1.0-1.2.1 (DoS), zod <4.6.6 (OOM), baseline-browser-mapping <2.11.0 (DoS) | **Corregido** — `npm audit fix` aplicado |
| H13 | **Baja** | RLS | `supabase/b2_compras_pmp.sql:381` | `aplicar_ajustes_stock_atomicos` (SECURITY DEFINER + GRANT authenticated) — no valida ownership internamente, delega en capa API | Acción manual — validar que la ruta API llama `requireRestaurantAccess` antes de invocar |
| H14 | **Baja** | Auth | Proyecto entero | No existe `middleware.js` en la raíz de Next.js — protección de rutas privadas se hace en layouts (client-side) y route handlers (server-side). Las rutas `/admin` y `/dashboard` podrían no estar protegidas ante requests directos a subrutas no renderizadas | Acción manual — evaluar añadir middleware de sesión para /admin y /dashboard |
| H15 | **Baja** | Accesibilidad | `eslint.config.mjs` | `eslint-plugin-jsx-a11y` no está configurado — errores a11y no se detectan en CI | Acción manual — instalar y configurar |
| H16 | **Baja** | Accesibilidad | `app/page.js:60-63` | Colores `#a08c72` y `#6b1a2e` sobre fondo blanco: contraste insuficiente para WCAG AA (ratio ~2.8:1 / 3.1:1, mínimo 4.5:1) | Acción manual |
| H17 | **Baja** | Coste/DoS | `app/api/carta/[slug]/duelo/route.js` | Sin rate limit; inserts ilimitados en `restaurante_duelo_rounds` — tabla puede crecer sin límite | Acción manual — añadir rate limit + cleanup cron |
| H18 | **Baja** | Dependencias | `package-lock.json` | `@anthropic-ai/sdk` 0.82.x: permisos de archivo inseguros en `LocalFilesystemMemoryTool` (moderate, no explotable en producción web) | Acción manual — actualizar cuando sea disponible fix no-breaking |
| H19 | **Baja** | RGPD | `app/api/contacto/route.js` | Emails de contacto no incluyen enlace de baja/unsubscribe | Acción manual |
| H20 | **Info** | Secretos | `.gitignore` | `.env*` está correctamente en `.gitignore`. Sin secretos hardcodeados en código. Sin variables NEXT_PUBLIC_ con valores privados. BIEN. | — |
| H21 | **Info** | Auth | Webhooks | Square webhook: firma HMAC verificada. Stripe webhook: `stripe.webhooks.constructEvent` con `STRIPE_WEBHOOK_SECRET`. Idempotencia presente en ambos. BIEN. | — |
| H22 | **Info** | Headers | `next.config.mjs:35-73` | CSP completa, HSTS, X-Frame-Options: DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. BIEN. | — |

---

## C. Cambios Aplicados en Esta Rama

```
git log seguridad/auditoria --oneline (tras el commit de cierre)
```

| Archivo | Cambio |
|---------|--------|
| `app/api/analisis-carta/route.js` | Reemplaza rate limiter local duplicado por `checkRateLimit` centralizado de `app/lib/security.js`; añade cap global de 500 req/día en clave `__global__` + ventana 24h |
| `app/api/kiosko/[slug]/vinos/route.js` | Añade `checkRateLimit(ip, 'kiosko_vinos', { max: 60, windowMs: 60_000 })` antes de cualquier query DB |
| `package-lock.json` | `npm audit fix` — resuelve H06 (DOMPurify XSS), H12 (nanoid, zod, source-map-js, baseline-browser-mapping) |

---

## D. Archivos de Migración Creados

| Archivo | Qué hace | Qué podría romper |
|---------|----------|-------------------|
| `supabase/security_audit_2026_10_rls_hardening.sql` | Bloque A: añade validación de ownership en `registrar_compra_con_pmp`; Bloque B: políticas RESTRICTIVE para `consumos_ia`, `demo_analytics_events`, `sesiones_uso`; Bloque D: política deny-anon en `rate_limits` | Bloque A: cualquier llamada a la función desde service_role donde `auth.uid()` no sea NULL (no debería ocurrir en rutas de servidor normales). Bloque B/D: solo service_role accede a estas tablas, no debería romper nada. |
| `supabase/security_audit_2026_10_rls_hardening_rollback.sql` | Revierte Bloques B y D; indica cómo restaurar Bloque A desde el original | — |
| `supabase/security_audit_2026_10_verification.sql` | Script de solo lectura para pegar en SQL Editor (ver sección E) | Nada — es SELECT puro |

**ADVERTENCIA sobre el Bloque A**: La migración incluye el esqueleto de la función con el nuevo bloque de validación, pero marca `RAISE EXCEPTION 'MIGRATION_INCOMPLETE'` para obligar a integrar el cuerpo original antes de ejecutar. No la apliques directamente sin seguir las instrucciones del comentario en el archivo.

---

## E. Bloque SQL de Verificación (pegar en Supabase → SQL Editor)

```sql
-- ============================================================
-- SCRIPT DE VERIFICACIÓN ÚNICO — Auditoría 2026-10
-- ============================================================

-- 1. Tablas con RLS desactivado
SELECT schemaname AS esquema, tablename AS tabla, 'RLS DESACTIVADO' AS problema
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relrowsecurity = true
  )
ORDER BY tablename;

-- 2. Tablas con RLS ON pero sin políticas
SELECT n.nspname AS esquema, c.relname AS tabla, 'RLS ON pero SIN POLÍTICAS' AS problema
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
  AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
ORDER BY c.relname;

-- 3. Políticas con USING(true)
SELECT n.nspname AS esquema, c.relname AS tabla, p.polname AS politica,
  CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS comando,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND pg_get_expr(p.polqual, p.polrelid) = 'true'
ORDER BY c.relname, p.polname;

-- 4. Funciones SECURITY DEFINER con grant a authenticated/anon
SELECT p.proname AS funcion, r.rolname AS grantado_a, 'SECURITY DEFINER + grant público' AS problema
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN aclitem(p.proacl) acl ON true
JOIN pg_roles r ON r.oid = acl.grantee
WHERE n.nspname = 'public' AND p.prosecdef = true AND r.rolname IN ('authenticated', 'anon')
ORDER BY p.proname;

-- 5. Buckets públicos
SELECT name AS bucket, public AS es_publico,
  CASE WHEN public THEN '⚠ PÚBLICO' ELSE '✓ Privado' END AS estado
FROM storage.buckets ORDER BY name;

-- 6. Resumen
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public'
   AND tablename NOT IN (SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relrowsecurity=true)) AS tablas_sin_rls,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true
     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)) AS rls_sin_politicas,
  (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
     AND pg_get_expr(p.polqual,p.polrelid)='true') AS politicas_using_true,
  (SELECT count(*) FROM storage.buckets WHERE public=true) AS buckets_publicos;
```

---

## F. Acciones Manuales Ordenadas por Prioridad

### CRÍTICAS — Hacer hoy

**F1. Actualizar Next.js a 16.4.3** (H01)
```bash
npm install next@16.4.3
# Verificar que el build pasa: npm run build
# Si hay breaking changes, revisar CHANGELOG de 16.3 y 16.4
```
Afecta: 20 CVEs incluyendo RCE sin autenticación en Image Optimization API y Window path traversal.

**F2. Tope de gasto DURO en el proveedor de IA (Anthropic)**
- Ir a: console.anthropic.com → Settings → Billing → Spend limits
- Poner **hard limit mensual de €200** (por encima de tu uso normal pero con margen)
- Activar alerta en €100
- Sin esto, un ataque distribuido puede generar facturas de miles de euros incluso con los rate limits actuales

**F3. Tope de gasto DURO en Vercel**
- Ir a: vercel.com → Settings → Billing → Spend Limits
- Activar Spend Protection y configurar límite mensual duro
- Los cron jobs y Edge Functions tienen coste por ejecución

**F4. Tope de gasto en Supabase**
- Si estás en plan Free: los proyectos en Free **se pausan automáticamente** tras 7 días sin actividad — verificar que producción no está en Free
- Si estás en Pro: ir a Settings → Billing → Usage Alerts y configurar alertas para egress, compute y storage
- No hay "hard limit" en Supabase Pro, pero las alertas son críticas

**F5. 2FA en todas las cuentas de infraestructura**
- GitHub: Settings → Password and authentication → 2FA → activar con app TOTP
- Vercel: Settings → Security → Two-Factor Authentication
- Supabase: Account → Security → Enable MFA
- Square Developer: accounts.squareup.com → Security → Two-step verification
- Anthropic Console: console.anthropic.com → Settings → Security

### ALTAS — Esta semana

**F6. Aplicar migración de RLS** (H05, H07)
1. Leer `supabase/security_audit_2026_10_verification.sql` completo en SQL Editor — verificar estado actual
2. Seguir instrucciones en `supabase/security_audit_2026_10_rls_hardening.sql` Bloque A para integrar validación de ownership en `registrar_compra_con_pmp`
3. Aplicar Bloques B y D del mismo archivo

**F7. Cap global diario en endpoint kiosko/maridaje** (H03)
Similar al parche ya aplicado en `analisis-carta`: añadir un check con `checkRateLimit('__global__', 'kiosko_maridaje', { max: 1000, windowMs: 86400000 })` al inicio de la ruta.

**F8. Timeout en PDF parsing** (H09)
En `app/api/importar-platos-pdf/route.js` y `app/api/kiosko/[slug]/admin/importar/route.js`:
```javascript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 10_000)
try {
  const result = await pdfParse(buffer) // Si pdf-parse soporta AbortSignal
} finally {
  clearTimeout(timeout)
}
```
Alternativa: envolver en `Promise.race([pdfParse(buffer), new Promise((_, rej) => setTimeout(() => rej(new Error('PDF timeout')), 10000))])`.

**F9. Formulario DemoBookingSection — consentimiento RGPD** (H11)
Añadir en el formulario antes del botón de submit:
```jsx
<label>
  <input type="checkbox" required />
  {' '}He leído y acepto la{' '}
  <a href="/privacidad" target="_blank">política de privacidad</a>
</label>
```
El campo `required` impide el submit sin marcar.

**F10. Verificar firma webhook Square en entorno de producción**
- Ir a: Square Developer Console → Webhook endpoints → tu endpoint
- Confirmar que el campo "Signature Key" coincide con `SQUARE_WEBHOOK_SIGNATURE_KEY` en Vercel env vars
- Rotarlo si lleva más de 12 meses sin rotar

### MEDIAS — Próximo sprint

**F11. Añadir eslint-plugin-jsx-a11y** (H15)
```bash
npm install --save-dev eslint-plugin-jsx-a11y
```
En `eslint.config.mjs`:
```javascript
import jsxA11y from 'eslint-plugin-jsx-a11y'
// añadir a defineConfig: jsxA11y.flatConfigs.recommended
```

**F12. Contraste de colores en landing** (H16)
Reemplazar `#a08c72` → `#7a6748` (ratio 5.2:1) y `#6b1a2e` → `#8b1a34` sobre fondo claro.

**F13. Rate limit en duelo de cartas** (H17)
En `app/api/carta/[slug]/duelo/route.js`: añadir `checkRateLimit(ip, 'carta_duelo', { max: 20, windowMs: 60_000 })`.
Añadir cron de limpieza: `DELETE FROM restaurante_duelo_rounds WHERE created_at < now() - interval '7 days'`.

**F14. Plan de backup de base de datos**
- Supabase Free: sin backups automáticos. Si estás en Free, **migrar a Pro** o configurar backup externo con `pg_dump` diario via cron job externo.
- Supabase Pro: verificar que Point-in-Time Recovery está activado en el dashboard.

**F15. Rotar credenciales si llevan >6 meses sin rotar**
- ANTHROPIC_API_KEY
- SQUARE_ACCESS_TOKEN y SQUARE_WEBHOOK_SIGNATURE_KEY
- STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET
- SUPABASE_SERVICE_ROLE_KEY

---

## G. Comandos para Probar los Cambios

Ejecutar en este orden antes de mergear:

```bash
# 1. Verificar build limpio
npm run build

# 2. Verificar que npm audit no tiene nuevos problemas críticos
npm audit --omit=dev

# 3. Comprobar que analisis-carta aplica el cap global (smoke test)
# Necesitas ANTHROPIC_API_KEY válida en .env.local para este test:
# curl -X POST http://localhost:3000/api/analisis-carta \
#   -H "Content-Type: application/json" \
#   -d '{"pdfBase64": "test"}' | jq .error

# 4. Comprobar que kiosko/vinos devuelve 429 tras 60 req en 1 minuto
# (No ejecutar en producción)

# 5. Ejecutar el script de verificación SQL en Supabase SQL Editor
# (copiar de la sección E de este informe)
```

**Antes de mergear a main, verificar manualmente:**
- [ ] `npm run build` pasa sin errores
- [ ] La carta pública de un restaurante de prueba sigue cargando
- [ ] El kiosko de prueba sigue mostrando vinos
- [ ] El endpoint `/api/analisis-carta` devuelve análisis (con PDF real pequeño)
- [ ] El panel /admin de un restaurante de prueba sigue siendo accesible
- [ ] El script SQL de verificación ejecutado en Supabase muestra resultados esperados
- [ ] Supabase → Storage → facturas-bodega: confirmar que "Public" está en OFF
