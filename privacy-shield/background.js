// Privacy Shield background worker: turns each feature on or off from the
// settings saved by the popup, and keeps the per-site "paused" list in sync.

const DEFAULT_SETTINGS = {
  trackers: true,    // block tracker and ad-network requests
  params: true,      // strip utm_*, fbclid, gclid... from links
  signals: true,     // send Global Privacy Control + Do Not Track
  cookies: true,     // block third-party cookies
  adApis: true,      // turn off Topics, Protected Audience, ad measurement, link pings
  webrtc: true,      // stop WebRTC exposing your local IP address
  fingerprint: true, // canvas noise, hide GPU model, remove battery API
};

const PAUSE_RULE_ID = 1;

const p = chrome.privacy;
// Chrome settings each feature controls. On -> set to the private value; off -> hand back to Chrome.
const PRIVACY_SETTINGS = {
  cookies: [[p.websites.thirdPartyCookiesAllowed, false]],
  signals: [[p.websites.doNotTrackEnabled, true]],
  adApis: [
    [p.websites.topicsEnabled, false],
    [p.websites.fledgeEnabled, false],
    [p.websites.adMeasurementEnabled, false],
    [p.websites.hyperlinkAuditingEnabled, false],
  ],
  webrtc: [[p.network.webRTCIPHandlingPolicy, 'default_public_interface_only']],
};

// Scripts that run in the page itself before any site code.
const PAGE_SCRIPTS = {
  fingerprint: { id: 'fingerprint', js: ['content/fingerprint.js'] },
  signals: { id: 'gpc', js: ['content/gpc.js'] },
};

async function getState() {
  const { settings = {}, paused = [] } = await chrome.storage.local.get(['settings', 'paused']);
  return { settings: { ...DEFAULT_SETTINGS, ...settings }, paused };
}

async function applyPrivacySettings(settings) {
  for (const [feature, entries] of Object.entries(PRIVACY_SETTINGS)) {
    for (const [setting, value] of entries) {
      if (!setting) continue; // not available in this Chrome version
      try {
        if (settings[feature]) await setting.set({ value });
        else await setting.clear({});
      } catch (e) {
        // Usually means an administrator policy controls this setting.
        console.warn(`Privacy Shield: could not change a "${feature}" setting`, e);
      }
    }
  }
}

async function applyRulesets(settings) {
  const ids = ['trackers', 'params', 'signals'];
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: ids.filter((id) => settings[id]),
    disableRulesetIds: ids.filter((id) => !settings[id]),
  });
}

// One high-priority "allow everything" rule covering every paused site.
async function applyPausedSites(paused) {
  const rule = {
    id: PAUSE_RULE_ID,
    priority: 1000,
    action: { type: 'allowAllRequests' },
    condition: { requestDomains: paused, resourceTypes: ['main_frame', 'sub_frame'] },
  };
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [PAUSE_RULE_ID],
    addRules: paused.length ? [rule] : [],
  });
}

async function applyPageScripts(settings, paused) {
  const ids = Object.values(PAGE_SCRIPTS).map((s) => s.id);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids });
  if (registered.length) {
    await chrome.scripting.unregisterContentScripts({ ids: registered.map((s) => s.id) });
  }
  const excludeMatches = paused.map((domain) => `*://*.${domain}/*`);
  const scripts = Object.entries(PAGE_SCRIPTS)
    .filter(([feature]) => settings[feature])
    .map(([, s]) => ({
      ...s,
      matches: ['<all_urls>'],
      excludeMatches,
      allFrames: true,
      runAt: 'document_start',
      world: 'MAIN',
    }));
  if (scripts.length) await chrome.scripting.registerContentScripts(scripts);
}

async function applyAll() {
  const { settings, paused } = await getState();
  await applyRulesets(settings);
  await applyPausedSites(paused);
  await applyPrivacySettings(settings);
  await applyPageScripts(settings, paused);
}

// Run updates one after another so quick toggles can't interleave.
let queue = Promise.resolve();
function scheduleApply() {
  queue = queue.then(applyAll).catch((e) => console.error('Privacy Shield:', e));
  return queue;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  scheduleApply();
});
chrome.runtime.onStartup.addListener(scheduleApply);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes.paused)) scheduleApply();
});
