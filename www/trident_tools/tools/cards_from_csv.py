"""Build the app's CARDS list from Trident_Master.csv, in the app's existing format."""
import csv, json, re, sys
COLORS = {'DisciplesOfTheCelestia':'#3B4A8F','AshenLegion':'#8F3B2A','UndertowCourt':'#1D6E5E','DriftConcordat':'#5A5A5A',
 'NullChoir':'#4A2A6E','MeridianCombine':'#2A5A8F','VerdantConcord':'#3B7A2A','HollowCourt':'#2A2A3A','WagerBound':'#8F6A2A',
 'Kayfabe':'#8F2A5A','Factionless':'#4A4A4A'}
def norm_ability(t):
    t = t.replace('\r', '').strip()
    m = re.match(r'^\*\*([^*]+)\*\*\s*\n\s*(.+)$', t, re.S)
    if m:  # keyword line, then body: "Kw, Kw. body"
        kw = m.group(1).strip()
        if not kw.endswith('.'): kw += '.'
        t = kw + ' ' + m.group(2)
    t = t.replace('**', '')
    return re.sub(r'\s+', ' ', t).strip()
def load(path):
    rows = list(csv.DictReader(open(path, newline='', encoding='utf-8')))
    out = []
    for r in rows:
        if not r['CardNameText'].strip(): continue
        frame = r['CardFrameImage']
        typ = 'Location' if 'Location' in frame else 'Event' if 'Event' in frame else 'Unit'
        fac = re.sub(r'.*/|Watermark\.png', '', r['CardWatermarkImage']) or 'Factionless'
        out.append({'id': r['CardNumberValue'].strip(), 'name': r['CardNameText'].strip(), 'type': typ,
            'subtype': r['SubTypeText'].strip(), 'power': r['CardPowerValue'].strip(),
            'ability': norm_ability(r['CardAbilityText']), 'flavor': r['CardFlavorText'].strip(),
            'faction': fac, 'color': COLORS.get(fac, '#4A4A4A'),
            'rarity': r['RarityGemImage'].replace('RarityGem', '').replace('.png', '').strip(),
            'isUnique': r.get('IsUnique', '').strip().upper() in ('TRUE', 'YES', '1', 'Y')})
    return out
if __name__ == '__main__':
    print(json.dumps(load(sys.argv[1]), ensure_ascii=False)[:300])
