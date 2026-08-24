# Ecoase Dashboard

Dashboard web de control operativo construido con React y Vite.

## Desarrollo local

Requiere Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

## Comandos

- `npm run dev`: servidor local con recarga automática.
- `npm run build`: genera la aplicación web.
- `npm run lint`: valida el código.
- `npm test`: ejecuta pruebas de datos, render y endpoints.

## API

- `GET /api/orders`: lista pedidos.
- `POST /api/orders`: agrega un pedido.
- `GET /api/clients`: resumen por cliente.
- `GET /api/calendar`: agenda operativa.
- `GET /api/logistics`: entregas y transportes.

Por ahora las altas se guardan en memoria y se reinician con el servidor. La estructura de Drizzle queda disponible para incorporar una base persistente en la siguiente etapa.
