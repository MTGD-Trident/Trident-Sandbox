#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Cuts Windows ads, telemetry and preinstalled bloat, and switches DNS to an
    ad- and tracker-blocking service. Every change is recorded so that
    Undo-PrivacyTweaks.ps1 can put it back.

.PARAMETER DryRun
    List what would change without changing anything.
.PARAMETER SkipApps
    Don't remove any apps.
.PARAMETER SkipDns
    Don't change DNS settings.
.PARAMETER Yes
    Don't ask for confirmation before removing apps.
.PARAMETER KeepOneDrive
    Don't uninstall OneDrive. (It is never removed while signed in, regardless.)

.EXAMPLE
    .\Apply-PrivacyTweaks.ps1 -DryRun
    .\Apply-PrivacyTweaks.ps1
#>
[CmdletBinding()]
param([switch]$DryRun, [switch]$SkipApps, [switch]$SkipDns, [switch]$Yes, [switch]$KeepOneDrive)

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSEdition -ne 'Desktop') {
    throw 'Run this in "Windows PowerShell" (the built-in one), not PowerShell 7. Some commands it needs only exist there.'
}

# ---------------------------------------------------------------------------
# Edit these lists to taste.
# ---------------------------------------------------------------------------

# Preinstalled apps to remove. Wildcards allowed. Anything not installed is skipped.
# Kept on purpose: Store, Photos, Media Player, Calculator, Notepad, Paint, Terminal,
# Snipping Tool, Camera, Clock, Edge, App Installer (winget), and the Xbox sign-in
# components (Xbox Identity Provider, Xbox TCUI), which only run when a game asks for them.
$BloatApps = @(
    'Microsoft.BingNews'
    'Microsoft.BingWeather'
    'Microsoft.BingSearch'
    'Microsoft.GetHelp'
    'Microsoft.Getstarted'                       # "Tips"
    'Microsoft.MicrosoftSolitaireCollection'
    'Microsoft.MicrosoftOfficeHub'               # "Microsoft 365 (Office)" launcher
    'Microsoft.People'
    'Microsoft.WindowsFeedbackHub'
    'Microsoft.WindowsMaps'
    'Microsoft.ZuneVideo'                        # "Movies & TV"
    'Microsoft.MixedReality.Portal'
    'Microsoft.SkypeApp'
    'Microsoft.549981C3F5F10'                    # Cortana
    'Microsoft.Copilot'
    'Microsoft.Windows.DevHome'
    'Microsoft.PowerAutomateDesktop'
    'MicrosoftTeams'                             # consumer Teams chat (work Teams is "MSTeams")
    'MicrosoftCorporationII.MicrosoftFamily'
    'Clipchamp.Clipchamp'
    'king.com.*'                                 # Candy Crush etc.
    'BytedancePte.Ltd.TikTok'
    'Disney.*'
    'AmazonVideo.PrimeVideo'
    '*.Twitter'
    'Facebook.*'
    'Microsoft.Todos'
    'Microsoft.YourPhone'                        # Phone Link (runs in the background)
    'Microsoft.WindowsCommunicationsApps'        # Mail and Calendar
    'Microsoft.OutlookForWindows'                # new Outlook
    'MSTeams'                                    # Teams
    'MicrosoftWindows.Client.WebExperience'      # Widgets
    'Microsoft.Edge.GameAssist'
    'Microsoft.GamingApp'                        # Xbox app
    'Microsoft.XboxApp'                          # Xbox Console Companion
    'Microsoft.XboxGamingOverlay'                # Game Bar
    'Microsoft.XboxGameOverlay'
    'Microsoft.XboxSpeechToTextOverlay'
)

# Ad- and tracker-blocking DNS (AdGuard DNS, free, no account needed).
$DnsServers  = @('94.140.14.14', '94.140.15.15', '2a10:50c0::ad1:ff', '2a10:50c0::ad2:ff')
$DohTemplate = 'https://dns.adguard-dns.com/dns-query'

# ---------------------------------------------------------------------------
# Backup bookkeeping. The first recorded value of anything is kept, so running
# this script twice still lets Undo restore the true original state.
# ---------------------------------------------------------------------------

$BackupDir  = Join-Path $env:ProgramData 'WindowsPrivacyTweaks'
$BackupFile = Join-Path $BackupDir 'backup.json'
$Sections   = 'Registry', 'Services', 'Tasks', 'Dns', 'Doh', 'Apps'

$backup = [ordered]@{}
$saved = if (Test-Path $BackupFile) { Get-Content $BackupFile -Raw | ConvertFrom-Json }
foreach ($s in $Sections) { $backup[$s] = @(if ($saved -and $saved.$s) { $saved.$s }) }

function Save-Backup {
    if ($DryRun) { return }
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    $backup | ConvertTo-Json -Depth 5 | Set-Content -Path $BackupFile -Encoding UTF8
}

$script:changes = 0
function Write-Change($Text) {
    $script:changes++
    $prefix = if ($DryRun) { '[dry run] ' } else { '' }
    Write-Host "  $prefix$Text"
}

function Write-Section($Title) { Write-Host "`n== $Title ==" -ForegroundColor Cyan }

function Set-Reg($Path, $Name, $Value, $Type = 'DWord') {
    $existed = $false; $current = $null; $kind = $null
    try {
        if (Test-Path -LiteralPath $Path) {
            $key = Get-Item -LiteralPath $Path
            if ($key.GetValueNames() -contains $Name) {
                $existed = $true
                $current = $key.GetValue($Name)
                $kind = $key.GetValueKind($Name).ToString()
            }
        }
    } catch {
        Write-Warning "Windows blocks reading this setting; skipped: $Path\$Name"
        return
    }
    if ($existed -and "$current" -eq "$Value") { return }

    Write-Change "$Path\$Name = $Value"
    if ($DryRun) { return }

    try {
        if (-not (Test-Path -LiteralPath $Path)) { New-Item -Path $Path -Force | Out-Null }
        New-ItemProperty -LiteralPath $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null
    } catch {
        # Some keys are locked by Windows itself, even for administrators.
        Write-Warning "Windows blocks changing this setting; skipped: $Path\$Name"
        return
    }
    $id = "$Path|$Name"
    if (-not ($backup.Registry | Where-Object { $_.Id -eq $id })) {
        $backup.Registry += [pscustomobject]@{ Id = $id; Path = $Path; Name = $Name; Existed = $existed; Value = $current; Type = $kind }
        Save-Backup
    }
}

function Disable-Svc($Name) {
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $svc -or $svc.StartType -eq 'Disabled') { return }

    Write-Change "Service '$($svc.DisplayName)' -> Disabled"
    if ($DryRun) { return }

    try {
        Set-Service -Name $Name -StartupType Disabled
    } catch {
        Write-Warning "Windows would not let this service be changed; skipping: $Name"
        return
    }
    Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
    if (-not ($backup.Services | Where-Object { $_.Name -eq $Name })) {
        $backup.Services += [pscustomobject]@{ Name = $Name; StartType = $svc.StartType.ToString() }
        Save-Backup
    }
}

function Disable-Task($FullName) {
    $split = $FullName.LastIndexOf('\') + 1
    $task = Get-ScheduledTask -TaskPath $FullName.Substring(0, $split) -TaskName $FullName.Substring($split) -ErrorAction SilentlyContinue
    if (-not $task -or $task.State -eq 'Disabled') { return }

    Write-Change "Scheduled task $FullName -> Disabled"
    if ($DryRun) { return }

    try {
        Disable-ScheduledTask -InputObject $task | Out-Null
        if ($backup.Tasks -notcontains $FullName) { $backup.Tasks += $FullName; Save-Backup }
    } catch {
        Write-Warning "Windows would not let this task be disabled; skipping: $FullName"
    }
}

# ---------------------------------------------------------------------------

Write-Host 'Windows privacy & debloat' -ForegroundColor Green
if ($DryRun) { Write-Host 'DRY RUN: nothing will be changed.' -ForegroundColor Yellow }

if (-not $DryRun) {
    Write-Section 'Restore point'
    # Windows normally refuses a second restore point within 24 hours; lift that limit just for this one.
    $srKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore'
    $oldFrequency = (Get-ItemProperty $srKey -ErrorAction SilentlyContinue).SystemRestorePointCreationFrequency
    try {
        Enable-ComputerRestore -Drive "$env:SystemDrive\"
        Set-ItemProperty $srKey -Name SystemRestorePointCreationFrequency -Value 0 -Type DWord
        $before = @(Get-ComputerRestorePoint).Count
        Checkpoint-Computer -Description 'Before privacy tweaks' -RestorePointType MODIFY_SETTINGS -WarningAction SilentlyContinue
        if (@(Get-ComputerRestorePoint).Count -le $before) { throw 'Windows did not create it.' }
        Write-Host '  Created.'
    } catch {
        Write-Warning "Could not create a restore point: $($_.Exception.Message)"
        if ((Read-Host '  Continue anyway? Undo-PrivacyTweaks.ps1 can still reverse the changes. [y/N]') -notmatch '^y') { exit 1 }
    } finally {
        if ($null -eq $oldFrequency) { Remove-ItemProperty $srKey -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue }
        else { Set-ItemProperty $srKey -Name SystemRestorePointCreationFrequency -Value $oldFrequency -Type DWord }
    }
}

# --- 1. Telemetry ------------------------------------------------------------
Write-Section 'Telemetry and diagnostics'
$dc = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection'
Set-Reg $dc 'AllowTelemetry' 1                         # "Required" only: the minimum on Home/Pro
Set-Reg $dc 'AllowDeviceNameInTelemetry' 0
Set-Reg $dc 'DoNotShowFeedbackNotifications' 1
Set-Reg $dc 'LimitDiagnosticLogCollection' 1
Set-Reg $dc 'LimitDumpCollection' 1
Set-Reg 'HKCU:\Software\Microsoft\Siuf\Rules' 'NumberOfSIUFInPeriod' 0     # feedback prompts
Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting' 'Disabled' 1
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppCompat' 'AITEnable' 0  # app usage telemetry
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppCompat' 'DisableInventory' 1
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'Start_TrackProgs' 0

# Typing and inking data sent to Microsoft
Set-Reg 'HKCU:\Software\Microsoft\InputPersonalization' 'RestrictImplicitTextCollection' 1
Set-Reg 'HKCU:\Software\Microsoft\InputPersonalization' 'RestrictImplicitInkCollection' 1
Set-Reg 'HKCU:\Software\Microsoft\InputPersonalization\TrainedDataStore' 'HarvestContacts' 0
Set-Reg 'HKCU:\Software\Microsoft\Personalization\Settings' 'AcceptedPrivacyPolicy' 0
Set-Reg 'HKCU:\Software\Microsoft\Input\TIPC' 'Enabled' 0

# Activity history (timeline of what you did, synced to Microsoft)
$sys = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System'
Set-Reg $sys 'EnableActivityFeed' 0
Set-Reg $sys 'PublishUserActivities' 0
Set-Reg $sys 'UploadUserActivities' 0

# Recall (periodic screenshots on Copilot+ PCs)
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' 1
Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\WindowsAI' 'DisableAIDataAnalysis' 1

Disable-Svc 'DiagTrack'           # Connected User Experiences and Telemetry
Disable-Svc 'dmwappushservice'    # Device management push routing (telemetry relay)
Disable-Svc 'RetailDemo'

@(
    '\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser'
    '\Microsoft\Windows\Application Experience\ProgramDataUpdater'
    '\Microsoft\Windows\Autochk\Proxy'
    '\Microsoft\Windows\Customer Experience Improvement Program\Consolidator'
    '\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip'
    '\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticDataCollector'
    '\Microsoft\Windows\Feedback\Siuf\DmClient'
    '\Microsoft\Windows\Feedback\Siuf\DmClientOnScenarioDownload'
    '\Microsoft\Windows\Windows Error Reporting\QueueReporting'
) | ForEach-Object { Disable-Task $_ }
Save-Backup

# --- 2. Ads, suggestions and promoted content ---------------------------------
Write-Section 'Ads, tips and suggestions'
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo' 'Enabled' 0
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AdvertisingInfo' 'DisabledByGroupPolicy' 1
Set-Reg 'HKCU:\Control Panel\International\User Profile' 'HttpAcceptLanguageOptOut' 1

# Content Delivery Manager: silently installed apps, Start/Settings/lock-screen suggestions
$cdm = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
foreach ($name in 'SilentInstalledAppsEnabled', 'SystemPaneSuggestionsEnabled', 'SoftLandingEnabled',
                  'RotatingLockScreenOverlayEnabled', 'OemPreInstalledAppsEnabled', 'PreInstalledAppsEnabled',
                  'PreInstalledAppsEverEnabled', 'FeatureManagementEnabled',
                  'SubscribedContent-310093Enabled',   # welcome experience after updates
                  'SubscribedContent-338387Enabled',   # lock screen "fun facts"
                  'SubscribedContent-338388Enabled',   # Start menu suggestions
                  'SubscribedContent-338389Enabled',   # tips and tricks
                  'SubscribedContent-338393Enabled',   # suggested content in Settings
                  'SubscribedContent-353694Enabled',
                  'SubscribedContent-353696Enabled') {
    Set-Reg $cdm $name 0
}

$cc = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent'
Set-Reg $cc 'DisableWindowsConsumerFeatures' 1         # stops apps like Candy Crush reinstalling
Set-Reg $cc 'DisableSoftLanding' 1
Set-Reg $cc 'DisableCloudOptimizedContent' 1
Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\CloudContent' 'DisableTailoredExperiencesWithDiagnosticData' 1
Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\CloudContent' 'DisableThirdPartySuggestions' 1

$adv = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
Set-Reg $adv 'ShowSyncProviderNotifications' 0          # OneDrive / M365 ads in File Explorer
Set-Reg $adv 'Start_IrisRecommendations' 0              # "tips, shortcuts, new apps" in Start
Set-Reg $adv 'Start_AccountNotifications' 0             # account nag badges in Start
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\UserProfileEngagement' 'ScoobeSystemSettingEnabled' 0  # "finish setting up your device"
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.Suggested' 'Enabled' 0

# Web/Bing results and promotions in Start menu search
Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\Explorer' 'DisableSearchBoxSuggestions' 1
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'BingSearchEnabled' 0
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\SearchSettings' 'IsDynamicSearchBoxEnabled' 0

# Widgets / News and Interests (news feed with ads, runs in the background)
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Dsh' 'AllowNewsAndInterests' 0
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Feeds' 'EnableFeeds' 0

# Copilot sidebar (older builds; the newer Copilot app is in the removal list)
Set-Reg 'HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' 1

# Edge: telemetry, shopping pop-ups and "recommendations"
$edge = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
Set-Reg $edge 'DiagnosticData' 0
Set-Reg $edge 'PersonalizationReportingEnabled' 0
Set-Reg $edge 'ShowRecommendationsEnabled' 0
Set-Reg $edge 'EdgeShoppingAssistantEnabled' 0
Set-Reg $edge 'SpotlightExperiencesAndRecommendationsEnabled' 0
Set-Reg $edge 'StartupBoostEnabled' 0                   # stops Edge running in the background at sign-in

# Delivery Optimization: stop uploading Windows updates to strangers' PCs over the internet
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization' 'DODownloadMode' 0
Save-Backup

# --- Chrome -----------------------------------------------------------------
Write-Section 'Chrome'
$chrome = 'HKLM:\SOFTWARE\Policies\Google\Chrome'
Set-Reg $chrome 'MetricsReportingEnabled' 0                 # usage statistics and crash reports
Set-Reg $chrome 'UrlKeyedAnonymizedDataCollectionEnabled' 0 # sending visited URLs to Google
Set-Reg $chrome 'ChromeVariations' 1                        # Google's feature experiments: critical fixes only
Set-Reg $chrome 'FeedbackSurveysEnabled' 0
Set-Reg $chrome 'UserFeedbackAllowed' 0
Set-Reg $chrome 'SpellCheckServiceEnabled' 0                # local spell check still works
Set-Reg $chrome 'BackgroundModeEnabled' 0                   # Chrome fully exits when you close it
Set-Reg $chrome 'DnsOverHttpsMode' 'automatic' 'String'     # use Windows' DNS (AdGuard) instead of a custom provider
Save-Backup

# --- Hidden resource use --------------------------------------------------------
Write-Section 'Background apps and services'
# Store apps may not run in the background (desktop programs like Steam and Chrome are unaffected).
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy' 'LetAppsRunInBackground' 2
Set-Reg $edge 'BackgroundModeEnabled' 0

# Game Bar background recording
Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_Enabled' 0
Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' 'AppCaptureEnabled' 0
Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\GameDVR' 'AllowGameDVR' 0
Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\BcastDVRUserService' 'Start' 4   # Game DVR per-user service

Disable-Svc 'XblAuthManager'      # Xbox Live sign-in
Disable-Svc 'XblGameSave'         # Xbox cloud saves
Disable-Svc 'XboxNetApiSvc'       # Xbox Live networking
# SysMain (Superfetch) stays on: it caches large, frequently used apps and files (editors, projects).
Disable-Svc 'WSearch'             # file indexing; Start still finds apps and settings, file search is slower
Disable-Svc 'WerSvc'              # error reporting
Disable-Svc 'MapsBroker'          # offline maps
Disable-Svc 'WMPNetworkSvc'       # Media Player network sharing
Disable-Svc 'WpcMonSvc'           # parental controls
Disable-Svc 'wisvc'               # Windows Insider
Disable-Svc 'Fax'
Save-Backup

# --- OneDrive -------------------------------------------------------------------
if (-not $KeepOneDrive) {
    Write-Section 'OneDrive'
    $signedIn = Get-ChildItem 'HKCU:\Software\Microsoft\OneDrive\Accounts' -ErrorAction SilentlyContinue |
        Where-Object { (Get-ItemProperty $_.PSPath).UserEmail }
    $setup = @("$env:SystemRoot\System32\OneDriveSetup.exe", "$env:SystemRoot\SysWOW64\OneDriveSetup.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
    $installed = (Test-Path "$env:LOCALAPPDATA\Microsoft\OneDrive\OneDrive.exe") -or
                 (Test-Path "$env:ProgramFiles\Microsoft OneDrive\OneDrive.exe")

    if (-not $installed) {
        Write-Host '  Not installed.'
    } elseif ($signedIn) {
        # Uninstalling while signed in could leave files that only exist in the cloud out of reach.
        Write-Warning 'OneDrive is signed in, so it was left alone. If you do not use it: make sure your files are downloaded and moved out of the OneDrive folder, sign out of OneDrive, then run this script again.'
    } elseif (-not $setup) {
        Write-Warning 'OneDrive uninstaller not found. Remove it from Settings -> Apps -> Installed apps.'
    } else {
        Write-Change 'Uninstall OneDrive'
        if (-not $DryRun) {
            Stop-Process -Name OneDrive -Force -ErrorAction SilentlyContinue
            Start-Process $setup '/uninstall' -Wait
            $backup.Apps = @((@($backup.Apps) + 'OneDrive') | Sort-Object -Unique)
            Save-Backup
        }
    }
}

# --- 3. Preinstalled apps -----------------------------------------------------
if (-not $SkipApps) {
    Write-Section 'Preinstalled apps'
    $packages = @(foreach ($pattern in $BloatApps) { Get-AppxPackage -AllUsers -Name $pattern -ErrorAction SilentlyContinue })
    $provisioned = @(Get-AppxProvisionedPackage -Online | Where-Object {
        $display = $_.DisplayName
        $BloatApps | Where-Object { $display -like $_ }
    })
    $names = @((@($packages.Name) + @($provisioned.DisplayName)) | Where-Object { $_ } | Sort-Object -Unique)

    if (-not $names) {
        Write-Host '  None of the listed apps are installed.'
    } else {
        $names | ForEach-Object { Write-Host "  - $_" }
        $go = $DryRun -or $Yes -or ((Read-Host "`n  Remove these $($names.Count) apps? [y/N]") -match '^y')
        if ($go) {
            foreach ($pkg in $packages) {
                Write-Change "Remove app $($pkg.Name)"
                if ($DryRun) { continue }
                try { Remove-AppxPackage -Package $pkg.PackageFullName -AllUsers -ErrorAction Stop }
                catch { Write-Warning "Could not remove $($pkg.Name): $($_.Exception.Message)" }
            }
            foreach ($prov in $provisioned) {
                Write-Change "Stop $($prov.DisplayName) installing for new users"
                if ($DryRun) { continue }
                try { Remove-AppxProvisionedPackage -Online -PackageName $prov.PackageName -ErrorAction Stop | Out-Null }
                catch { Write-Warning "Could not unprovision $($prov.DisplayName): $($_.Exception.Message)" }
            }
            if (-not $DryRun) { $backup.Apps = @(($backup.Apps + $names) | Sort-Object -Unique) }
        } else {
            Write-Host '  Skipped.'
        }
    }
    Save-Backup
}

# --- 4. Network-level blocking (DNS) ------------------------------------------
if (-not $SkipDns) {
    Write-Section 'Ad- and tracker-blocking DNS (AdGuard)'
    $adapters = @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up')
    if (-not $adapters) { Write-Host '  No connected network adapters found.' }

    foreach ($a in $adapters) {
        $current = (Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex).ServerAddresses
        if ((@($current) -join ',') -eq ($DnsServers -join ',')) { continue }

        Write-Change "DNS on '$($a.Name)' -> AdGuard DNS"
        if ($DryRun) { continue }

        if (-not ($backup.Dns | Where-Object { $_.Guid -eq $a.InterfaceGuid })) {
            # Only manually set servers are stored in these keys; empty means "automatic (DHCP)".
            $v4 = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$($a.InterfaceGuid)" -ErrorAction SilentlyContinue).NameServer
            $v6 = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters\Interfaces\$($a.InterfaceGuid)" -ErrorAction SilentlyContinue).NameServer
            $static = @("$v4,$v6" -split '[ ,]' | Where-Object { $_ })
            $backup.Dns += [pscustomobject]@{ Guid = $a.InterfaceGuid; Name = $a.Name; StaticServers = $static }
        }
        try { Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ServerAddresses $DnsServers }
        catch { Write-Warning "Could not change DNS on '$($a.Name)': $($_.Exception.Message)" }
        Save-Backup
    }

    # Encrypt DNS lookups (DNS over HTTPS) on Windows 11.
    if (Get-Command Add-DnsClientDohServerAddress -ErrorAction SilentlyContinue) {
        foreach ($ip in $DnsServers) {
            if (Get-DnsClientDohServerAddress -ServerAddress $ip -ErrorAction SilentlyContinue) { continue }
            Write-Change "Encrypted DNS for $ip"
            if ($DryRun) { continue }
            # Fallback to unencrypted DNS stays on so a network that blocks DoH doesn't cut you off.
            try {
                Add-DnsClientDohServerAddress -ServerAddress $ip -DohTemplate $DohTemplate -AllowFallbackToUdp $true -AutoUpgrade $true | Out-Null
                $backup.Doh += $ip
                Save-Backup
            } catch {
                Write-Warning "Could not turn on encrypted DNS for ${ip}: $($_.Exception.Message)"
            }
        }
        Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' 'DoHPolicy' 2   # allow DoH
    } else {
        Write-Host '  Encrypted DNS needs Windows 11; using standard DNS.'
    }
    if (-not $DryRun) { Clear-DnsClientCache }
    Save-Backup
}

# ---------------------------------------------------------------------------
Write-Host ''
if ($DryRun) {
    Write-Host "$($script:changes) changes would be made. Run again without -DryRun to apply them." -ForegroundColor Green
} else {
    Write-Host "Done: $($script:changes) changes. Backup saved to $BackupFile" -ForegroundColor Green
    Write-Host 'Restart your PC to finish. To reverse everything, run Undo-PrivacyTweaks.ps1.'
}
