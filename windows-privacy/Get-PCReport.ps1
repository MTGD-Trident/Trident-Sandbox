# Read-only hardware and performance summary. Changes nothing; copies the report to the clipboard.
# Leaves out serial numbers, user names and file paths.
$r = New-Object System.Collections.Generic.List[string]
function Line($t) { $r.Add($t) }
function Try-Line($label, [scriptblock]$get) { try { Line "${label}: $(& $get)" } catch { Line "${label}: (unavailable)" } }

$os = Get-CimInstance Win32_OperatingSystem
$nt = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
Line "== System =="
Line "Windows: $($os.Caption) $($nt.DisplayVersion) (build $($nt.CurrentBuild))"
Try-Line 'Motherboard' { $b = Get-CimInstance Win32_BaseBoard; "$($b.Manufacturer) $($b.Product)" }
Try-Line 'BIOS' { $b = Get-CimInstance Win32_BIOS; "$($b.SMBIOSBIOSVersion), $($b.ReleaseDate.ToString('yyyy-MM-dd'))" }
Line "Uptime: $([int]((Get-Date) - $os.LastBootUpTime).TotalHours) hours"

Line "`n== CPU =="
Get-CimInstance Win32_Processor | ForEach-Object {
    Line "$($_.Name.Trim()) - $($_.NumberOfCores) cores / $($_.NumberOfLogicalProcessors) threads, max $($_.MaxClockSpeed) MHz"
}

Line "`n== Memory =="
$totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$usedGB = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 1)
Line "Total $totalGB GB, in use now $usedGB GB"
Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
    Line "  Stick: $([math]::Round($_.Capacity / 1GB)) GB, running at $($_.ConfiguredClockSpeed) MT/s (module default $($_.Speed)), $($_.Manufacturer) $("$($_.PartNumber)".Trim())"
}
Try-Line 'Page file' { if ((Get-CimInstance Win32_ComputerSystem).AutomaticManagedPagefile) { 'managed by Windows' } else { 'custom size' } }

Line "`n== Graphics =="
Get-CimInstance Win32_VideoController | ForEach-Object {
    Line "$($_.Name) - driver $($_.DriverVersion) ($($_.DriverDate.ToString('yyyy-MM-dd'))), $($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution) @ $($_.CurrentRefreshRate) Hz"
}
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' -ErrorAction SilentlyContinue |
    Where-Object { $_.'HardwareInformation.qwMemorySize' } |
    ForEach-Object { Line "  VRAM: $([math]::Round($_.'HardwareInformation.qwMemorySize' / 1GB)) GB ($($_.DriverDesc))" }
Try-Line 'GPU scheduling (HAGS)' { switch ((Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers').HwSchMode) { 2 { 'on' } 1 { 'off' } default { 'not set' } } }
Try-Line 'Game Mode' { if ((Get-ItemProperty 'HKCU:\Software\Microsoft\GameBar' -ErrorAction SilentlyContinue).AutoGameModeEnabled -eq 0) { 'off' } else { 'on' } }

Line "`n== Storage =="
Try-Line 'Drives' { (Get-PhysicalDisk | ForEach-Object { "$($_.FriendlyName) [$($_.MediaType), $($_.BusType), $([math]::Round($_.Size / 1GB)) GB]" }) -join '; ' }
Try-Line 'C: free' { $c = Get-PSDrive C; "$([math]::Round($c.Free / 1GB)) GB of $([math]::Round(($c.Used + $c.Free) / 1GB)) GB" }

Line "`n== Power =="
Try-Line 'Power plan' { ((powercfg /getactivescheme) -replace '.*\((.*)\).*', '$1').Trim() }

Line "`n== Top memory users =="
Get-Process | Group-Object ProcessName | ForEach-Object {
    [pscustomobject]@{ Name = $_.Name; MB = [math]::Round(($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB) }
} | Sort-Object MB -Descending | Select-Object -First 15 | ForEach-Object { Line ("  {0,6} MB  {1}" -f $_.MB, $_.Name) }

Line "`n== Startup apps =="
Try-Line 'Registered' { ((Get-CimInstance Win32_StartupCommand).Name | Sort-Object -Unique) -join ', ' }

$report = $r -join "`n"
$report
$report | Set-Clipboard
Write-Host "`nReport copied to clipboard - paste it into the chat." -ForegroundColor Green
