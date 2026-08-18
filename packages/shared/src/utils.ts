/**
 * Shared utility functions used across sentinel packages.
 */

// Re-export isPlainObject from security for backward compatibility
// The canonical implementation is in security.ts
export { isPlainObject } from './security.js';
