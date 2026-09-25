"""Refresh the app's card data and ability scripts from the master CSV.

Usage (from the project folder):
    python tools/refresh_cards.py path/to/Trident_Master.csv

Rewrites the CARDS, SCRIPTS and SCRIPT_STATUS lines in www/index.html and
writes tools/Ability_Coverage.csv. Then run build_apk.bat as usual.
"""
import csv, json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cards_from_csv import load
from scripts_from_text import script_card

def main(csv_path, html_path='www/index.html'):
    cards = load(csv_path)
    scripts, status, rows = {}, {}, []
    for c in cards:
        a, s, m = script_card(c)
        if a: scripts[c['id']] = a
        status[c['id']] = s
        rows.append([c['id'], c['name'], c['faction'], c['type'], c['rarity'], s,
                     '; '.join(sorted({x.get('source', '') for x in a})), ' | '.join(m)])
    html = open(html_path, encoding='utf-8').read()
    lines = html.split('\n')
    def swap(prefix, value):
        idx = [i for i, l in enumerate(lines) if l.startswith(prefix)]
        assert len(idx) == 1, 'could not find ' + prefix
        lines[idx[0]] = prefix + value + ';'
    swap('const CARDS = ', json.dumps(cards, ensure_ascii=False))
    swap('const SCRIPTS = ', json.dumps(scripts, separators=(',', ':')))
    swap('const SCRIPT_STATUS = ', json.dumps(status, separators=(',', ':')))
    open(html_path, 'w', encoding='utf-8').write('\n'.join(lines))
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Ability_Coverage.csv')
    with open(out, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(['Card #', 'Name', 'Faction', 'Type', 'Rarity', 'Status', 'Automated from', 'Still manual'])
        w.writerows(rows)
    counts = {k: list(status.values()).count(k) for k in ('auto', 'partial', 'manual', 'none')}
    print('Refreshed', len(cards), 'cards:', counts)

if __name__ == '__main__':
    main(sys.argv[1])
