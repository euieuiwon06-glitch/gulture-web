# gulture — Clothes in Motion

Web version of the gulture homepage screens, built from the Figma file
(pages "홈페이지 1440" / "홈페이지 1920" / "홈페이지").

- Live: https://euieuiwon06-glitch.github.io/gulture-web/
- Three sizes of every screen are in the page — 1440×900, 1920×1080 and 2048×940.
  The browser shows the one whose aspect ratio is closest to the window and fits it
  without cropping (portrait phones get the 1440 set at full width).
- Navigate with the header links / buttons, the ☰ menu (all screens), or ← → keys.
- Sliders, radios, segmented tabs, filter chips, card selection, front/side/back views
  and both chat inputs work in every size (`assets/interact.js`).

## Rebuild

```
python tools/build.py
```

`tools/figma1440/*.json` is the layer export of the 1440 master frames (each layer also
records its original 1920 geometry as `o`). `build.py` derives the 1920 and 2048 sets with
the same rule used in Figma: positions and boxes scale with the frame, text / circles /
icons / logo scale uniformly, cropped photos are re-fitted. `tools/figma1920_crops.json` keeps photo crops adjusted directly on the 1920 page.
`assets/logo.svg` is the
vector logo, `assets/img/` the photos (WebP, from the 4K slot-fit set).
