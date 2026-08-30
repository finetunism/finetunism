import express from "express";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirs, IMAGE, listPosts, readPost, renderPostPage, root } from "../lib/build.mjs";

async function freshBuild() {
  const { stdout } = await exec(process.execPath, ["lib/build.mjs", "--json"], { cwd: root });
  return JSON.parse(stdout.trim());
}
import { serializeFrontMatter, slugify } from "../lib/markdown.mjs";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8790);
const app = express();

app.use(express.json({ limit: "10mb" }));

function safeSlug(s) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) throw Object.assign(new Error("bad slug"), { status: 400 });
  return s;
}

function safeName(s) {
  const name = path.basename(s).replace(/[^a-zA-Z0-9._-]+/g, "-");
  if (!IMAGE.test(name)) throw Object.assign(new Error("not an image"), { status: 400 });
  return name;
}

function summary(post) {
  return {
    slug: post.slug,
    title: post.meta.title ?? post.slug,
    date: post.meta.date ?? "",
    draft: String(post.meta.draft ?? "").toLowerCase() === "true",
    hasEs: Boolean(post.es),
  };
}

app.get("/api/posts", (req, res) => {
  res.json(listPosts().map(summary));
});

app.post("/api/posts", (req, res) => {
  const title = String(req.body?.title ?? "").trim() || "untitled";
  let slug = slugify(title);
  let n = 2;
  while (fs.existsSync(path.join(dirs.content, slug))) slug = `${slugify(title)}-${n++}`;
  const dir = path.join(dirs.content, slug);
  fs.mkdirSync(dir, { recursive: true });
  const meta = { title, date: new Date().toISOString().slice(0, 10), tags: "", draft: "true" };
  fs.writeFileSync(path.join(dir, "index.md"), serializeFrontMatter(meta, ""));
  res.json(summary(readPost(slug)));
});

app.get("/api/posts/:slug", (req, res) => {
  const post = readPost(safeSlug(req.params.slug));
  if (!post) return res.status(404).json({ error: "not found" });
  res.json(post);
});

app.put("/api/posts/:slug", (req, res) => {
  const slug = safeSlug(req.params.slug);
  const dir = path.join(dirs.content, slug);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: "not found" });
  const { lang, meta, body } = req.body ?? {};
  const file = lang === "es" ? "index.es.md" : "index.md";
  fs.writeFileSync(path.join(dir, file), serializeFrontMatter(meta ?? {}, String(body ?? "")));
  res.json(summary(readPost(slug)));
});

app.delete("/api/posts/:slug", (req, res) => {
  const slug = safeSlug(req.params.slug);
  fs.rmSync(path.join(dirs.content, slug), { recursive: true, force: true });
  res.json({ ok: true });
});

app.delete("/api/posts/:slug/es", (req, res) => {
  const slug = safeSlug(req.params.slug);
  fs.rmSync(path.join(dirs.content, slug, "index.es.md"), { force: true });
  res.json(summary(readPost(slug)));
});

app.put("/api/posts/:slug/images/:name", express.raw({ type: "*/*", limit: "50mb" }), (req, res) => {
  const slug = safeSlug(req.params.slug);
  const dir = path.join(dirs.content, slug);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: "not found" });
  let name = safeName(req.params.name);
  const ext = path.extname(name);
  const base = name.slice(0, -ext.length);
  let n = 2;
  while (fs.existsSync(path.join(dir, name))) name = `${base}-${n++}${ext}`;
  fs.writeFileSync(path.join(dir, name), req.body);
  res.json({ name });
});

app.delete("/api/posts/:slug/images/:name", (req, res) => {
  const slug = safeSlug(req.params.slug);
  fs.rmSync(path.join(dirs.content, slug, safeName(req.params.name)), { force: true });
  res.json({ ok: true });
});

app.post("/api/render", (req, res) => {
  const { slug, lang, meta, body, es } = req.body ?? {};
  const post = readPost(safeSlug(slug)) ?? { slug, meta: {}, body: "", es: null, images: [] };
  if (lang === "es") {
    post.es = { meta: { ...(post.es?.meta ?? {}), ...(meta ?? {}) }, body: String(body ?? "") };
  } else {
    post.meta = { ...post.meta, ...(meta ?? {}) };
    post.body = String(body ?? "");
  }
  if (es) post.es = { meta: { ...(post.es?.meta ?? {}), ...(es.meta ?? {}) }, body: String(es.body ?? "") };
  res.type("html").send(renderPostPage(post, lang === "es" ? "es" : "en"));
});

app.post("/api/build", async (req, res) => {
  try {
    res.json({ built: await freshBuild() });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/api/status", async (req, res) => {
  try {
    const { stdout } = await exec("git", ["status", "--porcelain"], { cwd: root });
    const changes = stdout.split("\n").filter(Boolean);
    let ahead = 0;
    try {
      const a = await exec("git", ["rev-list", "--count", "@{u}..HEAD"], { cwd: root });
      ahead = Number(a.stdout.trim()) || 0;
    } catch {}
    res.json({ changes: changes.length, ahead });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post("/api/publish", async (req, res) => {
  const message = String(req.body?.message ?? "").trim() || `publish ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  try {
    const built = await freshBuild();
    await exec("git", ["add", "-A"], { cwd: root });
    const st = await exec("git", ["status", "--porcelain"], { cwd: root });
    if (st.stdout.trim()) await exec("git", ["commit", "-q", "-m", message], { cwd: root });
    const push = await exec("git", ["push"], { cwd: root });
    res.json({ built, committed: Boolean(st.stdout.trim()), output: push.stderr || push.stdout });
  } catch (e) {
    res.status(500).json({ error: String(e.stderr || e.message) });
  }
});

app.get("/posts/:slug/:file", (req, res, next) => {
  try {
    const file = path.join(dirs.content, safeSlug(req.params.slug), safeName(req.params.file));
    if (fs.existsSync(file)) return res.sendFile(file);
  } catch {}
  next();
});

app.use(express.static(path.join(here, "public")));
app.use(express.static(dirs.site));

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`finetunism editor → http://localhost:${port}`);
});
