// ===================================================================
// Ability engine
// -------------------------------------------------------------------
// SCRIPTS (generated from the master CSV by tools/scripts_from_text.py)
// lists each card's automated abilities. Anything not in SCRIPTS stays
// manual: the +/- Power steppers and drag-to-Retire still work on every
// card, so an unscripted ability is always playable by hand.
//
// Flow: an action (play, retire, draw...) queues triggered abilities in
// state.queue. runQueue() resolves them in order. An ability that needs
// a decision (a target, a "you may", a card from a list) parks itself in
// state.pending and waits for the player. Per the Core Rules, all
// triggers finish before the next action, and only then do Zero-Power
// Retirement, Conflict Start and end-of-turn get checked (settle()).
// Everything lives in `state`, so saves resume mid-prompt.
// ===================================================================

function scriptsOf(cardId) { return SCRIPTS[cardId] || []; }
function abilitiesWith(cardId, trig) {
  return scriptsOf(cardId).map((a, i) => ({ a, i })).filter(x => x.a.trig === trig);
}
function hasTrig(cardId, trig) { return scriptsOf(cardId).some(a => a.trig === trig); }
function cardOf(inst) { return CARD_BY_ID[inst.cardId]; }
function nameOf(inst) { return cardOf(inst).name; }
function other(pIdx) { return pIdx === 0 ? 1 : 0; }
function busy() { return !!(state && (state.pending || (state.queue && state.queue.length))); }

function logMsg(t) {
  state.log = state.log || [];
  state.log.push(t);
  if (state.log.length > 6) state.log.shift();
}

// Every card on the board, with where it sits.
function boardCards(pIdx) {
  const out = [];
  const pl = pIdx === undefined ? [0, 1] : [pIdx];
  pl.forEach(pi => ROW_TYPES.forEach(row => state.players[pi].rows[row].forEach((inst, slot) => {
    if (inst) out.push({ inst, pIdx: pi, row, slot });
  })));
  return out;
}
function findOnBoard(instanceId) {
  return boardCards().find(b => b.inst.instanceId === instanceId) || null;
}
// Find an instance anywhere (board, hand, deck, piles).
function findAnywhere(instanceId) {
  const b = findOnBoard(instanceId);
  if (b) return Object.assign({ zone: 'board' }, b);
  for (let pi = 0; pi < 2; pi++) {
    const p = state.players[pi];
    for (const zone of ['hand', 'deck', 'retirement', 'erased']) {
      const idx = (p[zone] || []).findIndex(i => i.instanceId === instanceId);
      if (idx >= 0) return { zone, pIdx: pi, idx, inst: p[zone][idx] };
    }
  }
  return null;
}

// ---- Counts used by scaling and conditions ------------------------
function countFor(key, pIdx, srcInst) {
  const p = state.players[pIdx], o = state.players[other(pIdx)];
  const n = arr => arr.filter(Boolean).length;
  switch (key) {
    case 'ownLocations': return n(p.rows.Location);
    case 'ownUnits': return n(p.rows.Unit);
    case 'ownOtherUnits': return p.rows.Unit.filter(u => u && (!srcInst || u.instanceId !== srcInst.instanceId)).length;
    case 'ownRetiredUnits': return p.retirement.filter(i => cardOf(i).type === 'Unit').length;
    case 'oppUnits': return n(o.rows.Unit);
    case 'allRetired': return p.retirement.length + o.retirement.length;
    case 'opposingLocations': return [0, 1, 2].filter(i => o.rows.Location[i] && (p.rows.Location[i] || p.rows.Unit[i])).length;
    case 'handSize': return p.hand.length;
  }
  return 0;
}
function condOk(cond, pIdx, srcInst) {
  if (!cond) return true;
  const v = countFor(cond.count, pIdx, srcInst);
  if (cond.min !== undefined && v < cond.min) return false;
  if (cond.max !== undefined && v > cond.max) return false;
  return true;
}

// ---- Power ----------------------------------------------------------
// inst.power  = counters plus manual stepper changes (lasts until it leaves play)
// inst.cb     = "During the next Conflict" bonus (cleared after Conflict)
// statics     = continuous "for each" bonuses, recomputed every time
function staticBonus(inst) {
  const b = findOnBoard(inst.instanceId);
  if (!b) return 0;
  let bonus = 0;
  abilitiesWith(inst.cardId, 'static').forEach(({ a }) => {
    if (a.eff.kind !== 'perCount') return;
    let v = a.eff.amount * countFor(a.eff.count, b.pIdx, inst);
    if (a.eff.max !== undefined) v = Math.min(v, a.eff.max);
    bonus += v;
  });
  return bonus;
}
function conflictOnlyBonus(inst) {
  const b = findOnBoard(inst.instanceId);
  if (!b) return 0;
  let bonus = inst.cb || 0;
  abilitiesWith(inst.cardId, 'conflictStatic').forEach(({ a }) => {
    if (a.eff.kind === 'ifCount' && countFor(a.eff.count, b.pIdx, inst) >= a.eff.min) bonus += a.eff.amount;
  });
  return bonus;
}
function powerFloor(inst) {
  let f = null;
  abilitiesWith(inst.cardId, 'static').forEach(({ a }) => { if (a.eff.kind === 'floor') f = a.eff.min; });
  return f;
}
function currentPower(inst) {
  const base = basePower(inst.cardId);
  if (base === null) return null;
  let v = base + (inst.power || 0) + staticBonus(inst);
  const f = powerFloor(inst);
  if (f !== null) v = Math.max(v, f);
  return v;
}
function conflictPower(inst) {
  const v = currentPower(inst);
  return v === null ? null : v + conflictOnlyBonus(inst);
}
function totalPower(pIdx) {
  let total = 0;
  boardCards(pIdx).forEach(b => { total += conflictPower(b.inst) || 0; });
  return total;
}
// An ability changing Power. Shields ("Prevent the next N Power loss") soak losses first.
function changePower(inst, delta, field) {
  field = field || 'power';
  if (delta < 0 && inst.shield > 0) {
    const s = Math.min(inst.shield, -delta);
    inst.shield -= s; delta += s;
    if (s) logMsg(nameOf(inst) + ' prevented ' + s + ' Power loss.');
  }
  inst[field] = (inst[field] || 0) + delta;
}

// ---- Drawing, with the Retirement-pile reshuffle ---------------------
function drawOne(pIdx) {
  const p = state.players[pIdx];
  if (p.deck.length === 0 && p.retirement.length > 0) {
    p.deck = shuffle(p.retirement);
    p.retirement = [];
    logMsg(p.name + ' shuffled their Retirement pile into their Deck.');
  }
  if (p.deck.length === 0) return null; // nothing to draw: the draw is skipped
  const inst = p.deck.shift();
  inst.drawnTurn = state.turnNo;
  p.hand.push(inst);
  return inst;
}
function topOfDeck(pIdx, n) {
  const p = state.players[pIdx];
  if (p.deck.length < n && p.retirement.length > 0) {
    p.deck = p.deck.concat(shuffle(p.retirement));
    p.retirement = [];
  }
  return p.deck.slice(0, n);
}

// ---- Targets ----------------------------------------------------------
function isBait(inst) { return hasTrig(inst.cardId, 'bait'); }
function isProtected(inst) { return hasTrig(inst.cardId, 'protect'); }
function legalTargets(spec, controller, srcId, sign) {
  const side = spec.side === 'own' ? controller : other(controller);
  let list = boardCards(side).filter(b => b.row === spec.row);
  if (spec.otherThanSource) list = list.filter(b => b.inst.instanceId !== srcId);
  if (spec.maxPower !== undefined) list = list.filter(b => (currentPower(b.inst) || 0) <= spec.maxPower);
  if (side !== controller) {
    if (sign < 0) list = list.filter(b => !isProtected(b.inst));
    const bait = list.filter(b => isBait(b.inst));
    if (bait.length) list = bait; // Bait: opponents must choose it if able
  }
  return list;
}
// Targets that need no choice ("each", "the opposing", "this").
function autoTargets(spec, controller, srcId) {
  const src = findOnBoard(srcId);
  if (spec.sel === 'self') return src ? [src] : [];
  if (spec.sel === 'each') {
    const side = spec.side === 'own' ? controller : other(controller);
    let list = boardCards(side).filter(b => b.row === spec.row);
    if (spec.otherThanSource) list = list.filter(b => b.inst.instanceId !== srcId);
    if (spec.maxPower !== undefined) list = list.filter(b => (currentPower(b.inst) || 0) <= spec.maxPower);
    return list;
  }
  if (spec.sel === 'opposing') {
    if (!src) return [];
    const o = state.players[other(src.pIdx)].rows[spec.row][src.slot];
    return o ? [{ inst: o, pIdx: other(src.pIdx), row: spec.row, slot: src.slot }] : [];
  }
  if (spec.sel === 'eachOpposing') {
    const me = state.players[controller], opp = other(controller);
    return [0, 1, 2].filter(i => (me.rows.Unit[i] || me.rows.Location[i]) && state.players[opp].rows[spec.row][i])
      .map(i => ({ inst: state.players[opp].rows[spec.row][i], pIdx: opp, row: spec.row, slot: i }));
  }
  return [];
}

// ---- Triggers and the queue -----------------------------------------
function queueAbility(inst, owner, abIdx, extra) {
  state.queue.push(Object.assign({ cardId: inst.cardId, ab: abIdx, src: inst.instanceId, controller: owner }, extra || {}));
}
function fire(trig, ctx) {
  const queueFor = (inst, owner) => abilitiesWith(inst.cardId, trig).forEach(({ a, i }) => {
    if (a.oncePerTurn) {
      inst.usedTurn = inst.usedTurn || {};
      if (inst.usedTurn[i] === state.turnNo) return;
      inst.usedTurn[i] = state.turnNo;
    }
    queueAbility(inst, owner, i);
  });
  switch (trig) {
    case 'enter': case 'play': case 'retiredSelf': case 'leavesPlay':
      queueFor(ctx.inst, ctx.owner); break;
    case 'ownUnitPlayed': case 'ownLocationPlayed': case 'ownUnitRetired': case 'turnStart': case 'ownDiscard':
      boardCards(ctx.owner).forEach(b => queueFor(b.inst, ctx.owner)); break;
    case 'unitStationedHere': {
      const loc = state.players[ctx.owner].rows.Location[ctx.slot];
      if (loc) queueFor(loc, ctx.owner);
      break;
    }
    case 'opposingUnitRetired': {
      const opp = other(ctx.owner);
      const u = state.players[opp].rows.Unit[ctx.slot];
      if (u) queueFor(u, opp);
      break;
    }
  }
}

// A card leaves the board through Retirement (not cleanup — cleanup triggers nothing).
function retireFromBoard(pIdx, row, slot, why) {
  const p = state.players[pIdx];
  const inst = p.rows[row][slot];
  if (!inst) return;
  p.rows[row][slot] = null;
  inst.power = 0; inst.cb = 0; inst.shield = 0;
  if (hasTrig(inst.cardId, 'duty')) {
    state.queue.unshift({ kind: 'duty', src: inst.instanceId, controller: pIdx, row, slot, why });
    p.limbo = p.limbo || [];
    p.limbo.push(inst); // held until Duty is decided
    return;
  }
  finishRetire(pIdx, inst, row, slot);
}
function finishRetire(pIdx, inst, row, slot) {
  state.players[pIdx].retirement.push(inst);
  logMsg(nameOf(inst) + ' was Retired.');
  fire('leavesPlay', { inst, owner: pIdx });
  fire('retiredSelf', { inst, owner: pIdx });
  if (row === 'Unit') {
    fire('ownUnitRetired', { owner: pIdx });
    fire('opposingUnitRetired', { owner: pIdx, slot });
  }
}
function takeFromLimbo(pIdx, instanceId) {
  const p = state.players[pIdx];
  const i = (p.limbo || []).findIndex(x => x.instanceId === instanceId);
  return i >= 0 ? p.limbo.splice(i, 1)[0] : null;
}

function runQueue() {
  let guard = 0;
  while (!state.pending && state.queue.length && guard++ < 500) {
    resolveTask(state.queue.shift());
  }
  if (!state.pending && !state.queue.length) settle();
}

// After everything resolves: Zero-Power Retirement, then Conflict Start, then auto end of turn.
function settle() {
  if (state.gameOver) return;
  const dead = boardCards().filter(b => { const v = currentPower(b.inst); return v !== null && v <= 0; });
  if (dead.length) {
    dead.forEach(b => { logMsg(nameOf(b.inst) + ' fell to 0 Power.'); retireFromBoard(b.pIdx, b.row, b.slot, 'zero'); });
    runQueue();
    return;
  }
  if (checkConflictTrigger()) return;
  maybeAutoEndTurn(state.active);
}

function ask(p) { state.pending = p; }
function who(pIdx) { return state.players[pIdx].name + ': '; }

function resolveTask(t) {
  if (t.kind === 'duty') return resolveDuty(t);
  const ab = scriptsOf(t.cardId)[t.ab];
  if (!ab || !ab.eff) return;
  const eff = ab.eff, ctl = t.controller;
  const srcCard = CARD_BY_ID[t.cardId];
  const srcInst = (findAnywhere(t.src) || {}).inst;
  if (!t.condChecked) {
    t.condChecked = true;
    if (!condOk(ab.cond, ctl, srcInst)) { logMsg(srcCard.name + ': condition not met.'); return; }
  }
  const choosesTarget = eff.target && eff.target.sel === 'target' || eff.kind === 'swing';
  const choosesFromList = ['eraseFromPiles', 'switchSearch', 'pileToHand', 'scry'].includes(eff.kind);
  if (ab.optional && !t.confirmed && !choosesTarget && !choosesFromList) {
    return ask({ type: 'confirm', task: t, text: who(ctl) + srcCard.name + ' — use this ability?', detail: srcCard.ability });
  }
  const sign = (eff.amount || 0) < 0 || eff.kind === 'swing' ? -1 : 1;

  // Effects that apply to a chosen target.
  if (choosesTarget && !t.choice) {
    const spec = eff.kind === 'swing' ? { sel: 'target', side: 'own', row: eff.row } : eff.target;
    const legal = legalTargets(spec, ctl, t.src, eff.kind === 'swing' ? 1 : sign);
    if (!legal.length) { logMsg(srcCard.name + ': no legal target.'); return; }
    return ask({ type: 'target', task: t, legal: legal.map(b => b.inst.instanceId), optional: !!ab.optional,
      text: who(ctl) + srcCard.name + ' — choose target ' + spec.row + (spec.side === 'own' ? ' you control' : ' an opponent controls') });
  }
  const chosen = t.choice ? findOnBoard(t.choice) : null;
  if (choosesTarget && !chosen) { logMsg(srcCard.name + ': target left play.'); return; }

  switch (eff.kind) {
    case 'counters': case 'conflictBonus': {
      let amount = eff.amount;
      if (eff.perCount) amount *= Math.floor(countFor(eff.perCount, ctl, srcInst) / (eff.div || 1));
      if (!amount) { logMsg(srcCard.name + ': nothing to add.'); return; }
      const field = eff.kind === 'conflictBonus' ? 'cb' : 'power';
      const targets = chosen ? [chosen] : autoTargets(eff.target, ctl, t.src);
      targets.forEach(b => changePower(b.inst, amount, field));
      logMsg(srcCard.name + ': ' + (amount > 0 ? '+' : '') + amount + (field === 'cb' ? ' next Conflict' : '') +
        ' to ' + (targets.length ? targets.map(b => nameOf(b.inst)).join(', ') : 'nothing') + '.');
      return;
    }
    case 'swing': {
      const field = eff.conflict ? 'cb' : 'power';
      changePower(chosen.inst, eff.plus, field);
      const opp = state.players[other(chosen.pIdx)].rows[chosen.row][chosen.slot];
      if (opp) changePower(opp, -eff.minus, field);
      logMsg(srcCard.name + ': +' + eff.plus + ' ' + nameOf(chosen.inst) + (opp ? ', -' + eff.minus + ' ' + nameOf(opp) : ' (no opposing card)') + '.');
      return;
    }
    case 'shield':
      chosen.inst.shield = (chosen.inst.shield || 0) + eff.amount;
      logMsg(nameOf(chosen.inst) + ' will prevent the next ' + eff.amount + ' Power loss this turn.');
      return;
    case 'returnToHand': {
      const b = chosen;
      state.players[b.pIdx].rows[b.row][b.slot] = null;
      b.inst.power = 0; b.inst.cb = 0; b.inst.shield = 0;
      state.players[b.pIdx].hand.push(b.inst);
      logMsg(nameOf(b.inst) + ' returned to hand.');
      fire('leavesPlay', { inst: b.inst, owner: b.pIdx });
      return;
    }
    case 'revealGamble': {
      const top = topOfDeck(ctl, 1)[0];
      if (!top) { logMsg(srcCard.name + ': nothing to reveal.'); return; }
      const hit = cardOf(top).type === 'Unit';
      changePower(chosen.inst, hit ? eff.plus : -eff.minus);
      logMsg(srcCard.name + ': revealed ' + nameOf(top) + ' — ' + nameOf(chosen.inst) + (hit ? ' +' + eff.plus : ' -' + eff.minus) + '.');
      return;
    }
    case 'draw': {
      let got = 0;
      for (let i = 0; i < eff.n; i++) if (drawOne(ctl)) got++;
      logMsg(state.players[ctl].name + ' drew ' + got + ' (' + srcCard.name + ').');
      return;
    }
    case 'highStakes': {
      const top = topOfDeck(ctl, 1)[0];
      if (!srcInst || !findOnBoard(srcInst.instanceId)) return;
      if (!top) { logMsg('High Stakes: nothing to reveal.'); return; }
      if (cardOf(top).type === 'Unit') {
        changePower(srcInst, 3);
        logMsg('High Stakes: revealed ' + nameOf(top) + ' (Unit) — ' + srcCard.name + ' +3.');
      } else {
        state.players[ctl].deck.shift();
        state.players[ctl].retirement.push(top);
        changePower(srcInst, -1);
        logMsg('High Stakes: revealed ' + nameOf(top) + ' — Retired it; ' + srcCard.name + ' -1.');
      }
      return;
    }
    case 'peek': {
      const top = topOfDeck(ctl, 1);
      if (!top.length) return;
      return ask({ type: 'list', task: Object.assign(t, { done: true }), text: who(ctl) + 'Top card of your Deck (' + srcCard.name + ')',
        options: top.map(i => i.instanceId), min: 0, max: 0, selected: [] });
    }
  }

  // Effects that pick cards from a list.
  if (t.picked === undefined) {
    let options = [], min = 0, max = 1, text = '';
    const p = state.players[ctl];
    switch (eff.kind) {
      case 'eraseFromPiles':
        options = state.players[0].retirement.concat(state.players[1].retirement);
        max = eff.max; text = 'Scrap Value — you may Erase a card from any Retirement pile';
        break;
      case 'switchSearch': {
        const floor = basePower(t.cardId) || 0;
        options = p.deck.filter(i => cardOf(i).type === 'Unit' && (basePower(i.cardId) || 0) > floor);
        text = 'Switch — you may put a higher-Power Unit from your Deck on top';
        break;
      }
      case 'pileToHand':
        options = p.retirement.filter(i => cardOf(i).type === eff.filter);
        min = 1; text = srcCard.name + ' — return a ' + eff.filter + ' from your Retirement pile to your hand';
        break;
      case 'lookTop':
        options = topOfDeck(ctl, eff.n); min = max = Math.min(eff.toHand, options.length);
        text = srcCard.name + ' — choose ' + eff.toHand + ' for your hand' + (eff.rest === 'bottom' ? '; the rest go to the bottom' : '');
        break;
      case 'scry':
        options = topOfDeck(ctl, eff.n);
        text = srcCard.name + ' — tap the card to put it on the bottom, or leave it on top';
        break;
      case 'discardThenDraw':
        options = p.hand.slice(); min = max = Math.min(1, options.length);
        text = srcCard.name + ' — discard a card, then draw a card';
        break;
      default:
        logMsg(srcCard.name + ': not automated.');
        return;
    }
    if (!options.length && min === 0) { logMsg(srcCard.name + ': nothing to choose.'); return; }
    if (!options.length) { if (eff.kind === 'discardThenDraw') { t.picked = []; } else { logMsg(srcCard.name + ': nothing to choose.'); return; } }
    else return ask({ type: 'list', task: t, text: who(ctl) + text, options: options.map(i => i.instanceId), min, max, selected: [] });
  }
  applyPicked(t, eff, ctl, srcCard, srcInst);
}

function removeFrom(arr, id) { const i = arr.findIndex(x => x.instanceId === id); return i >= 0 ? arr.splice(i, 1)[0] : null; }

function applyPicked(t, eff, ctl, srcCard, srcInst) {
  const p = state.players[ctl];
  const picked = t.picked || [];
  switch (eff.kind) {
    case 'eraseFromPiles': {
      picked.forEach(id => {
        for (let pi = 0; pi < 2; pi++) {
          const inst = removeFrom(state.players[pi].retirement, id);
          if (inst) { state.players[pi].erased.push(inst); logMsg(nameOf(inst) + ' was Erased.'); }
        }
      });
      if (picked.length && srcInst && findOnBoard(srcInst.instanceId)) changePower(srcInst, eff.perCounter * picked.length);
      return;
    }
    case 'switchSearch': {
      if (!picked.length) return;
      const inst = removeFrom(p.deck, picked[0]);
      p.deck = shuffle(p.deck);
      p.deck.unshift(inst);
      logMsg('Switch: ' + nameOf(inst) + ' put on top of the Deck.');
      return;
    }
    case 'pileToHand':
      picked.forEach(id => { const inst = removeFrom(p.retirement, id); if (inst) { p.hand.push(inst); logMsg(nameOf(inst) + ' returned to hand.'); } });
      return;
    case 'lookTop': {
      const looked = p.deck.splice(0, eff.n);
      looked.forEach(inst => {
        if (picked.includes(inst.instanceId)) { inst.drawnTurn = state.turnNo; p.hand.push(inst); }
        else if (eff.rest === 'bottom') p.deck.push(inst);
        else p.deck.unshift(inst);
      });
      logMsg(srcCard.name + ': took a card into hand.');
      return;
    }
    case 'scry':
      if (picked.length) { const inst = removeFrom(p.deck, picked[0]); p.deck.push(inst); logMsg(srcCard.name + ': put the top card on the bottom.'); }
      return;
    case 'discardThenDraw':
      picked.forEach(id => { const inst = removeFrom(p.hand, id); if (inst) { p.retirement.push(inst); logMsg(p.name + ' discarded ' + nameOf(inst) + '.'); fire('ownDiscard', { owner: ctl }); } });
      drawOne(ctl);
      return;
  }
}

function resolveDuty(t) {
  const inst = (state.players[t.controller].limbo || []).find(x => x.instanceId === t.src);
  if (!inst) return;
  if (t.answer === undefined) {
    return ask({ type: 'confirm', task: t, text: who(t.controller) + 'Duty — shuffle ' + nameOf(inst) + ' into your Deck instead of Retiring it?' });
  }
  takeFromLimbo(t.controller, t.src);
  if (t.answer) {
    const p = state.players[t.controller];
    p.deck.push(inst); p.deck = shuffle(p.deck);
    logMsg('Duty: ' + nameOf(inst) + ' was shuffled into the Deck.');
    fire('leavesPlay', { inst, owner: t.controller });
  } else {
    finishRetire(t.controller, inst, t.row, t.slot);
  }
}

// ---- Player responses to prompts --------------------------------------
function answerPending(yes) {
  const pd = state.pending; if (!pd) return;
  const t = pd.task;
  state.pending = null;
  if (t.kind === 'duty') { t.answer = !!yes; resolveTask(t); }
  else if (pd.type === 'confirm') { if (yes) { t.confirmed = true; resolveTask(t); } else logMsg(CARD_BY_ID[t.cardId].name + ': declined.'); }
  else if (pd.type === 'target') { logMsg(CARD_BY_ID[t.cardId].name + ': skipped.'); }
  else if (pd.type === 'list') {
    if (t.done) { /* info only */ }
    else if (!yes) { t.picked = []; resolveTask(t); }
    else { t.picked = pd.selected.slice(); resolveTask(t); }
  }
  runQueue(); render();
}
function chooseTarget(instanceId) {
  const pd = state.pending;
  if (!pd || pd.type !== 'target' || !pd.legal.includes(instanceId)) return false;
  state.pending = null;
  pd.task.choice = instanceId; pd.task.confirmed = true;
  resolveTask(pd.task);
  runQueue(); render();
  return true;
}
function togglePick(instanceId) {
  const pd = state.pending;
  if (!pd || pd.type !== 'list' || pd.max === 0) return;
  const i = pd.selected.indexOf(instanceId);
  if (i >= 0) pd.selected.splice(i, 1);
  else { if (pd.selected.length >= pd.max) pd.selected.shift(); pd.selected.push(instanceId); }
  render();
}

// ---- Play restrictions -----------------------------------------------
function canPlayCard(pIdx, inst) {
  const reqs = abilitiesWith(inst.cardId, 'playReq').map(x => x.a);
  for (const r of reqs) {
    if (r.req === 'notDrawnThisTurn' && inst.drawnTurn === state.turnNo) return false;
    if (r.req === 'controlLocation' && countFor('ownLocations', pIdx) < 1) return false;
    if (r.req === 'minRetired' && state.players[pIdx].retirement.length < r.n) return false;
  }
  return true;
}

// ---- Save compatibility ------------------------------------------------
function upgradeState(s) {
  s.queue = s.queue || []; s.pending = s.pending || null; s.log = s.log || [];
  s.turnNo = s.turnNo || 1;
  s.players.forEach((p, pi) => { p.erased = p.erased || []; p.limbo = p.limbo || []; });
  return s;
}
