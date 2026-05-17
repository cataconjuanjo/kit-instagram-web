# Despliegue y superadmin

## Variables necesarias en Vercel

Configura estas variables en el proyecto de Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_ADMIN_EMAIL`

`NEXT_PUBLIC_ADMIN_EMAIL` debe ser el email que tendra acceso a `/admin`.
Si no se configura, la app usa `cataconjuanjo@gmail.com` por defecto.

## Crear el usuario superadmin

1. Entra en Supabase.
2. Ve a `Authentication` -> `Users`.
3. Pulsa `Add user` / `Create user`.
4. Email: el mismo valor que `NEXT_PUBLIC_ADMIN_EMAIL`.
5. Password: crea una contraseña fuerte.
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

## Crear usuarios de restaurantes

Cada restaurante necesita:

1. Un usuario en Supabase Auth con su email y contraseña.
2. Una fila en la tabla `restaurantes` con el mismo `email`.

El dashboard normal busca el restaurante por ese email.

## Despliegue en cataconjuanjo.com

Esta app es Next.js y no funciona como GitHub Pages estatica. Debe desplegarse en Vercel.

Flujo recomendado:

1. Subir este repo a GitHub.
2. Crear/importar proyecto en Vercel desde el repo.
3. Añadir las variables de entorno.
4. Añadir el dominio `cataconjuanjo.com` en Vercel.
5. Cambiar DNS del dominio segun indique Vercel.

Cuando Vercel este conectado al repo, cada push a la rama principal desplegara la web.
