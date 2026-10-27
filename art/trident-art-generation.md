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

## Progress

See the status section at the bottom (updated each session).

## Status
