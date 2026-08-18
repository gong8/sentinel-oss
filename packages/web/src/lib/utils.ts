import { isPlainObject } from '@sentinel/shared';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export { isPlainObject };

export function cn(...inputs: Array<string | undefined | null | false>): string {
  return twMerge(clsx(inputs));
}

/**
 * Recursively removes empty values from an object
 * Empty values: null, undefined, empty string, empty array, empty object
 */
export function cleanObject<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    if (isPlainObject(value)) {
      const cleaned = cleanObject(value);
      if (Object.keys(cleaned).length > 0) {
        result[key as keyof T] = cleaned as T[keyof T];
      }
      continue;
    }
    result[key as keyof T] = value as T[keyof T];
  }

  return result;
}
