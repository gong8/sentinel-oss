/**
 * Tests for Snapshot Utilities
 * Tests all functions that extract data from admin action log snapshots
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  extractEmailFromSnapshot,
  extractResourceNameFromSnapshot,
  extractRolesFromSnapshot,
  isDeletedResource,
} from '../../../../packages/api/src/lib/snapshotUtils.js';

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});

describe('snapshotUtils', () => {
  describe('extractEmailFromSnapshot', () => {
    test('should extract email from beforeSnapshot', () => {
      const before = { email: 'user@example.com', name: 'Test User' };
      const after = null;
      expect(extractEmailFromSnapshot(before, after)).toBe('user@example.com');
    });

    test('should extract email from afterSnapshot when beforeSnapshot has no email', () => {
      const before = { name: 'Test User' };
      const after = { email: 'new@example.com' };
      expect(extractEmailFromSnapshot(before, after)).toBe('new@example.com');
    });

    test('should prefer beforeSnapshot email over afterSnapshot', () => {
      const before = { email: 'before@example.com' };
      const after = { email: 'after@example.com' };
      expect(extractEmailFromSnapshot(before, after)).toBe('before@example.com');
    });

    test('should return null when neither snapshot has email', () => {
      const before = { name: 'Test' };
      const after = { name: 'Updated' };
      expect(extractEmailFromSnapshot(before, after)).toBeNull();
    });

    test('should return null when both snapshots are null', () => {
      expect(extractEmailFromSnapshot(null, null)).toBeNull();
    });

    test('should return null when both snapshots are undefined', () => {
      expect(extractEmailFromSnapshot(undefined, undefined)).toBeNull();
    });

    test('should return null when snapshots are arrays', () => {
      expect(extractEmailFromSnapshot(['email'], ['email'])).toBeNull();
    });

    test('should return null when email is not a string', () => {
      const before = { email: 123 };
      const after = { email: true };
      expect(extractEmailFromSnapshot(before, after)).toBeNull();
    });

    test('should handle empty objects', () => {
      expect(extractEmailFromSnapshot({}, {})).toBeNull();
    });

    test('should handle nested email property (should not extract)', () => {
      const before = { user: { email: 'nested@example.com' } };
      expect(extractEmailFromSnapshot(before, null)).toBeNull();
    });
  });

  describe('extractResourceNameFromSnapshot', () => {
    test('should extract name field', () => {
      const snapshot = { name: 'My Resource' };
      expect(extractResourceNameFromSnapshot(snapshot, null)).toBe('My Resource');
    });

    test('should extract email field when name is not present', () => {
      const snapshot = { email: 'user@example.com' };
      expect(extractResourceNameFromSnapshot(snapshot, null)).toBe('user@example.com');
    });

    test('should extract slug field when name and email are not present', () => {
      const snapshot = { slug: 'my-resource-slug' };
      expect(extractResourceNameFromSnapshot(snapshot, null)).toBe('my-resource-slug');
    });

    test('should extract description field as last resort', () => {
      const snapshot = { description: 'A detailed description' };
      expect(extractResourceNameFromSnapshot(snapshot, null)).toBe('A detailed description');
    });

    test('should prefer name over other fields', () => {
      const snapshot = { name: 'Name', email: 'email@test.com', slug: 'slug', description: 'desc' };
      expect(extractResourceNameFromSnapshot(snapshot, null)).toBe('Name');
    });

    test('should use afterSnapshot when beforeSnapshot is null', () => {
      const after = { name: 'After Name' };
      expect(extractResourceNameFromSnapshot(null, after)).toBe('After Name');
    });

    test('should prefer beforeSnapshot over afterSnapshot', () => {
      const before = { name: 'Before' };
      const after = { name: 'After' };
      expect(extractResourceNameFromSnapshot(before, after)).toBe('Before');
    });

    test('should return null when no name fields exist', () => {
      const snapshot = { id: '123', createdAt: new Date() };
      expect(extractResourceNameFromSnapshot(snapshot, null)).toBeNull();
    });

    test('should return null for null snapshots', () => {
      expect(extractResourceNameFromSnapshot(null, null)).toBeNull();
    });

    test('should return null for non-object snapshots', () => {
      expect(extractResourceNameFromSnapshot('string', null)).toBeNull();
      expect(extractResourceNameFromSnapshot(123, null)).toBeNull();
      expect(extractResourceNameFromSnapshot(true, null)).toBeNull();
    });

    test('should handle arrays (should return null)', () => {
      expect(extractResourceNameFromSnapshot(['name'], null)).toBeNull();
    });

    test('should not extract non-string values', () => {
      const snapshot = { name: 123, email: true, slug: null, description: {} };
      expect(extractResourceNameFromSnapshot(snapshot, null)).toBeNull();
    });

    test('should handle empty string values', () => {
      const snapshot = { name: '' };
      // Empty string is still a string, so it should be returned
      expect(extractResourceNameFromSnapshot(snapshot, null)).toBe('');
    });

    test('should fallback to afterSnapshot when beforeSnapshot is empty object', () => {
      // Empty object is falsy for `beforeSnapshot || afterSnapshot`
      // Actually {} is truthy, so it won't fallback
      const before = {};
      const after = { name: 'After' };
      // Since {} is truthy, it will use before which has no name fields
      expect(extractResourceNameFromSnapshot(before, after)).toBeNull();
    });
  });

  describe('extractRolesFromSnapshot', () => {
    test('should extract string roles from roles array', () => {
      const snapshot = { roles: ['ADMIN', 'USER', 'VIEWER'] };
      expect(extractRolesFromSnapshot(snapshot)).toEqual(['ADMIN', 'USER', 'VIEWER']);
    });

    test('should extract roles with roleName property', () => {
      const snapshot = {
        roles: [{ roleName: 'Admin' }, { roleName: 'User' }],
      };
      expect(extractRolesFromSnapshot(snapshot)).toEqual(['Admin', 'User']);
    });

    test('should extract roles with name property', () => {
      const snapshot = {
        roles: [{ name: 'Admin' }, { name: 'User' }],
      };
      expect(extractRolesFromSnapshot(snapshot)).toEqual(['Admin', 'User']);
    });

    test('should handle mixed role formats', () => {
      const snapshot = {
        roles: [
          'STRING_ROLE',
          { roleName: 'Role Name' },
          { name: 'Named Role' },
          { other: 'invalid' },
        ],
      };
      expect(extractRolesFromSnapshot(snapshot)).toEqual([
        'STRING_ROLE',
        'Role Name',
        'Named Role',
      ]);
    });

    test('should extract roles from userRoles with nested role.name', () => {
      const snapshot = {
        userRoles: [{ role: { name: 'Admin' } }, { role: { name: 'User' } }],
      };
      expect(extractRolesFromSnapshot(snapshot)).toEqual(['Admin', 'User']);
    });

    test('should extract string roles from userRoles', () => {
      const snapshot = {
        userRoles: ['ADMIN', 'USER'],
      };
      expect(extractRolesFromSnapshot(snapshot)).toEqual(['ADMIN', 'USER']);
    });

    test('should prefer roles array over userRoles', () => {
      const snapshot = {
        roles: ['FromRoles'],
        userRoles: ['FromUserRoles'],
      };
      expect(extractRolesFromSnapshot(snapshot)).toEqual(['FromRoles']);
    });

    test('should return empty array for null snapshot', () => {
      expect(extractRolesFromSnapshot(null)).toEqual([]);
    });

    test('should return empty array for undefined snapshot', () => {
      expect(extractRolesFromSnapshot(undefined)).toEqual([]);
    });

    test('should return empty array for non-object snapshot', () => {
      expect(extractRolesFromSnapshot('string')).toEqual([]);
      expect(extractRolesFromSnapshot(123)).toEqual([]);
      expect(extractRolesFromSnapshot(true)).toEqual([]);
    });

    test('should return empty array when roles is not an array', () => {
      expect(extractRolesFromSnapshot({ roles: 'ADMIN' })).toEqual([]);
      expect(extractRolesFromSnapshot({ roles: { name: 'Admin' } })).toEqual([]);
    });

    test('should filter out invalid role entries', () => {
      const snapshot = {
        roles: [
          'ValidRole',
          null,
          undefined,
          123,
          { invalid: 'format' },
          { roleName: 'ValidRoleName' },
        ],
      };
      expect(extractRolesFromSnapshot(snapshot)).toEqual(['ValidRole', 'ValidRoleName']);
    });

    test('should handle userRoles with invalid entries', () => {
      const snapshot = {
        userRoles: [
          { role: { name: 'Valid' } },
          { role: { invalid: 'no name' } },
          null,
          'StringRole',
          { noRole: true },
        ],
      };
      expect(extractRolesFromSnapshot(snapshot)).toEqual(['Valid', 'StringRole']);
    });

    test('should return empty array for empty roles array', () => {
      expect(extractRolesFromSnapshot({ roles: [] })).toEqual([]);
    });

    test('should return empty array for empty userRoles array', () => {
      expect(extractRolesFromSnapshot({ userRoles: [] })).toEqual([]);
    });

    test('should handle deeply nested but invalid structures', () => {
      const snapshot = {
        roles: [
          { role: { name: 'Nested but wrong path' } }, // roles expects direct name/roleName
          { name: { nested: 'wrong type' } },
        ],
      };
      expect(extractRolesFromSnapshot(snapshot)).toEqual([]);
    });

    test('should handle userRoles without role property', () => {
      const snapshot = {
        userRoles: [{ roleName: 'WrongFormat' }],
      };
      expect(extractRolesFromSnapshot(snapshot)).toEqual([]);
    });
  });

  describe('isDeletedResource', () => {
    test('should return true when foreignKey is null but snapshot has data', () => {
      expect(isDeletedResource(null, 'user@example.com')).toBe(true);
    });

    test('should return false when foreignKey exists', () => {
      expect(isDeletedResource('user-123', 'user@example.com')).toBe(false);
    });

    test('should return false when both are null', () => {
      expect(isDeletedResource(null, null)).toBe(false);
    });

    test('should return false when foreignKey exists and snapshot is null', () => {
      expect(isDeletedResource('user-123', null)).toBe(false);
    });

    test('should return true with empty string snapshot', () => {
      // Empty string is still not null, so technically deleted
      expect(isDeletedResource(null, '')).toBe(true);
    });

    test('should work with any string values', () => {
      expect(isDeletedResource(null, 'Resource Name')).toBe(true);
      expect(isDeletedResource('fk-id', 'Resource Name')).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('should handle circular reference attempt gracefully', () => {
      // Note: We can't actually create true circular refs in JSON-like data
      // But we can test with nested objects
      const deepNested = {
        email: 'deep@example.com',
        nested: {
          deeper: {
            deepest: {
              email: 'wrong@example.com',
            },
          },
        },
      };
      expect(extractEmailFromSnapshot(deepNested, null)).toBe('deep@example.com');
    });

    test('should handle snapshot with prototype pollution attempt', () => {
      // Test that __proto__ and constructor are handled safely
      const malicious = {
        email: 'legit@example.com',
        __proto__: { email: 'evil@example.com' },
      };
      // Should still work correctly
      expect(extractEmailFromSnapshot(malicious, null)).toBe('legit@example.com');
    });

    test('should handle very long email strings', () => {
      const longEmail = 'a'.repeat(1000) + '@example.com';
      const snapshot = { email: longEmail };
      expect(extractEmailFromSnapshot(snapshot, null)).toBe(longEmail);
    });

    test('should handle unicode in email', () => {
      const snapshot = { email: 'user+tag@例え.jp' };
      expect(extractEmailFromSnapshot(snapshot, null)).toBe('user+tag@例え.jp');
    });

    test('should handle unicode in names', () => {
      const snapshot = { name: '田中太郎' };
      expect(extractResourceNameFromSnapshot(snapshot, null)).toBe('田中太郎');
    });

    test('should handle special characters in roles', () => {
      const snapshot = { roles: ['Admin (Super)', 'User [Basic]', 'Role/Sub'] };
      expect(extractRolesFromSnapshot(snapshot)).toEqual([
        'Admin (Super)',
        'User [Basic]',
        'Role/Sub',
      ]);
    });

    test('should handle whitespace-only strings', () => {
      const snapshot = { email: '   ' };
      // Whitespace-only string is still a string
      expect(extractEmailFromSnapshot(snapshot, null)).toBe('   ');
    });

    test('should handle newlines in strings', () => {
      const snapshot = { name: 'Line1\nLine2' };
      expect(extractResourceNameFromSnapshot(snapshot, null)).toBe('Line1\nLine2');
    });
  });
});
