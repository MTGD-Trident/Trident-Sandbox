"""Build Higgsfield prompts for cards that still need art.

    python art/build_prompts.py            # writes art/prompt_queue.json

Reads art/cards_needing_art.csv, skips cards in art/art_completed.csv, pulls
subtype and flavor text from the CARDS list in www/index.html, and fills the
established prompt template (see art/trident-art-generation.md).
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))

SETTINGS = {
    "DisciplesOfTheCelestia": "a crystalline mountain monastery-fortress, Human paladins, Djinn, and stone Golems, elemental light given physical form, a palette of warm gold, temple white, and glowing elemental hues",
    "AshenLegion": "a scorched volcanic frontier, iron-skinned Kharund warriors and human mercenaries, war-camps and forges, active lava glow, soot and raw iron, a palette of ember orange, charcoal black, and molten red",
    "UndertowCourt": "a harbor city drowned beneath the waterline generations ago and still inhabited, Naga and Krakenkin mariners, kelp-wrapped towers and flooded plazas lit by refracted surface light, a palette of deep teal, aquamarine, and drowned-gold",
    "DriftConcordat": "a scavenged fleet of patched-together ships from a dozen erased timelines, displaced refugees and salvage-drones, mismatched genres and tech levels bolted into one hull, a palette of weathered metal, rust, and faded signal-light blue",
    "NullChoir": "a networked hive intelligence given architectural form, humanoid nodes wired into a standing lattice of light, concentric rings of processing power, a palette of cold cyan glow, deep black circuitry, and bone-white casing",
    "MeridianCombine": "a corporate data-tower that phased fully built into reality, augmented human employees and AI constructs in sterile uniform attire, trading floors and server-vaults, a palette of cold corporate blue, glass, and brushed steel",
    "VerdantConcord": "a living forest that relocates its own center, fae and beastfolk druids, root-halls and ley-shrines grown rather than built, a palette of deep moss green, bark brown, and bioluminescent undergrowth",
    "Kayfabe": "a trans-dimensional wrestling arena lit for a broadcast, contracted fighters of wildly mixed species in showman costuming, stage smoke and spotlight, a palette of hot stage-light magenta, gold, and arena shadow",
    # HollowCourt, WagerBound, Factionless: no setting established yet.
}

FRAMING = {
    "Unit": "Character portrait, three-quarter view, waist-up, the character as the clear single subject against a softly blurred backdrop of their faction's setting.",
    "Event": "A single dramatic moment caught mid-action, wider framing than a portrait, showing what is happening rather than just a portrait of someone.",
    "Location": "Wide establishing environment shot, no characters in frame, strong sense of place and scale.",
}

STYLE = ("Stylized digital fantasy illustration, clean bold shapes, dramatic lighting, painterly but graphic "
         "rather than photorealistic. Single clear focal subject, uncluttered composition that still reads at "
         "small size. No text, no lettering, no logos, no watermarks, no UI elements anywhere in the image. "
         "4:3 aspect ratio.")


def load_cards():
    s = open(os.path.join(HERE, "..", "www", "index.html"), encoding="utf-8").read()
    i = s.index("const CARDS = ") + len("const CARDS = ")
    cards, _ = json.JSONDecoder().raw_decode(s[i:])
    return {c["id"]: c for c in cards}


def subject(card):
    sub = card["subtype"].strip()
    if card["type"] == "Event":
        return "A dramatic moment (%s)." % sub
    if card["type"] == "Location":
        return "A %s." % sub.lower()
    return "A %s." % sub


def prompt(card):
    parts = [subject(card)]
    if card["flavor"].strip():
        parts.append(card["flavor"].strip())
    parts.append("Setting: %s." % SETTINGS[card["faction"]])
    parts.append(FRAMING[card["type"]])
    parts.append(STYLE)
    return " ".join(parts)


def main():
    cards = load_cards()
    done = {r["CardNumberValue"] for r in csv.DictReader(open(os.path.join(HERE, "art_completed.csv"), encoding="utf-8"))}
    queue, blocked = [], []
    for r in csv.DictReader(open(os.path.join(HERE, "cards_needing_art.csv"), encoding="utf-8")):
        cid = r["CardNumberValue"]
        if cid in done:
            continue
        card = cards[cid]
        if card["faction"] not in SETTINGS:
            blocked.append(cid)
            continue
        queue.append({"id": cid, "name": card["name"], "faction": card["faction"], "prompt": prompt(card)})
    json.dump(queue, open(os.path.join(HERE, "prompt_queue.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("%d queued, %d blocked on missing faction setting" % (len(queue), len(blocked)))


if __name__ == "__main__":
    main()
