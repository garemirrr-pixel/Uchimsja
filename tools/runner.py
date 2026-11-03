"""Isolated snippet runner used by build.py.

Reads JSON {"code": str, "inputs": [str]} from stdin, executes the code with a
mocked input() (prompts are NOT echoed, exactly like the in-browser runner) and
prints JSON {"out": str, "err": str | None} to stdout.
"""
import builtins
import io
import json
import sys


def main():
    req = json.loads(sys.stdin.read())
    inputs = iter(req.get("inputs") or [])

    def fake_input(prompt=""):
        try:
            return next(inputs)
        except StopIteration:
            raise EOFError("no more input") from None

    buf = io.StringIO()
    real_stdout = sys.stdout
    err = None
    g = {"__name__": "__main__", "__builtins__": builtins, "input": fake_input}
    try:
        code = compile(req["code"], "<code>", "exec")
        sys.stdout = buf
        exec(code, g)
    except SystemExit:
        pass
    except BaseException as e:  # noqa: BLE001
        err = type(e).__name__
    finally:
        sys.stdout = real_stdout
    real_stdout.write(json.dumps({"out": buf.getvalue(), "err": err}))


main()
