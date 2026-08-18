/**
 * A2A Proxy-side credential decryption.
 * Re-exports from @sentinel/shared with A2A-specific logging.
 */

import {
  decryptCredentials as sharedDecryptCredentials,
  decryptString as sharedDecryptString,
  type DecryptOptions,
} from '@sentinel/shared';

import { logger } from './logger.js';

/**
 * Default decrypt options with A2A-specific logging
 */
const defaultOptions: DecryptOptions = {
  onKeyWarning: (message) => logger.security(message),
};

export function decryptString(ciphertext: string): string {
  return sharedDecryptString(ciphertext, defaultOptions);
}

export function decryptCredentials(ciphertext: string): Record<string, unknown> {
  return sharedDecryptCredentials(ciphertext, defaultOptions);
}
