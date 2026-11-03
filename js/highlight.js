/* Tiny Python syntax highlighter + mini markdown renderer. */
(function () {
  const KW = new Set("and as assert break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case".split(" "));
  const CONST = new Set(["True", "False", "None"]);
  const BI = new Set("print input len range int float str bool list tuple set dict type sum min max sorted enumerate zip abs round any all id repr isinstance deepcopy".split(" "));
  const RE_SRC = /(#[^\n]*)|((?:[rRfFbBuU]{1,2})?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|(\b\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?\b|\.\d+)|([A-Za-z_\u0400-\u04FF][\w\u0400-\u04FF]*)|([+\-*/%=<>!&|^~]+|[()[\]{}:,.])/.source;

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function hl(code) {
    let out = "";
    let last = 0;
    const RE = new RegExp(RE_SRC, "g");
    let m;
    while ((m = RE.exec(code))) {
      out += esc(code.slice(last, m.index));
      const t = m[0];
      if (m[1]) out += `<span class="t-com">${esc(t)}</span>`;
      else if (m[2]) {
        const isF = /^[rR]?[fF]|^[fF][rR]?/.test(t);
        out += isF ? fstr(t) : `<span class="t-str">${esc(t)}</span>`;
      } else if (m[3]) out += `<span class="t-num">${esc(t)}</span>`;
      else if (m[4]) {
        if (KW.has(t)) out += `<span class="t-kw">${t}</span>`;
        else if (CONST.has(t)) out += `<span class="t-const">${t}</span>`;
        else if (BI.has(t) && code[RE.lastIndex] === "(") out += `<span class="t-bi">${t}</span>`;
        else out += esc(t);
      } else if (m[5]) out += `<span class="t-op">${esc(t)}</span>`;
      else out += esc(t);
      last = RE.lastIndex;
    }
    out += esc(code.slice(last));
    return out;
  }

  // f-string: highlight {...} parts as code
  function fstr(t) {
    let res = "";
    let i = 0;
    let buf = "";
    const flush = () => { if (buf) { res += `<span class="t-str">${esc(buf)}</span>`; buf = ""; } };
    while (i < t.length) {
      const c = t[i];
      if (c === "{" && t[i + 1] === "{") { buf += "{{"; i += 2; continue; }
      if (c === "{") {
        flush();
        let depth = 1, j = i + 1;
        while (j < t.length && depth) { if (t[j] === "{") depth++; else if (t[j] === "}") depth--; j++; }
        const inner = t.slice(i + 1, j - 1);
        res += `<span class="t-fb">{</span>${hl(inner)}<span class="t-fb">}</span>`;
        i = j;
        continue;
      }
      buf += c; i++;
    }
    flush();
    return res;
  }

  function codeBlock(code, opts = {}) {
    const lines = code.split("\n");
    const nums = opts.numbers !== false && lines.length > 1;
    const body = hl(code).split("\n").map((l, i) =>
      `<span class="ln">${nums ? `<span class="lnum">${i + 1}</span>` : ""}<span class="lc">${l || " "}</span></span>`).join("");
    return `<pre class="code${nums ? " numbered" : ""}"><code>${body}</code></pre>`;
  }

  function inline(s) {
    // `code`, **bold**
    return esc(s)
      .replace(/`([^`]+)`/g, (_, c) => `<code class="ic">${c}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  function md(src) {
    const lines = src.split("\n");
    let html = "";
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html += codeBlock(buf.join("\n"), { numbers: false });
        continue;
      }
      if (/^###\s/.test(line)) { html += `<h3>${inline(line.slice(4))}</h3>`; i++; continue; }
      if (/^\|/.test(line)) {
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = rows.filter(r => !/^\|[\s|:-]+\|$/.test(r) && r.replace(/[|\s]/g, ""))
          .map(r => r.slice(1, -1).split("|").map(c => `<td>${inline(c.trim())}</td>`).join(""));
        html += `<div class="tbl"><table>${cells.map(c => `<tr>${c}</tr>`).join("")}</table></div>`;
        continue;
      }
      if (/^-\s/.test(line) || /^\d+\.\s/.test(line)) {
        const ordered = /^\d+\./.test(line);
        const items = [];
        while (i < lines.length && (/^-\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]))) {
          items.push(lines[i].replace(/^(-|\d+\.)\s/, ""));
          i++;
        }
        const tag = ordered ? "ol" : "ul";
        html += `<${tag}>${items.map(t => `<li>${inline(t)}</li>`).join("")}</${tag}>`;
        continue;
      }
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
        html += `<div class="tip">${buf.map(inline).join("<br>")}</div>`;
        continue;
      }
      if (!line.trim()) { i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(```|###|-\s|\d+\.\s|>|\|)/.test(lines[i])) buf.push(lines[i++]);
      html += `<p>${inline(buf.join(" "))}</p>`;
    }
    return html;
  }

  window.HL = { hl, codeBlock, md, esc };
})();
