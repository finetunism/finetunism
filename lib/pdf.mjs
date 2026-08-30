import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { marked } from "marked";

const DEJAVU = "/usr/share/fonts/truetype/dejavu";
const fonts = fs.existsSync(path.join(DEJAVU, "DejaVuSerif.ttf"))
  ? {
      body: path.join(DEJAVU, "DejaVuSerif.ttf"),
      bold: path.join(DEJAVU, "DejaVuSerif-Bold.ttf"),
      italic: path.join(DEJAVU, "DejaVuSerif-Italic.ttf"),
      bolditalic: path.join(DEJAVU, "DejaVuSerif-BoldItalic.ttf"),
      mono: path.join(DEJAVU, "DejaVuSansMono.ttf"),
    }
  : { body: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic", bolditalic: "Times-BoldItalic", mono: "Courier" };

const BODY_SIZE = 10.5;

function width(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function pickFont(state) {
  if (state.bold && state.italic) return fonts.bolditalic;
  if (state.bold) return fonts.bold;
  if (state.italic) return fonts.italic;
  return fonts.body;
}

function plainText(tokens) {
  let out = "";
  for (const t of tokens ?? []) {
    if (t.type === "image") continue;
    out += t.tokens ? plainText(t.tokens) : (t.text ?? "");
  }
  return out;
}

function inline(doc, tokens, state, ctx) {
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "strong":
        inline(doc, t.tokens, { ...state, bold: true }, ctx);
        break;
      case "em":
        inline(doc, t.tokens, { ...state, italic: true }, ctx);
        break;
      case "del":
        inline(doc, t.tokens, { ...state, strike: true }, ctx);
        break;
      case "link":
        inline(doc, t.tokens ?? [{ type: "text", text: t.href }], { ...state, link: t.href }, ctx);
        break;
      case "codespan":
        doc.font(fonts.mono).fontSize(ctx.size - 1).fillColor("#222");
        doc.text(t.text, { continued: true });
        ctx.wrote = true;
        break;
      case "br":
        doc.text("\n", { continued: true });
        ctx.wrote = true;
        break;
      case "image":
        flush(doc, ctx);
        placeImage(doc, t, ctx);
        break;
      case "html":
        break;
      default:
        if (t.tokens) {
          inline(doc, t.tokens, state, ctx);
        } else if (t.text) {
          doc.font(pickFont(state)).fontSize(ctx.size).fillColor(state.link ? "#003366" : ctx.color);
          doc.text(t.text, {
            continued: true,
            underline: Boolean(state.link),
            strike: Boolean(state.strike),
            link: state.link ?? undefined,
            lineGap: 2.5,
          });
          ctx.wrote = true;
        }
    }
  }
}

function flush(doc, ctx) {
  if (!ctx.wrote) return;
  doc.text(" ", { continued: false });
  ctx.wrote = false;
}

function placeImage(doc, t, ctx) {
  const name = decodeURIComponent(t.href ?? "");
  const file = path.join(ctx.dir, path.basename(name));
  if (!/\.(png|jpe?g)$/i.test(file) || !fs.existsSync(file)) return;
  const prevX = doc.x;
  doc.x = doc.page.margins.left;
  doc.moveDown(0.4);
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  if (bottom() - doc.y < 170) doc.addPage();
  const room = bottom() - doc.y - (t.title ? 34 : 12);
  try {
    doc.image(file, { fit: [width(doc), Math.min(330, room)], align: "center" });
  } catch {
    doc.x = prevX;
    return;
  }
  const cap = t.title;
  if (cap) {
    doc.moveDown(0.25);
    doc.font(fonts.italic).fontSize(9).fillColor("#555").text(cap, { align: "center" });
  }
  doc.fillColor("#000");
  doc.moveDown(0.6);
  doc.x = prevX;
}

function paragraph(doc, tokens, ctx) {
  inline(doc, tokens, { bold: false, italic: false, strike: false, link: null }, ctx);
  flush(doc, ctx);
}

function listBlock(doc, t, ctx, depth) {
  t.items.forEach((item, i) => {
    const marker = item.task ? (item.checked ? "☑" : "☐") : t.ordered ? `${(t.start || 1) + i}.` : "•";
    doc.x = doc.page.margins.left + 14 * (depth + 1);
    doc.font(fonts.body).fontSize(ctx.size).fillColor("#000");
    doc.text(`${marker}  `, { continued: true, lineGap: 2.5 });
    ctx.wrote = true;
    for (const tok of item.tokens ?? []) {
      if (tok.type === "list") {
        flush(doc, ctx);
        listBlock(doc, tok, ctx, depth + 1);
      } else if (tok.tokens) {
        inline(doc, tok.tokens, { bold: false, italic: false, strike: false, link: null }, ctx);
      } else if (tok.text) {
        doc.font(fonts.body).fontSize(ctx.size).fillColor("#000");
        doc.text(tok.text, { continued: true, lineGap: 2.5 });
      }
    }
    flush(doc, ctx);
  });
  doc.x = doc.page.margins.left;
  doc.moveDown(0.4);
}

function walk(doc, tokens, ctx) {
  const list = tokens ?? [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    switch (t.type) {
      case "space":
        break;
      case "heading": {
        const sizes = { 1: 15, 2: 13.5, 3: 12, 4: 11 };
        let next = null;
        for (let j = i + 1; j < list.length; j++) {
          if (list[j].type !== "space") {
            next = list[j];
            break;
          }
        }
        const startsWithImage = next?.type === "paragraph" && next.tokens?.[0]?.type === "image";
        const need = startsWithImage ? 230 : 110;
        if (doc.page.height - doc.page.margins.bottom - doc.y < need) doc.addPage();
        else doc.moveDown(0.9);
        doc.font(fonts.bold).fontSize(sizes[Math.min(t.depth, 4)]).fillColor("#000");
        doc.text(plainText(t.tokens), { lineGap: 2 });
        doc.moveDown(0.35);
        break;
      }
      case "paragraph":
        paragraph(doc, t.tokens, ctx);
        doc.moveDown(0.55);
        break;
      case "code": {
        doc.moveDown(0.2);
        const x0 = doc.page.margins.left;
        const y0 = doc.y;
        doc.font(fonts.mono).fontSize(8.5).fillColor("#111");
        doc.text(t.text, x0 + 12, y0, { width: width(doc) - 12, lineGap: 1.5 });
        doc.moveTo(x0 + 3, y0 - 1).lineTo(x0 + 3, doc.y - 2).lineWidth(1.5).strokeColor("#aaa").stroke();
        doc.x = x0;
        doc.fillColor("#000");
        doc.moveDown(0.7);
        break;
      }
      case "blockquote": {
        const x0 = doc.page.margins.left;
        const y0 = doc.y;
        doc.x = x0 + 16;
        const prev = ctx.color;
        ctx.color = "#333";
        for (const tok of t.tokens ?? []) {
          if (tok.type === "paragraph") {
            inline(doc, tok.tokens, { bold: false, italic: true, strike: false, link: null }, ctx);
            flush(doc, ctx);
          } else {
            walk(doc, [tok], ctx);
          }
        }
        ctx.color = prev;
        doc.moveTo(x0 + 4, y0 + 1).lineTo(x0 + 4, doc.y - 2).lineWidth(1.5).strokeColor("#888").stroke();
        doc.x = x0;
        doc.moveDown(0.55);
        break;
      }
      case "list":
        listBlock(doc, t, ctx, 0);
        break;
      case "hr": {
        doc.moveDown(0.4);
        const mid = doc.page.margins.left + width(doc) / 2;
        doc.moveTo(mid - 40, doc.y).lineTo(mid + 40, doc.y).lineWidth(0.7).strokeColor("#666").stroke();
        doc.moveDown(0.9);
        break;
      }
      case "table": {
        doc.font(fonts.mono).fontSize(8.5).fillColor("#000");
        const rows = [t.header, ...t.rows];
        rows.forEach((cells, r) => {
          doc.text(cells.map((c) => plainText(c.tokens) || c.text || "").join("  |  "), { lineGap: 1.5 });
          if (r === 0) doc.text("-".repeat(60), { lineGap: 1.5 });
        });
        doc.moveDown(0.6);
        break;
      }
      case "html":
        break;
      default:
        if (t.tokens) {
          paragraph(doc, t.tokens, ctx);
          doc.moveDown(0.55);
        }
    }
  }
}

export function renderPaper(post, contentDir) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      bufferPages: true,
      margins: { top: 64, bottom: 64, left: 70, right: 70 },
      info: { Title: post.meta.title ?? post.slug, Author: "finetunism" },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.font(fonts.mono).fontSize(8.5).fillColor("#888").text("finetunism.science", { align: "right" });
    doc.moveDown(1.6);
    doc.font(fonts.bold).fontSize(21).fillColor("#000").text(post.meta.title ?? post.slug, { align: "center", lineGap: 3 });
    const tags = String(post.meta.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean).join(" · ");
    const sub = [post.meta.date, tags].filter(Boolean).join("   ·   ");
    if (sub) {
      doc.moveDown(0.5);
      doc.font(fonts.body).fontSize(9.5).fillColor("#444").text(sub, { align: "center" });
    }
    if (post.meta.description) {
      doc.moveDown(0.8);
      doc.font(fonts.italic).fontSize(9.5).fillColor("#333");
      doc.text(`Abstract — ${post.meta.description}`, doc.page.margins.left + 40, doc.y, { width: width(doc) - 80, align: "center" });
      doc.x = doc.page.margins.left;
    }
    doc.moveDown(1);
    const yRule = doc.y;
    doc.moveTo(doc.page.margins.left, yRule).lineTo(doc.page.width - doc.page.margins.right, yRule).lineWidth(0.8).strokeColor("#000").stroke();
    doc.moveDown(1.2);

    const ctx = { size: BODY_SIZE, color: "#000", images: [], dir: contentDir };
    walk(doc, marked.lexer(post.body), ctx);

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font(fonts.mono).fontSize(8).fillColor("#888");
      doc.text(`${i + 1} / ${range.count}`, doc.page.margins.left, doc.page.height - 42, {
        width: width(doc),
        align: "center",
        lineBreak: false,
      });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
