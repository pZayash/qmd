/**
 * Collections configuration management
 *
 * This module manages the YAML-based collection configuration at ~/.config/qmd/index.yml.
 * Collections define which directories to index and their associated contexts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { homedir } from "os";
import YAML from "yaml";
import { resolveL0Source, type L0Source } from "./dir-node.js";

export type { L0Source } from "./dir-node.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Context definitions for a collection
 * Key is path prefix (e.g., "/", "/2024", "/Board of Directors")
 * Value is the context description
 */
export type ContextMap = Record<string, string>;

/**
 * A single collection configuration
 */
export interface Collection {
  path: string;              // Absolute path to index
  pattern: string;           // Glob pattern (e.g., "**/*.md")
  ignore?: string[];         // Glob patterns to exclude (e.g., ["Sessions/**"])
  context?: ContextMap;      // Optional context definitions
  update?: string;           // Optional bash command to run during qmd update
  includeByDefault?: boolean; // Include in queries by default (default: true)
  l0Source?: L0Source;       // Dir-node L0 mode: n=extractive, p=contract, q=reserved
}

/**
 * Model configuration for embedding, reranking, and generation
 */
export interface ModelsConfig {
  embed?: string;
  rerank?: string;
  generate?: string;
  l0Source?: L0Source;       // Default dir-node L0 mode for collections without override
  embedBatchSize?: number;
  // Local OpenAI-compatible fallback for a cloud `embed` provider (e.g. LMStudio).
  // Used when the cloud endpoint is unreachable (network error / 5xx). The local
  // server MUST serve the SAME embedding model/dimensions as the cloud one.
  embedFallbackUrl?: string;     // base (.../v1) or full (.../v1/embeddings) URL
  embedFallbackModel?: string;   // defaults to the cloud model id
  embedFallbackApiKey?: string;  // optional; local servers ignore it
  // Hard endpoint override: force ALL embedding requests to this single endpoint,
  // bypassing the cloud primary and fallback chain (debug/tests/emergency switch).
  // Env QMD_EMBED_ENDPOINT* takes precedence over these. Endpoint MUST serve the
  // SAME model/dimensions — the logical model URI (DB tag) is unchanged.
  embedEndpointUrl?: string;     // base (.../v1) or full (.../v1/embeddings) URL
  embedEndpointModel?: string;   // defaults to the `embed` model id
  embedEndpointApiKey?: string;  // optional
}

/**
 * The complete configuration file structure
 */
export interface CollectionConfig {
  global_context?: string;                    // Context applied to all collections
  editor_uri?: string;                        // Editor URI template for terminal hyperlinks
  editor_uri_template?: string;               // Alias for editor_uri
  collections: Record<string, Collection>;    // Collection name -> config
  models?: ModelsConfig;
}

/**
 * Collection with its name (for return values)
 */
export interface NamedCollection extends Collection {
  name: string;
}

type CollectionYaml = Collection & { l0_source?: unknown };

/** Normalize YAML snake_case keys onto Collection fields. */
export function normalizeCollectionFields(collection: CollectionYaml): Collection {
  const l0Raw = collection.l0Source ?? collection.l0_source;
  const { l0_source: _drop, ...rest } = collection;
  if (l0Raw === undefined) return rest;
  return { ...rest, l0Source: resolveL0Source(l0Raw) };
}

/** Effective dir-node L0 mode: collection overrides models; default `n`. */
export function getEffectiveL0Source(
  collection?: Collection | NamedCollection | null,
  config?: CollectionConfig,
): L0Source {
  if (collection) {
    const c = collection as CollectionYaml;
    if (c.l0Source !== undefined) return resolveL0Source(c.l0Source);
    if (c.l0_source !== undefined) return resolveL0Source(c.l0_source);
  }
  if (config?.models) {
    const m = config.models as ModelsConfig & { l0_source?: unknown };
    if (m.l0Source !== undefined) return resolveL0Source(m.l0Source);
    if (m.l0_source !== undefined) return resolveL0Source(m.l0_source);
  }
  return "n";
}

// ============================================================================
// Configuration paths
// ============================================================================

// Current index name (default: "index")
let currentIndexName: string = "index";

// SDK mode: optional in-memory config or custom config path
let configSource: { type: 'file'; path?: string } | { type: 'inline'; config: CollectionConfig } = { type: 'file' };

/**
 * Set the config source for SDK mode.
 * - File path: load/save from a specific YAML file
 * - Inline config: use an in-memory CollectionConfig (saveConfig updates in place, no file I/O)
 * - undefined: reset to default file-based config
 */
export function setConfigSource(source?: { configPath?: string; config?: CollectionConfig }): void {
  if (!source) {
    configSource = { type: 'file' };
    return;
  }
  if (source.config) {
    // Ensure collections object exists
    if (!source.config.collections) {
      source.config.collections = {};
    }
    configSource = { type: 'inline', config: source.config };
  } else if (source.configPath) {
    configSource = { type: 'file', path: source.configPath };
  } else {
    configSource = { type: 'file' };
  }
}

/**
 * Set the current index name for config file lookup
 * Config file will be ~/.config/qmd/{indexName}.yml
 */
export function setConfigIndexName(name: string): void {
  // Resolve relative paths to absolute paths and sanitize for use as filename
  if (name.includes('/')) {
    const { resolve } = require('path');
    const { cwd } = require('process');
    const absolutePath = resolve(cwd(), name);
    // Replace path separators with underscores to create a valid filename
    currentIndexName = absolutePath.replace(/\//g, '_').replace(/^_/, '');
  } else {
    currentIndexName = name;
  }
}

function getConfigDir(): string {
  // Allow override via QMD_CONFIG_DIR for testing
  if (process.env.QMD_CONFIG_DIR) {
    return process.env.QMD_CONFIG_DIR;
  }
  // Respect XDG Base Directory specification (consistent with store.ts)
  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, "qmd");
  }
  return join(homedir(), ".config", "qmd");
}

function getConfigFilePath(): string {
  return join(getConfigDir(), `${currentIndexName}.yml`);
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

// ============================================================================
// Core functions
// ============================================================================

/**
 * Load secrets from ~/.config/qmd/.env into process.env.
 * Existing env vars take priority (are not overwritten).
 * Called once at CLI/SDK startup.
 */
// Load one .env file into process.env. Existing keys are never overwritten, so
// the first source to define a key wins. Returns silently if the file is absent
// or unreadable.
function loadEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return;

  let content: string;
  try {
    content = readFileSync(envPath, "utf-8");
  } catch {
    return;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // Accept an optional `export ` prefix; key must be a valid identifier.
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2] ?? "";

    // Strip an unquoted trailing inline comment, then surrounding quotes.
    value = value.replace(/\s+#.*$/, "").trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Env vars already set in the environment take priority (first source wins).
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * Load env vars with a precedence cascade (highest wins):
 *   1. shell env       — already in process.env, never overwritten
 *   2. <cwd>/.env      — project-local overrides (per-collection endpoints, debug)
 *   3. ~/.config/qmd/.env — global secrets/defaults (e.g. OPENROUTER_API_KEY)
 * Because loadEnvFile never overwrites an existing key, loading the project file
 * before the global file gives the project file priority over the global one.
 * `cwd` defaults to the shell working dir (PWD, matching getPwd()); pass
 * explicitly for tests/SDK embedding.
 */
export function loadConfigEnv(cwd: string = process.env.PWD || process.cwd()): void {
  loadEnvFile(join(cwd, ".env"));         // project-local (higher priority)
  loadEnvFile(join(getConfigDir(), ".env")); // global (lower priority)
}

/**
 * Load configuration from the configured source.
 * - Inline config: returns the in-memory object directly
 * - File-based: reads from YAML file (default ~/.config/qmd/index.yml)
 * Returns empty config if file doesn't exist
 */
export function loadConfig(): CollectionConfig {
  // SDK inline config mode
  if (configSource.type === 'inline') {
    return configSource.config;
  }

  // File-based config (SDK custom path or default)
  const configPath = configSource.path || getConfigFilePath();
  if (!existsSync(configPath)) {
    return { collections: {} };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = YAML.parse(content) as CollectionConfig;

    // Ensure collections object exists
    if (!config.collections) {
      config.collections = {};
    }

    return config;
  } catch (error) {
    throw new Error(`Failed to parse ${configPath}: ${error}`);
  }
}

/**
 * Save configuration to the configured source.
 * - Inline config: updates the in-memory object (no file I/O)
 * - File-based: writes to YAML file (default ~/.config/qmd/index.yml)
 */
export function saveConfig(config: CollectionConfig): void {
  // SDK inline config mode: update in place, no file I/O
  if (configSource.type === 'inline') {
    configSource.config = config;
    return;
  }

  const configPath = configSource.path || getConfigFilePath();
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  try {
    const yaml = YAML.stringify(config, {
      indent: 2,
      lineWidth: 0,  // Don't wrap lines
    });
    writeFileSync(configPath, yaml, "utf-8");
  } catch (error) {
    throw new Error(`Failed to write ${configPath}: ${error}`);
  }
}

/**
 * Get a specific collection by name
 * Returns null if not found
 */
export function getCollection(name: string): NamedCollection | null {
  const config = loadConfig();
  const collection = config.collections[name];

  if (!collection) {
    return null;
  }

  return { name, ...normalizeCollectionFields(collection as CollectionYaml) };
}

/**
 * List all collections
 */
export function listCollections(): NamedCollection[] {
  const config = loadConfig();
  return Object.entries(config.collections).map(([name, collection]) => ({
    name,
    ...normalizeCollectionFields(collection as CollectionYaml),
  }));
}

/**
 * Get collections that are included by default in queries
 */
export function getDefaultCollections(): NamedCollection[] {
  return listCollections().filter(c => c.includeByDefault !== false);
}

/**
 * Get collection names that are included by default
 */
export function getDefaultCollectionNames(): string[] {
  return getDefaultCollections().map(c => c.name);
}

/**
 * Update a collection's settings
 */
export function updateCollectionSettings(
  name: string,
  settings: { update?: string | null; includeByDefault?: boolean }
): boolean {
  const config = loadConfig();
  const collection = config.collections[name];
  if (!collection) return false;

  if (settings.update !== undefined) {
    if (settings.update === null) {
      delete collection.update;
    } else {
      collection.update = settings.update;
    }
  }

  if (settings.includeByDefault !== undefined) {
    if (settings.includeByDefault === true) {
      // true is default, remove the field
      delete collection.includeByDefault;
    } else {
      collection.includeByDefault = settings.includeByDefault;
    }
  }

  saveConfig(config);
  return true;
}

/**
 * Add or update a collection
 */
export function addCollection(
  name: string,
  path: string,
  pattern: string = "**/*.md"
): void {
  const config = loadConfig();

  config.collections[name] = {
    path,
    pattern,
    context: config.collections[name]?.context, // Preserve existing context
  };

  saveConfig(config);
}

/**
 * Remove a collection
 */
export function removeCollection(name: string): boolean {
  const config = loadConfig();

  if (!config.collections[name]) {
    return false;
  }

  delete config.collections[name];
  saveConfig(config);
  return true;
}

/**
 * Rename a collection
 */
export function renameCollection(oldName: string, newName: string): boolean {
  const config = loadConfig();

  if (!config.collections[oldName]) {
    return false;
  }

  if (config.collections[newName]) {
    throw new Error(`Collection '${newName}' already exists`);
  }

  config.collections[newName] = config.collections[oldName];
  delete config.collections[oldName];
  saveConfig(config);
  return true;
}

/**
 * Remap a collection's filesystem root. Does not reindex or drop documents.
 */
export function setCollectionPath(name: string, newRoot: string): boolean {
  const config = loadConfig();

  if (!config.collections[name]) {
    return false;
  }

  config.collections[name].path = resolve(newRoot);
  saveConfig(config);
  return true;
}

// ============================================================================
// Context management
// ============================================================================

/**
 * Get global context
 */
export function getGlobalContext(): string | undefined {
  const config = loadConfig();
  return config.global_context;
}

/**
 * Set global context
 */
export function setGlobalContext(context: string | undefined): void {
  const config = loadConfig();
  config.global_context = context;
  saveConfig(config);
}

/**
 * Get all contexts for a collection
 */
export function getContexts(collectionName: string): ContextMap | undefined {
  const collection = getCollection(collectionName);
  return collection?.context;
}

/**
 * Add or update a context for a specific path in a collection
 */
export function addContext(
  collectionName: string,
  pathPrefix: string,
  contextText: string
): boolean {
  const config = loadConfig();
  const collection = config.collections[collectionName];

  if (!collection) {
    return false;
  }

  if (!collection.context) {
    collection.context = {};
  }

  collection.context[pathPrefix] = contextText;
  saveConfig(config);
  return true;
}

/**
 * Remove a context from a collection
 */
export function removeContext(
  collectionName: string,
  pathPrefix: string
): boolean {
  const config = loadConfig();
  const collection = config.collections[collectionName];

  if (!collection?.context?.[pathPrefix]) {
    return false;
  }

  delete collection.context[pathPrefix];

  // Remove empty context object
  if (Object.keys(collection.context).length === 0) {
    delete collection.context;
  }

  saveConfig(config);
  return true;
}

/**
 * List all contexts across all collections
 */
export function listAllContexts(): Array<{
  collection: string;
  path: string;
  context: string;
}> {
  const config = loadConfig();
  const results: Array<{ collection: string; path: string; context: string }> = [];

  // Add global context if present
  if (config.global_context) {
    results.push({
      collection: "*",
      path: "/",
      context: config.global_context,
    });
  }

  // Add collection contexts
  for (const [name, collection] of Object.entries(config.collections)) {
    if (collection.context) {
      for (const [path, context] of Object.entries(collection.context)) {
        results.push({
          collection: name,
          path,
          context,
        });
      }
    }
  }

  return results;
}

/**
 * Find best matching context for a given collection and path
 * Returns the most specific matching context (longest path prefix match)
 */
export function findContextForPath(
  collectionName: string,
  filePath: string
): string | undefined {
  const config = loadConfig();
  const collection = config.collections[collectionName];

  if (!collection?.context) {
    return config.global_context;
  }

  // Find all matching prefixes
  const matches: Array<{ prefix: string; context: string }> = [];

  for (const [prefix, context] of Object.entries(collection.context)) {
    // Normalize paths for comparison
    const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
    const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;

    if (normalizedPath.startsWith(normalizedPrefix)) {
      matches.push({ prefix: normalizedPrefix, context });
    }
  }

  // Return most specific match (longest prefix)
  if (matches.length > 0) {
    matches.sort((a, b) => b.prefix.length - a.prefix.length);
    return matches[0]!.context;
  }

  // Fallback to global context
  return config.global_context;
}

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Get the config file path (useful for error messages)
 */
export function getConfigPath(): string {
  if (configSource.type === 'inline') return '<inline>';
  return configSource.path || getConfigFilePath();
}

/**
 * Check if config file exists
 */
export function configExists(): boolean {
  if (configSource.type === 'inline') return true;
  const path = configSource.path || getConfigFilePath();
  return existsSync(path);
}

/**
 * Validate a collection name
 * Collection names must be valid and not contain special characters
 */
export function isValidCollectionName(name: string): boolean {
  // Allow alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]+$/.test(name);
}
