"""Builds js/data.js from the content files in tools/content/.

Every snippet is actually executed (twice, with different hash seeds) so the
correct answers in the game are computed by real Python, never typed by hand:

* predict questions  -> correct output / exception name is computed
* type questions     -> type name is computed
* slice questions    -> target is computed from the reference slice
* parsons puzzles    -> expected outputs for the test inputs are computed
* code tasks         -> expected outputs for the tests come from the solution

Run:  python3 tools/build.py
"""
import json
import os
import re
import subprocess
import sys
import textwrap

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNNER = os.path.join(ROOT, "tools", "runner.py")
OUT = os.path.join(ROOT, "js", "data.js")

ERRORS = []


def run(code, inputs=None, seed="0"):
    env = dict(os.environ, PYTHONHASHSEED=seed)
    p = subprocess.run(
        [sys.executable, "-I", RUNNER],
        input=json.dumps({"code": code, "inputs": inputs or []}),
        capture_output=True, text=True, timeout=10, env=env,
    )
    if p.returncode != 0:
        raise RuntimeError(p.stderr)
    return json.loads(p.stdout)


def run_checked(code, inputs=None, where=""):
    a = run(code, inputs, "1")
    b = run(code, inputs, "2")
    if a != b:
        ERRORS.append(f"{where}: non-deterministic output\n{code}")
    return a


def norm(out):
    return "\n".join(line.rstrip() for line in out.rstrip("\n").split("\n"))


def dedent(code):
    return textwrap.dedent(code).strip("\n")


class Level:
    def __init__(self, unit, idx, title, icon, theory, boss=False):
        self.unit = unit
        self.id = f"{unit.id}l{idx}"
        self.title = title
        self.icon = icon
        self.theory = dedent(theory) if theory else ""
        self.boss = boss
        self.items = []

    def _id(self):
        return f"{self.id}q{len(self.items) + 1}"

    # --- predict the output ------------------------------------------------
    def p(self, code, distractors, ex, inputs=None, q=None):
        code = dedent(code)
        qid = self._id()
        r = run_checked(code, inputs, qid)
        if r["err"]:
            if r["out"].strip():
                ERRORS.append(f"{qid}: output AND error ({r['err']}) — avoid\n{code}")
            ans = r["err"]
        else:
            ans = norm(r["out"]) or "Ничего"
        ds = [norm(d) if not re.fullmatch(r"[A-Z]\w*(Error|Exception)", d) else d
              for d in distractors]
        if ans in ds:
            ERRORS.append(f"{qid}: distractor equals answer {ans!r}\n{code}")
        if len(set(ds)) != len(ds):
            ERRORS.append(f"{qid}: duplicate distractors {ds}")
        self.items.append({"id": qid, "t": "predict", "code": code, "inputs": inputs or [],
                           "a": ans, "opts": ds, "ex": ex, "q": q})

    # --- multiple choice (first option is correct) --------------------------
    def mc(self, q, opts, ex, code=None):
        qid = self._id()
        if len(set(opts)) != len(opts):
            ERRORS.append(f"{qid}: duplicate options")
        self.items.append({"id": qid, "t": "mc", "q": q, "code": dedent(code) if code else None,
                           "a": opts[0], "opts": opts[1:], "ex": ex})

    # --- what type is it? ---------------------------------------------------
    def ty(self, expr, ex):
        qid = self._id()
        r = run_checked(f"print(type({expr}).__name__)", None, qid)
        if r["err"]:
            ERRORS.append(f"{qid}: type expr failed {expr} {r['err']}")
            return
        self.items.append({"id": qid, "t": "type", "code": expr, "a": r["out"].strip(), "ex": ex})

    # --- slicing ------------------------------------------------------------
    def sl(self, setup, ref, ex, q=None):
        qid = self._id()
        name, seq_src = [s.strip() for s in setup.split("=", 1)]
        code = (f"{name} = {seq_src}\n"
                f"import json\n"
                f"print(json.dumps({{'str': isinstance({name}, str), "
                f"'seq': [repr(x) for x in {name}], "
                f"'res': [repr(x) for x in {name}[{ref}]], 'rr': repr({name}[{ref}])}}))")
        r = run_checked(code, None, qid)
        if r["err"]:
            ERRORS.append(f"{qid}: slice failed {setup} [{ref}] {r['err']}")
            return
        d = json.loads(r["out"])
        self.items.append({"id": qid, "t": "slice", "name": name, "isStr": d["str"],
                           "seq": d["seq"], "target": d["res"], "targetRepr": d["rr"],
                           "ref": ref, "ex": ex, "q": q})

    # --- parsons puzzle -----------------------------------------------------
    def pz(self, q, code, ex, distractors=(), tests=None):
        qid = self._id()
        code = dedent(code)
        lines = []
        for raw in code.split("\n"):
            stripped = raw.lstrip(" ")
            indent = (len(raw) - len(stripped)) // 4
            lines.append({"text": stripped, "indent": indent})
        tests = tests or [[]]
        expected = []
        for t in tests:
            r = run_checked(code, t, qid)
            if r["err"]:
                ERRORS.append(f"{qid}: parsons solution failed {r['err']}\n{code}")
            expected.append(norm(r["out"]))
        texts = [line["text"] for line in lines]
        for d in distractors:
            if d in texts:
                ERRORS.append(f"{qid}: distractor is also a real line: {d}")
        self.items.append({"id": qid, "t": "parsons", "q": q, "lines": lines,
                           "distractors": list(distractors), "tests": tests,
                           "expected": expected, "ex": ex})

    # --- coding task --------------------------------------------------------
    def code(self, title, desc, solution, tests, hint, starter="", diff=1, fmt=None):
        qid = self._id()
        solution = dedent(solution)
        cases = []
        for t in tests:
            r = run_checked(solution, t, qid)
            if r["err"]:
                ERRORS.append(f"{qid}: solution failed on {t}: {r['err']}\n{solution}")
            cases.append({"in": t, "out": norm(r["out"])})
        self.items.append({"id": qid, "t": "code", "title": title, "desc": dedent(desc),
                           "starter": dedent(starter) if starter else "",
                           "solution": solution, "tests": cases, "hint": hint,
                           "diff": diff})

    def to_json(self):
        return {"id": self.id, "title": self.title, "icon": self.icon,
                "theory": self.theory, "boss": self.boss, "items": self.items}


class Unit:
    def __init__(self, uid, title, subtitle, emoji, color):
        self.id = uid
        self.title = title
        self.subtitle = subtitle
        self.emoji = emoji
        self.color = color
        self.levels = []

    def level(self, title, icon, theory, boss=False):
        lv = Level(self, len(self.levels) + 1, title, icon, theory, boss)
        self.levels.append(lv)
        return lv

    def to_json(self):
        return {"id": self.id, "title": self.title, "subtitle": self.subtitle,
                "emoji": self.emoji, "color": self.color,
                "levels": [lv.to_json() for lv in self.levels]}


def main():
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    from content import unit1, unit2, unit3  # noqa: E402

    units = [unit1.build(Unit), unit2.build(Unit), unit3.build(Unit)]
    data = {"units": [u.to_json() for u in units]}

    counts = {}
    for u in data["units"]:
        for lv in u["levels"]:
            for it in lv["items"]:
                counts[it["t"]] = counts.get(it["t"], 0) + 1
    if ERRORS:
        print("\n\n".join(ERRORS))
        print(f"\n{len(ERRORS)} error(s)")
        sys.exit(1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build.py — do not edit by hand.\n")
        f.write("window.GAME_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("OK", counts, "total", sum(counts.values()))


if __name__ == "__main__":
    main()
