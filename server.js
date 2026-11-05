// Local dev server for the portfolio.
//   node server.js            → http://127.0.0.1:8124
//
// Serves the site as static files, plus one endpoint (POST /api/commit) that
// admin.html uses to save when you edit on this computer without a GitHub token.
// On the live site (GitHub Pages) admin.html saves through GitHub instead.
//
// Safety: listens on 127.0.0.1 only, accepts saves only from its own pages
// (Origin check + JSON content type, so other websites can't post to it),
// and only writes the paths the admin page manages.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8124;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".mp4": "video/mp4",
  ".stl": "model/stl", ".ico": "image/x-icon",
};
const ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

// Files the admin page may write / delete (mirrors WRITABLE in admin.html)
const WRITABLE = /^(cartridges\.json|lighting\.json|images\/cartridges\/[a-z0-9._-]+|protected\/[a-z0-9._-]+\.json)$/i;
const DELETABLE = /^(images\/[a-z0-9._\/-]+|protected\/[a-z0-9._-]+\.json|(?!index\.html$|admin\.html$|locked\.html$)[a-z0-9._-]+\.html)$/i;

function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(obj));
}

function commit(body) {
  const files = body && body.files;
  if (!Array.isArray(files) || !files.length) throw new Error("Nothing to save");
  for (const f of files) {
    const p = String(f.path || "");
    if (p.includes("..")) throw new Error(`Not allowed: ${p}`);
    if (f.content == null ? !DELETABLE.test(p) : !WRITABLE.test(p)) throw new Error(`Not allowed: ${p}`);
  }
  for (const f of files) {
    const abs = path.join(ROOT, f.path);
    if (f.content == null) { fs.rmSync(abs, { force: true }); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = abs + ".tmp";
    fs.writeFileSync(tmp, Buffer.from(f.content, "base64"));
    fs.renameSync(tmp, abs); // atomic swap so a crash never leaves a half-written file
  }
  console.log(`saved: ${files.map((f) => (f.content == null ? "−" : "+") + f.path).join(", ")}`);
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/commit") {
    if (req.method !== "POST") return res.writeHead(405).end();
    if (!ORIGINS.has(req.headers.origin) || !String(req.headers["content-type"]).startsWith("application/json"))
      return send(res, 403, { error: "Saves are only accepted from this server's own admin page" });
    const chunks = [];
    let size = 0;
    req.on("data", (d) => { size += d.length; if (size > 60e6) req.destroy(); else chunks.push(d); });
    req.on("end", () => {
      try { commit(JSON.parse(Buffer.concat(chunks).toString("utf8"))); send(res, 200, { ok: true }); }
      catch (e) { send(res, 400, { error: e.message }); }
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
  if (/(^|\/)\.|server\.js$/.test(path.relative(ROOT, file))) return res.writeHead(404).end();
  fs.readFile(file, (err, buf) => {
    if (err) return res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : buf);
  });
}).listen(PORT, "127.0.0.1", () => console.log(`portfolio on http://127.0.0.1:${PORT}  (admin: /admin.html)`));
