// Interactive states for the static Figma screens: sliders, radios, segmented
// controls, chips, card selection, view switching and the two chat inputs.
// Elements are found by their Figma geometry (data-b="x,y,w,h", stage px).
(() => {
  const INK = '#121212', WHITE = '#ffffff', GRAY = '#808080';
  const IMG = n => 'url(assets/img/' + n + '.webp) center / cover no-repeat';
  const S = id => document.getElementById(id);
  const geo = el => el.dataset.b.split(',').map(Number);

  function at(root, x, y, w) {
    root = typeof root === 'string' ? S(root) : root;
    for (const el of root.children) {
      if (!el.dataset || !el.dataset.b) continue;
      const b = geo(el);
      if (Math.abs(b[0] - x) < 1.1 && Math.abs(b[1] - y) < 1.1 && (w == null || Math.abs(b[2] - w) < 1.1)) return el;
    }
    console.warn('[interact] not found', root.id, x, y, w);
    return document.createElement('div');
  }
  const ink = (el, color, weight) => el.querySelectorAll('span').forEach(s => {
    if (color) s.style.color = color;
    if (weight) s.style.fontWeight = weight;
  });
  const setText = (el, str) => { el.querySelector('span').textContent = str; };
  function tap(el, fn) {
    el.classList.add('ui');
    el.addEventListener('click', e => { e.stopPropagation(); fn(e); });
  }
  function make(parent, css, html) {
    const d = document.createElement('div');
    d.className = 'n';
    d.style.cssText = css;
    if (html != null) d.innerHTML = html;
    parent.appendChild(d);
    return d;
  }
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('on'), 1800);
  }

  // move the label out of a pill frame so the pill can slide under other labels
  function liftText(fr) {
    const t = fr.querySelector('.t'), fb = geo(fr), tb = geo(t);
    const x = fb[0] + tb[0], y = fb[1] + tb[1];
    t.style.left = x + 'px'; t.style.top = y + 'px';
    t.dataset.b = [x, y, tb[2], tb[3]].join(',');
    fr.parentNode.appendChild(t);
    return t;
  }

  // a dark pill/circle that slides under the chosen label
  function pillGroup(pill, opts, o = {}) {
    const on = o.on || WHITE, off = o.off || INK;
    pill.classList.add('mv');
    pill.style.zIndex = 1;
    opts.forEach(t => { t.style.zIndex = 2; });
    function select(i) {
      const tb = geo(opts[i]);
      const w = o.fixedW || tb[2] + 2 * o.pad;
      let left = tb[0] + tb[2] / 2 - w / 2;
      if (o.bounds) left = Math.min(Math.max(left, o.bounds[0]), o.bounds[1] - w);
      pill.style.width = w + 'px';
      pill.style.left = left + 'px';
      opts.forEach((t, j) => ink(t, j === i ? on : off));
      if (o.onSelect) o.onSelect(i);
    }
    opts.forEach((t, i) => tap(t, () => select(i)));
    return select;
  }

  // draggable slider: track + fill + knob; stops = optional snap points (0..1)
  function slider(track, fill, knob, o = {}) {
    const tb = geo(track), kb = geo(knob), x0 = tb[0], W = tb[2];
    let cur = fill ? geo(fill)[2] / W : (geo(knob)[0] + kb[2] / 2 - x0) / W;
    function set(t, silent) {
      t = Math.max(0, Math.min(1, t));
      if (o.stops) t = o.stops.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a);
      cur = t;
      if (fill) fill.style.width = t * W + 'px';
      knob.style.left = x0 + t * W - kb[2] / 2 + 'px';
      if (!silent && o.onChange) o.onChange(t);
    }
    const hit = make(track.parentNode,
      `left:${x0 - 14}px;top:${tb[1] - 20}px;width:${W + 28}px;height:${tb[3] + 40}px;z-index:3;touch-action:none`);
    hit.classList.add('ui');
    const pos = e => { const r = track.getBoundingClientRect(); return (e.clientX - r.left) / r.width; };
    hit.addEventListener('pointerdown', e => {
      e.stopPropagation();
      hit.setPointerCapture(e.pointerId);
      set(pos(e));
      const mv = ev => set(pos(ev));
      hit.addEventListener('pointermove', mv);
      hit.addEventListener('pointerup', () => hit.removeEventListener('pointermove', mv), { once: true });
    });
    hit.addEventListener('click', e => e.stopPropagation());
    return { set, get: () => cur };
  }

  function editableNumber(el, onInput) {
    const s = el.querySelector('span');
    s.contentEditable = 'true';
    s.spellcheck = false;
    s.style.outline = 'none';
    el.classList.add('ui', 'edit');
    el.addEventListener('click', e => { e.stopPropagation(); s.focus(); });
    s.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); s.blur(); }
      else if (e.key.length === 1 && !/[0-9.]/.test(e.key)) e.preventDefault();
    });
    s.addEventListener('input', () => onInput && onInput(s.textContent));
  }

  // view switcher: labels/thumbs pick FRONT / SIDE / BACK, swaps the main photo
  function viewSwitch(o) {
    const base = o.main.style.background;
    function select(i) {
      o.labels.forEach((l, j) => ink(l, null, j === i ? o.boldW || 600 : 400));
      if (o.underline) {
        const lb = geo(o.labels[i]);
        o.underline.classList.add('mv');
        o.underline.style.left = lb[0] + 'px';
        o.underline.style.width = lb[2] + 'px';
      }
      if (o.thumbs && o.ring) o.thumbs.forEach((t, j) => { t.style.border = j === i ? o.ring : 'none'; });
      o.main.style.background = i === 0 && o.keepFront ? base : IMG(o.images[i]);
      if (o.onSelect) o.onSelect(i);
    }
    o.labels.forEach((l, i) => tap(l, () => select(i)));
    (o.thumbs || []).forEach((t, i) => tap(t, () => select(i)));
    return select;
  }

  /* ---------- 08 body proportions ---------- */
  (() => {
    const s = 'body';
    const rings = [at(s, 354, 635), at(s, 561, 635), at(s, 802, 635)];
    const dot = at(s, 361, 642);
    dot.classList.add('mv');
    const pickId = i => { dot.style.left = geo(rings[i])[0] + 7 + 'px'; };
    rings.forEach((r, i) => tap(r, () => pickId(i)));
    [at(s, 413, 641), at(s, 619, 641), at(s, 860, 641)].forEach((l, i) => tap(l, () => pickId(i)));

    [[746, 737, 298], [824, 816, 160], [907, 898, 400], [992, 983, 171]].forEach(([y, ky, fw]) =>
      slider(at(s, 427, y, 587), at(s, 427, y, fw), findKnob(s, ky)));

    const bg = at(s, 1625, 140, 215), fr = at(s, 1625, 140, 112);
    const front = liftText(fr), side = at(s, 1773, 151);
    pillGroup(fr, [front, side], { fixedW: 112, bounds: [1625, 1840] });

    editableNumber(at(s, 52, 485), v => { setText(at('analysis', 1000, 562), (v || '0') + ' CM'); });
    editableNumber(at(s, 617, 485));
  })();
  function findKnob(s, y) {
    for (const el of S(s).children) {
      const b = el.dataset.b && geo(el);
      if (b && Math.abs(b[1] - y) < 1.1 && b[2] === 19 && b[3] === 19) return el;
    }
  }

  /* ---------- 10 choose profile ---------- */
  (() => {
    const s = 'profile';
    const val = at(s, 47, 554);
    let unit = 'cm', cm = 178;
    const show = () => setText(val, unit === 'cm' ? String(cm)
      : Math.floor(cm / 30.48) + "'" + Math.round((cm / 2.54) % 12));
    slider(at(s, 52, 660, 347), at(s, 52, 660, 188), at(s, 230, 649), {
      onChange: t => { cm = Math.round(150 + 50 * t); show(); },
    });
    const ul = at(s, 218, 625), cmT = at(s, 218, 599), ftT = at(s, 270, 599);
    ul.classList.add('mv');
    tap(cmT, () => { unit = 'cm'; ul.style.left = '218px'; ul.style.width = '23px'; show(); });
    tap(ftT, () => { unit = 'ft'; ul.style.left = '270px'; ul.style.width = '19px'; show(); });

    // fit preference: 5 stops on the line, three labels
    make(S(s), 'left:225.5px;top:842px;width:7px;height:7px;border-radius:50%;background:' + INK);
    const big = at(s, 221, 836);
    S(s).appendChild(big);
    const labels = [at(s, 56, 802), at(s, 188, 802), at(s, 317, 802)];
    const xs = [58.5, 143.5, 229, 314.5, 399.5];
    const line = at(s, 58, 845, 343);
    const stops = xs.map(x => (x - 58) / 343);
    const fit = slider(line, null, big, {
      stops,
      onChange: t => {
        const i = stops.indexOf(t);
        labels.forEach((l, j) => ink(l, null, j === (i < 2 ? 0 : i === 2 ? 1 : 2) ? 600 : 400));
      },
    });
    labels.forEach((l, j) => tap(l, () => fit.set(stops[j + 1])));

    pillGroup(at(s, 154, 932), [at(s, 88, 952), at(s, 176, 952), at(s, 270, 952), at(s, 351, 952)], { fixedW: 62 });

    const cards = [at(s, 448, 125), at(s, 778, 125), at(s, 1092, 125)];
    cards.forEach((c, i) => tap(c, () => cards.forEach((d, j) => {
      d.style.boxShadow = j === i ? 'inset 0 0 0 4px ' + INK : 'none';
    })));
  })();

  /* ---------- 11 define your taste ---------- */
  (() => {
    const s = 'taste';
    const count = at(s, 56, 539);
    const cards = [[414, 110, 1], [811, 110, 0], [1185, 110, 1], [1544, 110, 0], [1544, 470, 1]].map(([x, y, on]) => {
      const el = at(s, x, y), b = geo(el);
      const dot = on ? findDot(s, b) : make(S(s),
        `left:${b[0] + b[2] - 38}px;top:${b[1] + 16}px;width:19px;height:19px;border-radius:50%;background:${INK}`);
      return { el, dot, on: !!on };
    });
    const refresh = () => {
      cards.forEach(c => {
        c.el.style.border = c.on ? '2px solid ' + INK : 'none';
        c.dot.style.display = c.on ? 'block' : 'none';
      });
      setText(count, String(cards.filter(c => c.on).length).padStart(2, '0') + ' SELECTED');
    };
    cards.forEach(c => { tap(c.el, () => { c.on = !c.on; refresh(); }); tap(c.dot, () => { c.on = !c.on; refresh(); }); });
    refresh();

    const fitPill = at(s, 857, 887);
    const relaxed = liftText(fitPill);
    pillGroup(fitPill, [at(s, 425, 902), at(s, 646, 902), relaxed, at(s, 1173, 902)], { pad: 60 });
    const moodPill = at(s, 414, 981);
    const mono = liftText(moodPill);
    pillGroup(moodPill, [mono, at(s, 794, 995), at(s, 1027, 995)], { pad: 62 });
  })();
  function findDot(s, b) {
    for (const el of S(s).children) {
      const g = el.dataset.b && geo(el);
      if (g && g[2] === 19 && g[0] > b[0] + b[2] - 50 && g[0] < b[0] + b[2] && Math.abs(g[1] - b[1] - 16) < 4) return el;
    }
  }

  /* ---------- 14 three directions ---------- */
  (() => {
    const s = 'directions';
    const cards = [[558, 501], [1093, 368], [1489, 368]].map(([x, w]) => ({ img: at(s, x, 118), line: at(s, x, 950, w) }));
    cards.forEach((c, i) => tap(c.img, () => cards.forEach((d, j) => {
      d.line.style.height = j === i ? '3px' : '1px';
      d.img.style.opacity = j === i ? '1' : '.55';
    })));
  })();

  /* ---------- 05 looks: filter chips ---------- */
  (() => {
    const s = 'looks';
    const chips = [at(s, 1148, 176), at(s, 1292, 176), at(s, 1503, 176), at(s, 1714, 176)];
    const photos = { line: at(s, 26, 279), knitA: at(s, 407, 279), knitB: at(s, 407, 752), layer: at(s, 789, 279),
                     utility: at(s, 1152, 279), coat: at(s, 1526, 279), wool: at(s, 1526, 752) };
    const groups = [null, ['layer', 'utility', 'coat'], ['line', 'coat', 'wool'], ['knitA', 'knitB']];
    chips.forEach((c, i) => {
      c.removeAttribute('data-go');
      tap(c, () => {
        chips.forEach((d, j) => {
          d.style.background = j === i ? INK : WHITE;
          d.style.border = '1.5px solid ' + INK;
          ink(d, j === i ? WHITE : INK);
        });
        Object.entries(photos).forEach(([k, el]) => {
          el.style.transition = 'opacity .3s ease';
          el.style.opacity = !groups[i] || groups[i].includes(k) ? '1' : '.18';
        });
      });
    });
  })();

  /* ---------- 04 look detail A ---------- */
  viewSwitch({
    labels: [at('look-a', 1067, 788), at('look-a', 1142, 788), at('look-a', 1197, 788)],
    underline: at('look-a', 1067, 813),
    thumbs: [at('look-a', 1001, 826), at('look-a', 1141, 826), at('look-a', 1280, 826)],
    main: at('look-a', 23, 117),
    images: ['05_structured_front', '06_structured_side', '07_structured_back'],
  });

  /* ---------- 06 look detail B: segmented FRONT / SIDE / BACK ---------- */
  (() => {
    const s = 'look-b';
    const fr = at(s, 1428, 749);
    const front = liftText(fr);
    const viewA = at(s, 1424, 704), viewB = at(s, 1576, 704);
    const names = ['FRONT', 'SIDE', 'BACK'];
    const main = at(s, 23, 117);
    const imgs = ['05_structured_front', '06_structured_side', '07_structured_back'];
    pillGroup(fr, [front, at(s, 1632, 772), at(s, 1783, 772)], {
      fixedW: 145,
      onSelect: i => {
        setText(viewA, 'VIEW  /  ' + names[i]);
        setText(viewB, names.filter((_, j) => j !== i).join('  '));
        main.style.background = IMG(imgs[i]);
      },
    });
  })();

  /* ---------- 03 fitting dashboard ---------- */
  viewSwitch({
    labels: [at('fitting', 878, 973), at('fitting', 1086, 973), at('fitting', 1288, 973)],
    thumbs: [at('fitting', 816, 645), at('fitting', 1019, 645), at('fitting', 1221, 645)],
    ring: '2.5px solid ' + INK,
    main: at('fitting', 30, 117),
    images: ['05_structured_front', '06_structured_side', '07_structured_back'],
  });

  /* ---------- 16 fitting room ---------- */
  (() => {
    const s = 'fitting-room';
    viewSwitch({
      labels: [at(s, 1315, 675), at(s, 1467, 675), at(s, 1614, 675)],
      thumbs: [at(s, 1281, 529), at(s, 1428, 529), at(s, 1574, 529)],
      ring: '1.5px solid ' + INK, boldW: 500, keepFront: true,
      main: at(s, 274, 132),
      images: ['20_structured_studio_cutout', '06_structured_side', '07_structured_back'],
    });
    const tabs = [at(s, 1315, 776), at(s, 1452, 776), at(s, 1574, 776)];
    const ul = at(s, 1300, 804);
    ul.classList.add('mv');
    tabs.forEach((t, i) => tap(t, () => {
      const b = geo(t), w = b[2] + 33;
      ul.style.left = b[0] + b[2] / 2 - w / 2 + 'px';
      ul.style.width = w + 'px';
      tabs.forEach((u, j) => ink(u, null, j === i ? 500 : 400));
    }));
  })();

  /* ---------- 18 outfit: accordion rows ---------- */
  (() => {
    const s = 'outfit';
    [[688, 691, 'FINE MERINO  /  THE ROW'],
     [775, 778, 'FLUID WOOL  /  THE ROW']].forEach(([ty, iy, info]) => {
      const row = at(s, 922, ty), icon = at(s, 1765, iy);
      icon.classList.add('rot');
      const detail = make(S(s), `left:1420px;top:${ty + 8}px;white-space:pre;font:400 15px 'Geist',sans-serif;` +
        `letter-spacing:.15em;color:${GRAY};opacity:0;transition:opacity .3s ease`, info);
      let open = false;
      const toggle = () => {
        open = !open;
        icon.style.transform = open ? 'rotate(45deg)' : 'none';
        detail.style.opacity = open ? '1' : '0';
      };
      tap(row, toggle);
      tap(icon, toggle);
    });
    tap(at(s, 1566, 503), () => toast('Opening THE ROW…'));
  })();

  /* ---------- chats ---------- */
  const REPLIES = [
    "Got it. I'll keep the shoulders structured and let the trousers fall loose.",
    'Try LOOK 02 — the soft knit balances a long coat.',
    'Noted. Monochrome, layered, easy to move in.',
    "I'd pair that with a wool trouser in graphite.",
  ];
  const now = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toUpperCase();

  function chat(o) {
    const scr = S(o.screen);
    const [cx, cy, cw, ch] = o.clip;
    const clip = make(scr, `left:${cx}px;top:${cy}px;width:${cw}px;height:${ch}px;overflow:hidden`);
    const inner = make(clip, 'left:0;top:0;width:100%;height:100%;transition:transform .45s ease');
    let bottom = 0;
    [...scr.children].forEach(el => {
      if (!el.dataset.b || el === clip) return;
      const b = geo(el);
      if (o.take(b)) {
        el.style.left = b[0] - cx + 'px';
        el.style.top = b[1] - cy + 'px';
        inner.appendChild(el);
        bottom = Math.max(bottom, b[1] + b[3] - cy);
      }
    });
    let n = 0;
    const scroll = () => {
      const over = bottom + 20 - ch;
      inner.style.transform = over > 0 ? `translateY(${-over}px)` : 'none';
    };
    const add = (who, text) => {
      const box = o.render(inner, who, text, bottom + o.gap);
      bottom = bottom + o.gap + box;
      scroll();
    };
    const [ix, iy, iw, ih] = o.input;
    const field = document.createElement('input');
    field.type = 'text';
    field.placeholder = o.placeholder;
    field.className = 'n chat-input';
    field.style.cssText = `left:${ix}px;top:${iy}px;width:${iw}px;height:${ih}px;` + o.inputStyle;
    scr.appendChild(field);
    o.hidePlaceholder.style.display = 'none';
    ['click', 'pointerdown', 'keydown'].forEach(ev => field.addEventListener(ev, e => e.stopPropagation()));
    const send = () => {
      const v = field.value.trim();
      if (!v) { field.focus(); return; }
      field.value = '';
      add('you', v);
      setTimeout(() => add('bot', REPLIES[n++ % REPLIES.length]), 650);
    };
    field.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    o.send.forEach(b => { b.removeAttribute('data-go'); tap(b, send); });
    return { add };
  }

  // 12 style chat session (wide chat window)
  (() => {
    const s = 'chat-session';
    const avatarBg = at(s, 1291, 329).style.background;
    chat({
      screen: s, clip: [274, 116, 1135, 816], gap: 30,
      take: b => b[0] >= 300 && b[0] < 1400 && b[1] >= 150 && b[1] < 900,
      input: [350, 954, 900, 44], placeholder: 'ASK ABOUT LOOKS, FIT, OR OCCASION',
      inputStyle: "font:400 16px 'Geist',sans-serif;letter-spacing:.18em;color:#121212",
      hidePlaceholder: at(s, 350, 966),
      send: [at(s, 1297, 946), at(s, 1312, 961)],
      render(inner, who, text, y) {
        const g = make(inner, `left:0;top:${y - 15}px;width:100%;height:1px`);
        make(g, `left:54px;top:0;width:1027px;height:1px;background:${INK}`);
        y += 20;
        const lbl = "font:500 14px 'Geist',sans-serif;letter-spacing:.15em;white-space:pre;";
        if (who === 'you') {
          make(inner, `left:863px;top:${y + 4}px;${lbl}color:${INK}`, 'YOU');
          make(inner, `left:916px;top:${y + 4}px;${lbl}font-weight:400;color:${GRAY}`, now());
          make(inner, `left:1017px;top:${y}px;width:62px;height:62px;border-radius:50%;background:${avatarBg}`);
          const bub = make(inner, `right:129px;top:${y + 33}px;max-width:640px;padding:17px 25px;border-radius:11px;` +
            `background:#f1f1f1;font:400 21px 'Geist',sans-serif;color:${INK}`);
          bub.textContent = text;
          return 20 + 33 + bub.offsetHeight;
        }
        make(inner, `left:65px;top:${y}px;width:62px;height:62px;border-radius:50%;background:${INK};` +
          `color:#fff;font:500 36px 'Geist',sans-serif;text-align:center;line-height:52px`, 'g');
        make(inner, `left:170px;top:${y + 12}px;${lbl}color:${INK}`, 'GULTURE');
        make(inner, `left:279px;top:${y + 12}px;${lbl}font-weight:400;color:${GRAY}`, now());
        const t = make(inner, `left:170px;top:${y + 46}px;max-width:760px;font:400 22px/150% 'Geist',sans-serif;color:${INK}`);
        t.textContent = text;
        return 20 + Math.max(62, 46 + t.offsetHeight);
      },
    });
  })();

  // 13 style chat (left column)
  (() => {
    const s = 'chat';
    const personIcon = at(s, 473, 645).innerHTML;
    chat({
      screen: s, clip: [80, 470, 445, 445], gap: 34,
      take: b => b[0] < 540 && b[1] >= 480 && b[1] < 900,
      input: [112, 938, 290, 44], placeholder: 'Ask about color, fit, or mood...',
      inputStyle: "font:400 16px 'Geist',sans-serif;color:#121212",
      hidePlaceholder: at(s, 112, 948),
      send: [at(s, 411, 933)],
      render(inner, who, text, y) {
        const font = "font:400 19px/140% 'Geist',sans-serif;";
        if (who === 'you') {
          make(inner, `left:381px;top:${y + 7}px;width:49px;height:49px;border-radius:50%;background:#ebebeb`,
            `<div class="n" style="left:12px;top:14px;width:25px;height:25px">${personIcon}</div>`);
          const bub = make(inner, `right:86px;top:${y}px;max-width:270px;padding:17px 22px;border-radius:19px;` +
            `background:${INK};${font}color:#fff`);
          bub.textContent = text;
          return bub.offsetHeight;
        }
        make(inner, `left:9px;top:${y + 8}px;width:47px;height:47px;border-radius:50%;background:${INK};` +
          `color:#fff;font:500 27px 'Geist',sans-serif;text-align:center;line-height:40px`, 'g');
        const bub = make(inner, `left:82px;top:${y}px;max-width:281px;padding:18px 20px;border-radius:19px;` +
          `background:#f1f1f1;${font}color:${INK}`);
        bub.textContent = text;
        return bub.offsetHeight;
      },
    });
  })();
})();
