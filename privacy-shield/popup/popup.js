const FEATURES = [
  ['trackers', 'Block trackers & ad networks', 'Analytics, ad, and session-recording services'],
  ['params', 'Clean tracking links', 'Removes utm_, fbclid, gclid and similar from links you open'],
  ['cookies', 'Block third-party cookies', 'Stops cross-site cookie tracking'],
  ['fingerprint', 'Fingerprinting protection', 'Canvas noise, hides GPU model, removes battery API'],
  ['adApis', "Disable Chrome's ad features", 'Topics, Protected Audience, ad measurement, link pings'],
  ['signals', 'Send "Do Not Sell" signals', 'Global Privacy Control and Do Not Track'],
  ['webrtc', 'Hide IP from WebRTC', 'Stops video-call APIs exposing your local IP address'],
];
const DEFAULTS = Object.fromEntries(FEATURES.map(([key]) => [key, true]));

const $ = (id) => document.getElementById(id);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { settings = {}, paused = [] } = await chrome.storage.local.get(['settings', 'paused']);
  const current = { ...DEFAULTS, ...settings };

  const list = $('features');
  for (const [key, label, hint] of FEATURES) {
    const li = document.createElement('li');
    li.innerHTML = `<div><span></span><small></small></div>
      <label class="switch"><input type="checkbox"><span></span></label>`;
    li.querySelector('div > span').textContent = label;
    li.querySelector('small').textContent = hint;
    const input = li.querySelector('input');
    input.setAttribute('aria-label', label);
    input.checked = current[key];
    input.addEventListener('change', async () => {
      current[key] = input.checked;
      await chrome.storage.local.set({ settings: current });
    });
    list.append(li);
  }

  let url;
  try { url = new URL(tab?.url); } catch {}
  const siteToggle = $('site-toggle');
  if (!url || !/^https?:$/.test(url.protocol)) {
    $('host').textContent = 'This page';
    $('site-note').textContent = 'Site controls are only available on websites.';
    siteToggle.disabled = true;
    return;
  }

  const host = url.hostname.replace(/^www\./, '');
  $('host').textContent = host;
  const pausedHere = paused.find((d) => host === d || host.endsWith('.' + d));
  siteToggle.checked = !pausedHere;
  siteToggle.setAttribute('aria-label', `Protection on ${host}`);

  const count = await chrome.action.getBadgeText({ tabId: tab.id });
  $('blocked').textContent = pausedHere
    ? 'Protection paused on this site'
    : `${Number(count) || 0} requests blocked or cleaned on this page`;

  siteToggle.addEventListener('change', async () => {
    const { paused: latest = [] } = await chrome.storage.local.get('paused');
    const next = siteToggle.checked
      ? latest.filter((d) => !(host === d || host.endsWith('.' + d)))
      : [...new Set([...latest, host])];
    await chrome.storage.local.set({ paused: next });
    $('site-note').textContent = siteToggle.checked
      ? 'Protection back on for this site.'
      : 'Paused here. Cookie, WebRTC and Chrome ad settings stay on everywhere.';
    $('reload').hidden = false;
  });
  $('reload').addEventListener('click', () => {
    chrome.tabs.reload(tab.id);
    window.close();
  });
}

init();
