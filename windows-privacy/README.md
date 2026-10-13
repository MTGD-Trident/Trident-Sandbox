# Windows privacy & debloat

Two PowerShell scripts for Windows 10 and 11:

- **`Apply-PrivacyTweaks.ps1`** cuts ads, telemetry and preinstalled bloat, and blocks ad/tracker domains at the network level.
- **`Undo-PrivacyTweaks.ps1`** puts everything back. Every value the first script changes is saved before it changes it.

## What it changes

**Telemetry**
- Diagnostic data set to "Required" (the lowest Home and Pro allow).
- The telemetry service (DiagTrack) and its relay service turned off.
- 9 data-collection scheduled tasks turned off.
- Error reporting, feedback prompts, typing/inking data collection and activity history turned off.
- Recall screenshots blocked.

**Ads and suggestions**
- Advertising ID off.
- No more "suggested" apps silently installed, Start menu and Settings suggestions, lock screen tips or "finish setting up your device" nags.
- No OneDrive/Microsoft 365 ads in File Explorer.
- No Bing web results in Start search.
- Widgets/news feed turned off.
- Old-style Copilot sidebar off.
- Edge: no shopping pop-ups, recommendations, telemetry or background preloading.
- Windows Update no longer uploads updates to other people's PCs over the internet.

**Apps** (asks before removing anything)
- Removes: Bing News, Bing Weather, Bing Search, Tips, Get Help, Solitaire, Office launcher, People, Feedback Hub, Maps, Movies & TV, Mixed Reality Portal, Skype, Cortana, Copilot, Dev Home, Power Automate, consumer Teams chat, Family, Clipchamp, Candy Crush, TikTok, Disney+, Prime Video, X/Twitter and Facebook.
- Edit the `$BloatApps` list at the top of the script to change this.

**Network**
- Switches DNS to **AdGuard DNS**. It blocks ad, tracker and telemetry domains for every app on the PC, not just the browser.
- On Windows 11 it also encrypts DNS lookups (DNS over HTTPS).

## Deliberately left alone

- **Windows Update, Defender, SmartScreen and Safe Browsing.** Turning these off makes a PC much less secure.
- **Xbox apps and Game Bar.** Needed for Game Pass and screen capture.
- **OneDrive, background apps, search indexing, location.** These are useful to many people. Turn them off yourself in Settings if you don't use them.

## How to run it

1. Download the `windows-privacy` folder, e.g. to `C:\Tools\windows-privacy`.
2. Click Start, type **Windows PowerShell**, right-click it and choose **Run as administrator**. Use the built-in Windows PowerShell, not "PowerShell 7".
3. Run these commands:

   ```powershell
   cd C:\Tools\windows-privacy
   Set-ExecutionPolicy -Scope Process Bypass -Force
   .\Apply-PrivacyTweaks.ps1 -DryRun     # preview: lists every change, changes nothing
   .\Apply-PrivacyTweaks.ps1             # apply
   ```

4. Restart the PC.

Options:
- `-SkipApps` keeps all apps.
- `-SkipDns` leaves DNS alone.
- `-Yes` removes apps without asking.

The script creates a **System Restore point** first.

To reverse everything, run `.\Undo-PrivacyTweaks.ps1` the same way, then restart. Removed apps can't be restored automatically. The undo script lists them so you can reinstall any you want from the Microsoft Store.

## Things you might notice

- **"Some settings are managed by your organization"** now appears in Settings and Edge. That's how Windows labels the policies this script uses. Nothing else is managing your PC.
- **Chrome's "Use secure DNS" setting can bypass AdGuard.** If you turned it on with a custom provider, change it to *With your current service provider* (Settings → Privacy and security → Security). Chrome will then use AdGuard too.
- **Hotel and café Wi-Fi login pages** sometimes fail to appear with custom DNS. Run `.\Undo-PrivacyTweaks.ps1` or set the Wi-Fi adapter's DNS back to automatic while you sign in.
- **A site or app that won't load** may be one AdGuard blocks. That is rare, but it happens with some shopping-link and tracking redirect domains.
- **Run the script while signed in as yourself.** Some settings apply to the account that runs it. If you sign in as a standard user and type an admin password to elevate, those settings land on the admin account instead.
- **Major Windows updates can re-add some apps or reset some settings.** Re-run the script after one. It only changes what's needed and keeps your original backup.

## Optional extra: see and block what each app sends

**Portmaster** (free, open source) is a firewall that shows which programs connect where and lets you block them one at a time. It's useful for catching chatty third-party software such as printer utilities and game launchers.
