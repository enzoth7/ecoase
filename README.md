# Ecoase Dashboard

Dashboard web de control operativo construido con React y Next.js.

## Desarrollo local

Requiere Node.js `>=22.13.0`.

```bash
npm install
```

Creá un archivo `.env.local` con:

```bash
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_PUBLISHABLE_KEY=tu-clave-publicable
```

Luego iniciá la aplicación:

```bash
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

## Comandos

- `npm run dev`: servidor local con recarga automática.
- `npm run build`: genera la aplicación web para producción y Vercel.
- `npm run lint`: valida el código.
- `npm test`: ejecuta pruebas de datos, render y endpoints.

## API

- `GET /api/orders`: lista pedidos.
- `POST /api/orders`: agrega un pedido.
- `PATCH /api/orders/:id`: actualiza fecha, cantidad, etapa o transportista.
- `GET /api/orders/:id/history`: historial de cambios del pedido.
- `GET /api/history`: pedidos completados.
- `GET /api/clients`: resumen por cliente.
- `GET /api/calendar`: agenda operativa.
- `GET /api/logistics`: entregas y transportes.
- `GET /api/providers`: proveedores y tipo de abastecimiento.

Los pedidos, sus líneas, los proveedores y el historial de cambios se guardan en Supabase. Las vistas de clientes, calendario, logística y plan se calculan a partir de esos datos.

El esquema está versionado en `supabase/migrations` y los datos iniciales en `supabase/seed.sql`. Las pruebas de endpoints usan un almacenamiento temporal aislado para no modificar la base real.

## Despliegue en Vercel

Vercel detecta Next.js automáticamente. Antes de desplegar, cargá `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en las variables de entorno del proyecto. No requiere directorio de salida personalizado.
