# Sumkar — one-command installer (Windows / PowerShell)
# (engine: Herald, from ESMC)
# Usage:  .\install.ps1 C:\path\to\your-project
# Installs Herald's engine + Claude Code hook into a target project and wires
# the PreToolUse:Read hook into that project's .claude\settings.json.

param(
  [Parameter(Mandatory = $true)]
  [string]$Target
)

$ErrorActionPreference = "Stop"
$HeraldRoot = $PSScriptRoot

Write-Host ""
Write-Host "Sumkar installer" -ForegroundColor Cyan
Write-Host "  source : $HeraldRoot"
Write-Host "  target : $Target"
Write-Host ""

if (-not (Test-Path $Target)) {
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
  Write-Host "  created target folder" -ForegroundColor DarkGray
}

# 1. Copy the engine + hook into the target under a .herald folder
$dest = Join-Path $Target ".herald"
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item (Join-Path $HeraldRoot "packages") (Join-Path $dest "packages") -Recurse -Force
Copy-Item (Join-Path $HeraldRoot "adapters") (Join-Path $dest "adapters") -Recurse -Force
Write-Host "  copied engine + adapters -> .herald\" -ForegroundColor Green

# 2. Ensure target\.claude exists
$claudeDir = Join-Path $Target ".claude"
New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
$settingsPath = Join-Path $claudeDir "settings.json"

# 3. Build the hook command (points at the copied hook)
$hookCmd = 'node "$CLAUDE_PROJECT_DIR/.herald/adapters/claude-code/herald-gate.js"'

# 4. Merge into settings.json (create if missing)
if (Test-Path $settingsPath) {
  $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
} else {
  $settings = [PSCustomObject]@{}
}

# Ensure hooks.PreToolUse exists as an array with a Read matcher
if (-not $settings.PSObject.Properties.Name -contains "hooks") {
  $settings | Add-Member -NotePropertyName hooks -NotePropertyValue ([PSCustomObject]@{}) -Force
}
if (-not $settings.hooks) {
  $settings | Add-Member -NotePropertyName hooks -NotePropertyValue ([PSCustomObject]@{}) -Force
}

$readHook = [PSCustomObject]@{
  matcher = "Read"
  hooks   = @([PSCustomObject]@{ type = "command"; command = $hookCmd; timeout = 300 })
}

$settings.hooks | Add-Member -NotePropertyName PreToolUse -NotePropertyValue @($readHook) -Force

$settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding utf8
Write-Host "  wired Read hook -> .claude\settings.json" -ForegroundColor Green

# 5. Optional model backend note
Write-Host ""
Write-Host "Compression backend (for compress-on-miss):" -ForegroundColor Yellow
Write-Host "  default  : Anthropic Claude Sonnet 4.6"
Write-Host "  needs    : npm i @anthropic-ai/sdk   AND   `$env:ANTHROPIC_API_KEY"
Write-Host "  swap     : copy .herald-vendor.json.example -> .herald-vendor.json (e.g. free local Ollama)"
Write-Host "  (without a backend Sumkar still runs - it just reads large files raw on a cache miss)"
Write-Host ""
Write-Host "Done. Next:" -ForegroundColor Cyan
Write-Host "  cd `"$Target`""
Write-Host "  claude            # then read a large file and watch Sumkar route you to its index"
Write-Host ""
