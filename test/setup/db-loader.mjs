/**
 * ESM Database Loader
 * Loads the compiled @sentinel/db package using native Node.js ESM
 * This bypasses Playwright's Babel transpiler which doesn't support `export * as` syntax
 */

export async function loadPrisma() {
  const db = await import('@sentinel/db');
  return db.prisma;
}
