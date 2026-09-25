const A = require('./harness.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  FAIL:', msg); } }
const C = A.CARD_BY_ID;
// Fresh game where each player's hand/deck are set to chosen card ids.
function setup(hand0, hand1, deck0, deck1) {
  const filler = Object.keys(C).filter(id => C[id].type === 'Unit' && !A.SCRIPTS[id]).slice(0, 5);
  const picks = {}; filler.forEach(id => picks[id] = 4);
  A.startGameWithDecks('AshenLegion', picks, 'VerdantConcord', picks);
  let n = 0; const mk = id => ({ instanceId: id + '-t' + (n++), cardId: id, power: null });
  const s = A.state;
  s.players[0].hand = hand0.map(mk); s.players[1].hand = hand1.map(mk);
  if (deck0) s.players[0].deck = deck0.map(mk);
  if (deck1) s.players[1].deck = deck1.map(mk);
  s.pendingReveal = null;
  return s;
}
const idByName = n => Object.keys(C).find(id => C[id].name === n);
function place(pIdx, name, row, slot) { const s = A.state; const id = idByName(name); s.players[pIdx].rows[row][slot] = { instanceId: id + '-p' + Math.random(), cardId: id, power: 0 }; return s.players[pIdx].rows[row][slot]; }

console.log('Scripts loaded for', Object.keys(A.SCRIPTS).length, 'cards');

// 1. Swing Event: Bonebreaker's Toll (+1 own, -2 opposing).
{ const s = setup(['125', '155'], ['155']);
  const mine = place(0, 'Ironclad Brute', 'Unit', 1); const theirs = place(1, 'Ironclad Brute', 'Unit', 1);
  A.playEvent(0, 0);
  ok(s.pending && s.pending.type === 'target', 'swing asks for a target');
  ok(s.pending.legal.includes(mine.instanceId) && !s.pending.legal.includes(theirs.instanceId), 'swing targets only own Units');
  A.onCardTap(mine.instanceId);
  ok(mine.power === 1 && theirs.power === -2, 'swing: +1 mine, -2 opposing (got ' + mine.power + ', ' + theirs.power + ')');
  ok(!s.pending, 'no prompt left'); }

// 2. Onslaught blanket needs 3 Units, optional.
{ const s = setup([idByName('Bloodmark Recruit'), '155'], ['155']);
  place(0, 'Ironclad Brute', 'Unit', 0); place(0, 'Ironclad Brute', 'Unit', 2);
  const e1 = place(1, 'Ironclad Brute', 'Unit', 0), e2 = place(1, 'Ironclad Brute', 'Unit', 2);
  A.playToSlot(0, 0, 'Unit', 1);
  ok(s.pending && s.pending.type === 'confirm', 'Onslaught asks "you may"');
  A.answerPending(true);
  ok(e1.power === -2 && e2.power === -2, 'Onslaught hits every enemy Unit, including ones not across from yours'); }

// 3. Onslaught with fewer than 3 Units does nothing.
{ const s = setup([idByName('Bloodmark Recruit')], ['155']);
  const e1 = place(1, 'Ironclad Brute', 'Unit', 0);
  A.playToSlot(0, 0, 'Unit', 1);
  ok(!s.pending && e1.power === 0, 'Onslaught condition blocks it with 1 Unit'); }

// 4. Fury counts Units in your Retirement pile (static, live).
{ const s = setup([], ['155']);
  const fury = place(0, 'Kharund Skullsplitter', 'Unit', 0); // placeholder to get an id
  const furyId = Object.keys(A.SCRIPTS).find(id => C[id].ability === 'Fury' && C[id].type === 'Unit');
  s.players[0].rows.Unit[0] = { instanceId: 'fury1', cardId: furyId, power: 0 };
  const base = parseInt(C[furyId].power, 10);
  ok(A.currentPower(s.players[0].rows.Unit[0]) === base, 'Fury with empty pile = base');
  s.players[0].retirement.push({ instanceId: 'r1', cardId: '086' }, { instanceId: 'r2', cardId: '086' }, { instanceId: 'r3', cardId: '155' });
  ok(A.currentPower(s.players[0].rows.Unit[0]) === base + 2, 'Fury +1 per retired Unit, Events not counted'); }

// 5. Duty replaces Retirement when a card is overwritten; declining retires it.
{ const dutyId = Object.keys(A.SCRIPTS).find(id => C[id].ability === 'Duty' && C[id].type === 'Unit');
  const s = setup(['155', '155'], ['155']);
  s.players[0].rows.Unit[0] = { instanceId: 'duty1', cardId: dutyId, power: 0 };
  const deckBefore = s.players[0].deck.length;
  A.playToSlot(0, 0, 'Unit', 0);
  ok(s.pending && /Duty/.test(s.pending.text), 'Duty prompt on overwrite');
  A.answerPending(true);
  ok(s.players[0].deck.length === deckBefore + 1 && !s.players[0].retirement.some(i => i.instanceId === 'duty1'), 'Duty shuffled into deck, not Retired');
  s.players[0].rows.Unit[1] = { instanceId: 'duty2', cardId: dutyId, power: 0 };
  s.players[0].cardsPlayedThisTurn = 0;
  A.playToSlot(0, 0, 'Unit', 1);
  A.answerPending(false);
  ok(s.players[0].retirement.some(i => i.instanceId === 'duty2'), 'declining Duty Retires it'); }

// 6. Zero-Power Retirement after resolution.
{ const s = setup(['125'], ['155']);
  const mine = place(0, 'Ironclad Brute', 'Unit', 0);
  const weak = place(1, 'Bloodmark Recruit', 'Unit', 0); // Power 2? check
  weak.power = 2 - parseInt(C[weak.cardId].power, 10); // make it Power 2
  A.playEvent(0, 0); A.onCardTap(mine.instanceId);
  ok(!s.players[1].rows.Unit[0] && s.players[1].retirement.some(i => i === weak), 'Unit at 0 Power is Retired'); }

// 7. Conflict-only bonus counts at Conflict, not on the card.
{ const s = setup([idByName('Quiet Sabotage')], ['155']);
  const loc = place(1, 'The Bonepile Forge', 'Location', 0);
  const before = A.currentPower(loc);
  A.playEvent(0, 0);
  ok(s.pending && s.pending.type === 'target', 'next-Conflict effect targets');
  A.onCardTap(loc.instanceId);
  ok(A.currentPower(loc) === before && A.conflictPower(loc) === before - 2, 'Quiet Sabotage: -2 only during Conflict'); }

// 8. Bait forces targeting; protect blocks reductions.
{ const s = setup([idByName('Bonebreaker\'s Toll') ? '125' : '125'], ['155']);
  const baitId = Object.keys(A.SCRIPTS).find(id => A.SCRIPTS[id].some(a => a.trig === 'bait') && C[id].type === 'Unit');
  const s2 = setup([idByName('The Undertow Calls')], ['155']);
  s2.players[1].rows.Unit[0] = { instanceId: 'plain', cardId: '086', power: 0 };
  s2.players[1].rows.Unit[2] = { instanceId: 'bait1', cardId: baitId, power: 0 };
  A.playEvent(0, 0);
  ok(s2.pending && s2.pending.legal.length === 1 && s2.pending.legal[0] === 'bait1', 'Bait must be chosen if able'); }

// 9. Look at top 2, one to hand, other to bottom.
{ const id15 = '015';
  const s = setup([id15], ['155'], ['086', '155', '110', '118']);
  A.playToSlot(0, 0, 'Unit', 0);
  ok(s.pending && s.pending.type === 'confirm', 'look-top is optional'); A.answerPending(true);
  ok(s.pending && s.pending.type === 'list' && s.pending.options.length === 2, 'shows top 2');
  const pick = s.pending.options[1]; A.togglePick(pick); A.answerPending(true);
  ok(s.players[0].hand.some(i => i.instanceId === pick) && s.players[0].deck[s.players[0].deck.length - 1].cardId === '086', 'picked to hand, other to bottom'); }

// 10. Scrap Value Erases from a pile and grows.
{ const svId = Object.keys(A.SCRIPTS).find(id => A.SCRIPTS[id].some(a => a.eff && a.eff.kind === 'eraseFromPiles'));
  const s = setup([svId], ['155']);
  s.players[1].retirement.push({ instanceId: 'x1', cardId: '086' });
  A.playToSlot(0, 0, 'Unit', 0);
  ok(s.pending && s.pending.type === 'list', 'Scrap Value shows pile cards');
  A.togglePick('x1'); A.answerPending(true);
  const u = s.players[0].rows.Unit[0];
  ok(s.players[1].erased.length === 1 && s.players[1].retirement.length === 0, 'card moved to owner Erased pile');
  ok(u.power === 1, 'Scrap Value +1 per Erased card'); }

// 11. Deck reshuffles from the Retirement pile when empty.
{ const s = setup(['155'], ['155'], [], ['155']);
  s.players[0].retirement = [{ instanceId: 'rr1', cardId: '086' }];
  A.draw(0);
  ok(s.players[0].hand.some(i => i.instanceId === 'rr1') && s.players[0].retirement.length === 0, 'draw reshuffles the pile'); }

// 12. Tiebreak by highest Unit.
{ const s = setup([], []);
  const a = place(0, 'Ironclad Brute', 'Unit', 0); a.power = 0;
  const b = place(1, 'Bloodmark Recruit', 'Unit', 0); const c = place(1, 'Bloodmark Recruit', 'Unit', 1);
  const pa = A.currentPower(a), pb = A.currentPower(b);
  b.power = pa - 2 * pb; // make totals equal: pa vs pb+pb
  b.power = Math.round((pa - 2 * pb)); c.power = 0;
  const t0 = A.totalPower(0), t1 = A.totalPower(1);
  s.players[0].rows.Unit[0].power += t1 - t0;
  A.resolveConflict();
  ok(s.lastRoundResult.tieNote.includes('highest-Power Unit'), 'tie broken by highest Unit: ' + s.lastRoundResult.tieNote); }

// 13. Play restriction: cannot be played unless you control a Location.
{ const rid = Object.keys(A.SCRIPTS).find(id => A.SCRIPTS[id].some(a => a.req === 'controlLocation'));
  const s = setup([rid], ['155']);
  ok(!A.canPlayCard(0, s.players[0].hand[0]), 'blocked without a Location');
  place(0, 'The Bonepile Forge', 'Location', 0);
  ok(A.canPlayCard(0, s.players[0].hand[0]), 'allowed with a Location'); }

// 14. Warcry: optional +1 to your other Units when you play a Unit.
{ const wid = Object.keys(A.SCRIPTS).find(id => C[id].ability === 'Warcry' && C[id].type === 'Unit');
  const s = setup(['086'], ['155']);
  const w = { instanceId: 'w1', cardId: wid, power: 0 }; s.players[0].rows.Unit[0] = w;
  const other = place(0, 'Ironclad Brute', 'Unit', 2);
  A.playToSlot(0, 0, 'Unit', 1);
  ok(s.pending && /Ironclad Brute/.test(s.pending.text), 'Onslaught on the played Unit asks first'); A.answerPending(false);
  ok(s.pending && /Raider Vanguard/.test(s.pending.text), 'then Warcry asks'); A.answerPending(true);
  const played = s.players[0].rows.Unit[1];
  ok(played.power === 1 && other.power === 1 && w.power === 0, 'Warcry: +1 to each other Unit'); }

// 15. Save/resume mid-prompt keeps the prompt.
{ const s = setup(['125'], ['155']); place(0, 'Ironclad Brute', 'Unit', 0);
  A.playEvent(0, 0);
  const saved = JSON.parse(JSON.stringify(s));
  A.state = A.upgradeState(saved);
  ok(A.state.pending && A.state.pending.type === 'target', 'prompt survives save/load');
  A.render(); ok(A.renderPrompt().includes('choose target'), 'prompt renders'); }

// 16. Render smoke test on every scripted card's inspect path (no crash).
{ const s = setup(['155'], ['155']);
  try { A.render(); A.renderPickModal(); pass++; } catch (e) { fail++; console.log('  FAIL render', e.message); } }


// 17. Hand-to-bottom rule then Conflict.
{ const s = setup(['155'], []);
  s.players[0].cardsPlayedThisTurn = 2; s.players[0].hasDrawnThisTurn = true;
  const r = s.roundNumber; A.endTurn();
  ok(A.state.roundNumber === r + 1 || A.state.lastRoundResult, 'empty opponent hand: current hand goes to Deck bottom, Conflict starts'); }

// 18. Cleanup triggers nothing (Consensus unit + retiring Units at Conflict).
{ const cid = Object.keys(A.SCRIPTS).find(id => C[id].ability === 'Consensus' && C[id].type === 'Unit');
  const s = setup([], []);
  s.players[0].rows.Unit[0] = { instanceId: 'cs1', cardId: cid, power: 0 };
  place(0, 'Ironclad Brute', 'Unit', 1);
  A.resolveConflict();
  ok(!A.state.pending && A.state.queue.length === 0, 'no triggers during cleanup'); }

// 19. Shield soaks the next loss this turn only.
{ const s = setup(['080', '125'], ['155']);
  const mine = place(0, 'Ironclad Brute', 'Unit', 0);
  A.playEvent(0, 0); A.onCardTap(mine.instanceId);
  ok(mine.shield === 1, 'shield applied');
  const theirs = place(1, 'Ironclad Brute', 'Unit', 0);
  s.players[1].hand = [{ instanceId: 'bt', cardId: '125', power: null }];
  s.active = 1; s.players[1].cardsPlayedThisTurn = 0;
  A.playEvent(1, 0); A.onCardTap(theirs.instanceId);
  ok(mine.power === -1 && mine.shield === 0, 'shield prevented 1 of 2 (got ' + mine.power + ')'); }

// 20. Every scripted card resolves without throwing (smoke test).
{ let errors = 0;
  Object.keys(A.SCRIPTS).forEach(id => {
    try {
      const s = setup([id], ['155'], ['086', '110', '118', '086'], ['086', '086']);
      place(0, 'Ironclad Brute', 'Unit', 2); place(1, 'Ironclad Brute', 'Unit', 2); place(0, 'The Bonepile Forge', 'Location', 1); place(1, 'The Bonepile Forge', 'Location', 1);
      s.players[0].retirement.push({ instanceId: 'rz', cardId: '086' });
      const c = C[id];
      if (c.type === 'Event') A.playEvent(0, 0); else if (A.canPlayCard(0, s.players[0].hand[0])) A.playToSlot(0, 0, c.type, 0);
      for (let k = 0; k < 10 && A.state.pending; k++) {
        const pd = A.state.pending;
        if (pd.type === 'target') A.onCardTap(pd.legal[0]);
        else if (pd.type === 'list') { if (pd.max > 0) A.togglePick(pd.options[0]); A.answerPending(true); }
        else A.answerPending(true);
      }
      A.render(); A.renderPickModal();
      if (A.state.pending) { errors++; console.log('  stuck prompt on', id, A.state.pending.text); }
    } catch (e) { errors++; console.log('  crash on', id, C[id].name, '-', e.message); }
  });
  ok(errors === 0, 'all scripted cards resolve cleanly'); }


// 21. End Turn: never automatic; lights up only after draw + 2 plays.
{ const s = setup(['086', '086', '086'], ['086', '086'], ['110', '118', '086'], null);
  ok(!A.canEndTurn(), 'not ready at turn start');
  A.playToSlot(0, 0, 'Unit', 0); if (A.state.pending) A.answerPending(false);
  A.playToSlot(0, 0, 'Unit', 1); if (A.state.pending) A.answerPending(false);
  ok(!A.canEndTurn(), 'two plays but no draw: not ready');
  A.draw(0);
  ok(A.state.active === 0, 'drawing last does NOT end the turn');
  ok(A.canEndTurn(), 'ready after draw + 2 plays');
  A.passTurn();
  ok(A.state.active === 1, 'End Turn passes to Player 2'); }

// 22. A draw that can't happen counts as done; so do plays when nothing is playable.
{ const s = setup([], ['086'], [], null);
  s.players[0].retirement = [];
  const st = A.turnStatus(0);
  ok(st.drawDone && st.playsDone && A.canEndTurn(), 'empty hand, deck and pile: turn can end'); }

// 23. Can't end the turn with a prompt open.
{ const s = setup(['125', '086'], ['086'], ['110']);
  place(0, 'Ironclad Brute', 'Unit', 0);
  s.players[0].hasDrawnThisTurn = true; s.players[0].cardsPlayedThisTurn = 1;
  A.playEvent(0, 0);
  ok(A.state.pending && !A.canEndTurn(), 'End Turn locked while a prompt is open'); }


// 24. Hand-size counters lock in when played (review fix).
{ const s = setup(['412', '086', '086', '086'], ['086']);
  A.playToSlot(0, 0, 'Unit', 0);
  const u = s.players[0].rows.Unit[0];
  ok(u.power === 3, 'Construct Market Executive: +1 counter per card left in hand (got ' + u.power + ')'); }

// 25. Skullbanner Muster boosts a thin army at turn start (review fix).
{ const s = setup(['086'], ['086']); // Player 1 keeps a card, so passing the turn doesn't trigger Conflict
  place(0, 'The Skullbanner Muster', 'Location', 0);
  const u = place(0, 'Ironclad Brute', 'Unit', 1);
  s.players[0].cardsPlayedThisTurn = 2; s.players[0].hasDrawnThisTurn = true;
  s.players[1].hand = [{ instanceId: 'x', cardId: '086' }];
  s.active = 1; A.endTurn();
  ok(u.power === 1 && A.state.active === 0, 'turn-start counter with 2 or fewer Units (got ' + u.power + ')'); }

console.log('passed', pass, 'failed', fail);
