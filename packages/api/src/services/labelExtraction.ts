/**
 * Label Extraction Service
 * Extracts human-readable labels from tool responses for display in the policy condition builder
 *
 * When a tool is invoked with an ID-like parameter (e.g., page_id: "page_abc123"),
 * this service searches the tool's response for that ID and extracts a human-readable
 * label (e.g., "Q1 Planning") to display alongside the raw ID value.
 *
 * This service is designed to be universal across different MCP servers and API patterns.
 */

import { isPlainObject } from '../lib/isPlainObject.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface LabelMapping {
  /** The parameter key (e.g., "page_id") */
  paramKey: string;
  /** The parameter value (e.g., "page_abc123") */
  paramValue: string;
  /** The extracted human-readable label (e.g., "Q1 Planning") */
  label: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Suffixes that indicate a parameter is likely an ID
 */
const ID_SUFFIXES = [
  '_id',
  'Id',
  '_ID',
  'ID',
  '_uuid',
  'Uuid',
  '_ref',
  'Ref',
  '_key',
  'Key',
  '_urn',
  '_uri',
  '_slug',
];

/**
 * Parameter names that are commonly IDs
 */
const ID_PARAM_NAMES = [
  // Generic
  'id',
  'uuid',
  'guid',
  'urn',
  'uri',
  'key',
  'ref',
  'identifier',
  'handle',
  'slug',
  // Resources
  'repository',
  'repo',
  'owner',
  'database',
  'table',
  'collection',
  'workspace',
  'channel',
  'team',
  'project',
  'folder',
  'file',
  'document',
  'page',
  'board',
  'list',
  'card',
  'issue',
  'pull_request',
  'pr',
  'branch',
  'commit',
  'namespace',
  'bucket',
  'container',
  'resource',
  'org',
  'organization',
  'user',
  'member',
  'group',
  'role',
  'permission',
  'account',
  'tenant',
  'space',
  'room',
  'thread',
  'message',
  'comment',
  'note',
  'task',
  'job',
  'run',
  'build',
  'deployment',
  'environment',
  'secret',
  'variable',
  'config',
  'setting',
  'record',
  'entry',
  'item',
  'object',
  'asset',
  'media',
  'image',
  'video',
  'audio',
  'attachment',
  // API-specific
  'data_source_id',
  'parent_id',
  'source_id',
  'target_id',
  'destination_id',
];

/**
 * Fields in response objects that commonly contain human-readable labels
 * Listed in priority order - first match wins
 */
const LABEL_FIELDS = [
  'title',
  'name',
  'label',
  'displayName',
  'display_name',
  'fullName',
  'full_name',
  'headline',
  'heading',
  'subject',
  'summary',
  'description',
  'caption',
  'text',
  'content',
  'body',
  'message',
  'username',
  'login',
  'email',
  'path',
  'filename',
  'file_name',
  'slug',
  'handle',
  'alias',
  'nickname',
];

/**
 * Fields in response objects that commonly contain IDs
 */
const ID_FIELDS = [
  'id',
  '_id',
  'uid',
  'uuid',
  'guid',
  'key',
  'ref',
  'identifier',
  'urn',
  'uri',
  'handle',
  'slug',
  'number', // GitHub issues/PRs use number
  'data_source_id',
];

/**
 * Common wrapper fields in API responses that contain the actual data
 */
const RESPONSE_WRAPPER_FIELDS = [
  'results',
  'data',
  'items',
  'records',
  'entries',
  'list',
  'objects',
  'documents',
  'pages',
  'rows',
  'nodes',
  'edges',
  'values',
  'members',
  'users',
  'files',
  'resources',
];

/**
 * UUID pattern - matches various UUID formats
 */
const UUID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/**
 * Common ID patterns (not just UUIDs)
 */
const ID_VALUE_PATTERNS = [
  UUID_PATTERN,
  /^[a-z]{2,10}_[a-zA-Z0-9]{10,}$/, // Stripe-style: cus_abc123, sub_xyz789
  /^[A-Z]{1,5}-\d+$/, // Jira-style: PROJ-123
  /^[0-9]+$/, // Numeric IDs
  /^[a-zA-Z0-9]{20,}$/, // Long alphanumeric IDs
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a value looks like an ID (UUID, numeric, or common ID patterns)
 */
export function looksLikeId(value: string): boolean {
  if (!value || value.length < 3) return false;
  return ID_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Check if a parameter key looks like an ID parameter
 */
export function isIdParameter(key: string): boolean {
  const lowerKey = key.toLowerCase();

  // Check if it ends with a common ID suffix
  for (const suffix of ID_SUFFIXES) {
    if (key.endsWith(suffix) || key.toLowerCase().endsWith(suffix.toLowerCase())) {
      return true;
    }
  }

  // Check if it's a common ID parameter name
  return ID_PARAM_NAMES.some(
    (name) =>
      lowerKey === name ||
      lowerKey === `${name}_id` ||
      lowerKey === `${name}id` ||
      lowerKey === `${name}_key` ||
      lowerKey === `${name}_ref`,
  );
}

/**
 * Try to parse a stringified JSON or Python-style dict
 */
function tryParseValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    // Try Python-style dict: {'key': 'value'}
    try {
      const jsonified = value
        .replace(/'/g, '"')
        .replace(/None/g, 'null')
        .replace(/True/g, 'true')
        .replace(/False/g, 'false');
      return JSON.parse(jsonified);
    } catch {
      return null;
    }
  }
}

/**
 * Extract ID values from nested parameters (objects, arrays, stringified JSON)
 * Returns array of [paramPath, idValue] pairs
 */
function extractNestedIds(
  value: unknown,
  parentKey: string,
  depth = 0,
): Array<{ path: string; value: string }> {
  const results: Array<{ path: string; value: string }> = [];
  if (depth > 5) return results;

  // Handle strings that might be stringified JSON
  if (typeof value === 'string') {
    // Check if it looks like an ID directly
    if (looksLikeId(value)) {
      results.push({ path: parentKey, value });
    }
    // Try to parse as JSON/Python dict
    const parsed = tryParseValue(value);
    if (parsed && typeof parsed === 'object') {
      results.push(...extractNestedIds(parsed, parentKey, depth + 1));
    }
    return results;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      results.push(...extractNestedIds(item, `${parentKey}[${index}]`, depth + 1));
    });
    return results;
  }

  // Handle objects
  if (isPlainObject(value)) {
    for (const [key, val] of Object.entries(value)) {
      const newPath = parentKey ? `${parentKey}.${key}` : key;

      // If key looks like an ID field and value is a string, extract it
      if (typeof val === 'string' && (isIdParameter(key) || ID_FIELDS.includes(key))) {
        if (val.trim().length > 0) {
          results.push({ path: newPath, value: val });
        }
      }

      // Recurse into nested objects/arrays
      if (typeof val === 'object' && val !== null) {
        results.push(...extractNestedIds(val, newPath, depth + 1));
      }
    }
  }

  return results;
}

/**
 * Normalize a response to a searchable object or array
 * Handles:
 * - Plain objects
 * - Arrays
 * - MCP CallToolResult format: { content: [{ type: "text", text: "..." }] }
 * - Stringified JSON
 * - Common wrapper patterns (results, data, items, etc.)
 */
export function normalizeResponse(response: unknown): unknown {
  if (response === null || response === undefined) {
    return null;
  }

  // Handle strings - try to parse as JSON
  if (typeof response === 'string') {
    try {
      return JSON.parse(response);
    } catch {
      return null; // Not JSON, can't extract labels
    }
  }

  // Handle arrays
  if (Array.isArray(response)) {
    return response;
  }

  // Handle objects
  if (isPlainObject(response)) {
    // Check for MCP CallToolResult format
    if ('content' in response && Array.isArray(response.content)) {
      const content = response.content;

      // Try to extract text content from MCP result
      for (const item of content) {
        if (isPlainObject(item) && item.type === 'text' && typeof item.text === 'string') {
          try {
            return JSON.parse(item.text);
          } catch {
            // Continue to next content item
          }
        }
      }

      // No parseable text content found
      return null;
    }

    // Regular object
    return response;
  }

  return null;
}

/**
 * Unwrap common response wrappers to get to the actual data
 */
function unwrapResponse(response: unknown): unknown {
  if (!isPlainObject(response)) {
    return response;
  }

  // Check for common wrapper fields
  for (const wrapperField of RESPONSE_WRAPPER_FIELDS) {
    if (wrapperField in response) {
      const wrapped = response[wrapperField];
      if (Array.isArray(wrapped) || isPlainObject(wrapped)) {
        return wrapped;
      }
    }
  }

  return response;
}

/**
 * Deep search for a label field value within an object
 * Searches recursively for any field in LABEL_FIELDS at any nesting depth
 * Also handles common patterns like arrays of text objects (plain_text, content)
 */
function deepFindLabel(obj: unknown, maxDepth = 5, currentDepth = 0): string | null {
  if (currentDepth >= maxDepth || obj === null || obj === undefined) {
    return null;
  }

  // Handle strings directly - check if it looks like a label (not an ID/UUID)
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    // Skip if empty, looks like UUID, or is too short
    if (trimmed.length < 2 || looksLikeId(trimmed)) {
      return null;
    }
    return trimmed.length > 100 ? `${trimmed.slice(0, 97)}...` : trimmed;
  }

  // Handle arrays - look for text content patterns (common in rich text APIs)
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (isPlainObject(item)) {
        // Common rich text patterns: { plain_text: "..." } or { text: { content: "..." } }
        if (typeof item.plain_text === 'string' && item.plain_text.trim()) {
          const label = item.plain_text.trim();
          if (!looksLikeId(label)) {
            return label.length > 100 ? `${label.slice(0, 97)}...` : label;
          }
        }
        if (typeof item.content === 'string' && item.content.trim()) {
          const label = item.content.trim();
          if (!looksLikeId(label)) {
            return label.length > 100 ? `${label.slice(0, 97)}...` : label;
          }
        }
        if (isPlainObject(item.text) && typeof item.text.content === 'string') {
          const label = item.text.content.trim();
          if (label && !looksLikeId(label)) {
            return label.length > 100 ? `${label.slice(0, 97)}...` : label;
          }
        }
      }
    }
    return null;
  }

  // Handle objects
  if (isPlainObject(obj)) {
    // First check label fields directly on this object
    for (const labelField of LABEL_FIELDS) {
      const value = obj[labelField];
      if (typeof value === 'string' && value.trim().length > 0) {
        const label = value.trim();
        // Skip if it looks like an ID
        if (!looksLikeId(label)) {
          return label.length > 100 ? `${label.slice(0, 97)}...` : label;
        }
      }
      // If it's an array or object, recurse into it (handles rich text arrays)
      if (Array.isArray(value) || isPlainObject(value)) {
        const nestedLabel = deepFindLabel(value, maxDepth, currentDepth + 1);
        if (nestedLabel) return nestedLabel;
      }
    }

    // Then recurse into nested objects/arrays to find labels deeper
    for (const [key, value] of Object.entries(obj)) {
      // Skip ID fields and already-checked label fields
      if (ID_FIELDS.includes(key) || LABEL_FIELDS.includes(key)) continue;

      if (isPlainObject(value) || Array.isArray(value)) {
        const nestedLabel = deepFindLabel(value, maxDepth, currentDepth + 1);
        if (nestedLabel) return nestedLabel;
      }
    }
  }

  return null;
}

/**
 * Find a label for a given ID value within an object
 * Searches for the ID in ID fields and returns the corresponding label from label fields
 */
function findLabelInObject(obj: Record<string, unknown>, targetValue: string): string | null {
  // Check if this object contains the target value in any ID field
  let foundMatch = false;

  // First check standard ID fields
  for (const idField of ID_FIELDS) {
    const idValue = obj[idField];
    if (typeof idValue === 'string' && idValue === targetValue) {
      foundMatch = true;
      break;
    }
    // Also check without hyphens (some APIs strip them)
    if (
      typeof idValue === 'string' &&
      idValue.replace(/-/g, '') === targetValue.replace(/-/g, '')
    ) {
      foundMatch = true;
      break;
    }
  }

  // Also check if any field's value matches (for cases where the ID field has a non-standard name)
  if (!foundMatch) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        if (value === targetValue || value.replace(/-/g, '') === targetValue.replace(/-/g, '')) {
          // Check if the key looks like it could be an ID field
          if (isIdParameter(key) || key.toLowerCase().includes('id')) {
            foundMatch = true;
            break;
          }
        }
      }
    }
  }

  // Check in nested URL fields (common pattern: id embedded in URL)
  if (!foundMatch && typeof obj.url === 'string') {
    const normalizedTarget = targetValue.replace(/-/g, '');
    if (obj.url.includes(targetValue) || obj.url.includes(normalizedTarget)) {
      foundMatch = true;
    }
  }

  if (!foundMatch) {
    return null;
  }

  // Found the ID - now do a deep search for a label within this object
  return deepFindLabel(obj);
}

/**
 * Recursively search for a label matching a parameter value in a response object
 */
export function findLabelInResponse(obj: unknown, targetValue: string): string | null {
  if (obj === null || obj === undefined) {
    return null;
  }

  // Handle arrays - search each item
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const label = findLabelInResponse(item, targetValue);
      if (label) {
        return label;
      }
    }
    return null;
  }

  // Handle objects
  if (isPlainObject(obj)) {
    // Try to find label directly in this object
    const directLabel = findLabelInObject(obj, targetValue);
    if (directLabel) {
      return directLabel;
    }

    // Check unwrapped response (common wrappers like results, data, items)
    const unwrapped = unwrapResponse(obj);
    if (unwrapped !== obj) {
      const unwrappedLabel = findLabelInResponse(unwrapped, targetValue);
      if (unwrappedLabel) {
        return unwrappedLabel;
      }
    }

    // Recursively search nested objects and arrays
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null) {
        const nestedLabel = findLabelInResponse(value, targetValue);
        if (nestedLabel) {
          return nestedLabel;
        }
      }
    }
  }

  return null;
}

/**
 * Extract all ID→label mappings from a response (for populating suggestions from search results)
 */
function extractAllLabelsFromResponse(response: unknown): Map<string, string> {
  const labels = new Map<string, string>();

  function processItem(item: unknown): void {
    if (!isPlainObject(item)) return;

    // Find any ID field
    let idValue: string | null = null;
    for (const idField of ID_FIELDS) {
      const val = item[idField];
      if (typeof val === 'string' && val.trim()) {
        idValue = val;
        break;
      }
    }

    // If we found an ID, find its label
    if (idValue) {
      const label = deepFindLabel(item);
      if (label && !labels.has(idValue)) {
        labels.set(idValue, label);
      }
    }

    // Recurse into nested objects/arrays
    for (const value of Object.values(item)) {
      if (Array.isArray(value)) {
        value.forEach(processItem);
      } else if (isPlainObject(value)) {
        processItem(value);
      }
    }
  }

  if (Array.isArray(response)) {
    response.forEach(processItem);
  } else if (isPlainObject(response)) {
    // Check for wrapper fields
    const unwrapped = unwrapResponse(response);
    if (Array.isArray(unwrapped)) {
      unwrapped.forEach(processItem);
    } else {
      processItem(response);
    }
  }

  return labels;
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract human-readable labels from tool response for ID-like parameters
 *
 * @param parameters - The parameters passed to the tool
 * @param response - The response from the tool (can be various formats)
 * @returns Array of label mappings for parameters where labels were found
 *
 * @example
 * // Tool call: notion.getPage({ page_id: "page_abc123" })
 * // Response: { id: "page_abc123", title: "Q1 Planning", ... }
 * extractLabelsFromResponse(
 *   { page_id: "page_abc123" },
 *   { id: "page_abc123", title: "Q1 Planning" }
 * )
 * // Returns: [{ paramKey: "page_id", paramValue: "page_abc123", label: "Q1 Planning" }]
 */
export function extractLabelsFromResponse(
  parameters: Record<string, unknown>,
  response: unknown,
): LabelMapping[] {
  const mappings: LabelMapping[] = [];
  const processedValues = new Set<string>();

  try {
    // Normalize the response to a searchable structure
    const normalizedResponse = normalizeResponse(response);
    if (!normalizedResponse) {
      return mappings;
    }

    // Extract all ID→label mappings from the response for quick lookup
    const allLabels = extractAllLabelsFromResponse(normalizedResponse);

    // Collect all ID-like parameters (including nested ones)
    const idParams: Array<{ path: string; value: string }> = [];

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        if (isIdParameter(key) || looksLikeId(value)) {
          idParams.push({ path: key, value: value.trim() });
        }
        // Also try to extract nested IDs from stringified JSON
        const nestedIds = extractNestedIds(value, key);
        idParams.push(...nestedIds);
      } else if (typeof value === 'object' && value !== null) {
        // Extract IDs from object parameters
        const nestedIds = extractNestedIds(value, key);
        idParams.push(...nestedIds);
      }
    }

    // For single-object responses, extract top-level label for fallback
    let topLevelLabel: string | null = null;
    const isSingleObjectResponse =
      isPlainObject(normalizedResponse) && !Array.isArray(normalizedResponse);

    // Check if the response looks like a wrapper with results array
    const hasResultsArray =
      isSingleObjectResponse &&
      RESPONSE_WRAPPER_FIELDS.some(
        (field) => field in normalizedResponse && Array.isArray(normalizedResponse[field]),
      );

    // Only use top-level fallback for true single-object responses (not search results)
    if (isSingleObjectResponse && !hasResultsArray) {
      topLevelLabel = deepFindLabel(normalizedResponse);
    }

    // Find labels for each ID parameter
    for (const { path, value } of idParams) {
      // Skip if we've already processed this value
      if (processedValues.has(value)) continue;
      processedValues.add(value);

      // Try multiple strategies to find a label:

      // 1. Check pre-extracted labels from response
      let label = allLabels.get(value);

      // 2. Try without hyphens (some APIs normalize UUIDs)
      if (!label) {
        const normalizedValue = value.replace(/-/g, '');
        for (const [id, lbl] of allLabels) {
          if (id.replace(/-/g, '') === normalizedValue) {
            label = lbl;
            break;
          }
        }
      }

      // 3. Deep search in the response
      if (!label) {
        label = findLabelInResponse(normalizedResponse, value) ?? undefined;
      }

      // 4. Fallback to top-level label for single-object responses with few ID params
      if (!label && topLevelLabel && idParams.length <= 2) {
        label = topLevelLabel ?? undefined;
      }

      if (label) {
        mappings.push({
          paramKey: path,
          paramValue: value,
          label,
        });
      }
    }
  } catch (error) {
    // Label extraction is non-critical - log and continue
    logger.debug('Failed to extract labels from response', { error });
  }

  return mappings;
}

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

export const _testing = {
  ID_SUFFIXES,
  ID_PARAM_NAMES,
  LABEL_FIELDS,
  ID_FIELDS,
  RESPONSE_WRAPPER_FIELDS,
  ID_VALUE_PATTERNS,
  findLabelInObject,
  extractNestedIds,
  extractAllLabelsFromResponse,
  looksLikeId,
  tryParseValue,
  unwrapResponse,
  deepFindLabel,
};
