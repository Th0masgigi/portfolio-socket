// Password protection for case studies.
//
// A protected case study is stored as protected/<id>.json:
//   { v: 1, kdf: "PBKDF2-SHA256", iter, salt, iv, data }   (all base64)
// `data` is the whole page (HTML with its images and video inlined as data URIs),
// encrypted with AES-GCM using a key derived from the password. Without the password
// the file is unreadable, so it is safe to keep in a public repo.

const ITER = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = {
  from(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  to(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

async function keyFrom(password, salt, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function encryptText(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, ITER);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  return { v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64.from(salt), iv: b64.from(iv), data: b64.from(data) };
}

/** Returns the plaintext, or throws if the password is wrong. */
export async function decryptText(box, password) {
  const key = await keyFrom(password, b64.to(box.salt), box.iter || ITER);
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.to(box.iv) }, key, b64.to(box.data));
  return dec.decode(data);
}

/**
 * Fetch a same-site page and inline everything it loads from this site
 * (img/video/source/poster, plus stylesheet <link>s) as data URIs, so the
 * encrypted copy is self-contained and the originals can be removed.
 */
export async function bundlePage(href) {
  const pageUrl = new URL(href, location.href);
  const html = await (await fetch(pageUrl, { cache: "no-store" })).text();
  const doc = new DOMParser().parseFromString(html, "text/html");

  const sameSite = (u) => u.origin === location.origin;
  const toDataUri = async (u) => {
    const blob = await (await fetch(u, { cache: "no-store" })).blob();
    return `data:${blob.type || "application/octet-stream"};base64,${b64.from(await blob.arrayBuffer())}`;
  };

  const jobs = [];
  doc.querySelectorAll("img[src], video[src], source[src], audio[src], video[poster]").forEach((el) => {
    ["src", "poster"].forEach((attr) => {
      const v = el.getAttribute(attr);
      if (!v || v.startsWith("data:")) return;
      const u = new URL(v, pageUrl);
      if (sameSite(u)) jobs.push(toDataUri(u).then((d) => el.setAttribute(attr, d)));
    });
  });
  doc.querySelectorAll('link[rel="stylesheet"][href]').forEach((el) => {
    const u = new URL(el.getAttribute("href"), pageUrl);
    if (!sameSite(u)) return;
    jobs.push(fetch(u).then((r) => r.text()).then((css) => {
      const style = doc.createElement("style");
      style.textContent = css;
      el.replaceWith(style);
    }));
  });
  await Promise.all(jobs);
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
