# Despliegue y superadmin

## Variables necesarias en Vercel

Configura estas variables en el proyecto de Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_ADMIN_EMAIL`
- `SUPABASE_SERVICE_ROLE_KEY`

`NEXT_PUBLIC_ADMIN_EMAIL` debe ser el email que tendra acceso a `/admin`.
Si no se configura, la app usa `cataconjuanjo@gmail.com` por defecto.

`SUPABASE_SERVICE_ROLE_KEY` es necesaria para que el superadmin pueda crear usuarios de restaurantes desde `/admin`. Se copia desde Supabase:

```text
Project Settings -> API -> service_role key
```

No debe llevar prefijo `NEXT_PUBLIC_`.

## Crear el usuario superadmin

1. Entra en Supabase.
2. Ve a `Authentication` -> `Users`.
3. Pulsa `Add user` / `Create user`.
4. Email: el mismo valor que `NEXT_PUBLIC_ADMIN_EMAIL`.
5. Password: crea una contrasena fuerte.
6. Marca el usuario como confirmado si Supabase lo permite.

Despues, entra en:

```text
https://cataconjuanjo.com/login
```

Con ese email, el login redirige automaticamente a:

```text
/admin
```

Desde `/admin` puedes elegir un restaurante y entrar a su dashboard completo.

## Crear usuarios de restaurantes desde superadmin

Entra en:

```text
https://cataconjuanjo.com/admin
```

En el bloque `Alta nueva` rellena:

1. Nombre comercial.
2. Email de acceso.
3. Ciudad.
4. Slug URL.
5. Contrasena inicial, o dejala vacia para generar una automaticamente.

Al crear el alta, la app genera:

1. Usuario en Supabase Auth.
2. Fila en `restaurantes`.
3. URL de carta publica: `/carta/slug`.
4. URL de modo sala: `/camarero/slug`.

El dashboard normal busca el restaurante por el email del usuario.

## Crear usuarios manualmente

Si el alta desde `/admin` falla por falta de `SUPABASE_SERVICE_ROLE_KEY`, todavia puedes hacerlo manualmente:

1. Crea un usuario en Supabase Auth con su email y contrasena.
2. Crea una fila en la tabla `restaurantes` con el mismo `email`.

## Despliegue en cataconjuanjo.com

Esta app es Next.js y no funciona como GitHub Pages estatica. Debe desplegarse en Vercel.

Flujo recomendado:

1. Subir este repo a GitHub.
2. Crear/importar proyecto en Vercel desde el repo.
3. Anadir las variables de entorno.
4. Anadir el dominio `cataconjuanjo.com` en Vercel.
5. Cambiar DNS del dominio segun indique Vercel.

Cuando Vercel este conectado al repo, cada push a la rama principal desplegara la web.
