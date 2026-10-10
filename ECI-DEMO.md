# ECI Gourmet Demo — Guía de operaciones

Slug: `eci-gourmet-k7x2` (no público, solo para demos)

---

## Arrancar la demo

```bash
npm run dev
```

- Kiosko: `http://localhost:3000/kiosko/eci-gourmet-k7x2`
- Admin:  `http://localhost:3000/kiosko-admin/eci-gourmet-k7x2`

Las credenciales del admin están en `.eci-demo-credentials` (gitignoreado).

---

## Reemplazar el logo

Sustituye el archivo:

```
public/assets/eci-gourmet-demo/logo.svg
```

El kiosko lo carga directamente. No se necesita reiniciar el servidor.

---

## Reemplazar fotos de producto

Las fotos están en:

```
public/assets/eci-gourmet-demo/products/<slug>.webp
```

El `<slug>` de cada producto coincide con el campo `slug` de `vinos_tienda`.  
Formato recomendado: `.webp`, fondo blanco o transparente, mín. 400×400 px.

Si no hay foto para un producto, el kiosko muestra la silueta de categoría.

---

## Ver qué fotos faltan

```bash
npm run demo:check-assets
```

Lista los assets requeridos y marca cuáles faltan con `✗`.

---

## Regenerar el cache de maridajes

Si se añaden o cambian vinos/productos, regenera el cache sin llamadas en vivo:

```bash
npm run demo:generate-cache-dry   # previsualiza
npm run demo:generate-cache       # aplica (requiere ANTHROPIC_API_KEY en env)
```

---

## Borrar la demo

```bash
npm run demo:purge
```

Elimina: tienda de BD, vinos, leads, eventos, usuario auth, `.eci-demo-credentials` y `public/assets/eci-gourmet-demo/`.

Para omitir la confirmación interactiva:

```bash
node scripts/purge-eci-demo.js --confirm
```
