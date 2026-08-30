import { marked } from "marked";

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

export function serializeFrontMatter(meta, body) {
  const lines = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n\n${body.replace(/^\n+/, "")}`;
}

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    image({ href, title, text }) {
      const cap = title ? `<figcaption>${esc(title)}</figcaption>` : "";
      return `<figure><img src="${esc(href)}" alt="${esc(text)}" loading="lazy">${cap}</figure>`;
    },
  },
});

export function renderMarkdown(md) {
  const html = marked.parse(md);
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (whole, inner) => {
    if (!inner.includes("<figure")) return whole;
    return inner
      .split(/(<figure[\s\S]*?<\/figure>)/)
      .map((part) => {
        if (part.startsWith("<figure")) return part;
        const text = part.replace(/^(?:\s|<br\s*\/?>)+|(?:\s|<br\s*\/?>)+$/g, "");
        return text ? `<p>${text}</p>` : "";
      })
      .filter(Boolean)
      .join("\n");
  });
}

export function excerpt(html, max = 220) {
  const text = html
    .replace(/<pre[\s\S]*?<\/pre>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

export function slugify(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "post";
}
