# Despliegue de la demo en Vercel + Supabase

Todo se hace desde el navegador; no necesitas instalar nada. Tiempo estimado: 20–30 min.

- **Supabase** pone la base de datos (Postgres) y el almacenamiento de los PDF del data room (compatible con S3).
- **Vercel** compila y publica la app desde GitHub (`Judival30/La_Dorada`, rama **`mvp-demo`**).
- En cada despliegue, el build aplica las migraciones y carga los datos de demo (`pnpm run vercel-build`). La carga es idempotente: repetirla no duplica datos.

Ten a mano un bloc de notas para ir copiando valores.

---

## Parte A · Supabase (≈10 min)

1. Entra a <https://supabase.com> → **Start your project** → inicia sesión con GitHub.
2. **New project**:
   - Name: `ladorada-demo`
   - Database Password: **usa solo letras y números** (sin `@ # / ? %`, rompen la URL). Guárdala.
   - Region: **South America (São Paulo)**.
   - **Create new project** y espera ~2 min a que termine.
3. **Cadenas de conexión.** Botón **Connect** (arriba) → pestaña **Connection String** → tipo **URI**.
   - En **Transaction pooler** (puerto **6543**) copia la URI, cambia `[YOUR-PASSWORD]` por tu contraseña y **agrega al final** `?pgbouncer=true&connection_limit=1`. Eso es `DATABASE_URL`.
   - En **Session pooler** (puerto **5432**) copia la URI y cambia `[YOUR-PASSWORD]`. Eso es `DATABASE_URL_MIGRATE`.
4. **Bucket.** Menú izquierdo **Storage** → **New bucket**:
   - Name: `ladorada-private`
   - **Public bucket: apagado** (privado).
   - **Create**.
5. **Llaves S3.** **Project Settings** (engranaje) → **Storage** → sección **S3 Connection**:
   - Copia **Endpoint** → `S3_ENDPOINT` (algo como `https://xxxx.storage.supabase.co/storage/v1/s3`).
   - Copia **Region** → `S3_REGION` (p. ej. `sa-east-1`).
   - En **S3 Access Keys** → **New access key** → descripción `vercel` → **Create**. Copia **Access key ID** → `S3_ACCESS_KEY` y **Secret access key** → `S3_SECRET_KEY` (el secreto se muestra una sola vez).

## Parte B · Variables

Arma este bloque con tus valores (los que no tienen `<...>` se dejan tal cual):

```env
DATABASE_URL=<URI transaction pooler 6543>?pgbouncer=true&connection_limit=1
DATABASE_URL_MIGRATE=<URI session pooler 5432>
S3_ENDPOINT=<endpoint>
S3_REGION=<region>
S3_ACCESS_KEY=<access key id>
S3_SECRET_KEY=<secret access key>
S3_BUCKET=ladorada-private
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
MAIL_FROM=La Dorada <no-responder@ladorada.local>
APP_URL=https://ladorada-demo.vercel.app
SESSION_TTL_DAYS=7
ADAPTERS_MODE=mock
STORAGE_DRIVER=s3
MAIL_DRIVER=smtp
ENABLE_EXPERIMENTAL_COREPACK=1
```

- `SMTP_*`: la demo no tiene servidor de correo. El envío falla al instante, queda en el log y no afecta nada; las notificaciones dentro de la app sí funcionan.
- `ENABLE_EXPERIMENTAL_COREPACK=1`: hace que Vercel use el pnpm del proyecto (12.9.1). Sin esto la instalación puede fallar.
- `APP_URL` solo debe ser una URL válida; no hace falta cambiarla después.

## Parte C · Vercel (≈10 min)

1. Entra a <https://vercel.com> → **Sign Up / Log In** con **GitHub**.
2. **Add New… → Project** → en *Import Git Repository* busca `La_Dorada` → **Import**.
   Si no aparece: **Adjust GitHub App Permissions** y da acceso al repositorio.
3. En *Configure Project*:
   - Framework Preset: **Next.js** (se detecta solo). Root Directory: `./`.
   - **Build and Output Settings** → **Build Command** → activa *Override* → `pnpm run vercel-build`.
   - **Environment Variables** → pega el bloque de la Parte B completo en el primer campo *Key* (Vercel lo separa solo) y verifica que salgan las 16 variables.
4. **Deploy**. Este primer despliegue usa la rama `main`, que **todavía no tiene la demo**: si falla con `Missing script: vercel-build`, es lo esperado. Sigue al paso 5.
5. Rama de producción: en el proyecto → **Settings → Environments → Production** → *Branch Tracking* → cambia `main` por **`mvp-demo`** → **Save**.
   (En versiones anteriores del panel: **Settings → Git → Production Branch**.)
6. Despliega la rama: pestaña **Deployments** → botón **Create Deployment** (o menú `…`) → escribe `mvp-demo` → **Create Deployment**.
   Mira los logs: deben aparecer `migrations applied`, la salida del seed y luego `next build`. Toma 3–5 min.
7. Al terminar, **Visit**. La URL de producción es la que aparece en **Domains** (p. ej. `la-dorada-xxxx.vercel.app`).

## Parte D · Verificación (≈3 min)

1. `https://<tu-dominio>/api/health` → `{"status":"ok","db":"up"}`.
2. Login con `admin@demo.ladorada.co` / `LaDorada2026!` → `/bo/companies` muestra las empresas en revisión.
3. En una ventana de incógnito, `comprador@demo.ladorada.co` → Marketplace → **Cafés de Antioquia** → **Abrir data room** → descarga un PDF (prueba el bucket).
4. **Mis procesos** → el proceso con contraoferta sembrado.

El guion de la presentación está en `docs/demo/guion-mvp.md`. En la versión desplegada **no** uses `pnpm demo:reset`: para volver a cargar los datos de demo, haz *Redeploy* (el seed solo completa lo que falte; no borra lo que cambiaste durante un ensayo).

## Si algo falla

| Síntoma en los logs o en la app | Causa probable | Arreglo |
|---|---|---|
| `ERR_PNPM_…` o `Unsupported lockfile` al instalar | Falta `ENABLE_EXPERIMENTAL_COREPACK=1` | Agrégala en *Settings → Environment Variables* y *Redeploy* |
| `P1001: Can't reach database server` | URL o contraseña mal | Revisa `DATABASE_URL_MIGRATE`; contraseña sin símbolos |
| `P1000: Authentication failed` | Contraseña equivocada | *Supabase → Project Settings → Database → Reset password* y actualiza las dos URLs |
| `prepared statement "s0" already exists` | Falta `?pgbouncer=true` en `DATABASE_URL` | Agrégalo al final de la URL del pooler 6543 |
| `NoSuchBucket` / `AccessDenied` en el seed | Bucket o llaves S3 | Bucket `ladorada-private` creado; revisa endpoint, región y llaves |
| La app abre pero la página muestra *Application error* | Variable faltante o mal escrita | *Settings → Environment Variables*: compara con la Parte B; luego *Redeploy* |
| Te pide iniciar sesión en Vercel al abrir el enlace | Abriste una URL de *preview*, no la de producción | Usa el dominio de **Domains** (rama `mvp-demo` como producción) |

**Ojo:** la URL es pública y las cuentas de demo tienen contraseña conocida. Compártela solo con quien vaya a ver la demo. Todos los datos son ficticios.
