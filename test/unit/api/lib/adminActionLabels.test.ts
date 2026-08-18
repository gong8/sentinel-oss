/**
 * Tests for Admin Action Labels Utilities
 * Tests display name mappings and tool pattern resolution
 */

import { AdminActionType } from '@sentinel/db';
import { describe, expect, test } from 'vitest';
import {
  getActionDisplayName,
  getToolFriendlyNames,
} from '../../../../packages/api/src/lib/adminActionLabels.js';

describe('getActionDisplayName', () => {
  describe('user actions', () => {
    test('should return display name for USER_CREATE', () => {
      expect(getActionDisplayName(AdminActionType.USER_CREATE)).toBe('Create User');
    });

    test('should return display name for USER_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.USER_UPDATE)).toBe('Update User');
    });

    test('should return display name for USER_DELETE', () => {
      expect(getActionDisplayName(AdminActionType.USER_DELETE)).toBe('Delete User');
    });

    test('should return display name for USER_RESTORE', () => {
      expect(getActionDisplayName(AdminActionType.USER_RESTORE)).toBe('Restore User');
    });

    test('should return display name for USER_ROLES_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.USER_ROLES_UPDATE)).toBe('Update User Roles');
    });

    test('should return display name for USER_TOKEN_REFRESH', () => {
      expect(getActionDisplayName(AdminActionType.USER_TOKEN_REFRESH)).toBe('Refresh User Token');
    });

    test('should return display name for USER_TOKEN_REVOKE', () => {
      expect(getActionDisplayName(AdminActionType.USER_TOKEN_REVOKE)).toBe('Revoke User Token');
    });
  });

  describe('role actions', () => {
    test('should return display name for ROLE_CREATE', () => {
      expect(getActionDisplayName(AdminActionType.ROLE_CREATE)).toBe('Create Role');
    });

    test('should return display name for ROLE_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.ROLE_UPDATE)).toBe('Update Role');
    });

    test('should return display name for ROLE_DELETE', () => {
      expect(getActionDisplayName(AdminActionType.ROLE_DELETE)).toBe('Delete Role');
    });

    test('should return display name for ROLE_RESTORE', () => {
      expect(getActionDisplayName(AdminActionType.ROLE_RESTORE)).toBe('Restore Role');
    });
  });

  describe('policy actions', () => {
    test('should return display name for POLICY_CREATE', () => {
      expect(getActionDisplayName(AdminActionType.POLICY_CREATE)).toBe('Create Policy');
    });

    test('should return display name for POLICY_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.POLICY_UPDATE)).toBe('Update Policy');
    });

    test('should return display name for POLICY_DELETE', () => {
      expect(getActionDisplayName(AdminActionType.POLICY_DELETE)).toBe('Delete Policy');
    });

    test('should return display name for POLICY_RESTORE', () => {
      expect(getActionDisplayName(AdminActionType.POLICY_RESTORE)).toBe('Restore Policy');
    });

    test('should return display name for POLICY_ENABLE', () => {
      expect(getActionDisplayName(AdminActionType.POLICY_ENABLE)).toBe('Enable Policy');
    });

    test('should return display name for POLICY_DISABLE', () => {
      expect(getActionDisplayName(AdminActionType.POLICY_DISABLE)).toBe('Disable Policy');
    });

    test('should return display name for POLICY_CONFLICT_RESOLVE', () => {
      expect(getActionDisplayName(AdminActionType.POLICY_CONFLICT_RESOLVE)).toBe(
        'Resolve Policy Conflict',
      );
    });
  });

  describe('MCP server actions', () => {
    test('should return display name for MCP_SERVER_CREATE', () => {
      expect(getActionDisplayName(AdminActionType.MCP_SERVER_CREATE)).toBe('Create MCP Server');
    });

    test('should return display name for MCP_SERVER_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.MCP_SERVER_UPDATE)).toBe('Update MCP Server');
    });

    test('should return display name for MCP_SERVER_DELETE', () => {
      expect(getActionDisplayName(AdminActionType.MCP_SERVER_DELETE)).toBe('Delete MCP Server');
    });

    test('should return display name for MCP_SERVER_RESTORE', () => {
      expect(getActionDisplayName(AdminActionType.MCP_SERVER_RESTORE)).toBe('Restore MCP Server');
    });

    test('should return display name for MCP_SERVER_DISCOVER_TOOLS', () => {
      expect(getActionDisplayName(AdminActionType.MCP_SERVER_DISCOVER_TOOLS)).toBe(
        'Discover Tools',
      );
    });

    test('should return display name for MCP_SERVER_ORG_API_KEY_ADD', () => {
      expect(getActionDisplayName(AdminActionType.MCP_SERVER_ORG_API_KEY_ADD)).toBe(
        'Add Org API Key',
      );
    });

    test('should return display name for MCP_SERVER_ORG_API_KEY_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.MCP_SERVER_ORG_API_KEY_UPDATE)).toBe(
        'Update Org API Key',
      );
    });

    test('should return display name for MCP_SERVER_ORG_API_KEY_REMOVE', () => {
      expect(getActionDisplayName(AdminActionType.MCP_SERVER_ORG_API_KEY_REMOVE)).toBe(
        'Remove Org API Key',
      );
    });
  });

  describe('OAuth actions', () => {
    test('should return display name for OAUTH_DISCOVER', () => {
      expect(getActionDisplayName(AdminActionType.OAUTH_DISCOVER)).toBe('OAuth Discover');
    });

    test('should return display name for OAUTH_CLIENT_REGISTER', () => {
      expect(getActionDisplayName(AdminActionType.OAUTH_CLIENT_REGISTER)).toBe(
        'Register OAuth Client',
      );
    });

    test('should return display name for OAUTH_CLIENT_CONFIGURE', () => {
      expect(getActionDisplayName(AdminActionType.OAUTH_CLIENT_CONFIGURE)).toBe(
        'Configure OAuth Client',
      );
    });

    test('should return display name for OAUTH_FLOW_INITIATE', () => {
      expect(getActionDisplayName(AdminActionType.OAUTH_FLOW_INITIATE)).toBe('Initiate OAuth Flow');
    });

    test('should return display name for OAUTH_FLOW_COMPLETE', () => {
      expect(getActionDisplayName(AdminActionType.OAUTH_FLOW_COMPLETE)).toBe('Complete OAuth Flow');
    });

    test('should return display name for OAUTH_TOKEN_REFRESH', () => {
      expect(getActionDisplayName(AdminActionType.OAUTH_TOKEN_REFRESH)).toBe('Refresh OAuth Token');
    });

    test('should return display name for OAUTH_TOKEN_REVOKE', () => {
      expect(getActionDisplayName(AdminActionType.OAUTH_TOKEN_REVOKE)).toBe('Revoke OAuth Token');
    });

    test('should return display name for OAUTH_DISCONNECT', () => {
      expect(getActionDisplayName(AdminActionType.OAUTH_DISCONNECT)).toBe('Disconnect OAuth');
    });
  });

  describe('agent actions', () => {
    test('should return display name for AGENT_CREATE', () => {
      expect(getActionDisplayName(AdminActionType.AGENT_CREATE)).toBe('Create Agent');
    });

    test('should return display name for AGENT_DELETE', () => {
      expect(getActionDisplayName(AdminActionType.AGENT_DELETE)).toBe('Delete Agent');
    });

    test('should return display name for AGENT_RESTORE', () => {
      expect(getActionDisplayName(AdminActionType.AGENT_RESTORE)).toBe('Restore Agent');
    });
  });

  describe('personal credentials actions', () => {
    test('should return display name for PERSONAL_API_KEY_SET', () => {
      expect(getActionDisplayName(AdminActionType.PERSONAL_API_KEY_SET)).toBe(
        'Set Personal API Key',
      );
    });

    test('should return display name for PERSONAL_API_KEY_REMOVE', () => {
      expect(getActionDisplayName(AdminActionType.PERSONAL_API_KEY_REMOVE)).toBe(
        'Remove Personal API Key',
      );
    });

    test('should return display name for PERSONAL_CREDENTIALS_SET', () => {
      expect(getActionDisplayName(AdminActionType.PERSONAL_CREDENTIALS_SET)).toBe(
        'Set Personal Credentials',
      );
    });

    test('should return display name for PERSONAL_CREDENTIALS_REMOVE', () => {
      expect(getActionDisplayName(AdminActionType.PERSONAL_CREDENTIALS_REMOVE)).toBe(
        'Remove Personal Credentials',
      );
    });
  });

  describe('permission request actions', () => {
    test('should return display name for PERMISSION_REQUEST_APPROVE', () => {
      expect(getActionDisplayName(AdminActionType.PERMISSION_REQUEST_APPROVE)).toBe(
        'Approve Permission Request',
      );
    });

    test('should return display name for PERMISSION_REQUEST_DENY', () => {
      expect(getActionDisplayName(AdminActionType.PERMISSION_REQUEST_DENY)).toBe(
        'Deny Permission Request',
      );
    });

    test('should return display name for DENY_POLICY_REMOVAL_APPROVE', () => {
      expect(getActionDisplayName(AdminActionType.DENY_POLICY_REMOVAL_APPROVE)).toBe(
        'Approve Restriction Removal',
      );
    });

    test('should return display name for DENY_POLICY_REMOVAL_DENY', () => {
      expect(getActionDisplayName(AdminActionType.DENY_POLICY_REMOVAL_DENY)).toBe(
        'Deny Restriction Removal',
      );
    });
  });

  describe('organization actions', () => {
    test('should return display name for ORGANIZATION_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.ORGANIZATION_UPDATE)).toBe('Update Organization');
    });
  });

  describe('sensitive flag actions', () => {
    test('should return display name for SENSITIVE_FLAG_CREATE', () => {
      expect(getActionDisplayName(AdminActionType.SENSITIVE_FLAG_CREATE)).toBe(
        'Create Sensitive Flag',
      );
    });

    test('should return display name for SENSITIVE_FLAG_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.SENSITIVE_FLAG_UPDATE)).toBe(
        'Update Sensitive Flag',
      );
    });

    test('should return display name for SENSITIVE_FLAG_DELETE', () => {
      expect(getActionDisplayName(AdminActionType.SENSITIVE_FLAG_DELETE)).toBe(
        'Delete Sensitive Flag',
      );
    });

    test('should return display name for SENSITIVE_OVERRIDE_CREATE', () => {
      expect(getActionDisplayName(AdminActionType.SENSITIVE_OVERRIDE_CREATE)).toBe(
        'Create Sensitive Override',
      );
    });

    test('should return display name for SENSITIVE_OVERRIDE_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.SENSITIVE_OVERRIDE_UPDATE)).toBe(
        'Update Sensitive Override',
      );
    });

    test('should return display name for SENSITIVE_OVERRIDE_DELETE', () => {
      expect(getActionDisplayName(AdminActionType.SENSITIVE_OVERRIDE_DELETE)).toBe(
        'Delete Sensitive Override',
      );
    });

    test('should return display name for SENSITIVE_APPROVAL_GRANTED', () => {
      expect(getActionDisplayName(AdminActionType.SENSITIVE_APPROVAL_GRANTED)).toBe(
        'Grant Sensitive Approval',
      );
    });

    test('should return display name for SENSITIVE_APPROVAL_DENIED', () => {
      expect(getActionDisplayName(AdminActionType.SENSITIVE_APPROVAL_DENIED)).toBe(
        'Deny Sensitive Approval',
      );
    });

    test('should return display name for SENSITIVE_APPROVAL_CANCELLED', () => {
      expect(getActionDisplayName(AdminActionType.SENSITIVE_APPROVAL_CANCELLED)).toBe(
        'Cancel Sensitive Approval',
      );
    });
  });

  describe('webhook actions', () => {
    test('should return display name for WEBHOOK_ENDPOINT_CREATE', () => {
      expect(getActionDisplayName(AdminActionType.WEBHOOK_ENDPOINT_CREATE)).toBe(
        'Create Webhook Endpoint',
      );
    });

    test('should return display name for WEBHOOK_ENDPOINT_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.WEBHOOK_ENDPOINT_UPDATE)).toBe(
        'Update Webhook Endpoint',
      );
    });

    test('should return display name for WEBHOOK_ENDPOINT_DELETE', () => {
      expect(getActionDisplayName(AdminActionType.WEBHOOK_ENDPOINT_DELETE)).toBe(
        'Delete Webhook Endpoint',
      );
    });
  });

  describe('integration actions', () => {
    test('should return display name for INTEGRATION_CREATE', () => {
      expect(getActionDisplayName(AdminActionType.INTEGRATION_CREATE)).toBe('Create Integration');
    });

    test('should return display name for INTEGRATION_UPDATE', () => {
      expect(getActionDisplayName(AdminActionType.INTEGRATION_UPDATE)).toBe('Update Integration');
    });

    test('should return display name for INTEGRATION_DELETE', () => {
      expect(getActionDisplayName(AdminActionType.INTEGRATION_DELETE)).toBe('Delete Integration');
    });

    test('should return display name for INTEGRATION_ENABLE', () => {
      expect(getActionDisplayName(AdminActionType.INTEGRATION_ENABLE)).toBe('Enable Integration');
    });

    test('should return display name for INTEGRATION_DISABLE', () => {
      expect(getActionDisplayName(AdminActionType.INTEGRATION_DISABLE)).toBe('Disable Integration');
    });

    test('should return display name for INTEGRATION_TEST', () => {
      expect(getActionDisplayName(AdminActionType.INTEGRATION_TEST)).toBe('Test Integration');
    });
  });
});

describe('getToolFriendlyNames', () => {
  const servers = [
    { name: 'GitHub', url: 'https://github.com:443' },
    { name: 'Slack', url: 'https://slack.com' },
    { name: 'Local Dev', url: 'http://localhost:3000' },
    { name: 'Custom API', url: 'https://api.example.com:8080' },
  ];

  describe('valid tool patterns', () => {
    test('should resolve tool pattern with port', () => {
      // Note: Port 443 is default for HTTPS, so URL.port returns empty string
      // Use the explicit non-default port (8080) from Custom API for port testing
      const result = getToolFriendlyNames('api.example.com:8080::createPR', servers);

      expect(result.serverFriendlyName).toBe('Custom API');
      expect(result.toolFriendlyName).toBe('Custom API::createPR');
    });

    test('should resolve tool pattern without port (default https)', () => {
      const result = getToolFriendlyNames('slack.com::sendMessage', servers);

      expect(result.serverFriendlyName).toBe('Slack');
      expect(result.toolFriendlyName).toBe('Slack::sendMessage');
    });

    test('should resolve localhost with port', () => {
      const result = getToolFriendlyNames('localhost:3000::runTest', servers);

      expect(result.serverFriendlyName).toBe('Local Dev');
      expect(result.toolFriendlyName).toBe('Local Dev::runTest');
    });

    test('should resolve custom domain with port', () => {
      const result = getToolFriendlyNames('api.example.com:8080::fetchData', servers);

      expect(result.serverFriendlyName).toBe('Custom API');
      expect(result.toolFriendlyName).toBe('Custom API::fetchData');
    });
  });

  describe('invalid tool patterns', () => {
    test('should return nulls for pattern without double colon', () => {
      const result = getToolFriendlyNames('invalid-pattern', servers);

      expect(result.serverFriendlyName).toBeNull();
      expect(result.toolFriendlyName).toBeNull();
    });

    test('should return nulls for pattern with single colon only', () => {
      const result = getToolFriendlyNames('server:tool', servers);

      expect(result.serverFriendlyName).toBeNull();
      expect(result.toolFriendlyName).toBeNull();
    });

    test('should return nulls for empty string', () => {
      const result = getToolFriendlyNames('', servers);

      expect(result.serverFriendlyName).toBeNull();
      expect(result.toolFriendlyName).toBeNull();
    });

    test('should return nulls for pattern with more than one double colon', () => {
      const result = getToolFriendlyNames('a::b::c', servers);

      expect(result.serverFriendlyName).toBeNull();
      expect(result.toolFriendlyName).toBeNull();
    });
  });

  describe('unmatched servers', () => {
    test('should return nulls when server is not found', () => {
      const result = getToolFriendlyNames('unknown.com::tool', servers);

      expect(result.serverFriendlyName).toBeNull();
      expect(result.toolFriendlyName).toBeNull();
    });

    test('should return nulls when port does not match', () => {
      const result = getToolFriendlyNames('github.com:8080::tool', servers);

      expect(result.serverFriendlyName).toBeNull();
      expect(result.toolFriendlyName).toBeNull();
    });
  });

  describe('edge cases', () => {
    test('should handle empty servers array', () => {
      const result = getToolFriendlyNames('github.com::tool', []);

      expect(result.serverFriendlyName).toBeNull();
      expect(result.toolFriendlyName).toBeNull();
    });

    test('should handle server with invalid URL', () => {
      const serversWithInvalidUrl = [{ name: 'Invalid', url: 'not-a-valid-url' }];

      const result = getToolFriendlyNames('not-a-valid-url::tool', serversWithInvalidUrl);

      // Should not crash, should return nulls
      expect(result.serverFriendlyName).toBeNull();
      expect(result.toolFriendlyName).toBeNull();
    });

    test('should handle tool name with special characters', () => {
      // Use github.com without port (443 is default for HTTPS and normalizes away)
      const result = getToolFriendlyNames('github.com::create-pull-request_v2', servers);

      expect(result.serverFriendlyName).toBe('GitHub');
      expect(result.toolFriendlyName).toBe('GitHub::create-pull-request_v2');
    });

    test('should handle empty tool name', () => {
      // Use github.com without port (443 is default for HTTPS and normalizes away)
      const result = getToolFriendlyNames('github.com::', servers);

      expect(result.serverFriendlyName).toBe('GitHub');
      expect(result.toolFriendlyName).toBe('GitHub::');
    });
  });
});
