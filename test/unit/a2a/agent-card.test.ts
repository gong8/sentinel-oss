/**
 * Unit tests for A2A Agent Card service
 * Tests parsing, validation, hashing, and security scheme handling
 */

import { describe, expect, test, vi } from 'vitest';

// Mock logger
vi.mock('../../../packages/a2a/src/logger.js', () => ({
  logger: {
    card: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('A2A Agent Card', () => {
  describe('parseAgentCard', () => {
    test('should parse valid minimal Agent Card', async () => {
      const { parseAgentCard } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test Agent',
        description: 'A test agent for unit testing',
        url: 'https://agent.example.com',
        skills: [
          {
            id: 'test-skill',
            name: 'Test Skill',
            description: 'A test skill',
          },
        ],
      };

      const result = parseAgentCard(card);
      expect(result.name).toBe('Test Agent');
      expect(result.url).toBe('https://agent.example.com');
      expect(result.protocolVersion).toBe('1.0.0');
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].id).toBe('test-skill');
    });

    test('should parse Agent Card with security schemes', async () => {
      const { parseAgentCard } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Secure Agent',
        description: 'A secure agent',
        url: 'https://agent.example.com',
        skills: [{ id: 'skill1', name: 'Skill', description: 'A skill' }],
        securitySchemes: {
          bearer: {
            type: 'http',
            scheme: 'bearer',
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
        security: [{ bearer: [] }],
      };

      const result = parseAgentCard(card);
      expect(result.securitySchemes).toBeDefined();
      expect(result.securitySchemes?.bearer.type).toBe('http');
      expect(result.securitySchemes?.apiKey.type).toBe('apiKey');
    });

    test('should throw on invalid Agent Card (missing required fields)', async () => {
      const { parseAgentCard } = await import('../../../packages/a2a/src/agent-card.js');

      const invalidCard = {
        name: 'Test Agent',
        // Missing url, version, skills
      };

      expect(() => parseAgentCard(invalidCard)).toThrow('Invalid Agent Card');
    });

    test('should throw on invalid Agent Card (wrong types)', async () => {
      const { parseAgentCard } = await import('../../../packages/a2a/src/agent-card.js');

      const invalidCard = {
        name: 123, // Should be string
        url: 'https://agent.example.com',
        version: '1.0.0',
        skills: [],
        supportsAuthenticatedExtendedCard: true,
      };

      expect(() => parseAgentCard(invalidCard)).toThrow('Invalid Agent Card');
    });
  });

  describe('computeCardHash', () => {
    test('should compute consistent hash for same card', async () => {
      const { computeCardHash } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test Agent',
        description: 'A test agent',
        url: 'https://agent.example.com',
        skills: [{ id: 'skill1', name: 'Skill', description: 'A skill' }],
      };

      const hash1 = computeCardHash(card);
      const hash2 = computeCardHash(card);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    test('should compute different hash for different cards', async () => {
      const { computeCardHash } = await import('../../../packages/a2a/src/agent-card.js');

      const card1 = {
        protocolVersion: '1.0.0',
        name: 'Agent 1',
        description: 'Agent 1 description',
        url: 'https://agent1.example.com',
        skills: [{ id: 'skill1', name: 'Skill', description: 'A skill' }],
      };

      const card2 = {
        protocolVersion: '1.0.0',
        name: 'Agent 2',
        description: 'Agent 2 description',
        url: 'https://agent2.example.com',
        skills: [{ id: 'skill1', name: 'Skill', description: 'A skill' }],
      };

      const hash1 = computeCardHash(card1);
      const hash2 = computeCardHash(card2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('isCacheValid', () => {
    test('should return false for null date', async () => {
      const { isCacheValid } = await import('../../../packages/a2a/src/agent-card.js');

      expect(isCacheValid(null)).toBe(false);
    });

    test('should return true for recent date', async () => {
      const { isCacheValid } = await import('../../../packages/a2a/src/agent-card.js');

      const recentDate = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      expect(isCacheValid(recentDate)).toBe(true);
    });

    test('should return false for old date (> 1 hour)', async () => {
      const { isCacheValid } = await import('../../../packages/a2a/src/agent-card.js');

      const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      expect(isCacheValid(oldDate)).toBe(false);
    });
  });

  describe('schemeTypeToAuthType', () => {
    test('should map apiKey to API_KEY', async () => {
      const { schemeTypeToAuthType } = await import('../../../packages/a2a/src/agent-card.js');
      expect(schemeTypeToAuthType('apiKey')).toBe('API_KEY');
    });

    test('should map http to API_KEY (bearer token)', async () => {
      const { schemeTypeToAuthType } = await import('../../../packages/a2a/src/agent-card.js');
      expect(schemeTypeToAuthType('http')).toBe('API_KEY');
    });

    test('should map oauth2 to OAUTH', async () => {
      const { schemeTypeToAuthType } = await import('../../../packages/a2a/src/agent-card.js');
      expect(schemeTypeToAuthType('oauth2')).toBe('OAUTH');
    });

    test('should map openIdConnect to OIDC', async () => {
      const { schemeTypeToAuthType } = await import('../../../packages/a2a/src/agent-card.js');
      expect(schemeTypeToAuthType('openIdConnect')).toBe('OIDC');
    });
  });

  describe('getSupportedAuthTypes', () => {
    test('should return all types when no schemes defined', async () => {
      const { getSupportedAuthTypes } = await import('../../../packages/a2a/src/agent-card.js');

      const result = getSupportedAuthTypes(undefined);
      expect(result).toContain('NONE');
      expect(result).toContain('API_KEY');
      expect(result).toContain('OAUTH');
      expect(result).toContain('OIDC');
    });

    test('should return mapped types from schemes', async () => {
      const { getSupportedAuthTypes } = await import('../../../packages/a2a/src/agent-card.js');

      const schemes = {
        bearer: { type: 'http' as const, scheme: 'bearer' },
        oauth: { type: 'oauth2' as const, flows: {} },
      };

      const result = getSupportedAuthTypes(schemes);
      expect(result).toContain('API_KEY');
      expect(result).toContain('OAUTH');
    });
  });

  describe('getPrimarySecurityScheme', () => {
    test('should return null when no schemes defined', async () => {
      const { getPrimarySecurityScheme } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [],
      };

      expect(getPrimarySecurityScheme(card)).toBeNull();
    });

    test('should return first scheme from security array', async () => {
      const { getPrimarySecurityScheme } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [],
        securitySchemes: {
          bearer: { type: 'http' as const, scheme: 'bearer' },
          apiKey: { type: 'apiKey' as const, in: 'header' as const, name: 'X-API-Key' },
        },
        security: [{ bearer: [] }],
      };

      const result = getPrimarySecurityScheme(card);
      expect(result?.name).toBe('bearer');
      expect(result?.scheme.type).toBe('http');
    });

    test('should return first defined scheme when no security array', async () => {
      const { getPrimarySecurityScheme } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [],
        securitySchemes: {
          apiKey: { type: 'apiKey' as const, in: 'header' as const, name: 'X-API-Key' },
        },
      };

      const result = getPrimarySecurityScheme(card);
      expect(result?.name).toBe('apiKey');
    });
  });

  describe('validateAuthTypeForCard', () => {
    test('should allow NONE when no security required', async () => {
      const { validateAuthTypeForCard } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [],
      };

      const result = validateAuthTypeForCard('NONE', card);
      expect(result.valid).toBe(true);
    });

    test('should reject NONE when security required', async () => {
      const { validateAuthTypeForCard } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [],
        securitySchemes: {
          bearer: { type: 'http' as const, scheme: 'bearer' },
        },
        security: [{ bearer: ['read', 'write'] }], // Non-empty scopes = required
      };

      const result = validateAuthTypeForCard('NONE', card);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires authentication');
    });

    test('should allow matching auth type', async () => {
      const { validateAuthTypeForCard } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [],
        securitySchemes: {
          bearer: { type: 'http' as const, scheme: 'bearer' },
        },
      };

      const result = validateAuthTypeForCard('API_KEY', card);
      expect(result.valid).toBe(true);
    });

    test('should reject non-matching auth type', async () => {
      const { validateAuthTypeForCard } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [],
        securitySchemes: {
          bearer: { type: 'http' as const, scheme: 'bearer' },
        },
      };

      const result = validateAuthTypeForCard('OAUTH', card);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not supported');
    });
  });

  describe('getSkillIds', () => {
    test('should extract skill IDs', async () => {
      const { getSkillIds } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [
          { id: 'skill-1', name: 'Skill 1', description: 'Skill 1 desc' },
          { id: 'skill-2', name: 'Skill 2', description: 'Skill 2 desc' },
          { id: 'skill-3', name: 'Skill 3', description: 'Skill 3 desc' },
        ],
      };

      const result = getSkillIds(card);
      expect(result).toEqual(['skill-1', 'skill-2', 'skill-3']);
    });

    test('should return empty array for no skills', async () => {
      const { getSkillIds } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [],
      };

      const result = getSkillIds(card);
      expect(result).toEqual([]);
    });
  });

  describe('findSkill', () => {
    test('should find skill by ID', async () => {
      const { findSkill } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [
          { id: 'skill-1', name: 'Skill 1', description: 'First skill' },
          { id: 'skill-2', name: 'Skill 2', description: 'The second skill' },
        ],
      };

      const result = findSkill(card, 'skill-2');
      expect(result?.id).toBe('skill-2');
      expect(result?.name).toBe('Skill 2');
      expect(result?.description).toBe('The second skill');
    });

    test('should return undefined for non-existent skill', async () => {
      const { findSkill } = await import('../../../packages/a2a/src/agent-card.js');

      const card = {
        protocolVersion: '1.0.0',
        name: 'Test',
        description: 'A test agent',
        url: 'https://test.com',
        skills: [{ id: 'skill-1', name: 'Skill 1', description: 'A skill' }],
      };

      const result = findSkill(card, 'non-existent');
      expect(result).toBeUndefined();
    });
  });
});
