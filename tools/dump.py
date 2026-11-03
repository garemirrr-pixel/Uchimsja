"""Print every predict/type answer next to its explanation for manual review."""
import json, sys
s = open("js/data.js", encoding="utf-8").read()
d = json.loads(s[s.index("{"):s.rindex(";")])
unit = sys.argv[1] if len(sys.argv) > 1 else None
for u in d["units"]:
    if unit and u["id"] != unit:
        continue
    for lv in u["levels"]:
        for it in lv["items"]:
            if it["t"] in ("predict", "type"):
                print(f'{it["id"]}: {it["a"]!r}  <- {it["ex"]}')
            elif it["t"] == "code":
                print(f'{it["id"]}: CODE {[c["out"][:40] for c in it["tests"]]}')
