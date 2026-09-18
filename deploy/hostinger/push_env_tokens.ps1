param(
  [Parameter(Mandatory = $true)]
  [string]$ServerIp,
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\id_ed25519",
  [string]$LocalEnv   = "$env:USERPROFILE\.openclaw\.env",
  [ValidateSet('TJB','MSL','RR','AAMA','IBM','EOS_TEMPLATES','EOS_MODULES','RTL')]
  [string]$PrimaryTenant = 'TJB'
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SshKeyPath)) { throw "SSH key not found: $SshKeyPath" }
if (-not (Test-Path $LocalEnv))   { throw "Local .env not found: $LocalEnv" }

$tenantAliases = @('TJB','MSL','RR','AAMA','IBM','EOS_TEMPLATES','EOS_MODULES','RTL')

# Parse local .env.
$localVals = @{}
foreach ($rawLine in (Get-Content $LocalEnv)) {
  $line = $rawLine.Trim()
  if (-not $line -or $line.StartsWith('#')) { continue }
  if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$') {
    $value = $Matches[2].Trim().Trim('"').Trim("'")
    $localVals[$Matches[1]] = $value
  }
}

$configured = @()
$varsToPush = [ordered]@{}

foreach ($alias in $tenantAliases) {
  $tokenKey = "GHL_PRIVATE_INTEGRATION_TOKEN_$alias"
  $locationKey = "GHL_LOCATION_ID_$alias"
  $token = if ($localVals.ContainsKey($tokenKey)) { $localVals[$tokenKey] } else { '' }
  $locationId = if ($localVals.ContainsKey($locationKey)) { $localVals[$locationKey] } else { '' }

  if ([string]::IsNullOrWhiteSpace($token) -xor [string]::IsNullOrWhiteSpace($locationId)) {
    throw "Incomplete GHL tenant pair for $alias; refusing partial production update."
  }
  if (-not [string]::IsNullOrWhiteSpace($token)) {
    $configured += $alias
    $varsToPush[$tokenKey] = $token
    $varsToPush[$locationKey] = $locationId
  }
}

if ($configured.Count -eq 0) { throw "No complete GHL tenant pairs found in $LocalEnv" }
if ($configured -notcontains $PrimaryTenant) { throw "Primary tenant $PrimaryTenant is not configured in $LocalEnv" }

$primaryTokenKey = "GHL_PRIVATE_INTEGRATION_TOKEN_$PrimaryTenant"
$primaryLocationKey = "GHL_LOCATION_ID_$PrimaryTenant"
$varsToPush['GHL_PRIVATE_INTEGRATION_TOKEN'] = $localVals[$primaryTokenKey]
$varsToPush['GHL_LOCATION_ID'] = $localVals[$primaryLocationKey]
$varsToPush['GHL_TOKEN'] = $localVals[$primaryTokenKey]

$envLines = @()
foreach ($pair in $varsToPush.GetEnumerator()) {
  $envLines += "$($pair.Key)=$($pair.Value)"
}

Write-Output "Will push $($envLines.Count) GHL variables to $ServerIp"
Write-Output ("Configured tenants: " + ($configured -join ', '))
Write-Output "Primary tenant: $PrimaryTenant"

$target = "root@$ServerIp"
$envBlock = $envLines -join "`n"

$bashScript = @'
set -e
ENV_FILE="/etc/openclaw/.env"
touch "$ENV_FILE"
cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
'@

foreach ($var in $varsToPush.Keys) {
  $bashScript += "`nsed -i '/^$var=/d' `"`$ENV_FILE`""
}

$bashScript += "`ncat >> `"`$ENV_FILE`" <<'ENVBLOCK'"
$bashScript += "`n$envBlock"
$bashScript += "`nENVBLOCK"
$bashScript += @'

echo 'Updated GHL tenant credentials. Restarting services...'
systemctl restart openclaw
systemctl restart openclaw-webhook 2>/dev/null || true
sleep 5
echo 'Service status:'
systemctl is-active openclaw || true
systemctl is-active openclaw-webhook 2>/dev/null || true
'@

Write-Output ""
Write-Output "Connecting to $target..."
$bashScript | ssh -i $SshKeyPath $target "bash -s"

Write-Output ""
Write-Output "Done. Multi-tenant GHL credentials deployed to production."
