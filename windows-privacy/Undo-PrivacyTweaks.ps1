#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Reverses Apply-PrivacyTweaks.ps1 using the backup it saved: registry values,
    services, scheduled tasks and DNS go back to how they were. Removed apps are
    listed so you can reinstall any you want from the Microsoft Store.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$BackupFile = Join-Path $env:ProgramData 'WindowsPrivacyTweaks\backup.json'
if (-not (Test-Path $BackupFile)) { throw "No backup found at $BackupFile; nothing to undo." }
$backup = Get-Content $BackupFile -Raw | ConvertFrom-Json

function Write-Section($Title) { Write-Host "`n== $Title ==" -ForegroundColor Cyan }
function Try-Step($What, [scriptblock]$Action) {
    try { & $Action; Write-Host "  $What" }
    catch { Write-Warning "$What failed: $($_.Exception.Message)" }
}

Write-Section 'Registry'
foreach ($r in @($backup.Registry)) {
    if (-not $r) { continue }
    if ($r.Existed) {
        Try-Step "Restored $($r.Path)\$($r.Name)" {
            New-ItemProperty -LiteralPath $r.Path -Name $r.Name -Value $r.Value -PropertyType $r.Type -Force | Out-Null
        }
    } else {
        Try-Step "Removed $($r.Path)\$($r.Name)" {
            Remove-ItemProperty -LiteralPath $r.Path -Name $r.Name -ErrorAction SilentlyContinue
        }
    }
}

Write-Section 'Services'
foreach ($s in @($backup.Services)) {
    if (-not $s) { continue }
    Try-Step "$($s.Name) -> $($s.StartType)" {
        Set-Service -Name $s.Name -StartupType $s.StartType
        if ($s.StartType -eq 'Automatic') { Start-Service -Name $s.Name -ErrorAction SilentlyContinue }
    }
}

Write-Section 'Scheduled tasks'
foreach ($t in @($backup.Tasks)) {
    if (-not $t) { continue }
    $split = $t.LastIndexOf('\') + 1
    Try-Step "Enabled $t" { Enable-ScheduledTask -TaskPath $t.Substring(0, $split) -TaskName $t.Substring($split) | Out-Null }
}

Write-Section 'DNS'
foreach ($d in @($backup.Dns)) {
    if (-not $d) { continue }
    $adapter = Get-NetAdapter | Where-Object { $_.InterfaceGuid -eq $d.Guid }
    if (-not $adapter) { Write-Warning "Adapter '$($d.Name)' no longer exists; skipping."; continue }
    Try-Step "Restored DNS on '$($d.Name)'" {
        Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ResetServerAddresses
        $static = @($d.StaticServers | Where-Object { $_ })
        if ($static) { Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses $static }
    }
}
foreach ($ip in @($backup.Doh)) {
    if (-not $ip) { continue }
    Try-Step "Removed encrypted DNS entry for $ip" { Remove-DnsClientDohServerAddress -ServerAddress $ip }
}
Clear-DnsClientCache

$apps = @($backup.Apps | Where-Object { $_ })
if ($apps) {
    Write-Section 'Removed apps'
    Write-Host '  Apps cannot be put back automatically. Reinstall any you want from the Microsoft Store:'
    $apps | ForEach-Object { Write-Host "  - $_" }
}

$done = Join-Path (Split-Path $BackupFile) ("backup-restored-{0:yyyyMMdd-HHmmss}.json" -f (Get-Date))
Move-Item $BackupFile $done
Write-Host "`nDone. Restart your PC to finish. (Old backup kept as $done)" -ForegroundColor Green
