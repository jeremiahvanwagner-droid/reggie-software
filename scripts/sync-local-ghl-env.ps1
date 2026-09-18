param(
  [string]$EnvPath = (Join-Path (Join-Path $PSScriptRoot '..') '.env'),
  [ValidateSet('TJB','MSL','RR','AAMA','IBM','EOS_TEMPLATES','EOS_MODULES','RTL')]
  [string]$PrimaryTenant = 'TJB'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvPath)) { throw "Local .env not found: $EnvPath" }

function Unquote-EnvValue {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $Value }
  if (($Value.StartsWith('"') -and $Value.EndsWith('"')) -or ($Value.StartsWith("'") -and $Value.EndsWith("'"))) {
    return $Value.Substring(1, $Value.Length - 2)
  }
  return $Value
}

$values = @{}
foreach ($rawLine in Get-Content $EnvPath) {
  $line = $rawLine.Trim()
  if (-not $line -or $line.StartsWith('#')) { continue }
  if ($line -notmatch '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$') { continue }
  $values[$Matches[1]] = Unquote-EnvValue $Matches[2].Trim()
}

foreach ($key in @($values.Keys)) {
  $values[$key] = [regex]::Replace($values[$key], '\$\{([A-Z0-9_]+)\}', {
    param($match)
    $name = $match.Groups[1].Value
    if ($values.ContainsKey($name)) { return $values[$name] }
    $envItem = Get-Item "Env:$name" -ErrorAction SilentlyContinue
    if ($envItem) { return $envItem.Value }
    return ''
  })
}

$tenantAliases = @('TJB','MSL','RR','AAMA','IBM','EOS_TEMPLATES','EOS_MODULES','RTL')
$configuredTenants = @()
$assignments = [ordered]@{}

foreach ($alias in $tenantAliases) {
  $tokenKey = "GHL_PRIVATE_INTEGRATION_TOKEN_$alias"
  $locationKey = "GHL_LOCATION_ID_$alias"
  $token = if ($values.ContainsKey($tokenKey)) { $values[$tokenKey] } else { '' }
  $locationId = if ($values.ContainsKey($locationKey)) { $values[$locationKey] } else { '' }

  if ([string]::IsNullOrWhiteSpace($token) -xor [string]::IsNullOrWhiteSpace($locationId)) {
    throw "Incomplete GHL tenant configuration for $alias; token and location ID must both be set."
  }

  if (-not [string]::IsNullOrWhiteSpace($token)) {
    $configuredTenants += $alias
    $assignments[$tokenKey] = $token
    $assignments[$locationKey] = $locationId
  }
}

if ($configuredTenants.Count -eq 0) { throw 'No complete GHL tenant pairs found in .env.' }
if ($configuredTenants -notcontains $PrimaryTenant) { throw "Primary tenant $PrimaryTenant is not configured." }

$primaryTokenKey = "GHL_PRIVATE_INTEGRATION_TOKEN_$PrimaryTenant"
$primaryLocationKey = "GHL_LOCATION_ID_$PrimaryTenant"
$assignments['GHL_PRIVATE_INTEGRATION_TOKEN'] = $values[$primaryTokenKey]
$assignments['GHL_LOCATION_ID'] = $values[$primaryLocationKey]
$assignments['GHL_TOKEN'] = $values[$primaryTokenKey]

foreach ($pair in $assignments.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($pair.Key, $pair.Value, 'User')
  [Environment]::SetEnvironmentVariable($pair.Key, $pair.Value, 'Process')
}

Write-Output "Synced GHL environment from $EnvPath"
Write-Output "Primary tenant: $PrimaryTenant"
Write-Output ("Configured tenants: " + ($configuredTenants -join ', '))
Write-Output ("Environment variables updated: " + $assignments.Count)
