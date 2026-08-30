const LANGS = { en: "en", es: "es", ca: "es" };

function pickLang(header) {
  const tags = (header || "")
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: tag.toLowerCase(), q: q ? parseFloat(q.slice(2)) : 1, i };
    })
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { tag } of tags) {
    const lang = LANGS[tag.split("-")[0]];
    if (lang) return lang;
  }
  return "en";
}

class Translate {
  element(el) {
    const text = el.getAttribute("data-es");
    if (text !== null) el.setInnerContent(text, { html: true });
  }
}

class SetLang {
  element(el) {
    el.setAttribute("lang", "es");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let lang = null;
    const m = url.pathname.match(/^\/(en|es)(\/.*)?$/);
    if (m) {
      lang = m[1];
      url.pathname = m[2] || "/";
    }
    if (!lang) lang = pickLang(request.headers.get("accept-language"));

    let res = null;
    if (lang === "es" && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      const esUrl = new URL(url);
      esUrl.pathname = url.pathname.replace(/\/?$/, "/") + "index.es";
      const esRes = await env.ASSETS.fetch(new Request(esUrl, request));
      if (esRes.ok) res = esRes;
    }
    if (!res) res = await env.ASSETS.fetch(new Request(url, request));
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;

    const headers = new Headers(res.headers);
    headers.append("Vary", "Accept-Language");
    headers.set("Content-Language", lang);
    const out = new Response(res.body, { status: res.status, headers });
    if (lang !== "es") return out;

    return new HTMLRewriter()
      .on("html", new SetLang())
      .on("[data-es]", new Translate())
      .transform(out);
  },
};
