# Reglas de seguridad — LEER PRIMERO

## Archivos de credenciales — prohibición absoluta

**Nunca leer ni imprimir el contenido de `.env*` ni de ningún archivo de credenciales** (`.env`, `.env.local`, `.env.production`, `*.pem`, `*secret*`, etc.).

Esta regla existe porque ya ocurrió una vez: en septiembre de 2026, al leer `.env.local` para depurar un webhook, el contenido completo — incluyendo tokens de Supabase, Stripe, Square, Anthropic y la clave de cifrado de TPV — quedó impreso en el chat.

**Si necesitas saber si una variable existe**, usa una comprobación de existencia que devuelva sí/no sin mostrar el valor:
- PowerShell: `Select-String -Quiet "NOMBRE_VAR" .env.local`
- Bash/Git Bash: `grep -c NOMBRE_VAR .env.local`

**Si una tarea requiere conocer el valor real de una credencial**, pídele al usuario que lo introduzca directamente donde haga falta (por ejemplo en un comando entre comillas), nunca a través del chat ni del historial de conversación.

---

# Tu Instagram → Web Profesional

Este proyecto convierte tu perfil de Instagram en una web de marca personal profesional.

## Comportamiento al iniciar

Cuando el usuario abra esta carpeta y escriba cualquier cosa (incluido "hola", "qué hago", "empezar"), responde con este mensaje de bienvenida:

> **Bienvenido al creador de webs desde Instagram**
>
> Voy a convertir tu perfil de Instagram en una web profesional de marca personal.
>
> Solo necesito tu **@handle de Instagram** para empezar. Yo me encargo del resto: descargo tus fotos, busco tus datos en redes, y genero la web.
>
> **¿Cuál es tu @ de Instagram?**

Después de eso, usa la skill `instagram-a-web` automáticamente.

## Qué hace Claude automáticamente
1. Entra a tu perfil de Instagram y descarga tus datos y fotos automáticamente
2. Busca tu presencia en otras redes (Threads, TikTok, YouTube, LinkedIn...)
3. Suma tus seguidores de todas las plataformas
4. Busca testimonios de tus clientes si los tienes publicados
5. Te pregunta lo que no puede encontrar solo (servicios, colores, email)
6. Genera una web premium y la abre en tu navegador

## Lo que necesitas tener a mano

- Tu @handle de Instagram
- A qué te dedicas y qué servicios ofreces
- Tu email de contacto
- Tus colores de marca (si los tienes; si no, Claude te propone opciones)

## Lo que genera

- Un archivo HTML profesional que se abre en cualquier navegador
- Hero con tu perfil de Instagram integrado (foto, stats, bio, tick verificado, mini grid de fotos)
- Tus fotos reales de Instagram en la galería
- Adaptado a tu tipo de marca personal (fotógrafo, coach, influencer, etc.)
- Se ve bien en móvil, tablet y escritorio
- Solo usa tus datos reales — nunca inventa información

## Sobre las dependencias

Antes de empezar, verifica si Node.js está instalado:
```bash
node --version 2>/dev/null && echo "Node.js OK" || echo "NO_NODE"
```

Si no tiene Node.js, dile:
> "Para poder acceder a tu Instagram automáticamente necesito Node.js. Es una instalación rápida de 2 minutos: ve a https://nodejs.org y descarga la versión LTS. Cuando lo tengas instalado, dime y seguimos.
>
> Si prefieres no instalarlo, no pasa nada — te pediré los datos directamente y la web quedará igual de bien."

Si tiene Node.js, instala Playwright automáticamente y sigue con el scraping. El usuario no tiene que hacer nada más.

## Si tienes imágenes extras

Puedes meter fotos adicionales (retratos, logo, portfolio) en la carpeta `assets/`. Claude las usará en la web.

## Después de generar

Dile a Claude qué quieres cambiar: colores, textos, secciones, fotos. Itera hasta que te guste.

## Diseño de interfaces web

Cuando generes o modifiques cualquier interfaz web (HTML, páginas, componentes de UI, secciones, estilos), aplica siempre la skill `frontend-design` como guía de diseño. Esto significa:

- Antes de escribir código, define un plan de diseño: paleta (4–6 hex), tipografías (display + body), layout y elemento firma.
- Evita los defaults de IA: fondo crema con serif y terracota, negro con verde ácido, layout periódico con columnas densas — a menos que el brief lo pida explícitamente.
- El héroe de la página es una tesis: ábrete con lo más característico del tema, no con un patrón genérico.
- Gasta la audacia en un solo elemento firma; el resto debe ser contenido y disciplina.
- Móvil, foco de teclado y `prefers-reduced-motion` son requisitos mínimos, no opcionales.

---

# Reglas de refactorización del catálogo (R1–R9)

Vigentes a partir de 2026-09-12 para la rama `refactor/catalogo-canonico` y cualquier
tarea relacionada con proveedores, catálogo, favoritos, simulador o carta de vinos.

**R1.** Trabaja en la rama `refactor/catalogo-canonico`. Créala si no existe. Un commit
por bloque, con mensaje `"bloque N: <descripción>"`.

**R2.** NUNCA ejecutes `DELETE`, `TRUNCATE`, `DROP TABLE`, `DROP COLUMN` ni `UPDATE`
masivo sin `WHERE` contra la base. Las migraciones son expand-only: `CREATE TABLE`,
`ADD COLUMN`, `CREATE INDEX` y backfills acotados. Nada de contract en esta fase.

**R3.** Cada migración `NNNN_nombre.sql` lleva su pareja `NNNN_nombre_rollback.sql`.

**R4.** No ejecutes migraciones contra producción. Déjalas escritas y comunica el
comando exacto que debe lanzar el usuario.

**R5.** No toques ficheros que el bloque no mencione. No reformatees código existente.
No cambies dependencias, configuración de lint ni estilos.

**R6.** No inventes nombres de tabla ni de columna. El diccionario canónico está en
`ADAPTACION.md`. Si necesitas crear algo nuevo, sigue la convención existente del repo
(snake_case, prefijo de dominio) y consulta antes de hacerlo.

**R7.** Si algo de un bloque contradice lo que ves en el código, o es ambiguo, PARA y
pregunta. No improvises ni "arregles de paso" nada que no te hayan pedido.

**R8.** Al cerrar cada bloque, informa: ficheros tocados, qué se ha creado, qué ha
quedado pendiente, y qué debe verificar el usuario manualmente.

**R9.** Todo script nuevo nace con `--dry-run` por defecto: no escribe en la base
salvo que se le pase `--apply` de forma explícita.
