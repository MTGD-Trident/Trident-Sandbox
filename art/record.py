"""Record finished Higgsfield jobs and print the next batch request.

    python art/record.py 162=<job_id> 168=<job_id> ...   # mark cards done
    python art/record.py --next 10                       # print next batch JSON

Done cards go to art/art_completed.csv and art/art_manifest.csv (card -> job id).
"""
import csv, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
COMPLETED = os.path.join(HERE, "art_completed.csv")
MANIFEST = os.path.join(HERE, "art_manifest.csv")


def done_ids():
    return {r["CardNumberValue"] for r in csv.DictReader(open(COMPLETED, encoding="utf-8"))}


def record(pairs):
    queue = {c["id"]: c for c in json.load(open(os.path.join(HERE, "prompt_queue.json"), encoding="utf-8"))}
    done = done_ids()
    new_manifest = not os.path.exists(MANIFEST)
    with open(COMPLETED, "a", newline="", encoding="utf-8") as fc, open(MANIFEST, "a", newline="", encoding="utf-8") as fm:
        wc, wm = csv.writer(fc), csv.writer(fm)
        if new_manifest:
            wm.writerow(["CardNumberValue", "CardNameText", "Faction", "Model", "HiggsfieldJobId"])
        for pair in pairs:
            cid, job = pair.split("=")
            cid = cid.zfill(3)
            if cid in done:
                continue
            c = queue[cid]
            wc.writerow([cid, c["name"], c["faction"]])
            wm.writerow([cid, c["name"], c["faction"], "z_image", job])
            done.add(cid)


def next_batch(n):
    done = done_ids()
    queue = [c for c in json.load(open(os.path.join(HERE, "prompt_queue.json"), encoding="utf-8")) if c["id"] not in done]
    print(json.dumps([{"index": int(c["id"]), "params": {"model": "z_image", "prompt": c["prompt"], "aspect_ratio": "4:3", "count": 1}}
                      for c in queue[:n]]))
    print("remaining:", len(queue), file=sys.stderr)


if __name__ == "__main__":
    if sys.argv[1] == "--next":
        next_batch(int(sys.argv[2]))
    else:
        record(sys.argv[1:])
