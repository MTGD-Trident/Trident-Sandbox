# trident-art-generation

Notes for the Trident card art pass. Read this first when resuming.

## Pipeline

- **Tool:** Higgsfield (claude.ai Higgsfield connector), `generate_image_batch` / `jobs_wait`.
- **Model:** `z_image`, `aspect_ratio: "4:3"` (comes out 2048x1536 PNG), count 1 per card.
- **Cost:** about 0.15 credits per image (Starter plan).
- **Rate limit:** batches of ~10 get one or two `429 rate_limit_reached` items; resubmit those in the next batch.
- **Output:** images live in the Higgsfield generation history (account CDN
  `d8j0ntlcm91z4.cloudfront.net`). `art/art_manifest.csv` maps card number -> Higgsfield job id
  for everything generated from the cloud session onward. The cloud container cannot reach
  that CDN, so images are not downloaded into the repo or embedded in `www/index.html` yet.
  (Only 4 cards are embedded in the `ART` map in `www/index.html` today; those came from an
  earlier, separate pass.)

## Prompt template

Built by `art/build_prompts.py` from `CARDS` in `www/index.html` (subtype + flavor text):

    <Subject> [<flavor text>] Setting: <faction setting>. <framing by card type> <style block>

- Subject: Unit -> `A <Subtype>.`; Event -> `A dramatic moment (<Subtype>).`;
  Location -> `A <subtype lowercased>.` Card names are not used (keeps text out of images).
- Framing: Unit = waist-up three-quarter character portrait; Event = single dramatic moment
  mid-action; Location = wide establishing shot, no characters.
- Style block (fixed): stylized digital fantasy illustration, clean bold shapes, dramatic
  lighting, painterly but graphic; single clear focal subject that reads small; no text, logos,
  watermarks or UI; 4:3.
- Faction settings are in `SETTINGS` in `art/build_prompts.py`.
  **HollowCourt, WagerBound and Factionless have no setting yet** -> those 178 cards are
  blocked until a setting line is written for each (match the style of the existing ones).

## Workflow

    python art/build_prompts.py          # rebuild art/prompt_queue.json from the CSVs
    python art/record.py --next 10       # print the next batch request JSON
    # submit with generate_image_batch, wait with jobs_wait, then:
    python art/record.py 186=<job_id> 187=<job_id> ...

`art/cards_needing_art.csv` is the full list (771 cards). `art/art_completed.csv` is the
running done list (the first 123 rows are from the earlier local session).

## Status (updated 2026-10-27, cloud session)

- **592 / 771 cards have art.** 123 from the earlier local session + 469 generated this session
  (all in `art/art_manifest.csv` with Higgsfield job ids). ~73 credits spent; 177.9 left.
- Done factions: DisciplesOfTheCelestia (the 33 on the list), AshenLegion, UndertowCourt
  (except 162), DriftConcordat, NullChoir, MeridianCombine, VerdantConcord, Kayfabe.

### What's next

1. **Card 162, Harbormaster Vashti** (UndertowCourt): every job sits in `queued` for minutes and
   then fails - happened in the earlier session and twice here. Listed in `STUCK` in
   `art/record.py`. Try rewording the flavor clause (maybe "swallowed" trips a filter) or
   another model, then remove it from `STUCK`.
2. **Write setting lines for HollowCourt, WagerBound and Factionless** (178 cards: 79 + 79 + 20)
   and add them to `SETTINGS` in `art/build_prompts.py`, then rerun `build_prompts.py` and continue
   the loop. These need the user's lore input - no setting was ever established for them.
3. **Get the images into the game.** Images only exist on Higgsfield. Download them on a machine
   that can reach the CDN (look each job id up with Higgsfield `show_generation_by_ids` or the web
   gallery), resize to the card art box (~500x373 JPEG like the 4 already embedded), and add them
   to the `ART` map in `www/index.html` keyed by card name.
4. Cards 001, 003, 005, 074 were not on the needing-art list (001/005 already have art in
   `ART`); check whether 003 and 074 need art.

### Prompt quirks kept for consistency
Subjects come straight from the subtype, so some read oddly ("A Augmented Human Analyst",
"A Human Engineers", "A docks"). The earlier session did the same ("a Ancient Fae"), so this was
left alone; fix it in `subject()` if it matters.
