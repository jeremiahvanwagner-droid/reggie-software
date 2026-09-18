import { readFileSync } from 'fs';

/**
 * GHL Multi-Tenant Token Resolver
 *
 * Resolves the correct Private Integration Token and Location ID for
 * GoHighLevel sub-accounts. Every skill that needs GHL API access
 * should call `resolve()` instead of reading env vars directly.
 *
 * Tenant aliases are intentionally environment-driven. A configured tenant
 * exists only when both its token and location ID are present.
 */

export const GHL_BASE = 'https://services.leadconnectorhq.com';
export const API_VERSION = '2021-07-28';

export const GHL_TENANT_ALIASES = Object.freeze([
  'TJB',
  'MSL',
  'RR',
  'AAMA',
  'IBM',
  'EOS_TEMPLATES',
  'EOS_MODULES',
  'RTL',
]);

const tenantEnvKeys = GHL_TENANT_ALIASES.flatMap(alias => [
  `GHL_PRIVATE_INTEGRATION_TOKEN_${alias}`,
  `GHL_LOCATION_ID_${alias}`,
]);

// Includes legacy/default aliases for backwards compatibility.
const GHL_ENV_KEYS = [
  'GHL_PRIVATE_INTEGRATION_TOKEN',
  'GHL_LOCATION_ID',
  ...tenantEnvKeys,
  'GHL_TOKEN',
];

function stripOuterQuotes(value) {
  if (!value) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function expandEnvValue(value, parsedValues) {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key) => parsedValues[key] || process.env[key] || '');
}

function hydrateGhlEnvFromDotEnv() {
  const missingKeys = GHL_ENV_KEYS.filter(key => !process.env[key]);
  if (missingKeys.length === 0) return;

  const envPath = new URL('../.env', import.meta.url);
  let envText = '';

  try {
    envText = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  const parsedValues = {};

  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!GHL_ENV_KEYS.includes(key)) continue;

    const rawValue = line.slice(eqIndex + 1).trim();
    parsedValues[key] = stripOuterQuotes(rawValue);
  }

  for (const key of Object.keys(parsedValues)) {
    parsedValues[key] = expandEnvValue(parsedValues[key], parsedValues);
  }

  for (const key of missingKeys) {
    if (!process.env[key] && parsedValues[key]) {
      process.env[key] = parsedValues[key];
    }
  }
}

hydrateGhlEnvFromDotEnv();

// Tenant registry (built once from env vars)
const tenants = [];

function addTenant(alias) {
  const tokenEnv = `GHL_PRIVATE_INTEGRATION_TOKEN_${alias}`;
  const locationEnv = `GHL_LOCATION_ID_${alias}`;
  const token = process.env[tokenEnv] || '';
  const locationId = process.env[locationEnv] || '';
  if (token && locationId) {
    tenants.push({ alias, token, locationId });
  }
}

for (const alias of GHL_TENANT_ALIASES) {
  addTenant(alias);
}

// Fallback: the "primary" token + a default location
const primaryToken = process.env.GHL_PRIVATE_INTEGRATION_TOKEN
  || process.env.GHL_TOKEN
  || '';
const primaryLocation = process.env.GHL_LOCATION_ID || '';

/**
 * Resolve a tenant's token + locationId.
 *
 * @param {string} [aliasOrLocationId] - tenant alias, a raw location ID, or
 *   omit for the default tenant. TJB is preferred as the default when present.
 * @returns {{ token: string, locationId: string, alias: string }}
 */
export function resolve(aliasOrLocationId) {
  if (!aliasOrLocationId) {
    const tjb = tenants.find(t => t.alias === 'TJB');
    if (tjb) return { ...tjb };
    if (tenants.length > 0) return { ...tenants[0] };
    return { alias: 'PRIMARY', token: primaryToken, locationId: primaryLocation };
  }

  const upper = aliasOrLocationId.toUpperCase();

  // Match by alias
  const byAlias = tenants.find(t => t.alias === upper);
  if (byAlias) return { ...byAlias };

  // Match by location ID
  const byLoc = tenants.find(t => t.locationId === aliasOrLocationId);
  if (byLoc) return { ...byLoc };

  // Fallback: use primary token with the given locationId.
  // Callers should prefer a registered alias so the correct tenant-scoped PIT is used.
  if (primaryToken) {
    return { alias: 'PRIMARY', token: primaryToken, locationId: aliasOrLocationId };
  }

  throw new Error(`No GHL token found for tenant "${aliasOrLocationId}"`);
}

/**
 * Return all configured tenants without exposing tokens.
 * @returns {Array<{ alias: string, locationId: string }>}
 */
export function listTenants() {
  return tenants.map(({ alias, locationId }) => ({ alias, locationId }));
}

// ── Token-group-aware resolution ────────────────────────────────

let _tokenGroupsConfig = null;

function loadTokenGroupsSync() {
  if (!_tokenGroupsConfig) {
    _tokenGroupsConfig = JSON.parse(
      readFileSync(new URL('../config/ghl-token-groups.json', import.meta.url), 'utf8')
    ).token_groups;
  }
  return _tokenGroupsConfig;
}

/**
 * Resolve a tenant by token group ID.
 * Reads the env var specified in ghl-token-groups.json for the group,
 * falling back to the tenant's standard PIT if the scoped var isn't set.
 *
 * @param {string} tokenGroupId - e.g. 'token_insight_ops'
 * @returns {{ token: string, locationId: string, alias: string, tokenGroup: string }}
 */
export function resolveByTokenGroup(tokenGroupId) {
  const groups = loadTokenGroupsSync();
  const group = groups[tokenGroupId];
  if (!group) {
    throw new Error(`Unknown token group: "${tokenGroupId}"`);
  }

  const envVar = group.env_var;
  const scopedToken = process.env[envVar] || '';
  const tenantAlias = (group.tenant || 'TJB').toUpperCase();

  if (scopedToken) {
    const base = resolve(tenantAlias);
    return {
      alias: tenantAlias,
      token: scopedToken,
      locationId: base.locationId,
      tokenGroup: tokenGroupId,
    };
  }

  const base = resolve(tenantAlias);
  return {
    ...base,
    tokenGroup: tokenGroupId,
  };
}

/**
 * Build standard GHL request headers for a tenant.
 * @param {string} [aliasOrLocationId]
 * @returns {{ Authorization: string, Version: string, 'Content-Type': string }}
 */
export function headersFor(aliasOrLocationId) {
  const { token } = resolve(aliasOrLocationId);
  return {
    Authorization: `Bearer ${token}`,
    Version: API_VERSION,
    'Content-Type': 'application/json',
  };
}
