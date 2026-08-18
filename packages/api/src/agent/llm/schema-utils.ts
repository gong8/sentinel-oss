/**
 * Schema Utilities
 * Utilities for cleaning and transforming JSON Schema for different LLM providers
 */

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if a value is a non-null object (not an array)
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ============================================================================
// GEMINI SCHEMA CLEANING
// ============================================================================

/**
 * Gemini-supported format values (OpenAPI 3.0 subset)
 * Other format values like 'cuid', 'cuid2', 'ulid' etc. are not supported
 */
const GEMINI_SUPPORTED_FORMATS = new Set([
  'date-time',
  'date',
  'time',
  'email',
  'uri',
  'uuid',
  'int32',
  'int64',
  'float',
  'double',
  'byte',
  'binary',
  'password',
]);

/**
 * Fields that Gemini doesn't support in function schemas
 * Based on Gemini API documentation - only basic JSON Schema subset is supported
 * Gemini only supports: type, description, properties, required, items, enum
 */
const GEMINI_UNSUPPORTED_FIELDS = new Set([
  // JSON Schema references - not supported
  'additionalProperties',
  '$defs',
  'definitions',
  '$ref',
  '$schema',
  // Metadata fields
  'default',
  'examples',
  'title',
  // Complex type compositions - not supported
  'nullable',
  'oneOf',
  'anyOf',
  'allOf',
  // String validation - not supported in function schemas
  'pattern',
  'minLength',
  'maxLength',
  // Number validation - not supported in function schemas
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  // Array validation - not supported
  'minItems',
  'maxItems',
  'uniqueItems',
  // Other unsupported
  'const',
  'contentEncoding',
  'contentMediaType',
]);

/**
 * Find fields that have default values in the schema.
 * These fields should not be marked as required since they have fallback values.
 */
function findFieldsWithDefaults(properties: Record<string, unknown> | undefined): Set<string> {
  const fieldsWithDefaults = new Set<string>();
  if (!properties) return fieldsWithDefaults;

  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    if (fieldSchema && typeof fieldSchema === 'object' && 'default' in fieldSchema) {
      fieldsWithDefaults.add(fieldName);
    }
  }
  return fieldsWithDefaults;
}

/**
 * Recursively clean JSON Schema for Gemini compatibility.
 * - Strips unsupported fields ($defs, $ref, additionalProperties, default, etc.)
 * - Strips unsupported 'format' values (like 'cuid', 'cuid2', 'ulid')
 * - Handles array types (type: ["string", "null"]) by extracting primary type
 * - Removes fields with defaults from the required array
 * - Adds default type to properties that are missing one (e.g., from z.unknown())
 */
export function cleanSchemaForGemini(obj: unknown, fieldsWithDefaults?: Set<string>): unknown {
  if (!isRecord(obj)) {
    if (Array.isArray(obj)) {
      return obj.map((item) => cleanSchemaForGemini(item, fieldsWithDefaults));
    }
    return obj;
  }

  const result: Record<string, unknown> = {};
  const record = obj;

  // Find fields with defaults before processing (only at top level with properties)
  const properties = record.properties;
  const currentFieldsWithDefaults = isRecord(properties)
    ? findFieldsWithDefaults(properties)
    : fieldsWithDefaults;

  for (const [key, value] of Object.entries(record)) {
    // Skip unsupported fields
    if (GEMINI_UNSUPPORTED_FIELDS.has(key)) {
      continue;
    }
    // Skip unsupported format values
    if (key === 'format' && typeof value === 'string' && !GEMINI_SUPPORTED_FORMATS.has(value)) {
      continue;
    }
    // Handle array types like ["string", "null"] -> "string"
    if (key === 'type' && Array.isArray(value)) {
      const nonNullType = value.find((t) => t !== 'null');
      result[key] = nonNullType || 'string';
      continue;
    }
    // Filter out fields with defaults from required array
    if (key === 'required' && Array.isArray(value) && currentFieldsWithDefaults) {
      const filteredRequired = value.filter((field) => !currentFieldsWithDefaults.has(field));
      if (filteredRequired.length > 0) {
        result[key] = filteredRequired;
      }
      // If all required fields had defaults, don't include required at all
      continue;
    }
    result[key] = cleanSchemaForGemini(value, currentFieldsWithDefaults);
  }

  // Check if this looks like a property definition (has description but no type)
  // This handles z.unknown() which produces {"description": "..."} with no type
  // Gemini requires every property to have a type, so we default to string
  // IMPORTANT: We check that description is a string value, not just that the key exists
  // This avoids matching on properties objects like {name: {...}, description: {...}}
  // where "description" is a property name key, not a schema description
  if (
    typeof result.description === 'string' &&
    !('type' in result) &&
    !('properties' in result) &&
    !('items' in result)
  ) {
    result.type = 'string';
  }

  return result;
}

// ============================================================================
// OPENAI SCHEMA CLEANING
// ============================================================================

/**
 * Fields that OpenAI doesn't support in function schemas
 */
const OPENAI_UNSUPPORTED_FIELDS = new Set([
  // JSON Schema references - not fully supported
  '$schema',
  '$defs',
  'definitions',
  '$ref',
  // Metadata fields
  'examples',
  'title',
  // Array validation that may not be supported
  'minItems',
  'maxItems',
  'uniqueItems',
]);

/**
 * Recursively clean JSON Schema for OpenAI compatibility.
 * - Converts Draft 4 boolean exclusiveMinimum/exclusiveMaximum to Draft 6+ numeric format
 * - Strips unsupported fields
 * - Handles minItems constraint which OpenAI may reject
 */
export function cleanSchemaForOpenAI(obj: unknown): unknown {
  if (!isRecord(obj)) {
    if (Array.isArray(obj)) {
      return obj.map((item) => cleanSchemaForOpenAI(item));
    }
    return obj;
  }

  const result: Record<string, unknown> = {};
  const record = obj;

  for (const [key, value] of Object.entries(record)) {
    // Skip unsupported fields
    if (OPENAI_UNSUPPORTED_FIELDS.has(key)) {
      continue;
    }

    // Handle Draft 4 boolean exclusiveMinimum -> Draft 6+ numeric
    // In Draft 4: { "minimum": 0, "exclusiveMinimum": true } means > 0
    // In Draft 6+: { "exclusiveMinimum": 0 } means > 0
    if (key === 'exclusiveMinimum' && value === true) {
      const minimum = record.minimum;
      if (typeof minimum === 'number') {
        result.exclusiveMinimum = minimum;
      } else {
        // If no minimum, positive() means > 0
        result.exclusiveMinimum = 0;
      }
      continue;
    }

    // Skip minimum if we're converting to exclusive
    if (key === 'minimum' && record.exclusiveMinimum === true) {
      continue;
    }

    // Handle Draft 4 boolean exclusiveMaximum -> Draft 6+ numeric
    if (key === 'exclusiveMaximum' && value === true) {
      const maximum = record.maximum;
      if (typeof maximum === 'number') {
        result.exclusiveMaximum = maximum;
      }
      continue;
    }

    // Skip maximum if we're converting to exclusive
    if (key === 'maximum' && record.exclusiveMaximum === true) {
      continue;
    }

    result[key] = cleanSchemaForOpenAI(value);
  }

  return result;
}

// ============================================================================
// OPENAI TOOL NAME SANITIZATION
// ============================================================================

/**
 * Sanitize a tool name for OpenAI's function calling API
 * OpenAI requires function names to match ^[a-zA-Z0-9_-]+$
 * MCP tool names often contain :: or other special characters
 */
export function sanitizeToolNameForOpenAI(name: string): string {
  // Replace :: with double underscore (common MCP pattern)
  // Replace other special chars with underscore
  return name.replace(/::/g, '__').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Restore original tool name from sanitized name
 * This is a best-effort reverse transformation
 */
export function restoreToolNameFromOpenAI(sanitizedName: string): string {
  // Restore :: from double underscore
  return sanitizedName.replace(/__/g, '::');
}

// ============================================================================
// GENERIC SCHEMA UTILITIES
// ============================================================================

/**
 * Deep clone a JSON Schema object
 */
export function cloneSchema(schema: unknown): unknown {
  return JSON.parse(JSON.stringify(schema));
}

/**
 * Check if a schema has any properties
 */
export function hasSchemaProperties(schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  const properties = schema.properties;
  return isRecord(properties) && Object.keys(properties).length > 0;
}

/**
 * Get required fields from a schema
 */
export function getSchemaRequired(schema: unknown): string[] {
  if (!isRecord(schema)) return [];
  const required = schema.required;
  return Array.isArray(required)
    ? required.filter((item): item is string => typeof item === 'string')
    : [];
}
