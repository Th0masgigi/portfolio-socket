# portfolio-socket

A console-launcher portfolio: project "cartridges" in a 3D carousel.

- **Live site:** https://th0masgigi.github.io/portfolio-socket/
- **Edit cartridges:** open `/admin.html` on the live site, click **Connect GitHub**, and paste a
  fine-grained token limited to this repo with *Contents: Read and write*. Save commits the change
  and GitHub Pages republishes in about a minute.
- **Work locally:** `node server.js`, then open http://127.0.0.1:8124 (admin at `/admin.html`
  saves straight to the files without a token).

Cartridge data lives in `cartridges.json`; password-protected case studies are stored encrypted in
`protected/`. 3D cartridge model by WandererTJ (GrabCAD).
