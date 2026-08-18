/**
 * Workspace Tool Router Tests
 * Tests for tool classification and routing
 */

import { describe, expect, it } from 'vitest';
import { classifyToolByName } from '../../../../packages/api/src/services/workspace-tool-router.js';

describe('classifyToolByName', () => {
  describe('READ classification', () => {
    it('should classify tools starting with "get" as READ', () => {
      expect(classifyToolByName('getUser')).toBe('READ');
      expect(classifyToolByName('getUserById')).toBe('READ');
      expect(classifyToolByName('get_user_data')).toBe('READ');
    });

    it('should classify tools starting with "list" as READ', () => {
      expect(classifyToolByName('listUsers')).toBe('READ');
      expect(classifyToolByName('listAllRecords')).toBe('READ');
      expect(classifyToolByName('list_items')).toBe('READ');
    });

    it('should classify tools starting with "fetch" as READ', () => {
      expect(classifyToolByName('fetchData')).toBe('READ');
      expect(classifyToolByName('fetchUserProfile')).toBe('READ');
    });

    it('should classify tools starting with "read" as READ', () => {
      expect(classifyToolByName('readFile')).toBe('READ');
      expect(classifyToolByName('readConfig')).toBe('READ');
    });

    it('should classify tools starting with "search" as READ', () => {
      expect(classifyToolByName('searchUsers')).toBe('READ');
      expect(classifyToolByName('searchDocuments')).toBe('READ');
    });

    it('should classify tools starting with "find" as READ', () => {
      expect(classifyToolByName('findById')).toBe('READ');
      expect(classifyToolByName('findMatchingRecords')).toBe('READ');
    });

    it('should classify tools starting with "query" as READ', () => {
      expect(classifyToolByName('queryDatabase')).toBe('READ');
      expect(classifyToolByName('queryUsers')).toBe('READ');
    });

    it('should classify tools starting with "show" as READ', () => {
      expect(classifyToolByName('showDetails')).toBe('READ');
      expect(classifyToolByName('showUser')).toBe('READ');
    });

    it('should classify tools starting with "view" as READ', () => {
      expect(classifyToolByName('viewDocument')).toBe('READ');
      expect(classifyToolByName('viewProfile')).toBe('READ');
    });
  });

  describe('WRITE classification', () => {
    it('should classify tools starting with "create" as WRITE', () => {
      expect(classifyToolByName('createUser')).toBe('WRITE');
      expect(classifyToolByName('createPR')).toBe('WRITE');
      expect(classifyToolByName('create_record')).toBe('WRITE');
    });

    it('should classify tools starting with "update" as WRITE', () => {
      expect(classifyToolByName('updateUser')).toBe('WRITE');
      expect(classifyToolByName('updateSettings')).toBe('WRITE');
    });

    it('should classify tools starting with "delete" as WRITE', () => {
      expect(classifyToolByName('deleteUser')).toBe('WRITE');
      expect(classifyToolByName('deleteRecord')).toBe('WRITE');
    });

    it('should classify tools starting with "remove" as WRITE', () => {
      expect(classifyToolByName('removeItem')).toBe('WRITE');
      expect(classifyToolByName('removeFromList')).toBe('WRITE');
    });

    it('should classify tools starting with "send" as WRITE', () => {
      expect(classifyToolByName('sendEmail')).toBe('WRITE');
      expect(classifyToolByName('sendMessage')).toBe('WRITE');
    });

    it('should classify tools starting with "execute" as WRITE', () => {
      expect(classifyToolByName('executeCommand')).toBe('WRITE');
      expect(classifyToolByName('executeScript')).toBe('WRITE');
    });

    it('should classify tools starting with "run" as WRITE', () => {
      expect(classifyToolByName('runTask')).toBe('WRITE');
      expect(classifyToolByName('runPipeline')).toBe('WRITE');
    });

    it('should classify tools starting with "post" as WRITE', () => {
      expect(classifyToolByName('postComment')).toBe('WRITE');
      expect(classifyToolByName('postUpdate')).toBe('WRITE');
    });

    it('should classify tools starting with "put" as WRITE', () => {
      expect(classifyToolByName('putObject')).toBe('WRITE');
      expect(classifyToolByName('putData')).toBe('WRITE');
    });

    it('should classify tools starting with "patch" as WRITE', () => {
      expect(classifyToolByName('patchRecord')).toBe('WRITE');
      expect(classifyToolByName('patchUser')).toBe('WRITE');
    });

    it('should classify tools starting with "add" as WRITE', () => {
      expect(classifyToolByName('addUser')).toBe('WRITE');
      expect(classifyToolByName('addToList')).toBe('WRITE');
    });

    it('should classify tools starting with "set" as WRITE', () => {
      expect(classifyToolByName('setConfig')).toBe('WRITE');
      expect(classifyToolByName('setValue')).toBe('WRITE');
    });

    it('should classify tools starting with "modify" as WRITE', () => {
      expect(classifyToolByName('modifyRecord')).toBe('WRITE');
      expect(classifyToolByName('modifySettings')).toBe('WRITE');
    });

    it('should classify tools starting with "edit" as WRITE', () => {
      expect(classifyToolByName('editDocument')).toBe('WRITE');
      expect(classifyToolByName('editProfile')).toBe('WRITE');
    });

    it('should classify tools starting with "write" as WRITE', () => {
      expect(classifyToolByName('writeFile')).toBe('WRITE');
      expect(classifyToolByName('writeData')).toBe('WRITE');
    });

    it('should classify tools starting with "submit" as WRITE', () => {
      expect(classifyToolByName('submitForm')).toBe('WRITE');
      expect(classifyToolByName('submitRequest')).toBe('WRITE');
    });

    it('should classify tools starting with "publish" as WRITE', () => {
      expect(classifyToolByName('publishArticle')).toBe('WRITE');
      expect(classifyToolByName('publishChanges')).toBe('WRITE');
    });

    it('should classify tools starting with "deploy" as WRITE', () => {
      expect(classifyToolByName('deployApp')).toBe('WRITE');
      expect(classifyToolByName('deployService')).toBe('WRITE');
    });
  });

  describe('UNKNOWN classification', () => {
    it('should classify tools with unknown prefixes as UNKNOWN', () => {
      expect(classifyToolByName('doSomething')).toBe('UNKNOWN');
      expect(classifyToolByName('process')).toBe('UNKNOWN');
      expect(classifyToolByName('handleRequest')).toBe('UNKNOWN');
      expect(classifyToolByName('myCustomTool')).toBe('UNKNOWN');
    });
  });

  describe('domain::tool format handling', () => {
    it('should extract tool name from domain::tool format', () => {
      expect(classifyToolByName('github.com::getUser')).toBe('READ');
      expect(classifyToolByName('github.com::createPR')).toBe('WRITE');
      expect(classifyToolByName('api.example.com::listItems')).toBe('READ');
      expect(classifyToolByName('localhost:3000::deleteRecord')).toBe('WRITE');
    });

    it('should classify domain::tool with unknown prefix as UNKNOWN', () => {
      expect(classifyToolByName('github.com::unknownTool')).toBe('UNKNOWN');
    });
  });

  describe('case insensitivity', () => {
    it('should classify tools case-insensitively', () => {
      expect(classifyToolByName('GetUser')).toBe('READ');
      expect(classifyToolByName('GETUSER')).toBe('READ');
      expect(classifyToolByName('CreateUser')).toBe('WRITE');
      expect(classifyToolByName('CREATEUSER')).toBe('WRITE');
    });
  });
});
