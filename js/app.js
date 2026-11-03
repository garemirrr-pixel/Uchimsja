/* Три острова Python — game logic and views. */
(function () {
  "use strict";
  const D = window.GAME_DATA;
  const { esc, md, codeBlock, hl } = window.HL;
  const app = document.getElementById("app");

  // ------------------------------------------------------------ index
  const LEVELS = {};
  const ITEMS = {};
  const ORDER = [];
  D.units.forEach((u, ui) => {
    u.index = ui;
    u.levels.forEach((lv, li) => {
      lv.unit = u; lv.index = li;
      LEVELS[lv.id] = lv; ORDER.push(lv);
      lv.items.forEach(it => { it.level = lv; ITEMS[it.id] = it; });
    });
  });
  const ALL_ITEMS = Object.values(ITEMS);
  const CODE_TASKS = ALL_ITEMS.filter(it => it.t === "code");

  // ------------------------------------------------------------ state
  const KEY = "tri-ostrova.v1";
  const defaults = () => ({ xp: 0, levels: {}, solved: {}, drafts: {}, mistakes: {}, sound: true,
    streak: { day: null, count: 0 }, answered: 0, correct: 0, exam: null });
  let S;
  try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { S = defaults(); }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage off */ } }, 150);
  }

  const RANKS = [[0, "Новичок"], [120, "Ученик"], [350, "Кодер"], [700, "Питонист"], [1200, "Мастер циклов"],
    [2000, "Повелитель структур"], [3200, "Легенда интерпретатора"], [5000, "Сам себе CPython"]];
  function rankOf(xp) {
    let i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
    const from = RANKS[i][0];
    const to = RANKS[i + 1] ? RANKS[i + 1][0] : from + 2000;
    return { i, name: RANKS[i][1], from, to };
  }

  // ------------------------------------------------------------ utils
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function sample(a, n) { return shuffle(a).slice(0, n); }
  function today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
  function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
  const isErr = s => /^[A-Z]\w*(Error|Exception)$/.test(s);
  const KIND = { predict: "Что выведет?", mc: "Вопрос", type: "Какой тип?", slice: "Тир срезов", parsons: "Собери программу", code: "Задача" };

  function fmtOut(s) {
    if (isErr(s)) return `<span class="err-chip"><span class="err-x">✕</span>${esc(s)}</span>`;
    if (s === "Ничего") return `<span class="nothing">∅ ничего не выведет</span>`;
    return `<pre class="out">${esc(s)}</pre>`;
  }

  // per-view resources to clean up
  let disposers = [];
  function onDispose(fn) { disposers.push(fn); }
  function every(ms, fn) { const t = setInterval(fn, ms); onDispose(() => clearInterval(t)); return t; }
  function later(ms, fn) { const t = setTimeout(fn, ms); onDispose(() => clearTimeout(t)); return t; }
  function onKey(fn) { document.addEventListener("keydown", fn); onDispose(() => document.removeEventListener("keydown", fn)); }

  // ------------------------------------------------------------ HUD
  const xpNum = $("#xp-num"), xpFill = $("#xp-fill"), xpRank = $("#xp-rank");
  function updateHud() {
    const r = rankOf(S.xp);
    xpRank.textContent = r.name;
    xpNum.textContent = `${S.xp} XP`;
    xpFill.style.width = Math.min(100, ((S.xp - r.from) / (r.to - r.from)) * 100) + "%";
    const n = dueMistakes().length;
    const b = $("#mistake-badge");
    b.hidden = n === 0;
    b.textContent = n > 99 ? "99+" : n;
  }
  function addXP(n) {
    const before = rankOf(S.xp).i;
    S.xp += n;
    const after = rankOf(S.xp);
    updateHud();
    const chip = $("#xp-chip");
    chip.classList.remove("bump"); void chip.offsetWidth; chip.classList.add("bump");
    if (after.i > before) {
      later(500, () => {
        FX.play("level");
        FX.confetti(90);
        toast(`<b>Новый ранг!</b> Теперь ты — «${esc(after.name)}»`, "gold");
      });
    }
    save();
  }
  function touchStreak() {
    const t = today();
    if (S.streak.day === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yd = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
    S.streak.count = S.streak.day === yd ? S.streak.count + 1 : 1;
    S.streak.day = t;
  }
  function toast(html, kind = "") {
    const el = h(`<div class="toast ${kind}">${html}</div>`);
    $("#toasts").appendChild(el);
    setTimeout(() => el.classList.add("out"), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  const soundBtn = $("#sound-btn");
  function syncSound() { FX.setSound(S.sound); soundBtn.textContent = S.sound ? "🔊" : "🔇"; soundBtn.setAttribute("aria-label", S.sound ? "Выключить звук" : "Включить звук"); }
  soundBtn.addEventListener("click", () => { S.sound = !S.sound; syncSound(); save(); FX.play("click"); });
  syncSound();

  PY.onStatus(s => {
    const pill = $("#py-pill");
    pill.dataset.state = s;
    pill.querySelector("span").textContent = { idle: "Python", loading: "Python…", ready: "Python ✓", fail: "Python ✕" }[s];
    pill.title = { idle: "Интерпретатор загрузится, когда понадобится", loading: "Загружаю Python в браузер…", ready: "Python 3.12 работает в браузере", fail: "Не удалось загрузить Python — нужен интернет" }[s];
  });

  // ------------------------------------------------------------ mistakes
  function recordMistake(id) { S.mistakes[id] = { n: 0, t: Date.now() }; }
  function recordFix(id) {
    const m = S.mistakes[id];
    if (!m) return;
    m.n += 1;
    if (m.n >= 2) delete S.mistakes[id];
  }
  function dueMistakes() { return Object.keys(S.mistakes).filter(id => ITEMS[id]); }

  // ------------------------------------------------------------ progress helpers
  function levelStars(id) { return (S.levels[id] && S.levels[id].stars) || 0; }
  function nextLevel() { return ORDER.find(lv => !levelStars(lv.id)) || null; }
  function unitProgress(u) {
    const total = u.levels.length * 3;
    const got = u.levels.reduce((s, lv) => s + levelStars(lv.id), 0);
    return got / total;
  }
  function starsHtml(n, max = 3) {
    let s = "";
    for (let i = 0; i < max; i++) s += `<span class="${i < n ? "on" : ""}">★</span>`;
    return `<span class="stars">${s}</span>`;
  }

  // ============================================================ ROUTER
  function route() {
    disposers.forEach(fn => { try { fn(); } catch (e) { /* ignore */ } });
    disposers = [];
    const hash = location.hash.slice(1) || "map";
    let nav = hash.split("-")[0];
    if (nav === "level" || nav === "play") nav = "map";
    if (nav === "task") nav = "arena";
    $$(".nav a").forEach(a => a.classList.toggle("active", a.dataset.nav === nav));
    app.className = "";
    window.scrollTo(0, 0);
    if (hash === "map") viewMap();
    else if (hash.startsWith("level-") && LEVELS[hash.slice(6)]) viewTheory(LEVELS[hash.slice(6)]);
    else if (hash.startsWith("play-") && LEVELS[hash.slice(5)]) startSession({ mode: LEVELS[hash.slice(5)].boss ? "boss" : "level", level: LEVELS[hash.slice(5)] });
    else if (hash === "arena") viewArena();
    else if (hash.startsWith("task-") && ITEMS[hash.slice(5)]) viewTask(ITEMS[hash.slice(5)]);
    else if (hash === "review") viewReview();
    else if (hash === "review-go") startSession({ mode: "review" });
    else if (hash === "exam") viewExam();
    else if (hash === "exam-go") startSession({ mode: "exam" });
    else if (hash === "sandbox") viewSandbox();
    else viewMap();
    updateHud();
  }
  window.addEventListener("hashchange", route);

  // ============================================================ MAP
  const REPL_LINES = [
    ["-7 // 2", "-4"], ['bool("False")', "True"], ['int("3.7")', "ValueError: invalid literal for int() with base 10: '3.7'"],
    ['"100" > "20"', "False"], ["[1, 2, 3][::-1]", "[3, 2, 1]"], ["{1, True, 1.0}", "{1}"], ["(42)", "42"],
    ["0.1 + 0.2", "0.30000000000000004"], ['"" or "default"', "'default'"], ["a, *rest = [1, 2, 3]; rest", "[2, 3]"],
    ["round(2.5)", "2"], ['"5" + 5', "TypeError: can only concatenate str (not \"int\") to str"], ["type({})", "<class 'dict'>"],
    ["2 ** 3 ** 2", "512"], ["[3, 1, 2].sort()", ""], ["-7 % 3", "2"],
  ];

  function viewMap() {
    const nx = nextLevel();
    const totalStars = ORDER.reduce((s, lv) => s + levelStars(lv.id), 0);
    const doneLv = ORDER.filter(lv => levelStars(lv.id)).length;
    const solved = CODE_TASKS.filter(t => S.solved[t.id]).length;
    app.className = "view-map";
    app.innerHTML = `
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">Programming in Python I · Unit 1–3</p>
          <h1 class="hero-title"><span>Интерпретатор</span> <span class="accent">— это ты</span></h1>
          <p class="lead">Читай код и предсказывай вывод, лови ошибки раньше Python, режь списки срезами и пиши программы, которые проходят тесты. Пройди три острова — и задания курса станут простыми.</p>
          <div class="hero-cta">
            ${nx ? `<a class="btn primary big" href="#level-${nx.id}">${doneLv ? "Продолжить" : "Начать"}: ${esc(nx.title)} <span class="arr">→</span></a>`
              : `<a class="btn primary big" href="#exam">Все острова пройдены — на экзамен <span class="arr">→</span></a>`}
            <a class="btn ghost" href="#arena">Арена задач</a>
          </div>
          <dl class="stats">
            <div><dt>Уровни</dt><dd><b data-count="${doneLv}">0</b>/${ORDER.length}</dd></div>
            <div><dt>Звёзды</dt><dd><b data-count="${totalStars}">0</b>/${ORDER.length * 3}</dd></div>
            <div><dt>Задачи</dt><dd><b data-count="${solved}">0</b>/${CODE_TASKS.length}</dd></div>
            <div><dt>Серия</dt><dd><b data-count="${S.streak.count}">0</b> ${plural(S.streak.count, "день", "дня", "дней")}</dd></div>
          </dl>
        </div>
        <div class="repl" aria-hidden="true">
          <div class="repl-bar"><i></i><i></i><i></i><span>python3</span></div>
          <div class="repl-body" id="repl"></div>
        </div>
      </section>
      ${D.units.map(u => islandHtml(u, nx)).join("")}
      <p class="foot">Прогресс хранится в этом браузере. Ответы во всех заданиях вычислены настоящим Python.</p>`;
    $$("[data-count]").forEach(el => FX.countUp(el, +el.dataset.count, 900));
    startRepl($("#repl"));
    requestAnimationFrame(drawPaths);
    const onResize = () => drawPaths();
    window.addEventListener("resize", onResize);
    onDispose(() => window.removeEventListener("resize", onResize));
    if (document.fonts) document.fonts.ready.then(() => { if (app.classList.contains("view-map")) drawPaths(); });
    // warm up Python quietly
    later(5000, () => { if (!(navigator.connection && navigator.connection.saveData)) PY.load(); });
  }

  const ZIG = [0, 1, 2, 1, 0, -1, -2, -1];
  function islandHtml(u, nx) {
    const p = unitProgress(u);
    const R = 26, C = 2 * Math.PI * R;
    return `
      <section class="island isl-${u.color}" style="--d:${u.index}">
        <header class="isl-head">
          <div class="isl-emoji" aria-hidden="true">${u.emoji}</div>
          <div class="isl-title">
            <p class="eyebrow">Unit ${u.index + 1}</p>
            <h2>${esc(u.title)}</h2>
            <p class="isl-sub">${esc(u.subtitle.replace(/^Unit \d · /, ""))}</p>
          </div>
          <div class="ring" title="${Math.round(p * 100)}% звёзд">
            <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${R}" class="ring-bg"/><circle cx="32" cy="32" r="${R}" class="ring-fg" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - p)}"/></svg>
            <span>${Math.round(p * 100)}%</span>
          </div>
        </header>
        <div class="path">
          <svg class="path-svg" aria-hidden="true"><path class="p-base"/><path class="p-done"/></svg>
          ${u.levels.map((lv, i) => {
            const st = levelStars(lv.id);
            const cls = [st ? "done" : "", nx && nx.id === lv.id ? "next" : "", lv.boss ? "boss" : ""].join(" ");
            return `<a class="node ${cls}" href="#level-${lv.id}" style="--x:${ZIG[i % ZIG.length]};--i:${i}">
              <span class="node-orb"><span class="node-icon">${lv.icon}</span>${nx && nx.id === lv.id ? '<span class="node-ping"></span>' : ""}</span>
              <span class="node-label">${esc(lv.title)}</span>
              ${starsHtml(st)}
            </a>`;
          }).join("")}
        </div>
      </section>`;
  }

  function drawPaths() {
    $$(".path").forEach(path => {
      const svg = path.querySelector("svg");
      const box = path.getBoundingClientRect();
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      svg.setAttribute("width", box.width); svg.setAttribute("height", box.height);
      const nodes = $$(".node", path);
      const pts = nodes.map(n => { const r = n.querySelector(".node-orb").getBoundingClientRect(); return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, done: n.classList.contains("done") }; });
      const seg = (a, b) => { const dy = (b.y - a.y) * 0.5; return ` C ${a.x} ${a.y + dy}, ${b.x} ${b.y - dy}, ${b.x} ${b.y}`; };
      let d = pts.length ? `M ${pts[0].x} ${pts[0].y}` : "";
      for (let i = 1; i < pts.length; i++) d += seg(pts[i - 1], pts[i]);
      let dd = "";
      let k = 0;
      while (k < pts.length && pts[k].done) k++;
      if (k > 1) { dd = `M ${pts[0].x} ${pts[0].y}`; for (let i = 1; i < k; i++) dd += seg(pts[i - 1], pts[i]); }
      svg.querySelector(".p-base").setAttribute("d", d);
      svg.querySelector(".p-done").setAttribute("d", dd);
    });
  }

  function startRepl(el) {
    const lines = shuffle(REPL_LINES);
    let li = 0;
    const MAX = 7;
    function addLine(cls, html) {
      const row = h(`<div class="repl-row ${cls}">${html}</div>`);
      el.appendChild(row);
      while (el.children.length > MAX * 2) el.firstElementChild.remove();
      return row;
    }
    function next() {
      const [code, out] = lines[li++ % lines.length];
      const row = addLine("in", `<span class="ps">&gt;&gt;&gt;</span> <span class="typed"></span><span class="caret"></span>`);
      const typed = row.querySelector(".typed");
      let i = 0;
      if (FX.reduced) { typed.innerHTML = hl(code); finish(); return; }
      const t = every(55 + Math.random() * 30, () => {
        i++;
        typed.innerHTML = hl(code.slice(0, i));
        if (i >= code.length) { clearInterval(t); later(380, finish); }
      });
      function finish() {
        row.querySelector(".caret").remove();
        if (out) addLine(/Error/.test(out) ? "err" : "out", esc(out));
        later(1400, next);
      }
    }
    later(500, next);
  }

  // ============================================================ THEORY
  function viewTheory(lv) {
    const u = lv.unit;
    const counts = {};
    lv.items.forEach(it => { counts[it.t] = (counts[it.t] || 0) + 1; });
    const st = levelStars(lv.id);
    const nItems = lv.items.length + (lv.boss ? 6 : 0);
    app.className = `view-theory isl-${u.color}`;
    app.innerHTML = `
      <article class="theory">
        <a class="back" href="#map">← Карта</a>
        <header class="th-head">
          <div class="th-icon" aria-hidden="true">${lv.icon}</div>
          <div>
            <p class="eyebrow">${esc(u.title)} · ${lv.boss ? "Босс" : "Уровень " + (lv.index + 1)}</p>
            <h1>${esc(lv.title)}</h1>
            <p class="th-meta">${nItems} ${plural(nItems, "задание", "задания", "заданий")} · ${Object.entries(counts).map(([k, v]) => `${KIND[k]} ×${v}`).join(" · ")}${st ? ` · лучший результат ${starsHtml(st)}` : ""}</p>
          </div>
        </header>
        <div class="th-body">${md(lv.theory)}</div>
        <footer class="th-foot">
          <a class="btn primary big" href="#play-${lv.id}">${lv.boss ? "В бой! ❤️❤️❤️" : "Начать тренировку"} <span class="arr">→</span></a>
          <span class="hint-key">или нажми <kbd>Enter</kbd></span>
        </footer>
      </article>`;
    onKey(e => { if (e.key === "Enter" && !e.target.closest("input,textarea")) location.hash = `play-${lv.id}`; });
  }

  // ============================================================ SESSION
  let sess = null;

  function startSession(cfg) {
    let items;
    if (cfg.mode === "level") items = cfg.level.items.slice();
    else if (cfg.mode === "boss") {
      const pool = cfg.level.unit.levels.filter(l => !l.boss).flatMap(l => l.items).filter(it => it.t !== "code" && it.t !== "parsons");
      const own = cfg.level.items;
      items = shuffle([...own.filter(i => i.t !== "code"), ...sample(pool, 6)]).concat(own.filter(i => i.t === "code"));
    } else if (cfg.mode === "review") {
      items = shuffle(dueMistakes().map(id => ITEMS[id])).slice(0, 15);
      if (!items.length) { location.hash = "review"; return; }
    } else if (cfg.mode === "exam") {
      const quick = ALL_ITEMS.filter(it => it.t !== "code" && it.t !== "parsons");
      const perUnit = D.units.map(u => quick.filter(it => it.level.unit === u));
      items = shuffle(perUnit.flatMap(p => sample(p, 6))).concat(sample(ALL_ITEMS.filter(it => it.t === "parsons"), 1), sample(CODE_TASKS, 2));
    }
    sess = { cfg, items, i: 0, correct: 0, combo: 0, maxCombo: 0, lives: cfg.mode === "boss" ? 3 : null, xp: 0, wrong: [], t0: Date.now() };
    if (items.some(it => it.t === "code" || it.t === "parsons")) PY.load();
    const backHref = cfg.level ? `#level-${cfg.level.id}` : cfg.mode === "review" ? "#review" : "#exam";
    const accent = cfg.level ? cfg.level.unit.color : "gold";
    app.className = `view-play isl-${accent}`;
    app.innerHTML = `
      <section class="play">
        <div class="play-top">
          <a class="icon-btn quit" href="${backHref}" aria-label="Выйти">✕</a>
          <div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="${items.length}"><i id="prog-fill"></i></div>
          <span class="count" id="count"></span>
          <span class="combo" id="combo" hidden></span>
          ${sess.lives !== null ? `<span class="lives" id="lives">${"<i>❤️</i>".repeat(3)}</span>` : ""}
          ${cfg.mode === "exam" ? `<span class="timer" id="timer">0:00</span>` : ""}
        </div>
        <div class="stage" id="stage"></div>
      </section>`;
    if (cfg.mode === "exam") every(1000, () => { const s = ((Date.now() - sess.t0) / 1000) | 0; const t = $("#timer"); if (t) t.textContent = `${(s / 60) | 0}:${String(s % 60).padStart(2, "0")}`; });
    renderItem();
  }

  function updateTop() {
    $("#prog-fill").style.width = (sess.i / sess.items.length) * 100 + "%";
    $("#count").textContent = `${Math.min(sess.i + 1, sess.items.length)}/${sess.items.length}`;
    const c = $("#combo");
    c.hidden = sess.combo < 2;
    c.innerHTML = `🔥 <b>×${sess.combo}</b>`;
  }

  function renderItem() {
    updateTop();
    const it = sess.items[sess.i];
    const stage = $("#stage");
    const old = stage.firstElementChild;
    const card = h(`<div class="card q-card" data-t="${it.t}"></div>`);
    card.innerHTML = `<div class="q-kind"><span class="kind-dot"></span>${KIND[it.t]}${sess.cfg.mode !== "level" ? ` · <span class="q-from">${esc(it.level.title)}</span>` : ""}</div>`;
    sess.answered = false;
    sess.keyFn = null;
    RENDER[it.t](it, card);
    if (old) {
      old.classList.add("leave");
      setTimeout(() => old.remove(), 260);
    }
    stage.appendChild(card);
    const first = card.querySelector(".opt, input, .pz-tile");
    if (first && it.t !== "code" && window.matchMedia("(pointer: fine)").matches) later(50, () => first.focus({ preventScroll: true }));
  }

  // global key handling for the session
  document.addEventListener("keydown", e => {
    if (!sess || !document.querySelector(".view-play")) return;
    if (e.target.closest(".CodeMirror, textarea")) return;
    if (sess.answered && e.key === "Enter") { e.preventDefault(); const b = $("#next-btn"); if (b) b.click(); return; }
    if (!sess.answered && sess.keyFn) sess.keyFn(e);
  });

  function answer(ok, card, origin, opts = {}) {
    if (sess.answered) return;
    sess.answered = true;
    const it = sess.items[sess.i];
    S.answered++;
    touchStreak();
    let gain = 0;
    if (ok) {
      sess.correct++;
      S.correct++;
      sess.combo++;
      sess.maxCombo = Math.max(sess.maxCombo, sess.combo);
      gain = it.t === "code" ? (opts.firstTry ? 30 : 20) + 10 * (it.diff - 1) : it.t === "parsons" ? 15 : 10;
      gain += Math.min(sess.combo - 1, 5) * 2;
      if (sess.cfg.mode === "review") gain = Math.ceil(gain / 2);
      if (it.t === "code") S.solved[it.id] = true;
      sess.xp += gain;
      addXP(gain);
      recordFix(it.id);
      const p = origin ? centerOf(origin) : centerOf(card);
      FX.burst(p.x, p.y, 28);
      FX.floatText(p.x, p.y - 10, `+${gain} XP`);
      if (sess.combo >= 3 && sess.combo % 3 === 0) { FX.play("combo"); comboPop(sess.combo); } else FX.play("ok");
      card.classList.add("is-ok");
    } else {
      sess.combo = 0;
      recordMistake(it.id);
      sess.wrong.push(it);
      FX.play("bad");
      card.classList.add("is-bad");
      if (sess.lives !== null) {
        sess.lives--;
        const hearts = $$("#lives i");
        const lost = hearts[sess.lives];
        if (lost) lost.classList.add("lost");
      }
    }
    updateTop();
    save();
    const last = sess.i + 1 >= sess.items.length || sess.lives === 0;
    const fb = h(`
      <div class="fb ${ok ? "ok" : "bad"}">
        <div class="fb-head">
          <span class="fb-icon">${ok ? "✓" : "✕"}</span>
          <b>${ok ? pick(["Верно!", "Точно!", "Так и есть!", "Отлично!", "Python согласен!"]) : pick(["Не совсем.", "Мимо.", "Почти!", "Python думает иначе."])}</b>
          ${gain ? `<span class="fb-xp">+${gain} XP</span>` : ""}
        </div>
        ${opts.reveal || ""}
        ${it.ex ? `<p class="fb-ex">${inlineMd(it.ex)}</p>` : ""}
        <button class="btn ${ok ? "primary" : "danger"}" id="next-btn" type="button">${sess.lives === 0 ? "Итоги боя" : last ? "Итоги" : "Дальше"} <span class="arr">→</span> <kbd>Enter</kbd></button>
      </div>`);
    card.appendChild(fb);
    fb.querySelector("#next-btn").addEventListener("click", () => { FX.play("click"); nextItem(); });
    later(60, () => fb.scrollIntoView({ behavior: FX.reduced ? "auto" : "smooth", block: "nearest" }));
  }

  function inlineMd(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code class="ic">$1</code>');
  }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  function comboPop(n) {
    const el = h(`<div class="combo-pop"><span>КОМБО</span><b>×${n}</b></div>`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  function nextItem() {
    if (sess.lives === 0 || sess.i + 1 >= sess.items.length) { finishSession(); return; }
    sess.i++;
    renderItem();
    window.scrollTo({ top: 0, behavior: FX.reduced ? "auto" : "smooth" });
  }

  function finishSession() {
    const { cfg, items, correct } = sess;
    const total = items.length;
    const ratio = correct / total;
    const dead = sess.lives === 0;
    let stars;
    if (cfg.mode === "boss") stars = dead ? 0 : sess.lives;
    else stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.4 ? 1 : 0;
    let bonus = 0;
    let newBest = false;
    if (cfg.level) {
      const prev = S.levels[cfg.level.id] || { stars: 0 };
      if (stars > prev.stars) { bonus = (stars - prev.stars) * 15; newBest = true; }
      S.levels[cfg.level.id] = { stars: Math.max(prev.stars, stars), last: Date.now() };
    }
    if (cfg.mode === "exam") {
      const score = Math.round(ratio * 100);
      if (!S.exam || score > S.exam.best) { S.exam = { best: score, at: Date.now() }; newBest = true; }
      bonus = Math.round(ratio * 40);
    }
    if (bonus) { sess.xp += bonus; addXP(bonus); }
    save();
    const secs = ((Date.now() - sess.t0) / 1000) | 0;
    const xpTotal = sess.xp;
    const nx = cfg.level ? ORDER[ORDER.indexOf(cfg.level) + 1] : null;
    const title = dead ? "Поражение" : cfg.mode === "boss" ? "Босс повержен!" : cfg.mode === "exam" ? examVerdict(ratio)
      : cfg.mode === "review" ? "Повторение окончено" : stars >= 2 ? "Уровень пройден!" : stars === 1 ? "Пройдено, но можно лучше" : "Попробуй ещё раз";
    const pct = Math.round(ratio * 100);
    const R = 70, C = 2 * Math.PI * R;
    app.className = `view-result ${app.className.match(/isl-\w+/) ? app.className.match(/isl-\w+/)[0] : ""}`;
    app.innerHTML = `
      <section class="result card">
        <div class="res-ring">
          <svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="${R}" class="ring-bg"/><circle cx="80" cy="80" r="${R}" class="ring-fg" id="res-ring" style="stroke-dasharray:${C};stroke-dashoffset:${C}"/></svg>
          <div class="res-pct"><b id="res-pct">0</b><span>%</span></div>
        </div>
        <h1 class="res-title">${title}</h1>
        ${cfg.mode !== "review" && cfg.mode !== "exam" ? `<div class="res-stars">${[0, 1, 2].map(i => `<span class="${i < stars ? "on" : ""}" style="--k:${i}">★</span>`).join("")}</div>` : ""}
        ${newBest && cfg.mode !== "review" ? `<p class="res-best">Новый рекорд!</p>` : ""}
        <dl class="res-stats">
          <div><dt>Правильно</dt><dd>${correct}/${total}</dd></div>
          <div><dt>Макс. комбо</dt><dd>×${sess.maxCombo}</dd></div>
          <div><dt>Опыт</dt><dd>+<b id="res-xp">0</b></dd></div>
          <div><dt>Время</dt><dd>${(secs / 60) | 0}:${String(secs % 60).padStart(2, "0")}</dd></div>
        </dl>
        ${sess.wrong.length ? `<div class="res-wrong"><h3>Ошибки попали в «Работу над ошибками»</h3><ul>${sess.wrong.slice(0, 6).map(it => `<li><span class="chip">${KIND[it.t]}</span> ${esc(previewOf(it))}</li>`).join("")}</ul></div>` : ""}
        <div class="res-actions">
          ${cfg.level ? `<a class="btn ghost" href="#level-${cfg.level.id}">Ещё раз</a>` : ""}
          ${cfg.mode === "exam" ? `<a class="btn ghost" href="#exam">Ещё раз</a>` : ""}
          ${sess.wrong.length ? `<a class="btn ghost" href="#review">Разобрать ошибки</a>` : ""}
          ${nx && stars ? `<a class="btn primary" href="#level-${nx.id}">Дальше: ${esc(nx.title)} <span class="arr">→</span></a>` : `<a class="btn primary" href="#map">На карту <span class="arr">→</span></a>`}
        </div>
      </section>`;
    later(150, () => {
      $("#res-ring").style.strokeDashoffset = C * (1 - ratio);
      FX.countUp($("#res-pct"), pct, 1100);
      FX.countUp($("#res-xp"), xpTotal, 1100);
    });
    window.scrollTo(0, 0);
    if (dead) FX.play("lose");
    else if (stars >= 2 || (cfg.mode !== "level" && cfg.mode !== "boss" && ratio >= 0.7)) { later(400, () => { FX.play("win"); FX.confetti(); }); }
    else FX.play("ok");
    sess = null;
  }

  function examVerdict(r) {
    if (r >= 0.9) return "Готов к экзамену!";
    if (r >= 0.75) return "Почти готов";
    if (r >= 0.5) return "Есть пробелы";
    return "Нужно повторить острова";
  }

  function previewOf(it) {
    if (it.t === "code") return it.title;
    if (it.t === "slice") return `${it.name}[?] → ${it.targetRepr}`;
    const s = it.code || it.q || "";
    const first = s.split("\n").find(l => l.trim()) || "";
    return first.length > 60 ? first.slice(0, 58) + "…" : first;
  }

  // ============================================================ ITEM RENDERERS
  const TYPES = ["int", "float", "str", "bool", "NoneType", "list", "tuple", "set", "dict", "range"];

  function optionsBlock(card, it, options, correct, render = fmtOut) {
    const wrap = h(`<div class="opts ${options.some(o => o.includes("\n") || o.length > 22) ? "opts-wide" : ""}"></div>`);
    options.forEach((o, k) => {
      const b = h(`<button class="opt" type="button"><span class="opt-key">${k + 1}</span><span class="opt-body">${render(o)}</span></button>`);
      b.style.setProperty("--k", k);
      b.addEventListener("click", () => choose(o, b));
      wrap.appendChild(b);
    });
    card.appendChild(wrap);
    function choose(o, b) {
      if (sess.answered) return;
      const ok = o === correct;
      $$(".opt", wrap).forEach((x, k) => {
        x.disabled = true;
        if (options[k] === correct) x.classList.add("correct");
      });
      if (!ok) b.classList.add("wrong");
      const reveal = ok ? "" : `<div class="fb-reveal"><span>Правильный ответ:</span>${render(correct)}</div>`;
      answer(ok, card, b, { reveal });
    }
    sess.keyFn = e => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= options.length) { const b = wrap.children[n - 1]; choose(options[n - 1], b); }
    };
  }

  function stdinHtml(inputs) {
    if (!inputs || !inputs.length) return "";
    return `<div class="stdin"><span class="stdin-label">ввод</span>${inputs.map(v => `<kbd class="in-chip">${esc(v)}<span>⏎</span></kbd>`).join("")}</div>`;
  }

  const RENDER = {
    predict(it, card) {
      card.appendChild(h(`<h2 class="q-text">${esc(it.q || "Что выведет программа?")}</h2>`));
      card.appendChild(h(`<div class="code-wrap">${codeBlock(it.code)}${stdinHtml(it.inputs)}</div>`));
      optionsBlock(card, it, shuffle([it.a, ...it.opts]), it.a);
    },
    mc(it, card) {
      card.appendChild(h(`<h2 class="q-text">${inlineMd(it.q)}</h2>`));
      if (it.code) card.appendChild(h(`<div class="code-wrap">${codeBlock(it.code)}</div>`));
      const render = o => o.includes("\n") ? codeBlock(o, { numbers: false }) : `<span class="mc-txt">${inlineMd(o)}</span>`;
      optionsBlock(card, it, shuffle([it.a, ...it.opts]), it.a, render);
    },
    type(it, card) {
      card.appendChild(h(`<h2 class="q-text">Какой тип вернёт <code class="ic">type()</code>?</h2>`));
      card.appendChild(h(`<div class="code-wrap">${codeBlock(`type(${it.code})`)}</div>`));
      const grid = h(`<div class="types"></div>`);
      TYPES.forEach((t, k) => {
        const b = h(`<button class="type-btn" type="button" style="--k:${k}"><span class="tb-cls">&lt;class</span> '${t}'<span class="tb-cls">&gt;</span></button>`);
        b.addEventListener("click", () => {
          if (sess.answered) return;
          const ok = t === it.a;
          $$(".type-btn", grid).forEach(x => { x.disabled = true; });
          [...grid.children][TYPES.indexOf(it.a)].classList.add("correct");
          if (!ok) b.classList.add("wrong");
          answer(ok, card, b, { reveal: ok ? "" : `<div class="fb-reveal"><span>Правильно:</span><code class="ic">${esc(it.a)}</code></div>` });
        });
        grid.appendChild(b);
      });
      card.appendChild(grid);
    },
    slice: renderSlice,
    parsons: renderParsons,
    code(it, card) {
      codeTask(it, card, {
        onSolve: (firstTry, btn) => answer(true, card, btn, { firstTry }),
        onGiveUp: () => answer(false, card, null, { reveal: `<div class="fb-reveal block"><span>Решение:</span>${codeBlock(it.solution)}</div>` }),
      });
    },
  };

  // ------------------------------------------------------------ slice
  function sliceIdx(n, start, stop, step) {
    const out = [];
    if (step > 0) {
      let a = start === null ? 0 : start < 0 ? Math.max(0, start + n) : Math.min(start, n);
      let b = stop === null ? n : stop < 0 ? Math.max(0, stop + n) : Math.min(stop, n);
      for (let i = a; i < b; i += step) out.push(i);
    } else {
      let a = start === null ? n - 1 : start < 0 ? Math.max(-1, start + n) : Math.min(start, n - 1);
      let b = stop === null ? -1 : stop < 0 ? Math.max(-1, stop + n) : Math.min(stop, n - 1);
      for (let i = a; i > b; i += step) out.push(i);
    }
    return out;
  }
  function parseSlice(s) {
    s = s.trim();
    if (!s) return { empty: true };
    if (!s.includes(":")) {
      if (/^[+-]?\d+$/.test(s)) return { err: "Это индекс — он вернёт один элемент. Нужен срез с двоеточием, например 1:4" };
      return { err: "Нужен срез: start:stop:step" };
    }
    const parts = s.split(":");
    if (parts.length > 3) return { err: "Максимум два двоеточия: start:stop:step" };
    const vals = [];
    for (const p of parts.map(x => x.trim())) {
      if (p === "") { vals.push(null); continue; }
      if (!/^[+-]?\d+$/.test(p)) return { err: `«${p}» — не целое число` };
      vals.push(parseInt(p, 10));
    }
    const step = vals[2] === undefined || vals[2] === null ? 1 : vals[2];
    if (step === 0) return { err: "ValueError: slice step cannot be zero" };
    return { start: vals[0], stop: vals[1] === undefined ? null : vals[1], step };
  }
  function reprSeq(kind, els) {
    if (kind === "str") return "'" + els.map(r => r.slice(1, -1)).join("") + "'";
    if (kind === "tuple") return "(" + els.join(", ") + (els.length === 1 ? "," : "") + ")";
    return "[" + els.join(", ") + "]";
  }

  function renderSlice(it, card) {
    const n = it.seq.length;
    const kind = it.isStr ? "str" : it.targetRepr[0] === "(" ? "tuple" : "list";
    const src = it.isStr ? reprSeq("str", it.seq) : reprSeq(kind, it.seq);
    card.appendChild(h(`<h2 class="q-text">${esc(it.q || "Напиши срез, который даёт нужный результат")}</h2>`));
    card.appendChild(h(`<div class="code-wrap">${codeBlock(`${it.name} = ${src}`)}</div>`));
    const cells = h(`<div class="cells" style="--n:${n}">${it.seq.map((r, i) => `
      <div class="cell" data-i="${i}"><span class="ci-pos">${i}</span><span class="cv">${esc(it.isStr ? r.slice(1, -1) : r)}</span><span class="ci-neg">${i - n}</span><span class="c-ord"></span></div>`).join("")}</div>`);
    card.appendChild(h(`<div class="cells-scroll"></div>`)).appendChild(cells);
    card.appendChild(h(`<div class="target"><span>Нужно получить</span><code>${esc(it.targetRepr)}</code></div>`));
    const row = h(`
      <form class="slice-form" autocomplete="off">
        <label class="slice-input" for="slice-in"><span class="si-name">${esc(it.name)}[</span><input id="slice-in" spellcheck="false" placeholder="start:stop:step" inputmode="text"><span class="si-name">]</span></label>
        <button class="btn primary" type="submit">Выстрел 🎯</button>
      </form>`);
    card.appendChild(row);
    const preview = h(`<div class="slice-preview"><span class="sp-label">Результат:</span> <code id="sp-out">—</code></div>`);
    card.appendChild(preview);
    const input = row.querySelector("input");
    const out = preview.querySelector("#sp-out");
    let current = null;
    function update() {
      const p = parseSlice(input.value);
      $$(".cell", cells).forEach(c => { c.classList.remove("sel"); c.querySelector(".c-ord").textContent = ""; });
      current = null;
      preview.classList.remove("match", "err");
      if (p.empty) { out.textContent = "—"; return; }
      if (p.err) { out.textContent = p.err; preview.classList.add("err"); return; }
      const idx = sliceIdx(n, p.start, p.stop, p.step);
      idx.forEach((i, k) => { const c = cells.children[i]; c.classList.add("sel"); c.querySelector(".c-ord").textContent = k + 1; });
      current = idx.map(i => it.seq[i]);
      out.textContent = reprSeq(kind, current);
      if (current.join("\u0000") === it.target.join("\u0000")) preview.classList.add("match");
    }
    input.addEventListener("input", update);
    row.addEventListener("submit", e => {
      e.preventDefault();
      if (sess.answered) return;
      update();
      if (!current) { row.classList.remove("shake"); void row.offsetWidth; row.classList.add("shake"); return; }
      const ok = current.join("\u0000") === it.target.join("\u0000");
      input.disabled = true;
      row.querySelector("button").disabled = true;
      const alt = ok && input.value.replace(/\s/g, "") !== it.ref.replace(/\s/g, "") ? `<div class="fb-reveal"><span>Ещё один вариант:</span><code class="ic">${esc(it.name)}[${esc(it.ref)}]</code></div>` : "";
      answer(ok, card, row.querySelector("button"), { reveal: ok ? alt : `<div class="fb-reveal"><span>Например:</span><code class="ic">${esc(it.name)}[${esc(it.ref)}]</code> → <code class="ic">${esc(it.targetRepr)}</code></div>` });
    });
  }

  // ------------------------------------------------------------ parsons
  function renderParsons(it, card) {
    card.appendChild(h(`<h2 class="q-text pre-line">${esc(it.q)}</h2>`));
    card.appendChild(h(`<p class="q-help">Нажимай на блоки, чтобы добавить их в программу. Кнопками ‹ › меняй отступ. Лишние блоки могут быть ловушкой!</p>`));
    const tiles = shuffle([...it.lines.map(l => l.text), ...it.distractors]).map((text, k) => ({ key: k, text }));
    let placed = [];
    const wrap = h(`<div class="pz">
      <div class="pz-col"><h4>Блоки</h4><div class="pz-pool"></div></div>
      <div class="pz-col"><h4>Программа <span class="pz-file">main.py</span></h4><div class="pz-prog"></div></div>
    </div>`);
    card.appendChild(wrap);
    const pool = $(".pz-pool", wrap), prog = $(".pz-prog", wrap);
    const actions = h(`<div class="pz-actions"><button class="btn ghost" type="button" data-a="reset">Сбросить</button><button class="btn primary" type="button" data-a="check">Проверить</button></div>`);
    card.appendChild(actions);
    function draw() {
      pool.innerHTML = "";
      tiles.filter(t => !placed.find(p => p.key === t.key)).forEach(t => {
        const b = h(`<button class="pz-tile" type="button"><code>${hl(t.text)}</code></button>`);
        b.addEventListener("click", () => {
          if (sess.answered) return;
          FX.play("click");
          const prev = placed[placed.length - 1];
          let ind = prev ? prev.indent + (/:\s*$/.test(prev.text) ? 1 : 0) : 0;
          if (/^(else|elif|except|finally)\b/.test(t.text) && prev && !/:\s*$/.test(prev.text)) ind = Math.max(0, prev.indent - 1);
          placed.push({ key: t.key, text: t.text, indent: ind });
          draw();
        });
        pool.appendChild(b);
      });
      if (!pool.children.length) pool.appendChild(h(`<p class="pz-empty">Все блоки использованы</p>`));
      prog.innerHTML = "";
      placed.forEach((p, idx) => {
        const row = h(`<div class="pz-line" style="--ind:${p.indent}">
          <span class="pz-ln">${idx + 1}</span>
          <button type="button" class="pz-b" data-d="-1" aria-label="Уменьшить отступ">‹</button>
          <button type="button" class="pz-b" data-d="1" aria-label="Увеличить отступ">›</button>
          <code class="pz-code">${hl(p.text)}</code>
          <button type="button" class="pz-b pz-x" aria-label="Убрать строку">×</button>
        </div>`);
        $$("[data-d]", row).forEach(b => b.addEventListener("click", () => {
          if (sess.answered) return;
          p.indent = Math.max(0, Math.min(4, p.indent + +b.dataset.d)); draw();
        }));
        $(".pz-x", row).addEventListener("click", () => { if (sess.answered) return; placed.splice(idx, 1); draw(); });
        prog.appendChild(row);
      });
      if (!placed.length) prog.appendChild(h(`<p class="pz-empty">Сюда будут добавляться строки</p>`));
    }
    draw();
    actions.querySelector('[data-a="reset"]').addEventListener("click", () => { if (!sess.answered) { placed = []; draw(); } });
    const checkBtn = actions.querySelector('[data-a="check"]');
    checkBtn.addEventListener("click", async () => {
      if (sess.answered) return;
      if (!placed.length) return;
      const exact = placed.length === it.lines.length && placed.every((p, i) => p.text === it.lines[i].text && p.indent === it.lines[i].indent);
      let ok = exact;
      if (!exact && PY.status !== "fail") {
        checkBtn.disabled = true;
        checkBtn.textContent = "Проверяю…";
        const code = placed.map(p => "    ".repeat(p.indent) + p.text).join("\n");
        ok = true;
        for (let k = 0; k < it.tests.length; k++) {
          const r = await PY.run(code, it.tests[k], { timeout: 3000 });
          if (r.err || PY.norm(r.out) !== it.expected[k]) { ok = false; break; }
        }
        checkBtn.textContent = "Проверить";
      }
      checkBtn.disabled = true;
      actions.querySelector('[data-a="reset"]').disabled = true;
      wrap.classList.add("locked");
      const solution = it.lines.map(l => "    ".repeat(l.indent) + l.text).join("\n");
      answer(ok, card, checkBtn, { reveal: ok ? (exact ? "" : `<div class="fb-reveal block"><span>Твой порядок тоже работает. Эталон:</span>${codeBlock(solution)}</div>`) : `<div class="fb-reveal block"><span>Правильная программа:</span>${codeBlock(solution)}</div>` });
    });
  }

  // ------------------------------------------------------------ code task
  function makeEditor(textarea, value, onChange) {
    if (window.CodeMirror) {
      const cm = CodeMirror.fromTextArea(textarea, {
        value, mode: "python", lineNumbers: true, indentUnit: 4, tabSize: 4, matchBrackets: true,
        viewportMargin: Infinity, lineWrapping: false,
        extraKeys: {
          Tab: c => c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection("    ", "end"),
          "Shift-Tab": c => c.indentSelection("subtract"),
          "Ctrl-Enter": () => onChange && onChange("run"), "Cmd-Enter": () => onChange && onChange("run"),
        },
      });
      cm.setValue(value);
      cm.on("change", () => onChange && onChange("change"));
      setTimeout(() => cm.refresh(), 30);
      return { get: () => cm.getValue(), set: v => cm.setValue(v), focus: () => cm.focus(), cm };
    }
    textarea.value = value;
    textarea.classList.add("plain-editor");
    textarea.addEventListener("keydown", e => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = textarea.selectionStart;
        textarea.value = textarea.value.slice(0, s) + "    " + textarea.value.slice(textarea.selectionEnd);
        textarea.selectionStart = textarea.selectionEnd = s + 4;
      }
    });
    textarea.addEventListener("input", () => onChange && onChange("change"));
    return { get: () => textarea.value, set: v => { textarea.value = v; }, focus: () => textarea.focus() };
  }

  function codeTask(it, card, { onSolve, onGiveUp }) {
    PY.load();
    const diff = "●".repeat(it.diff) + "○".repeat(3 - it.diff);
    card.appendChild(h(`<h2 class="q-text">${esc(it.title)} <span class="diff" title="Сложность">${diff}</span>${S.solved[it.id] ? ' <span class="chip ok">решено</span>' : ""}</h2>`));
    card.appendChild(h(`<div class="task-desc">${md(it.desc)}</div>`));
    const edWrap = h(`<div class="editor"><div class="editor-bar"><span>main.py</span><span class="ed-hint">Tab — 4 пробела · Ctrl+Enter — запустить</span></div><textarea id="ed-${it.id}" spellcheck="false" aria-label="Редактор кода"></textarea></div>`);
    card.appendChild(edWrap);
    const actions = h(`<div class="task-actions">
      <button class="btn ghost" type="button" data-a="run">▶ Запустить</button>
      <button class="btn primary" type="button" data-a="check">✓ Проверить тестами</button>
      <button class="btn ghost" type="button" data-a="hint">💡 Подсказка</button>
      <button class="btn ghost subtle" type="button" data-a="give">Показать решение</button>
    </div>`);
    card.appendChild(actions);
    const stdin = h(`<details class="stdin-box"><summary>Ввод для «Запустить» (каждая строка — один <code class="ic">input()</code>)</summary><textarea id="stdin-${it.id}" spellcheck="false" rows="3">${esc((it.tests[0] && it.tests[0].in || []).join("\n"))}</textarea></details>`);
    card.appendChild(stdin);
    const consoleEl = h(`<div class="console" hidden></div>`);
    card.appendChild(consoleEl);
    const testsEl = h(`<div class="tests" hidden></div>`);
    card.appendChild(testsEl);
    const hintEl = h(`<div class="hint" hidden></div>`);
    card.appendChild(hintEl);

    let attempts = 0;
    let done = false;
    let saveT = null;
    const ed = makeEditor(edWrap.querySelector("textarea"), S.drafts[it.id] || it.starter || "", ev => {
      if (ev === "run") doRun();
      clearTimeout(saveT);
      saveT = setTimeout(() => { S.drafts[it.id] = ed.get(); save(); }, 400);
    });
    const btn = a => actions.querySelector(`[data-a="${a}"]`);

    async function doRun() {
      consoleEl.hidden = false;
      consoleEl.innerHTML = `<div class="con-head">Вывод</div><pre class="con-out muted">${PY.status === "ready" ? "Выполняю…" : "Загружаю Python (первый раз ~5–15 с)…"}</pre>`;
      btn("run").disabled = true;
      const lines = stdin.querySelector("textarea").value.replace(/\r/g, "").split("\n");
      if (lines.length && lines[lines.length - 1] === "") lines.pop();
      const r = await PY.run(ed.get(), lines, { echo: true });
      btn("run").disabled = false;
      consoleEl.innerHTML = `<div class="con-head">Вывод</div><pre class="con-out">${esc(r.out) || '<span class="muted">(пусто)</span>'}${r.tb ? `\n<span class="tb">${esc(r.tb)}</span>` : ""}</pre>`;
    }

    async function doCheck() {
      if (done) return;
      const code = ed.get();
      if (!code.trim()) { toast("Сначала напиши код ✍️"); return; }
      attempts++;
      btn("check").disabled = true;
      btn("check").textContent = PY.status === "ready" ? "Проверяю…" : "Загружаю Python…";
      testsEl.hidden = false;
      testsEl.innerHTML = it.tests.map((_, k) => `<div class="test pending"><span class="t-ic"></span>Тест ${k + 1}</div>`).join("");
      let all = true;
      for (let k = 0; k < it.tests.length; k++) {
        const tc = it.tests[k];
        const r = await PY.run(code, tc.in, { timeout: 4000 });
        const got = PY.norm(r.out);
        const pass = !r.err && got === tc.out;
        if (r.err === "LoadError") { testsEl.innerHTML = `<div class="test fail"><span class="t-ic"></span>${esc(r.tb)}</div>`; all = false; break; }
        const row = testsEl.children[k];
        row.className = "test " + (pass ? "pass" : "fail");
        if (!pass) {
          all = false;
          row.innerHTML = `<span class="t-ic"></span>Тест ${k + 1}
            <div class="t-detail">
              <div><span>Ввод</span><pre>${esc(tc.in.join("\n")) || "—"}</pre></div>
              <div><span>Ожидалось</span><pre>${esc(tc.out) || "(пусто)"}</pre></div>
              <div><span>Получено</span><pre>${esc(got) || "(пусто)"}${r.tb ? `\n<span class="tb">${esc(r.tb)}</span>` : ""}</pre></div>
            </div>${diffNote(tc.out, got, r)}`;
        }
      }
      btn("check").disabled = false;
      btn("check").textContent = "✓ Проверить тестами";
      if (all) {
        done = true;
        $$("button", actions).forEach(b => { b.disabled = true; });
        onSolve(attempts === 1, btn("check"));
      } else {
        card.classList.remove("shake-soft"); void card.offsetWidth; card.classList.add("shake-soft");
        FX.play("bad");
        if (attempts >= 2) btn("give").classList.remove("subtle");
      }
    }

    btn("run").addEventListener("click", doRun);
    btn("check").addEventListener("click", doCheck);
    btn("hint").addEventListener("click", () => { hintEl.hidden = false; hintEl.innerHTML = `<b>Подсказка:</b> ${inlineMd(it.hint)}`; });
    let giveArmed = false;
    btn("give").addEventListener("click", () => {
      if (done) return;
      if (!giveArmed) { giveArmed = true; btn("give").textContent = "Точно? Задание будет засчитано как ошибка"; btn("give").classList.add("armed"); return; }
      done = true;
      $$("button", actions).forEach(b => { b.disabled = true; });
      onGiveUp();
    });
    return { ed };
  }

  function diffNote(exp, got, r) {
    if (r.err === "Timeout") return "";
    if (r.err === "EOFError") return `<p class="t-note">Программа вызвала <code class="ic">input()</code> больше раз, чем есть строк ввода.</p>`;
    if (r.err) return "";
    const e = exp.split("\n"), g = got.split("\n");
    for (let i = 0; i < Math.max(e.length, g.length); i++) {
      if (e[i] !== g[i]) {
        if (e[i] !== undefined && g[i] !== undefined && e[i].replace(/\s+/g, "") === g[i].replace(/\s+/g, "")) return `<p class="t-note">Строка ${i + 1}: отличаются только пробелы.</p>`;
        if (e[i] !== undefined && g[i] !== undefined && e[i].toLowerCase() === g[i].toLowerCase()) return `<p class="t-note">Строка ${i + 1}: отличается регистр букв.</p>`;
        if (g[i] === undefined) return `<p class="t-note">Не хватает строки ${i + 1}: <code class="ic">${esc(e[i])}</code></p>`;
        if (e[i] === undefined) return `<p class="t-note">Лишняя строка ${i + 1}: <code class="ic">${esc(g[i])}</code></p>`;
        return `<p class="t-note">Первое отличие в строке ${i + 1}.</p>`;
      }
    }
    return "";
  }

  // ============================================================ ARENA
  function viewArena() {
    PY.load();
    const solved = CODE_TASKS.filter(t => S.solved[t.id]).length;
    app.className = "view-arena";
    app.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">Арена задач</p>
        <h1>Пиши настоящие программы</h1>
        <p class="lead">Задачи в стиле упражнений курса: читаешь ввод через <code class="ic">input()</code>, считаешь и печатаешь ответ в точном формате. Проверка — скрытыми тестами, как у автопроверки.</p>
        <div class="arena-prog"><div class="bar"><i style="width:${(solved / CODE_TASKS.length) * 100}%"></i></div><span>${solved} из ${CODE_TASKS.length} решено</span></div>
      </section>
      ${D.units.map(u => {
        const tasks = CODE_TASKS.filter(t => t.level.unit === u);
        return `<section class="arena-unit isl-${u.color}">
          <h2><span aria-hidden="true">${u.emoji}</span> ${esc(u.title)} <small>${tasks.filter(t => S.solved[t.id]).length}/${tasks.length}</small></h2>
          <div class="task-grid">${tasks.map((t, k) => `
            <a class="task-card ${S.solved[t.id] ? "solved" : ""}" href="#task-${t.id}" style="--k:${k}">
              <span class="tc-top"><span class="diff">${"●".repeat(t.diff)}${"○".repeat(3 - t.diff)}</span>${S.solved[t.id] ? '<span class="tc-ok">✓</span>' : ""}</span>
              <b>${esc(t.title)}</b>
              <span class="tc-lv">${esc(t.level.title)}</span>
            </a>`).join("")}</div>
        </section>`;
      }).join("")}`;
  }

  function viewTask(it) {
    const idx = CODE_TASKS.indexOf(it);
    const prev = CODE_TASKS[idx - 1], next = CODE_TASKS[idx + 1];
    app.className = `view-task isl-${it.level.unit.color}`;
    app.innerHTML = `
      <section class="task-page">
        <div class="task-nav">
          <a class="back" href="#arena">← Арена</a>
          <span class="tn-pos">${idx + 1} / ${CODE_TASKS.length}</span>
          <span class="tn-btns">${prev ? `<a class="icon-btn" href="#task-${prev.id}" aria-label="Предыдущая задача">‹</a>` : ""}${next ? `<a class="icon-btn" href="#task-${next.id}" aria-label="Следующая задача">›</a>` : ""}</span>
        </div>
        <div class="card q-card" id="task-card"><div class="q-kind"><span class="kind-dot"></span>${esc(it.level.unit.title)} · ${esc(it.level.title)}</div></div>
      </section>`;
    const card = $("#task-card");
    codeTask(it, card, {
      onSolve: (firstTry, b) => {
        const first = !S.solved[it.id];
        S.solved[it.id] = true;
        recordFix(it.id);
        const gain = first ? (firstTry ? 30 : 20) + 10 * (it.diff - 1) : 0;
        if (gain) addXP(gain);
        save();
        const p = centerOf(b);
        FX.burst(p.x, p.y, 34);
        if (gain) FX.floatText(p.x, p.y - 10, `+${gain} XP`);
        FX.play("win");
        card.classList.add("is-ok");
        card.appendChild(h(`<div class="fb ok"><div class="fb-head"><span class="fb-icon">✓</span><b>Все тесты пройдены!</b>${gain ? `<span class="fb-xp">+${gain} XP</span>` : ""}</div>
          <div class="fb-reveal block"><span>Эталонное решение (сравни со своим):</span>${codeBlock(it.solution)}</div>
          ${next ? `<a class="btn primary" href="#task-${next.id}">Следующая: ${esc(next.title)} <span class="arr">→</span></a>` : `<a class="btn primary" href="#arena">К списку задач</a>`}</div>`));
      },
      onGiveUp: () => {
        recordMistake(it.id); save();
        card.classList.add("is-bad");
        card.appendChild(h(`<div class="fb bad"><div class="fb-head"><span class="fb-icon">i</span><b>Разбор решения</b></div>
          <div class="fb-reveal block"><span>Решение:</span>${codeBlock(it.solution)}</div>
          <p class="fb-ex">Перепиши решение сам, не подглядывая, — задача добавлена в «Работу над ошибками».</p>
          <a class="btn ghost" href="#task-${it.id}" onclick="setTimeout(()=>location.reload(),0)">Решить заново</a></div>`));
      },
    });
  }

  // ============================================================ REVIEW
  function viewReview() {
    const ids = dueMistakes();
    app.className = "view-review";
    const byLevel = {};
    ids.forEach(id => { const it = ITEMS[id]; (byLevel[it.level.id] = byLevel[it.level.id] || []).push(it); });
    app.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">Работа над ошибками</p>
        <h1>${ids.length ? `${ids.length} ${plural(ids.length, "задание ждёт", "задания ждут", "заданий ждут")} реванша` : "Ошибок нет"}</h1>
        <p class="lead">${ids.length ? "Сюда попадает всё, где ты ошибся. Ответь правильно два раза подряд — и задание уйдёт из списка. Так тренируется именно то, что ещё не закрепилось." : "Чисто! Когда ошибёшься в игре, задание появится здесь, чтобы ты к нему вернулся."}</p>
        ${ids.length ? `<a class="btn primary big" href="#review-go">Повторить ${Math.min(15, ids.length)} <span class="arr">→</span></a>` : `<a class="btn primary big" href="#map">На карту <span class="arr">→</span></a>`}
      </section>
      ${Object.keys(byLevel).map(lid => {
        const lv = LEVELS[lid];
        return `<section class="rev-group isl-${lv.unit.color}"><h3>${lv.icon} ${esc(lv.title)} <small>${esc(lv.unit.title)}</small></h3>
          <ul>${byLevel[lid].map(it => `<li><span class="chip">${KIND[it.t]}</span><code>${esc(previewOf(it))}</code>${S.mistakes[it.id].n ? '<span class="chip ok">1/2</span>' : ""}</li>`).join("")}</ul></section>`;
      }).join("")}`;
  }

  // ============================================================ EXAM
  function viewExam() {
    app.className = "view-exam";
    app.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">Пробный экзамен</p>
        <h1>Проверь себя по всем трём юнитам</h1>
        <p class="lead">18 быстрых вопросов (по 6 с каждого острова), одна программа-пазл и две задачи на код. Без жизней и подсказок теории — как на настоящей проверке. Засекается время.</p>
        <ul class="exam-list">
          <li><b>18</b> вопросов: вывод, типы, срезы, понятия</li>
          <li><b>1</b> пазл «собери программу»</li>
          <li><b>2</b> задачи с автотестами</li>
        </ul>
        ${S.exam ? `<p class="exam-best">Лучший результат: <b>${S.exam.best}%</b></p>` : ""}
        <a class="btn primary big" href="#exam-go">Начать экзамен <span class="arr">→</span></a>
      </section>`;
  }

  // ============================================================ SANDBOX
  const SNIPPETS = [
    ["Привет", 'name = input("Имя: ")\nprint(f"Привет, {name}!")'],
    ["Цикл", "total = 0\nfor n in range(1, 6):\n    total += n\n    print(n, total)"],
    ["Словарь", 'counts = {}\nfor w in "a b a c a".split():\n    counts[w] = counts.get(w, 0) + 1\nprint(counts)'],
    ["Срезы", 'v = [0, 1, 2, 3, 4, 5]\nprint(v[2:5], v[::-1], v[-2:])'],
    ["Алиасы", "x = [1, 2, 3]\ny = x\nx.append(4)\nprint(y, x is y)"],
  ];
  function viewSandbox() {
    PY.load();
    app.className = "view-sandbox";
    app.innerHTML = `
      <section class="page-head slim">
        <p class="eyebrow">Песочница</p>
        <h1>Проверь любую догадку</h1>
        <p class="lead">Не уверен, что выведет код? Запусти. Это настоящий Python 3.12 прямо в браузере.</p>
      </section>
      <section class="card sandbox">
        <div class="snips">${SNIPPETS.map((s, k) => `<button class="chip-btn" type="button" data-k="${k}">${esc(s[0])}</button>`).join("")}</div>
        <div class="editor"><div class="editor-bar"><span>sandbox.py</span><span class="ed-hint">Ctrl+Enter — запустить</span></div><textarea id="sb-ed" spellcheck="false" aria-label="Редактор кода"></textarea></div>
        <label class="sb-label" for="sb-in">Ввод (каждая строка — один <code class="ic">input()</code>)</label>
        <textarea id="sb-in" class="sb-in" rows="2" spellcheck="false">Аня</textarea>
        <div class="task-actions"><button class="btn primary" type="button" id="sb-run">▶ Запустить</button></div>
        <div class="console"><div class="con-head">Вывод</div><pre class="con-out muted" id="sb-out">Нажми «Запустить»</pre></div>
      </section>`;
    const run = async () => {
      const out = $("#sb-out");
      out.className = "con-out muted";
      out.textContent = PY.status === "ready" ? "Выполняю…" : "Загружаю Python (первый раз ~5–15 с)…";
      const lines = $("#sb-in").value.replace(/\r/g, "").split("\n");
      if (lines[lines.length - 1] === "") lines.pop();
      const r = await PY.run(ed.get(), lines, { echo: true });
      out.className = "con-out";
      out.innerHTML = (esc(r.out) || '<span class="muted">(пусто)</span>') + (r.tb ? `\n<span class="tb">${esc(r.tb)}</span>` : "");
      try { localStorage.setItem(KEY + ".sandbox", ed.get()); } catch (e) { /* ignore */ }
    };
    let saved = null;
    try { saved = localStorage.getItem(KEY + ".sandbox"); } catch (e) { /* ignore */ }
    const ed = makeEditor($("#sb-ed"), saved || SNIPPETS[0][1], ev => { if (ev === "run") run(); });
    $("#sb-run").addEventListener("click", run);
    $$(".chip-btn").forEach(b => b.addEventListener("click", () => ed.set(SNIPPETS[+b.dataset.k][1])));
  }

  // ------------------------------------------------------------ boot
  route();
})();
