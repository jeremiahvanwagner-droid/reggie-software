#!/usr/bin/env node

import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

import { createGhlClient } from '../lib/ghl-client.mjs';
import {
  GHL_TENANT_ALIASES,
  listTenants,
  resolve as resolveTenant,
} from '../lib/ghl-tenant-resolver.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolvePath(__dirname, '..');
const ENV_PATH = join(ROOT_DIR, '.env');
const GHL_BASE = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';
const GHL_ENV_KEYS = [
  'GHL_PRIVATE_INTEGRATION_TOKEN',
  'GHL_LOCATION_ID',
  ...GHL_TENANT_ALIASES.flatMap(alias => [
    `GHL_PRIVATE_INTEGRATION_TOKEN_${alias}`,
    `GHL_LOCATION_ID_${alias}`,
  ]),
  'GHL_TOKEN',
];

function unquote(value) {
  if (!value) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseDotEnv(envPath) {
  if (!existsSync(envPath)) return {};
  const values = {};
  const envText = readFileSync(envPath, 'utf8');
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!GHL_ENV_KEYS.includes(key)) continue;
    values[key] = unquote(line.slice(eqIndex + 1).trim());
  }
  return values;
}

function presence(value) {
  return { present: Boolean(value), length: value ? value.length : 0 };
}

function valuesMatch(left, right) {
  return Boolean(left) && Boolean(right) && left === right;
}

function readUserEnv(key) {
  if (process.platform === 'win32') {
    try {
      return execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `[Environment]::GetEnvironmentVariable('${key}','User')`],
        { encoding: 'utf8' },
      ).trim();
    } catch {
      return '';
    }
  }
  return process.env[key] || '';
}

async function checkUserPrimaryAuth(token, locationId) {
  if (!token || !locationId) {
    return { ok: false, status: null, mode: 'user_primary_env', message: 'Missing primary token or location ID' };
  }
  const response = await fetch(`${GHL_BASE}/locations/${locationId}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, Version: API_VERSION },
  });
  return { ok: response.ok, status: response.status, mode: 'user_primary_env' };
}

async function checkResolverTenant(alias) {
  try {
    const tenant = resolveTenant(alias);
    const client = createGhlClient(alias, { retryBaseMs: 0, retryJitterMs: 0, maxRetries: 0 });
    await client.locations.get();
    return {
      alias,
      configured: Boolean(tenant.token && tenant.locationId),
      token: presence(tenant.token),
      locationId: tenant.locationId,
      auth: { ok: true, status: 200, mode: 'resolver_client' },
    };
  } catch (error) {
    return {
      alias,
      configured: false,
      auth: { ok: false, status: error.status || null, mode: 'resolver_client', message: error.message },
    };
  }
}

async function main() {
  const dotEnvValues = parseDotEnv(ENV_PATH);
  const resolverTenants = listTenants();
  const configuredAliases = resolverTenants.map(tenant => tenant.alias);
  const tenantChecks = await Promise.all(configuredAliases.map(checkResolverTenant));
  const resolverDefault = resolveTenant();

  const userPrimaryToken = readUserEnv('GHL_PRIVATE_INTEGRATION_TOKEN');
  const userPrimaryLocationId = readUserEnv('GHL_LOCATION_ID');
  const userPrimaryAuth = await checkUserPrimaryAuth(userPrimaryToken, userPrimaryLocationId);
  const warnings = [];

  for (const alias of GHL_TENANT_ALIASES) {
    const tokenKey = `GHL_PRIVATE_INTEGRATION_TOKEN_${alias}`;
    const locationKey = `GHL_LOCATION_ID_${alias}`;
    const hasToken = Boolean(dotEnvValues[tokenKey]);
    const hasLocation = Boolean(dotEnvValues[locationKey]);
    if (hasToken !== hasLocation) warnings.push(`Incomplete GHL tenant pair for ${alias}`);
  }

  if (dotEnvValues.GHL_PRIVATE_INTEGRATION_TOKEN && !valuesMatch(dotEnvValues.GHL_PRIVATE_INTEGRATION_TOKEN, resolverDefault.token)) {
    warnings.push('.env primary token does not match the resolver default tenant token.');
  }
  if (dotEnvValues.GHL_LOCATION_ID && !valuesMatch(dotEnvValues.GHL_LOCATION_ID, resolverDefault.locationId)) {
    warnings.push('.env primary location does not match the resolver default tenant location.');
  }

  const tenantSpecific = Object.fromEntries(
    GHL_TENANT_ALIASES.map(alias => [
      alias,
      {
        token: presence(readUserEnv(`GHL_PRIVATE_INTEGRATION_TOKEN_${alias}`)),
        locationId: readUserEnv(`GHL_LOCATION_ID_${alias}`) || null,
      },
    ]),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    configuredTenantCount: resolverTenants.length,
    resolver: {
      configuredTenants: resolverTenants,
      defaultTenant: { alias: resolverDefault.alias, locationId: resolverDefault.locationId },
    },
    envFile: {
      path: ENV_PATH,
      exists: existsSync(ENV_PATH),
      keys: Object.fromEntries(GHL_ENV_KEYS.map(key => [key, presence(dotEnvValues[key] || '')])),
    },
    userEnv: {
      primary: {
        token: presence(userPrimaryToken),
        locationId: userPrimaryLocationId || null,
        auth: userPrimaryAuth,
      },
      tenantSpecific,
    },
    warnings,
    tenantChecks,
  };

  report.overallHealthy = tenantChecks.length > 0 && tenantChecks.every(check => check.auth.ok) && userPrimaryAuth.ok;
  report.overallConsistent = warnings.length === 0;
  report.status = report.overallHealthy
    ? report.overallConsistent ? 'healthy' : 'healthy_with_drift'
    : 'unhealthy';

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.overallHealthy ? 0 : 1);
}

main().catch(error => {
  console.error(JSON.stringify({ generatedAt: new Date().toISOString(), fatal: true, message: error.message }, null, 2));
  process.exit(1);
});
