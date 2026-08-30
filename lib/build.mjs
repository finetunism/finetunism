import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, excerpt, parseFrontMatter, renderMarkdown } from "./markdown.mjs";
import { renderPaper } from "./pdf.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dirs = {
  content: path.join(root, "content", "posts"),
  site: path.join(root, "site"),
  templates: path.join(root, "templates"),
};

export const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

function template(name) {
  return fs.readFileSync(path.join(dirs.templates, name), "utf8");
}

function fill(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

export function readPost(slug) {
  const dir = path.join(dirs.content, slug);
  const main = path.join(dir, "index.md");
  if (!fs.existsSync(main)) return null;
  const en = parseFrontMatter(fs.readFileSync(main, "utf8"));
  const esPath = path.join(dir, "index.es.md");
  const es = fs.existsSync(esPath) ? parseFrontMatter(fs.readFileSync(esPath, "utf8")) : null;
  const images = fs.readdirSync(dir).filter((f) => IMAGE.test(f)).sort();
  return { slug, meta: en.meta, body: en.body, es, images, mtime: fs.statSync(main).mtimeMs };
}

export function listPosts() {
  if (!fs.existsSync(dirs.content)) return [];
  return fs
    .readdirSync(dirs.content, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readPost(d.name))
    .filter(Boolean)
    .sort((a, b) => String(b.meta.date ?? "").localeCompare(String(a.meta.date ?? "")) || b.mtime - a.mtime);
}

export function isDraft(post) {
  return String(post.meta.draft ?? "").toLowerCase() === "true";
}

function isFresh(post) {
  const t = Date.parse(post.meta.date ?? "");
  return Number.isFinite(t) && Date.now() - t < 8 * 86400000;
}

function tagList(meta) {
  return String(meta.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function renderPostPage(post, lang = "en") {
  const src = lang === "es" && post.es ? post.es : { meta: post.meta, body: post.body };
  const title = src.meta.title ?? post.meta.title ?? post.slug;
  const content = fill(template("post.html"), {
    date: esc(post.meta.date ?? ""),
    title: esc(title),
    tags: esc(tagList(post.meta).join(", ")),
    body: renderMarkdown(src.body),
    pdf: isProject(post) ? `          <a class="post__pdf" href="/posts/${esc(post.slug)}/paper.pdf">[ pdf ]</a>` : "",
  });
  return fill(template("layout.html"), {
    lang,
    title: `${esc(title)} — finetunism`,
    home_current: "",
    content,
  });
}

function postEntry(post) {
  const html = renderMarkdown(post.body);
  const desc = post.meta.description || excerpt(html);
  const esTitle = post.es?.meta.title ? ` data-es="${esc(post.es.meta.title)}"` : "";
  const esDesc = post.es ? ` data-es="${esc(post.es.meta.description || excerpt(renderMarkdown(post.es.body)))}"` : "";
  return `      <article class="post">
        <div class="post__head">
          <span class="post__date">==[ ${esc(post.meta.date ?? "")} ]</span>
          <span class="post__rule"></span>
        </div>
        <h2><a href="/posts/${esc(post.slug)}/"${esTitle}>${esc(post.meta.title ?? post.slug)}</a>${isFresh(post) ? '<span class="blink" data-es="[nuevo]">[new]</span>' : ""}</h2>
        <p class="post__tags"><span data-es="etiquetas:">tags:</span> ${esc(tagList(post.meta).join(", "))}</p>
        <p${esDesc}>${esc(desc)}</p>
        <a class="post__more" href="/posts/${esc(post.slug)}/" data-es="&gt;&gt; leer más">&gt;&gt; read more</a>
        <div class="post__foot"></div>
      </article>
`;
}

export function isProject(post) {
  return String(post.meta.project ?? "").toLowerCase() === "true";
}

function projectEntry(post) {
  const es = post.es?.meta.title ? ` data-es="${esc(post.es.meta.title)}"` : "";
  return `          <li><a href="/posts/${esc(post.slug)}/"${es}>${esc(post.meta.title ?? post.slug)}</a></li>`;
}

export function renderIndexPage(posts) {
  const projects = posts.filter(isProject);
  const content = fill(template("index.html"), {
    posts: posts.map(postEntry).join("\n"),
    projects: projects.length
      ? projects.map(projectEntry).join("\n")
      : '          <li><span data-es="nada todavía">nothing yet</span></li>',
  });
  return fill(template("layout.html"), {
    lang: "en",
    title: "FINETUNISM",
    home_current: ' aria-current="page"',
    content,
  });
}

export async function build() {
  const published = listPosts().filter((p) => !isDraft(p));
  const out = path.join(dirs.site, "posts");
  fs.rmSync(out, { recursive: true, force: true });
  for (const post of published) {
    const dir = path.join(out, post.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), renderPostPage(post, "en"));
    if (post.es) fs.writeFileSync(path.join(dir, "index.es.html"), renderPostPage(post, "es"));
    for (const img of post.images) {
      fs.copyFileSync(path.join(dirs.content, post.slug, img), path.join(dir, img));
    }
    if (isProject(post)) {
      fs.writeFileSync(path.join(dir, "paper.pdf"), await renderPaper(post, path.join(dirs.content, post.slug)));
    }
  }
  fs.writeFileSync(path.join(dirs.site, "index.html"), renderIndexPage(published));
  return published.map((p) => p.slug);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const slugs = await build();
  if (process.argv.includes("--json")) console.log(JSON.stringify(slugs));
  else console.log(`built ${slugs.length} post(s): ${slugs.join(", ") || "-"}`);
}
