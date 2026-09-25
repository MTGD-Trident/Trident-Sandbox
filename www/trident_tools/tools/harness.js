// Runs the app's real <script> in Node with a minimal DOM stub.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || 'www/index.html', 'utf8');
const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const el = () => ({ style: {}, innerHTML: '', className: '', classList: { add() {}, remove() {} }, scrollHeight: 900, scrollWidth: 900,
  querySelectorAll: () => [], set textContent(v) { this.innerHTML = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); } });
global.document = { getElementById: () => el(), createElement: () => el(), querySelectorAll: () => [] };
global.window = { addEventListener() {}, innerHeight: 900, innerWidth: 900 };
const store = {}; global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
const api = new Function(js + `
return { get state(){return state}, set state(v){state=v}, CARD_BY_ID, SCRIPTS, SCRIPT_STATUS, startGameWithDecks, playToSlot, playEvent, draw,
  retireSlot, answerPending, chooseTarget, togglePick, currentPower, conflictPower, totalPower, runQueue, canPlayCard, endTurn,
  resolveConflict, upgradeState, passTurn, canEndTurn, turnStatus, render, renderPrompt, renderPickModal, findOnBoard, onCardTap, adjustPower };`)();
module.exports = api;
