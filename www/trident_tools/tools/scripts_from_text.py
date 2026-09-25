"""Turn each card's ability text into a small script the app's ability engine runs.

Only text the rules below fully understand is scripted. Anything else is
left for manual play (the +/- steppers), and listed in the coverage report,
so the engine never guesses at a card.
"""
import re

KW_SCRIPTS = {
    'Fury':           [{'trig': 'static', 'eff': {'kind': 'perCount', 'count': 'ownRetiredUnits', 'amount': 1}}],
    'Root Network':   [{'trig': 'static', 'eff': {'kind': 'perCount', 'count': 'ownLocations', 'amount': 1}}],
    'Overgrowth':     [{'trig': 'static', 'eff': {'kind': 'perCount', 'count': 'oppUnits', 'amount': 1}}],
    'Harbor Recruit': [{'trig': 'conflictStatic', 'eff': {'kind': 'ifCount', 'count': 'ownLocations', 'min': 1, 'amount': 1}}],
    'Warcry':         [{'trig': 'ownUnitPlayed', 'optional': True, 'eff': {'kind': 'counters', 'amount': 1, 'target': {'sel': 'each', 'side': 'own', 'row': 'Unit', 'otherThanSource': True}}}],
    'Onslaught':      [{'trig': 'enter', 'optional': True, 'cond': {'count': 'ownUnits', 'min': 3}, 'eff': {'kind': 'counters', 'amount': -2, 'target': {'sel': 'each', 'side': 'opp', 'row': 'Unit'}}}],
    'Consensus':      [{'trig': 'ownUnitRetired', 'optional': True, 'eff': {'kind': 'counters', 'amount': 1, 'target': {'sel': 'each', 'side': 'own', 'row': 'Unit', 'otherThanSource': True}}}],
    'Duty':           [{'trig': 'duty'}],
    'Bait':           [{'trig': 'bait'}],
    'High Stakes':    [{'trig': 'enter', 'eff': {'kind': 'highStakes'}}],
    'Scrap Value':    [{'trig': 'enter', 'optional': True, 'eff': {'kind': 'eraseFromPiles', 'max': 1, 'perCounter': 1}}],
    'Switch':         [{'trig': 'leavesPlay', 'optional': True, 'eff': {'kind': 'switchSearch'}}],
    'Root Bond':      [{'trig': 'unitStationedHere', 'eff': {'kind': 'counters', 'amount': 1, 'target': {'sel': 'self'}}}],
    'Acquisition':    [{'trig': 'ownDiscard', 'optional': True, 'eff': {'kind': 'draw', 'n': 1}}],
}
# Keywords the engine does not run yet (they stay manual).
KW_MANUAL = {'Flow', 'Ebb', 'Ebb 1', 'Ebb 2', 'Ebb 3', 'Reintegration', 'Salvage Rights', 'Loaded Odds',
             'Whisper Network', 'Blackmail', 'Contract'}

N = {'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3}
ROW = r'(Unit|Location)'

def target_from(phrase):
    """Map a target phrase from the approved convention to a target spec."""
    p = phrase.strip()
    m = re.fullmatch(r'target ' + ROW + r' you control', p)
    if m: return {'sel': 'target', 'side': 'own', 'row': m.group(1)}
    m = re.fullmatch(r'target ' + ROW + r' an opponent controls', p)
    if m: return {'sel': 'target', 'side': 'opp', 'row': m.group(1)}
    m = re.fullmatch(r'the opposing ' + ROW, p)
    if m: return {'sel': 'opposing', 'row': m.group(1)}
    m = re.fullmatch(r"each of your opponents' " + ROW + r's', p)
    if m: return {'sel': 'each', 'side': 'opp', 'row': m.group(1)}
    m = re.fullmatch(r"each opponent's " + ROW + r's', p)
    if m: return {'sel': 'each', 'side': 'opp', 'row': m.group(1)}
    m = re.fullmatch(r'each opposing ' + ROW, p)
    if m: return {'sel': 'eachOpposing', 'row': m.group(1)}
    m = re.fullmatch(r'each ' + ROW + r' you control', p)
    if m: return {'sel': 'each', 'side': 'own', 'row': m.group(1)}
    m = re.fullmatch(r'each of your ' + ROW + r's', p)
    if m: return {'sel': 'each', 'side': 'own', 'row': m.group(1)}
    m = re.fullmatch(r'this ' + ROW, p)
    if m: return {'sel': 'self'}
    return None

def parse_effect(s):
    """One effect sentence (no trigger prefix) -> effect spec, or None."""
    s = s.strip().rstrip('.')
    # Swing: +1 on your card, -N on its opposing card.
    m = re.fullmatch(r'Put a \+1 Power counter on target ' + ROW + r' you control and (a|two|three) -1 Power counters? on its opposing \1', s)
    if m: return {'kind': 'swing', 'row': m.group(1), 'plus': 1, 'minus': N[m.group(2)], 'conflict': False}
    m = re.fullmatch(r'During the next Conflict, target ' + ROW + r' you control gets \+1 Power and its opposing \1 gets -(\d) Power', s)
    if m: return {'kind': 'swing', 'row': m.group(1), 'plus': 1, 'minus': int(m.group(2)), 'conflict': True}
    # Counters on a target or group.
    m = re.fullmatch(r'Put (a|two|three) ([+-])1 Power counters? on (.+?)(?: with (\d) or less Power)?', s)
    if m:
        t = target_from(m.group(3))
        if t:
            if m.group(4): t['maxPower'] = int(m.group(4))
            return {'kind': 'counters', 'amount': N[m.group(1)] * (1 if m.group(2) == '+' else -1), 'target': t}
    # "During the next Conflict, X gets +N Power."
    m = re.fullmatch(r'During the next Conflict, (.+?) gets? ([+-]\d) Power', s)
    if m:
        t = target_from(m.group(1))
        if t: return {'kind': 'conflictBonus', 'amount': int(m.group(2)), 'target': t}
    # "(you may have) X get(s) -N Power" / "X gets +N Power" — a lasting change, tracked as counters.
    m = re.fullmatch(r'(?:have )?(.+?) gets? ([+-]\d) Power', s)
    if m:
        t = target_from(m.group(1)[0].lower() + m.group(1)[1:] if m.group(1).startswith(('Target', 'Each', 'The')) else m.group(1))
        if t: return {'kind': 'counters', 'amount': int(m.group(2)), 'target': t}
    m = re.fullmatch(r'[Dd]raw (a|two|three) cards?', s)
    if m: return {'kind': 'draw', 'n': N[m.group(1)]}
    m = re.fullmatch(r'look at the top (\d|two) cards of your deck; put one in your hand and the other on the bottom', s, re.I)
    if m: return {'kind': 'lookTop', 'n': 2, 'toHand': 1, 'rest': 'bottom'}
    m = re.fullmatch(r'look at the top (2|two) cards of your deck; put one in your hand', s, re.I)
    if m: return {'kind': 'lookTop', 'n': 2, 'toHand': 1, 'rest': 'top'}
    m = re.fullmatch(r'look at the top card of your deck; you may put it on the bottom', s, re.I)
    if m: return {'kind': 'scry', 'n': 1}
    m = re.fullmatch(r'look at the top card of your deck', s, re.I)
    if m: return {'kind': 'peek', 'n': 1}
    m = re.fullmatch(r'Prevent the next (\d) Power loss target Unit you control would take this turn', s)
    if m: return {'kind': 'shield', 'amount': int(m.group(1)), 'target': {'sel': 'target', 'side': 'own', 'row': 'Unit'}}
    m = re.fullmatch(r'return target Unit you control to your hand', s, re.I)
    if m: return {'kind': 'returnToHand', 'target': {'sel': 'target', 'side': 'own', 'row': 'Unit', 'otherThanSource': True}}
    m = re.fullmatch(r'Return target Unit from your Retirement Pile to your hand', s)
    if m: return {'kind': 'pileToHand', 'filter': 'Unit', 'max': 1}
    m = re.fullmatch(r'have this (?:Unit|Location) gain \+(\d) Power', s)
    if m: return {'kind': 'counters', 'amount': int(m.group(1)), 'target': {'sel': 'self'}}
    m = re.fullmatch(r'Put an? ([+-])1 Power counter on (.+?) for (each|every 2) (Units? in your Retirement Pile|Location you control)', s)
    if m:
        t = target_from(m.group(2))
        cnt = 'ownRetiredUnits' if 'Retirement' in m.group(4) else 'ownLocations'
        if t: return {'kind': 'counters', 'amount': 1 if m.group(1) == '+' else -1, 'target': t,
                      'perCount': cnt, 'div': 2 if m.group(3) == 'every 2' else 1}
    m = re.fullmatch(r'put a \+1 Power counter on it for each card in your hand', s, re.I)
    if m: return {'kind': 'counters', 'amount': 1, 'target': {'sel': 'self'}, 'perCount': 'handSize', 'div': 1}
    m = re.fullmatch(r'Discard a card, then draw a card', s)
    if m: return {'kind': 'discardThenDraw'}
    return None

COUNTS = {
    'card in all Retirement Piles combined': 'allRetired', 'opposing Location in play': 'opposingLocations',
    'Location you control': 'ownLocations', 'Unit you control': 'ownUnits', 'other Unit you control': 'ownOtherUnits',
    'Unit in your Retirement Pile': 'ownRetiredUnits', "of your opponents' Units": 'oppUnits',
    'Unit your opponents control': 'oppUnits',
}

def parse_sentence(s):
    """A full ability sentence -> ability spec, or None."""
    s = s.strip()
    optional = False
    # Continuous statics.
    m = re.fullmatch(r'This (?:Unit|Location) gets \+1 Power for each (.+?)(?:, to a maximum of \+(\d))?\.', s)
    if m and m.group(1) in COUNTS:
        e = {'kind': 'perCount', 'count': COUNTS[m.group(1)], 'amount': 1}
        if m.group(2): e['max'] = int(m.group(2))
        return {'trig': 'static', 'eff': e}
    if re.fullmatch(r"This Unit's Power cannot be reduced below 1\.", s):
        return {'trig': 'static', 'eff': {'kind': 'floor', 'min': 1}}
    if re.fullmatch(r"This Unit cannot be the target of your opponents' abilities that reduce its Power\.", s):
        return {'trig': 'protect'}
    if re.fullmatch(r'This Unit cannot be played the turn you draw it\.', s):
        return {'trig': 'playReq', 'req': 'notDrawnThisTurn'}
    if re.fullmatch(r'This Unit cannot be played unless you control a Location\.', s):
        return {'trig': 'playReq', 'req': 'controlLocation'}
    m = re.fullmatch(r'This Unit cannot be played unless your Retirement Pile has (\d) or more cards\.', s)
    if m: return {'trig': 'playReq', 'req': 'minRetired', 'n': int(m.group(1))}
    m = re.fullmatch(r'At the start of your turn, if you control (\d) or fewer (Units|Locations), (.+)$', s)
    if m:
        eff = parse_effect(m.group(3)[0].upper() + m.group(3)[1:])
        if eff: return {'trig': 'turnStart', 'cond': {'count': 'ownUnits' if m.group(2) == 'Units' else 'ownLocations', 'max': int(m.group(1))}, 'eff': eff}
    m = re.fullmatch(r'At the start of your turn, if you have no cards in hand, draw a card\.', s)
    if m: return {'trig': 'turnStart', 'cond': {'count': 'handSize', 'max': 0}, 'eff': {'kind': 'draw', 'n': 1}}
    m = re.fullmatch(r'When this Unit is Retired, you may draw a card\.', s)
    if m: return {'trig': 'retiredSelf', 'optional': True, 'eff': {'kind': 'draw', 'n': 1}}
    m = re.fullmatch(r'Target Location you control gets \+(\d) Power when this Unit enters play\.', s)
    if m: return {'trig': 'enter', 'eff': {'kind': 'counters', 'amount': int(m.group(1)), 'target': {'sel': 'target', 'side': 'own', 'row': 'Location'}}}
    m = re.fullmatch(r'Reveal the top card of your deck\. If it is a Unit, target Unit you control gets \+(\d) Power\. If it is not, that Unit instead gets -(\d) Power\.', s)
    if m: return {'trig': 'play', 'eff': {'kind': 'revealGamble', 'plus': int(m.group(1)), 'minus': int(m.group(2)), 'target': {'sel': 'target', 'side': 'own', 'row': 'Unit'}}}
    m = re.fullmatch(r'During Conflict, this Unit gets \+1 Power if you control a Location\.', s)
    if m: return {'trig': 'conflictStatic', 'eff': {'kind': 'ifCount', 'count': 'ownLocations', 'min': 1, 'amount': 1}}
    # Self-growth when your Units are Retired.
    m = re.fullmatch(r'Whenever (another|a) Unit you control is Retired, you may put a \+1 Power counter on this (?:Unit|Location)\.( This triggers only once per turn\.)?', s)
    if m:
        return {'trig': 'ownUnitRetired', 'optional': True, 'oncePerTurn': bool(m.group(2)),
                'eff': {'kind': 'counters', 'amount': 1, 'target': {'sel': 'self'}}}
    m = re.fullmatch(r'Whenever the opposing Unit is Retired, put (a|two|three) \+1 Power counters? on this Unit\.', s)
    if m:
        return {'trig': 'opposingUnitRetired', 'eff': {'kind': 'counters', 'amount': N[m.group(1)], 'target': {'sel': 'self'}}}
    # Triggered on entering play.
    trig = 'play'
    m = re.match(r'When (?:this Unit|[^,]+?) enters play, (.+)$', s)
    if m: trig, s = 'enter', m.group(1)
    m = re.match(r'Whenever you play a (Unit|Location), (.+)$', s)
    if m: trig, s = ('ownUnitPlayed' if m.group(1) == 'Unit' else 'ownLocationPlayed'), m.group(2)
    cond = None
    m = re.match(r'If you control (\d) or more (Units|Locations), (.+)$', s)
    if m:
        cond = {'count': 'ownUnits' if m.group(2) == 'Units' else 'ownLocations', 'min': int(m.group(1))}
        s = m.group(3)[0].upper() + m.group(3)[1:]
    if s.startswith('you may '):
        optional, s = True, s[len('you may '):]
    eff = parse_effect(s)
    if not eff: return None
    out = {'trig': trig, 'optional': optional, 'eff': eff}
    if cond: out['cond'] = cond
    return out

def split_keywords(text):
    """'Warcry, Onslaught. Body' -> (['Warcry','Onslaught'], 'Body'); reminder text is dropped."""
    known = set(KW_SCRIPTS) | KW_MANUAL
    m = re.match(r'^((?:[A-Z][A-Za-z ]+?\d?)(?:, [A-Z][A-Za-z ]+?\d?)*)(?:\.\s*|\s*\(|\s*$)(.*)$', text)
    if not m: return [], text
    kws = [k.strip() for k in m.group(1).split(',')]
    if not all(k in known for k in kws): return [], text
    body = m.group(2)
    if text[len(m.group(1)):].lstrip().startswith('('):  # reminder text only
        body = ''
    return kws, body.strip()

def script_card(card):
    """-> (abilities, status, manual_notes). status: auto | partial | manual | none."""
    text = card['ability'].strip()
    if not text: return [], 'none', []
    kws, body = split_keywords(text)
    abilities, manual = [], []
    for k in kws:
        if k in KW_SCRIPTS: abilities += [dict(a, source=k) for a in KW_SCRIPTS[k]]
        else: manual.append(k)
    if body:
        whole = parse_sentence(body)
        sentences = [body] if whole else [x for x in re.split(r'(?<=\.)\s+', body) if x]
        parsed = [whole] if whole else [parse_sentence(x) for x in sentences]
        if all(parsed):
            abilities += [dict(p, source='text') for p in parsed]
        else:
            manual.append(body)
    if card['type'] == 'Event':
        abilities = [a for a in abilities if a['trig'] in ('play',)] + [a for a in abilities if a['trig'] != 'play']
    status = 'auto' if abilities and not manual else 'partial' if abilities else 'manual'
    return abilities, status, manual
