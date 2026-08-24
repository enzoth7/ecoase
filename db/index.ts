/**
 * The dashboard currently uses in-memory data. Add a Vercel-compatible
 * database adapter here when persistent storage is introduced.
 */
export function getDb(): never {
  throw new Error("La base de datos aún no está configurada.");
}
