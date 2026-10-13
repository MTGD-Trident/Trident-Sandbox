# Privacy Shield

A Chrome extension that adds stronger privacy and anti-tracking protection to your normal Chrome browser.

## What it does

| Protection | How |
|---|---|
| Block trackers & ad networks | Blocks ~110 known analytics, advertising and session-recording services (Google Analytics, Meta Pixel, Hotjar, Criteo, DoubleClick…) when another site loads them. The trackers' own websites still open normally. |
| Clean tracking links | Removes `utm_*`, `fbclid`, `gclid`, `msclkid` and similar from links before the page loads. |
| Block third-party cookies | Switches Chrome's third-party cookie setting off. |
| Fingerprinting protection | Adds invisible noise to canvas read-backs, hides your exact graphics card model, removes the Battery API. |
| Disable Chrome's ad features | Turns off Topics, Protected Audience (FLEDGE), ad measurement, and `<a ping>` link tracking. |
| "Do Not Sell" signals | Sends Global Privacy Control (`Sec-GPC: 1`, `navigator.globalPrivacyControl`) and Do Not Track. |
| Hide IP from WebRTC | Stops video-call APIs revealing your local network address. |

Each protection can be turned off in the popup. If a site breaks, switch off the toggle at the top of the popup to pause protection on that site only.

## Install

1. Download this `privacy-shield` folder to your computer (keep it somewhere permanent; Chrome loads it from there).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `privacy-shield` folder.
5. Pin it: click the puzzle-piece icon in the toolbar, then the pin next to Privacy Shield.

The toolbar badge shows how many requests were blocked or cleaned on the current page.

Chrome warns that the extension can "read and change all your data on all websites". It needs that access to block trackers and clean links on every site. It sends nothing anywhere: it has no server and makes no network requests of its own.

## Also worth doing

- Switch your search engine to DuckDuckGo, Brave Search or Startpage (Settings → Search engine).
- Turn on Settings → Privacy and security → Security → **Use secure DNS**.
- Turn on **Always use secure connections** on the same page.

## Limits

An extension can't change Chrome itself, so this is not as thorough as a privacy browser like Brave:

- The blocklist is curated and small. For full ad blocking, also install **uBlock Origin Lite**; it works alongside this extension.
- Fingerprinting protection covers the most common techniques (canvas, WebGL, battery), not all of them.
- Chrome still sends its own data to Google if you're signed in to the browser or have sync turned on.
- Pausing a site turns off tracker blocking, link cleaning, privacy signals and fingerprinting protection there. The cookie, WebRTC and ad-feature settings are browser-wide.
