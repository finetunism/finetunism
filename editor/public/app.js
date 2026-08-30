const $ = (id) => document.getElementById(id);
const md = $("md");
const pv = $("pv");

const state = {
  posts: [],
  slug: null,
  lang: "en",
  en: { meta: {}, body: "" },
  es: null,
  dirty: false,
  saveTimer: null,
  renderTimer: null,
};

function toast(msg, err = false) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("is-err", err);
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), err ? 6000 : 2500);
}

function status(msg, busy = false) {
  const s = $("status");
  s.textContent = msg;
  s.classList.toggle("is-busy", busy);
}

async function api(method, url, body, raw = false) {
  const res = await fetch(url, {
    method,
    headers: raw ? {} : { "content-type": "application/json" },
    body: raw ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

function current() {
  return state.lang === "es" ? state.es : state.en;
}

async function loadList() {
  state.posts = await api("GET", "/api/posts");
  const ul = $("post-list");
  ul.innerHTML = "";
  if (!state.posts.length) {
    ul.innerHTML = '<li class="empty">no posts yet</li>';
    return;
  }
  for (const p of state.posts) {
    const li = document.createElement("li");
    li.classList.toggle("is-on", p.slug === state.slug);
    li.innerHTML = `<span class="t">${escapeHtml(p.title)}${p.draft ? '<span class="draft">draft</span>' : ""}${p.hasEs ? '<span class="es">es</span>' : ""}</span><span class="d">${escapeHtml(p.date)}</span>`;
    li.onclick = () => open(p.slug);
    ul.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

async function open(slug) {
  if (state.dirty) await save();
  const post = await api("GET", `/api/posts/${slug}`);
  state.slug = slug;
  state.en = { meta: post.meta, body: post.body };
  state.es = post.es ? { meta: post.es.meta, body: post.es.body } : null;
  state.lang = "en";
  fillForm();
  restoreBackup();
  await loadList();
  render();
  $("meta").hidden = false;
  md.focus();
}

function fillForm() {
  const en = state.en;
  const cur = current();
  $("m-title").value = cur.meta.title ?? "";
  $("m-desc").value = cur.meta.description ?? "";
  $("m-date").value = en.meta.date ?? "";
  $("m-tags").value = en.meta.tags ?? "";
  $("m-draft").checked = String(en.meta.draft ?? "").toLowerCase() === "true";
  $("m-project").checked = String(en.meta.project ?? "").toLowerCase() === "true";
  $("m-slug").textContent = state.slug ?? "";
  md.value = cur.body ?? "";
  for (const b of $("lang").querySelectorAll("button")) b.classList.toggle("is-on", b.dataset.lang === state.lang);
  $("m-date").disabled = $("m-tags").disabled = $("m-draft").disabled = $("m-project").disabled = state.lang === "es";
  counts();
}

function readForm() {
  const cur = current();
  cur.meta.title = $("m-title").value;
  cur.meta.description = $("m-desc").value;
  cur.body = md.value;
  if (state.lang === "en") {
    state.en.meta.date = $("m-date").value;
    state.en.meta.tags = $("m-tags").value;
    state.en.meta.draft = $("m-draft").checked ? "true" : "false";
    state.en.meta.project = $("m-project").checked ? "true" : "false";
  }
}

function backupKey(lang) {
  return `ft-backup:${state.slug}:${lang}`;
}

function writeBackup() {
  if (!state.slug) return;
  try {
    localStorage.setItem(backupKey(state.lang), JSON.stringify({
      time: Date.now(),
      body: md.value,
      title: $("m-title").value,
      description: $("m-desc").value,
    }));
  } catch {}
}

function restoreBackup() {
  if (!state.slug) return;
  try {
    const raw = localStorage.getItem(backupKey(state.lang));
    if (!raw) return;
    const b = JSON.parse(raw);
    if (b.body === md.value) {
      localStorage.removeItem(backupKey(state.lang));
      return;
    }
    const when = new Date(b.time).toLocaleString();
    if (confirm(`Found a local backup of this post (${state.lang}) from ${when} that never reached disk.\n\nRestore it? (cancel discards the backup)`)) {
      md.value = b.body;
      if (b.title) $("m-title").value = b.title;
      if (b.description) $("m-desc").value = b.description;
      markDirty();
    } else {
      localStorage.removeItem(backupKey(state.lang));
    }
  } catch {}
}

function markDirty() {
  state.dirty = true;
  $("saved").textContent = "unsaved";
  writeBackup();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(save, 900);
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(render, 250);
  counts();
}

async function save() {
  if (!state.slug || !state.dirty) return;
  readForm();
  const cur = current();
  const meta = state.lang === "es" ? { title: cur.meta.title, description: cur.meta.description } : cur.meta;
  try {
    await api("PUT", `/api/posts/${state.slug}`, { lang: state.lang, meta, body: cur.body });
    state.dirty = false;
    try { localStorage.removeItem(backupKey(state.lang)); } catch {}
    status("ready");
    $("saved").textContent = "saved " + new Date().toLocaleTimeString();
    await loadList();
    gitStatus();
  } catch (e) {
    status("SAVE FAILED — retrying", true);
    $("saved").textContent = "NOT SAVED";
    toast("save failed: " + e.message + " — your text is backed up in this browser and saving will be retried", true);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(save, 4000);
  }
}

async function render() {
  if (!state.slug) return;
  readForm();
  const cur = current();
  try {
    const html = await api("POST", "/api/render", {
      slug: state.slug,
      lang: state.lang,
      meta: cur.meta,
      body: cur.body,
    });
    const key = `${state.slug}:${state.lang}`;
    const doc = pv.contentDocument;
    if (pv.dataset.key === key && doc?.querySelector(".post__body")) {
      const next = new DOMParser().parseFromString(html, "text/html");
      for (const sel of [".post__title", ".post__tags", ".post__date", ".post__body"]) {
        const a = doc.querySelector(sel);
        const b = next.querySelector(sel);
        if (a && b && a.innerHTML !== b.innerHTML) a.innerHTML = b.innerHTML;
      }
      return;
    }
    pv.dataset.key = key;
    const top = pv.contentWindow?.scrollY ?? 0;
    pv.srcdoc = html.replace("<head>", `<head><base href="/posts/${state.slug}/">`);
    pv.onload = () => {
      pv.contentWindow.scrollTo(0, top);
      pv.contentDocument.addEventListener("click", (e) => {
        const a = e.target.closest("a");
        if (a) e.preventDefault();
      });
    };
  } catch (e) {
    toast("preview failed: " + e.message, true);
  }
}

function counts() {
  const text = md.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  $("counts").textContent = `${words} words · ${Math.max(1, Math.round(words / 220))} min read · ${md.value.length} chars`;
}

function insert(before, after = "", placeholder = "") {
  const s = md.selectionStart;
  const e = md.selectionEnd;
  const sel = md.value.slice(s, e) || placeholder;
  md.setRangeText(before + sel + after, s, e, "end");
  if (!md.value.slice(s, e) && placeholder) md.setSelectionRange(s + before.length, s + before.length + placeholder.length);
  md.focus();
  markDirty();
}

function prefixLines(prefix, numbered = false) {
  const s = md.selectionStart;
  const e = md.selectionEnd;
  const startLine = md.value.lastIndexOf("\n", s - 1) + 1;
  const endLine = md.value.indexOf("\n", e) === -1 ? md.value.length : md.value.indexOf("\n", e);
  const lines = md.value.slice(startLine, endLine).split("\n");
  const out = lines.map((l, i) => (numbered ? `${i + 1}. ` : prefix) + l).join("\n");
  md.setRangeText(out, startLine, endLine, "select");
  md.focus();
  markDirty();
}

function block(text) {
  const s = md.selectionStart;
  const needsNl = s > 0 && md.value[s - 1] !== "\n";
  md.setRangeText((needsNl ? "\n\n" : "") + text + "\n\n", s, md.selectionEnd, "end");
  md.focus();
  markDirty();
}

const actions = {
  h2: () => prefixLines("## "),
  h3: () => prefixLines("### "),
  bold: () => insert("**", "**", "bold"),
  italic: () => insert("*", "*", "italic"),
  strike: () => insert("~~", "~~", "gone"),
  code: () => insert("`", "`", "code"),
  link: () => {
    const url = prompt("url");
    if (url) insert("[", `](${url})`, "text");
  },
  image: () => $("file").click(),
  quote: () => prefixLines("> "),
  ul: () => prefixLines("- "),
  ol: () => prefixLines("", true),
  task: () => prefixLines("- [ ] "),
  pre: () => insert("```\n", "\n```", "code"),
  table: () => block("| a | b |\n|---|---|\n| 1 | 2 |"),
  hr: () => block("---"),
  images: () => openImages(),
};

$("toolbar").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b && actions[b.dataset.act]) actions[b.dataset.act]();
});

md.addEventListener("input", markDirty);
md.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    insert("  ");
    return;
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  const map = { b: "bold", i: "italic", k: "link", e: "code", "2": "h2", "3": "h3" };
  if (map[e.key]) {
    e.preventDefault();
    actions[map[e.key]]();
  } else if (e.key === "s") {
    e.preventDefault();
    save();
  }
});

for (const id of ["m-title", "m-desc", "m-date", "m-tags"]) $(id).addEventListener("input", markDirty);
$("m-draft").addEventListener("change", markDirty);
$("m-project").addEventListener("change", markDirty);

$("lang").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b || !state.slug) return;
  if (state.dirty) await save();
  const lang = b.dataset.lang;
  if (lang === "es" && !state.es) {
    if (!confirm("Create a Spanish version of this post?")) return;
    state.es = { meta: { title: state.en.meta.title }, body: "" };
    state.lang = "es";
    state.dirty = true;
    await save();
  }
  state.lang = lang;
  fillForm();
  restoreBackup();
  render();
});

$("btn-new").onclick = async () => {
  const title = prompt("post title");
  if (title === null) return;
  const p = await api("POST", "/api/posts", { title });
  await open(p.slug);
};

$("btn-delete").onclick = async () => {
  if (!state.slug) return;
  if (state.lang === "es") {
    if (!confirm("Delete the Spanish version only?")) return;
    await api("DELETE", `/api/posts/${state.slug}/es`);
    state.es = null;
    state.lang = "en";
    fillForm();
    await loadList();
    render();
    return;
  }
  if (!confirm(`Delete "${state.en.meta.title}" and its images? This cannot be undone.`)) return;
  await api("DELETE", `/api/posts/${state.slug}`);
  state.slug = null;
  state.dirty = false;
  $("meta").hidden = true;
  md.value = "";
  pv.srcdoc = "";
  await loadList();
};

$("btn-build").onclick = async () => {
  await save();
  status("building", true);
  try {
    const r = await api("POST", "/api/build");
    status("ready");
    toast(`built ${r.built.length} post(s) into site/`);
    gitStatus();
  } catch (e) {
    status("ready");
    toast("build failed: " + e.message, true);
  }
};

$("btn-publish").onclick = async () => {
  if (state.slug && $("m-draft").checked) {
    if (confirm(`"${$("m-title").value || state.slug}" is marked as a draft, so it would NOT go live.\n\nUn-draft it and publish it now?`)) {
      $("m-draft").checked = false;
      markDirty();
    }
  }
  await save();
  const message = prompt("commit message", "publish");
  if (message === null) return;
  status("publishing", true);
  $("btn-publish").disabled = true;
  try {
    const r = await api("POST", "/api/publish", { message });
    status("ready");
    if (r.built.length) toast(`published ${r.built.length} post(s): ${r.built.join(", ")} — cloudflare will deploy in ~1 min`);
    else toast("pushed, but no posts are live: every post is still a draft", true);
    gitStatus();
  } catch (e) {
    status("ready");
    toast("publish failed: " + e.message, true);
  }
  $("btn-publish").disabled = false;
};

async function gitStatus() {
  try {
    const s = await api("GET", "/api/status");
    $("git").textContent = `${s.changes} changed · ${s.ahead} unpushed`;
  } catch {
    $("git").textContent = "";
  }
}

async function upload(files) {
  if (!state.slug) return toast("open a post first", true);
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const name = f.name && f.name !== "image.png" ? f.name : `img-${Date.now()}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`;
    try {
      const r = await api("PUT", `/api/posts/${state.slug}/images/${encodeURIComponent(name)}`, f, true);
      const alt = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      block(`![${alt}](${r.name})`);
    } catch (e) {
      toast("upload failed: " + e.message, true);
    }
  }
}

$("file").addEventListener("change", (e) => {
  upload(e.target.files);
  e.target.value = "";
});

md.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files ?? [])];
  if (files.length) {
    e.preventDefault();
    upload(files);
  }
});

md.addEventListener("dragover", (e) => {
  e.preventDefault();
  md.classList.add("is-drop");
});
md.addEventListener("dragleave", () => md.classList.remove("is-drop"));
md.addEventListener("drop", (e) => {
  e.preventDefault();
  md.classList.remove("is-drop");
  upload(e.dataTransfer.files);
});

async function openImages() {
  if (!state.slug) return;
  const post = await api("GET", `/api/posts/${state.slug}`);
  const grid = $("images-grid");
  grid.innerHTML = post.images.length ? "" : '<span class="none">no images yet — drop or paste one into the text</span>';
  for (const name of post.images) {
    const fig = document.createElement("figure");
    fig.innerHTML = `<img src="/posts/${state.slug}/${encodeURIComponent(name)}"><figcaption>${escapeHtml(name)}</figcaption><span class="x" title="delete">x</span>`;
    fig.onclick = (e) => {
      if (e.target.classList.contains("x")) {
        if (confirm(`delete ${name}?`)) api("DELETE", `/api/posts/${state.slug}/images/${encodeURIComponent(name)}`).then(openImages);
        return;
      }
      block(`![${name.replace(/\.[^.]+$/, "")}](${name})`);
      $("images-modal").hidden = true;
    };
    grid.appendChild(fig);
  }
  $("images-modal").hidden = false;
}

$("images-close").onclick = () => ($("images-modal").hidden = true);
$("images-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.hidden = true;
});

$("pv-width").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  for (const x of e.currentTarget.querySelectorAll("button")) x.classList.toggle("is-on", x === b);
  pv.parentElement.classList.toggle("is-mobile", b.dataset.w === "mobile");
});

md.addEventListener("scroll", () => {
  if (!$("pv-sync").checked || !pv.contentDocument) return;
  const ratio = md.scrollTop / Math.max(1, md.scrollHeight - md.clientHeight);
  const doc = pv.contentDocument.documentElement;
  pv.contentWindow.scrollTo(0, ratio * (doc.scrollHeight - doc.clientHeight));
});

window.addEventListener("beforeunload", (e) => {
  if (state.dirty) {
    save();
    e.preventDefault();
  }
});

$("meta").hidden = true;
loadList().then(() => {
  if (state.posts.length) open(state.posts[0].slug);
});
gitStatus();
