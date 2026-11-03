/* Python runner: Pyodide inside a Web Worker (so infinite loops can be killed). */
(function () {
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

  const HELPER = `
import sys, io, traceback, linecache

def __run(code, inputs, echo):
    it = iter(list(inputs))
    out = io.StringIO()
    def fake_input(prompt=""):
        try:
            v = next(it)
        except StopIteration:
            raise EOFError("input(): входные данные закончились") from None
        if echo:
            out.write(str(prompt) + v + "\\n")
        return v
    linecache.cache["main.py"] = (len(code), None, code.splitlines(True), "main.py")
    g = {"__name__": "__main__", "input": fake_input}
    old = sys.stdout
    sys.stdout = out
    err = None
    tb = None
    try:
        exec(compile(code, "main.py", "exec"), g)
    except SystemExit:
        pass
    except BaseException as e:
        err = type(e).__name__
        if isinstance(e, SyntaxError):
            tb = "".join(traceback.format_exception_only(type(e), e))
        else:
            frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "main.py"]
            tb = ("Traceback (most recent call last):\\n" + "".join(traceback.format_list(frames))
                  + "".join(traceback.format_exception_only(type(e), e)))
    finally:
        sys.stdout = old
    s = out.getvalue()
    if len(s) > 20000:
        s = s[:20000] + "\\n… (вывод обрезан)"
    return [s, err, tb]
`;

  const WORKER_SRC = `
importScripts(${JSON.stringify(PYODIDE + "pyodide.js")});
let py = null;
const ready = loadPyodide({ indexURL: ${JSON.stringify(PYODIDE)} }).then(p => {
  py = p;
  py.runPython(${JSON.stringify(HELPER)});
  postMessage({ type: "ready" });
}).catch(e => postMessage({ type: "fail", msg: String(e) }));
onmessage = async (e) => {
  await ready;
  if (!py) return;
  const { id, code, inputs, echo } = e.data;
  try {
    const fn = py.globals.get("__run");
    const res = fn(code, py.toPy(inputs || []), !!echo);
    const arr = res.toJs();
    res.destroy(); fn.destroy();
    postMessage({ type: "result", id, out: arr[0], err: arr[1], tb: arr[2] });
  } catch (err) {
    postMessage({ type: "result", id, out: "", err: "InternalError", tb: String(err) });
  }
};
`;

  const listeners = new Set();
  let worker = null;
  let status = "idle"; // idle | loading | ready | fail
  let seq = 0;
  const pending = new Map();
  let readyResolvers = [];

  function setStatus(s) {
    status = s;
    listeners.forEach(fn => fn(s));
    if (s === "ready") { readyResolvers.forEach(r => r(true)); readyResolvers = []; }
    if (s === "fail") { readyResolvers.forEach(r => r(false)); readyResolvers = []; }
  }

  function spawn() {
    try {
      const blob = new Blob([WORKER_SRC], { type: "text/javascript" });
      worker = new Worker(URL.createObjectURL(blob));
    } catch (e) {
      setStatus("fail");
      return;
    }
    setStatus("loading");
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "ready") setStatus("ready");
      else if (m.type === "fail") setStatus("fail");
      else if (m.type === "result") {
        const p = pending.get(m.id);
        if (p) { clearTimeout(p.timer); pending.delete(m.id); p.resolve(m); }
      }
    };
    worker.onerror = () => setStatus("fail");
  }

  function load() {
    if (!worker || status === "fail") spawn();
    return whenReady();
  }

  function whenReady() {
    if (status === "ready") return Promise.resolve(true);
    if (status === "fail") return Promise.resolve(false);
    return new Promise(r => readyResolvers.push(r));
  }

  async function run(code, inputs = [], { timeout = 4000, echo = false } = {}) {
    const ok = await load();
    if (!ok) return { out: "", err: "LoadError", tb: "Не удалось загрузить Python. Проверь подключение к интернету и обнови страницу." };
    const id = ++seq;
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        pending.delete(id);
        worker.terminate();
        worker = null;
        spawn(); // restart in background
        resolve({ out: "", err: "Timeout", tb: `Программа работала дольше ${timeout / 1000} с и была остановлена.\nВозможно, бесконечный цикл или input() ждёт больше данных.` });
      }, timeout);
      pending.set(id, { resolve, timer });
      worker.postMessage({ id, code, inputs, echo });
    });
  }

  function norm(s) {
    return String(s).replace(/\r/g, "").replace(/\n+$/, "").split("\n").map(l => l.replace(/\s+$/, "")).join("\n");
  }

  window.PY = {
    load, run, norm,
    get status() { return status; },
    onStatus(fn) { listeners.add(fn); fn(status); },
  };
})();
