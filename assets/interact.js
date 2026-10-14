// Interactive states for the static Figma screens: sliders, radios, segmented
// controls, chips, card selection, view switching and the two chat inputs.
//
// The page holds three sets of screens (1440 / 1920 / 2048). Every element
// carries data-b = its real geometry in that set and data-o = the geometry of
// the same layer in the original 1920 design, so elements are looked up by
// data-o (identical in every set) and positioned with data-b (set specific).
(() => {
  const INK = '#121212', WHITE = '#ffffff', GRAY = '#808080';
  const IMG = n => 'url(assets/img/' + n + '.webp) center / cover no-repeat';
  const nums = s => s.split(',').map(Number);
  const geo = el => nums(el.dataset.b);
  const ink = (el, color, weight) => el.querySelectorAll('span').forEach(s => {
    if (color) s.style.color = color;
    if (weight) s.style.fontWeight = weight;
  });
  const setText = (el, str) => { el.querySelector('span').textContent = str; };
  const setB = (el, b) => { el.dataset.b = b.map(v => Math.round(v * 100) / 100).join(','); };

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

  // every set gets its own copy of the behaviour
  document.querySelectorAll('.stage').forEach(stage => setup(stage));

  function setup(stage) {
    const W = +stage.dataset.w, H = +stage.dataset.h;
    const k = { 1440: 0.75, 1920: 1, 2048: 940 / 1080 }[stage.dataset.set];   // uniform scale vs original 1920
    const S = slug => stage.querySelector('.screen[data-slug="' + slug + '"]');

    // all direct children whose original geometry matches (x, y[, w])
    function atAll(root, x, y, w) {
      root = typeof root === 'string' ? S(root) : root;
      const out = [];
      for (const el of root.children) {
        if (!el.dataset || !el.dataset.o) continue;
        const o = nums(el.dataset.o);
        if (Math.abs(o[0] - x) < 1.1 && Math.abs(o[1] - y) < 1.1 && (w == null || Math.abs(o[2] - w) < 1.1)) out.push(el);
      }
      return out;
    }
    function at(root, x, y, w) {
      const r = atAll(root, x, y, w);
      if (!r.length) {
        console.warn('[interact ' + stage.dataset.set + '] not found', typeof root === 'string' ? root : '', x, y, w);
        return document.createElement('div');
      }
      return r[0];
    }

    // move the label out of a pill frame so the pill can slide under other labels
    function liftText(fr) {
      const t = fr.querySelector('.t'), fb = geo(fr), tb = geo(t);
      const b = [fb[0] + tb[0], fb[1] + tb[1], tb[2], tb[3]];
      t.style.left = b[0] + 'px'; t.style.top = b[1] + 'px';
      setB(t, b);
      fr.parentNode.appendChild(t);
      return t;
    }

    // a dark pill / circle that slides under the chosen label
    function pillGroup(pill, opts, o = {}) {
      const on = o.on || WHITE, off = o.off || INK;
      const fixedW = o.fixed ? geo(pill)[2] : 0;
      pill.classList.add('mv');
      pill.style.zIndex = 1;
      opts.forEach(t => { t.style.zIndex = 2; });
      function select(i) {
        const tb = geo(opts[i]);
        const w = fixedW || tb[2] + 2 * o.pad;
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
      const tb = geo(track), kb = geo(knob), x0 = tb[0], Wd = tb[2];
      function set(t, silent) {
        t = Math.max(0, Math.min(1, t));
        if (o.stops) t = o.stops.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a);
        if (fill) fill.style.width = t * Wd + 'px';
        knob.style.left = x0 + t * Wd - kb[2] / 2 + 'px';
        if (!silent && o.onChange) o.onChange(t);
      }
      const pad = 14 * k;
      const hit = make(track.parentNode,
        `left:${x0 - pad}px;top:${tb[1] - 20 * k}px;width:${Wd + 2 * pad}px;height:${tb[3] + 40 * k}px;z-index:3;touch-action:none`);
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
      return { set };
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
      const ring = o.thumbs && o.thumbs[0].style.border;
      function select(i) {
        o.labels.forEach((l, j) => ink(l, null, j === i ? o.boldW || 600 : 400));
        if (o.underline) {
          const lb = geo(o.labels[i]);
          o.underline.classList.add('mv');
          o.underline.style.left = lb[0] + 'px';
          o.underline.style.width = lb[2] + 'px';
        }
        if (ring) o.thumbs.forEach((t, j) => { t.style.border = j === i ? ring : 'none'; });
        o.main.style.background = i === 0 && o.keepFront ? base : IMG(o.images[i]);
      }
      o.labels.forEach((l, i) => tap(l, () => select(i)));
      (o.thumbs || []).forEach((t, i) => tap(t, () => select(i)));
    }
    const VIEWS = ['05_structured_front', '06_structured_side', '07_structured_back'];

    /* ---------- 01 loading: animated progress ---------- */
    const bars = atAll('loading', 786, 536, 331);
    if (bars[1]) bars[1].classList.add('load-fill');

    /* ---------- 08 body proportions ---------- */
    (() => {
      const s = 'body';
      const rings = [at(s, 354, 635), at(s, 561, 635), at(s, 802, 635)];
      const dot = at(s, 361, 642);
      dot.classList.add('mv');
      const pick = i => { const r = geo(rings[i]); dot.style.left = r[0] + (r[2] - geo(dot)[2]) / 2 + 'px'; };
      rings.forEach((r, i) => tap(r, () => pick(i)));
      [at(s, 413, 641), at(s, 619, 641), at(s, 860, 641)].forEach((l, i) => tap(l, () => pick(i)));

      [[746, 715, 737], [824, 577, 816], [907, 817, 898], [992, 588, 983]].forEach(([y, kx, ky]) => {
        const [track, fill] = atAll(s, 427, y, 587);
        slider(track, fill, at(s, kx, ky));
      });

      const bg = geo(at(s, 1625, 140, 215)), fr = at(s, 1625, 140, 112);
      const front = liftText(fr), side = at(s, 1773, 151);
      pillGroup(fr, [front, side], { fixed: true, bounds: [bg[0], bg[0] + bg[2]] });

      editableNumber(at(s, 52, 485), v => setText(at('analysis', 1000, 562), (v || '0') + ' CM'));
      editableNumber(at(s, 617, 485));
    })();

    /* ---------- 10 choose profile ---------- */
    (() => {
      const s = 'profile';
      const val = at(s, 47, 554);
      let unit = 'cm', cm = 178;
      const show = () => setText(val, unit === 'cm' ? String(cm)
        : Math.floor(cm / 30.48) + "'" + Math.round((cm / 2.54) % 12));
      const [track, fill] = atAll(s, 52, 660, 347);
      slider(track, fill, at(s, 230, 649), { onChange: t => { cm = Math.round(150 + 50 * t); show(); } });
      const ul = at(s, 218, 625), cmT = at(s, 218, 599), ftT = at(s, 270, 599);
      ul.classList.add('mv');
      const under = el => { const b = geo(el); ul.style.left = b[0] + 'px'; ul.style.width = b[2] * 0.92 + 'px'; };
      tap(cmT, () => { unit = 'cm'; under(cmT); show(); });
      tap(ftT, () => { unit = 'ft'; under(ftT); show(); });

      // fit preference: 5 stops on the line, three labels
      const small = [at(s, 55, 842), at(s, 140, 842), at(s, 311, 842), at(s, 396, 842)];
      const big = at(s, 221, 836), bb = geo(big);
      const mid = small[0].cloneNode();
      const sb = geo(small[0]);
      mid.style.left = bb[0] + bb[2] / 2 - sb[2] / 2 + 'px';
      big.parentNode.insertBefore(mid, big);
      big.parentNode.appendChild(big);
      const cx = el => { const b = geo(el); return b[0] + b[2] / 2; };
      const xs = [cx(small[0]), cx(small[1]), bb[0] + bb[2] / 2, cx(small[2]), cx(small[3])];
      const line = at(s, 58, 845, 343), lb = geo(line);
      const stops = xs.map(x => (x - lb[0]) / lb[2]);
      const labels = [at(s, 56, 802), at(s, 188, 802), at(s, 317, 802)];
      const fit = slider(line, null, big, {
        stops,
        onChange: t => {
          const i = stops.indexOf(t);
          labels.forEach((l, j) => ink(l, null, j === (i < 2 ? 0 : i === 2 ? 1 : 2) ? 600 : 400));
        },
      });
      labels.forEach((l, j) => tap(l, () => fit.set(stops[j + 1])));

      pillGroup(at(s, 154, 932), [at(s, 88, 952), at(s, 176, 952), at(s, 270, 952), at(s, 351, 952)], { fixed: true });

      const cards = [at(s, 448, 125), at(s, 778, 125), at(s, 1092, 125)];
      cards.forEach((c, i) => tap(c, () => cards.forEach((d, j) => {
        d.style.boxShadow = j === i ? 'inset 0 0 0 ' + 4 * k + 'px ' + INK : 'none';
      })));
    })();

    /* ---------- 11 define your taste ---------- */
    (() => {
      const s = 'taste';
      const count = at(s, 56, 539);
      const proto = at(s, 736, 128), first = geo(at(s, 414, 110)), pb = geo(proto);
      const dx = first[0] + first[2] - pb[0], dy = pb[1] - first[1];
      const dots = { 414: proto, 1185: atAll(s, 1465, 128)[0], 1544470: atAll(s, 1838, 483)[0] };
      const border = at(s, 414, 110).style.border;
      const cards = [[414, 110, 414], [811, 110, 0], [1185, 110, 1185], [1544, 110, 0], [1544, 470, 1544470]].map(([x, y, key]) => {
        const el = at(s, x, y), b = geo(el);
        let dot = key && dots[key];
        if (!dot) {
          dot = proto.cloneNode();
          dot.style.left = b[0] + b[2] - dx + 'px';
          dot.style.top = b[1] + dy + 'px';
          el.parentNode.appendChild(dot);
        }
        return { el, dot, on: !!(key && dots[key]) };
      });
      // keep the designed "0N SELECTED" number as the starting point
      const designed = parseInt(count.textContent, 10) || 0;
      const offset = designed - cards.filter(c => c.on).length;
      const refresh = () => {
        cards.forEach(c => {
          c.el.style.border = c.on ? border : 'none';
          c.dot.style.display = c.on ? 'block' : 'none';
        });
        setText(count, String(Math.max(0, cards.filter(c => c.on).length + offset)).padStart(2, '0') + ' SELECTED');
      };
      cards.forEach(c => { const tg = () => { c.on = !c.on; refresh(); }; tap(c.el, tg); tap(c.dot, tg); });
      cards.forEach(c => { c.dot.style.display = c.on ? 'block' : 'none'; });

      const fitPill = at(s, 857, 887), relaxed = liftText(fitPill);
      pillGroup(fitPill, [at(s, 425, 902), at(s, 646, 902), relaxed, at(s, 1173, 902)],
        { pad: (geo(fitPill)[2] - geo(relaxed)[2]) / 2 });
      const moodPill = at(s, 414, 981), mono = liftText(moodPill);
      pillGroup(moodPill, [mono, at(s, 794, 995), at(s, 1027, 995)],
        { pad: (geo(moodPill)[2] - geo(mono)[2]) / 2 });
    })();

    /* ---------- 14 three directions ---------- */
    (() => {
      const s = 'directions';
      const cards = [[558, 501], [1093, 368], [1489, 368]].map(([x, w]) => ({ img: at(s, x, 118), line: at(s, x, 950, w) }));
      cards.forEach((c, i) => tap(c.img, () => cards.forEach((d, j) => {
        d.line.style.height = j === i ? Math.max(2, 3 * k) + 'px' : '1px';
        d.img.style.opacity = j === i ? '1' : '.55';
      })));
    })();

    /* ---------- 05 looks: filter chips ---------- */
    (() => {
      const s = 'looks';
      const chips = [at(s, 1148, 176), at(s, 1292, 176), at(s, 1503, 176), at(s, 1714, 176)];
      const border = chips[1].style.border;
      const photos = { line: at(s, 26, 279), knitA: at(s, 407, 279), knitB: at(s, 407, 752), layer: at(s, 789, 279),
                       utility: at(s, 1152, 279), coat: at(s, 1526, 279), wool: at(s, 1526, 752) };
      const groups = [null, ['layer', 'utility', 'coat'], ['line', 'coat', 'wool'], ['knitA', 'knitB']];
      chips.forEach((c, i) => {
        c.removeAttribute('data-go');
        tap(c, () => {
          chips.forEach((d, j) => {
            d.style.background = j === i ? INK : WHITE;
            d.style.border = border;
            ink(d, j === i ? WHITE : INK);
          });
          Object.entries(photos).forEach(([key, el]) => {
            el.style.transition = 'opacity .3s ease';
            el.style.opacity = !groups[i] || groups[i].includes(key) ? '1' : '.18';
          });
        });
      });
    })();

    /* ---------- 04 look detail A ---------- */
    viewSwitch({
      labels: [at('look-a', 1067, 788), at('look-a', 1142, 788), at('look-a', 1197, 788)],
      underline: at('look-a', 1067, 813),
      thumbs: null,
      main: at('look-a', 23, 117),
      images: VIEWS,
    });
    [at('look-a', 1001, 826), at('look-a', 1141, 826), at('look-a', 1280, 826)].forEach((t, i) =>
      tap(t, () => at('look-a', [1067, 1142, 1197][i], 788).click()));

    /* ---------- 06 look detail B: segmented FRONT / SIDE / BACK ---------- */
    (() => {
      const s = 'look-b';
      const fr = at(s, 1428, 749), front = liftText(fr);
      const viewA = at(s, 1424, 704), viewB = at(s, 1576, 704);
      const names = ['FRONT', 'SIDE', 'BACK'];
      const main = at(s, 23, 117);
      pillGroup(fr, [front, at(s, 1632, 772), at(s, 1783, 772)], {
        fixed: true,
        onSelect: i => {
          setText(viewA, 'VIEW  /  ' + names[i]);
          setText(viewB, names.filter((_, j) => j !== i).join('  '));
          main.style.background = IMG(VIEWS[i]);
        },
      });
    })();

    /* ---------- 03 fitting dashboard ---------- */
    viewSwitch({
      labels: [at('fitting', 878, 973), at('fitting', 1086, 973), at('fitting', 1288, 973)],
      thumbs: [at('fitting', 816, 645), at('fitting', 1019, 645), at('fitting', 1221, 645)],
      main: at('fitting', 30, 117),
      images: VIEWS,
    });

    /* ---------- 16 fitting room ---------- */
    (() => {
      const s = 'fitting-room';
      viewSwitch({
        labels: [at(s, 1315, 675), at(s, 1467, 675), at(s, 1614, 675)],
        thumbs: [at(s, 1281, 529), at(s, 1428, 529), at(s, 1574, 529)],
        boldW: 500, keepFront: true,
        main: at(s, 274, 132),
        images: ['20_structured_studio_cutout', '06_structured_side', '07_structured_back'],
      });
      const tabs = [at(s, 1315, 776), at(s, 1452, 776), at(s, 1574, 776)];
      const ul = at(s, 1300, 804);
      const extra = geo(ul)[2] - geo(tabs[0])[2];
      ul.classList.add('mv');
      tabs.forEach((t, i) => tap(t, () => {
        const b = geo(t), w = b[2] + extra;
        ul.style.left = b[0] + b[2] / 2 - w / 2 + 'px';
        ul.style.width = w + 'px';
        tabs.forEach((u, j) => ink(u, null, j === i ? 500 : 400));
      }));
    })();

    /* ---------- 18 outfit: accordion rows ---------- */
    (() => {
      const s = 'outfit';
      [[688, 691, 'FINE MERINO  /  THE ROW'], [775, 778, 'FLUID WOOL  /  THE ROW']].forEach(([ty, iy, info]) => {
        const row = at(s, 922, ty), icon = at(s, 1765, iy);
        const rb = geo(row), ib = geo(icon), fs = 15 * k;
        icon.classList.add('rot');
        const detail = make(S(s), `right:${W - ib[0] + 20 * k}px;top:${rb[1] + (rb[3] - fs * 1.3) / 2}px;white-space:pre;` +
          `font:400 ${fs}px 'Geist',sans-serif;letter-spacing:.15em;color:${GRAY};opacity:0;transition:opacity .3s ease`, info);
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
        if (!el.dataset.b || el === clip || o.keep.includes(el)) return;
        const b = geo(el);
        if (b[0] >= cx - 1 && b[0] < cx + cw && b[1] >= cy - 1 && b[1] + b[3] <= cy + ch + 1) {
          el.style.left = b[0] - cx + 'px';
          el.style.top = b[1] - cy + 'px';
          inner.appendChild(el);
          bottom = Math.max(bottom, b[1] + b[3] - cy);
        }
      });
      let n = 0;
      const add = (who, text) => {
        bottom += o.gap + o.render(inner, who, text, bottom + o.gap);
        const over = bottom + 20 * k - ch;
        inner.style.transform = over > 0 ? `translateY(${-over}px)` : 'none';
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
    }

    // 12 style chat session (wide chat window)
    (() => {
      const s = 'chat-session';
      const frame = at(s, 273, 115, 1137), fb = geo(frame);
      const box = at(s, 304, 938), xb = geo(box);
      const ph = at(s, 350, 966), pb = geo(ph);
      const sendEl = at(s, 1297, 946), sb = geo(sendEl);
      const avatarBg = at(s, 1291, 329).style.background;
      const clip = [fb[0] + 1, fb[1] + 1, fb[2] - 2, xb[1] - fb[1] - 8 * k];
      const hx = v => v * clip[2] / 1135;       // horizontal positions from the original 1135px window
      chat({
        screen: s, clip, gap: 30 * k, keep: [frame, box, ph, sendEl, at(s, 1312, 961)],
        input: [pb[0], xb[1] + (xb[3] - 44 * k) / 2, sb[0] - pb[0] - 20 * k, 44 * k],
        placeholder: 'ASK ABOUT LOOKS, FIT, OR OCCASION',
        inputStyle: `font:400 ${16 * k}px 'Geist',sans-serif;letter-spacing:.18em;color:${INK}`,
        hidePlaceholder: ph,
        send: [sendEl, at(s, 1312, 961)],
        render(inner, who, text, y) {
          const g = make(inner, `left:${hx(54)}px;top:${y - 15 * k}px;width:${hx(1027)}px;height:1px;background:${INK}`);
          g.className = 'n';
          y += 20 * k;
          const lbl = `font:500 ${14 * k}px 'Geist',sans-serif;letter-spacing:.15em;white-space:pre;`;
          if (who === 'you') {
            make(inner, `left:${hx(863)}px;top:${y + 4 * k}px;${lbl}color:${INK}`, 'YOU');
            make(inner, `left:${hx(916)}px;top:${y + 4 * k}px;${lbl}font-weight:400;color:${GRAY}`, now());
            make(inner, `left:${hx(1017)}px;top:${y}px;width:${62 * k}px;height:${62 * k}px;border-radius:50%;background:${avatarBg}`);
            const bub = make(inner, `right:${clip[2] - hx(1006)}px;top:${y + 33 * k}px;max-width:${hx(640)}px;padding:${17 * k}px ${25 * k}px;` +
              `border-radius:${11 * k}px;background:#f1f1f1;font:400 ${21 * k}px 'Geist',sans-serif;color:${INK}`);
            bub.textContent = text;
            return 20 * k + 33 * k + bub.offsetHeight;
          }
          make(inner, `left:${hx(65)}px;top:${y}px;width:${62 * k}px;height:${62 * k}px;border-radius:50%;background:${INK};` +
            `color:#fff;font:500 ${36 * k}px 'Geist',sans-serif;text-align:center;line-height:${52 * k}px`, 'g');
          make(inner, `left:${hx(170)}px;top:${y + 12 * k}px;${lbl}color:${INK}`, 'GULTURE');
          make(inner, `left:${hx(279)}px;top:${y + 12 * k}px;${lbl}font-weight:400;color:${GRAY}`, now());
          const t = make(inner, `left:${hx(170)}px;top:${y + 46 * k}px;max-width:${hx(760)}px;font:400 ${22 * k}px/150% 'Geist',sans-serif;color:${INK}`);
          t.textContent = text;
          return 20 * k + Math.max(62 * k, 46 * k + t.offsetHeight);
        },
      });
    })();

    // 13 style chat (left column)
    (() => {
      const s = 'chat';
      const line = geo(at(s, 92, 440));
      const box = at(s, 86, 924), xb = geo(box);
      const ph = at(s, 112, 948), pb = geo(ph);
      const sendEl = at(s, 411, 933), sb = geo(sendEl);
      const personIcon = at(s, 473, 645).innerHTML;
      const clip = [xb[0] - 6 * k, line[1] + 30 * k, xb[2] + 18 * k, xb[1] - 9 * k - (line[1] + 30 * k)];
      const hx = v => v * clip[2] / 445;        // horizontal positions from the original 445px column
      chat({
        screen: s, clip, gap: 34 * k, keep: [box, ph, sendEl],
        input: [pb[0], xb[1] + (xb[3] - 44 * k) / 2, sb[0] - pb[0] - 10 * k, 44 * k],
        placeholder: 'Ask about color, fit, or mood...',
        inputStyle: `font:400 ${16 * k}px 'Geist',sans-serif;color:${INK}`,
        hidePlaceholder: ph,
        send: [sendEl],
        render(inner, who, text, y) {
          const font = `font:400 ${19 * k}px/140% 'Geist',sans-serif;`;
          if (who === 'you') {
            make(inner, `left:${hx(381)}px;top:${y + 7 * k}px;width:${49 * k}px;height:${49 * k}px;border-radius:50%;background:#ebebeb`,
              `<div class="n" style="left:${12 * k}px;top:${14 * k}px;width:${25 * k}px;height:${25 * k}px">${personIcon}</div>`);
            const bub = make(inner, `right:${clip[2] - hx(359)}px;top:${y}px;max-width:${hx(270)}px;padding:${17 * k}px ${22 * k}px;` +
              `border-radius:${19 * k}px;background:${INK};${font}color:#fff`);
            bub.textContent = text;
            return bub.offsetHeight;
          }
          make(inner, `left:${hx(9)}px;top:${y + 8 * k}px;width:${47 * k}px;height:${47 * k}px;border-radius:50%;background:${INK};` +
            `color:#fff;font:500 ${27 * k}px 'Geist',sans-serif;text-align:center;line-height:${40 * k}px`, 'g');
          const bub = make(inner, `left:${hx(82)}px;top:${y}px;max-width:${hx(281)}px;padding:${18 * k}px ${20 * k}px;` +
            `border-radius:${19 * k}px;background:#f1f1f1;${font}color:${INK}`);
          bub.textContent = text;
          return bub.offsetHeight;
        },
      });
    })();
  }
})();
