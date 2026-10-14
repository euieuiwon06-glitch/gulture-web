# gulture — Clothes in Motion

Web version of the gulture homepage screens, built 1:1 from the Figma file
(page "홈페이지", 19 frames at 1920×1080).

- Live: https://euieuiwon06-glitch.github.io/gulture-web/
- Each screen is reproduced with absolute positioning from the Figma layer export and scaled to the browser width.
- Navigate with the header links / buttons, the ☰ menu (all screens), or ← → keys.
- Sliders, radios, segmented tabs, filter chips, card selection, view switching (front/side/back) and both chat inputs work (`assets/interact.js`).

## Rebuild

```
python tools/build.py
```

`tools/figma/*.json` holds the exported layer tree, `tools/template.html` the page shell,
`assets/img/` the photos (WebP, from the 4K slot-fit set).
