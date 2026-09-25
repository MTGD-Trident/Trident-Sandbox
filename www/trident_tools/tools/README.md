# Trident ability tools

These scripts keep the app's card data and ability automation in step with the master CSV.

## After the master CSV changes

    python tools/refresh_cards.py path\to\Trident_Master.csv
    build_apk.bat

`refresh_cards.py` rewrites the card data and ability scripts inside `www/index.html`
and writes `tools/Ability_Coverage.csv`, listing each card as automated, partly
automated, manual, or no ability.

## Checking the engine (optional, needs Node.js)

    node tools/test_engine.js

Runs the app's real code headlessly and checks the core rules: swing Events, Onslaught,
Fury, Duty, Zero-Power Retirement, next-Conflict bonuses, Bait, Scrap Value and Erase,
reshuffling, tiebreaks, play restrictions, Warcry, shields, and save/resume. It also plays
every scripted card once.

## Files

- `cards_from_csv.py` - reads the master CSV into the app's card format
- `scripts_from_text.py` - turns ability text into scripts; add new templates here
- `engine.js` - the ability engine (already inside index.html; kept for reference)
- `fx.js` - backgrounds, music, sound effects and the Settings panel (already inside index.html; kept for reference)
- `refresh_cards.py` - the one-step refresh above
- `harness.js`, `test_engine.js` - the test suite
