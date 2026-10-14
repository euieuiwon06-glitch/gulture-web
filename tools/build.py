"""Build index.html from the Figma 1440 master export (tools/figma1440/*.json).

The Figma file keeps three versions of every screen: 1440x900 (the master the
designer edits), 1920x1080 and 2048x940. The larger two are generated in Figma
from the 1440 frames with one rule, so the same rule is applied here:
  - positions and box sizes scale by (SX, SY)
  - text, circles, icons and the logo scale uniformly by U (no distortion)
  - 1px lines keep their thickness, cropped photos are re-fitted to the new box
All three sets go into the page; the browser picks the one whose aspect ratio
is closest to the window. Run: python tools/build.py
"""
import copy
import html
import json
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIG = os.path.join(ROOT, 'tools', 'figma1440')

IMG = {
    'b14bf15e': '01_hero_city_motion', 'ac017a72': '02_blue_layered_motion', 'f18073da': '03_black_coat_hall',
    '031ca4c3': '05_structured_front', '9ac76c94': '06_structured_side', 'a7590023': '07_structured_back',
    '26f179c2': '08_cream_sweater_male', 'dc8d7c16': '09_utility_black_woman', 'b32340ea': '10_layered_black_woman',
    '17401e82': '11_minimal_cream_woman', '25c6cfcc': '12_tailored_black_male', '8efddbd2': '13_charcoal_coat_flatlay',
    'de387654': '14_charcoal_trousers_flatlay', '78432044': '15_charcoal_wool_detail', '9fc93df9': '16_navy_technical_detail',
    'a23bf24f': '18_line_blazer_woman', '41587148': '19_relaxed_seated_black', '92330f06': '20_structured_studio_cutout',
    'aaceb54e': '17_body_analysis_cutout',
}
IMG_SIZE = {}
for h, name in IMG.items():
    with Image.open(os.path.join(ROOT, 'assets', 'img', name + '.webp')) as im:
        IMG_SIZE[h] = im.size

# (set id, width, height, uniform scale of the set relative to the 1440 master)
SETS = [('1440', 1440, 900, 1.0), ('1920', 1920, 1080, 1 / 0.75), ('2048', 2048, 940, (940 / 1080) / 0.75)]

# screen order = reading order of the frames on the Figma page
SCREENS = [
    ('C / 20 Hero – City Motion', 'hero'), ('C / 07 Home – Cards', 'home'),
    ('C / 08 Onboarding 01 – Body Proportions', 'body'), ('C / 09 Analysis Complete', 'analysis'),
    ('C / 10 Fitting 01 – Choose Profile', 'profile'), ('C / 11 Onboarding 02 – Define Your Taste', 'taste'),
    ('C / 13 Style Chat B', 'chat'), ('C / 12 Style Chat A', 'chat-session'),
    ('C / 01 Loading – Building Your Fit', 'loading'), ('C / 14 Your Form – Three Directions', 'directions'),
    ('C / 05 Looks – Grid', 'looks'), ('C / 06 Look Detail – Structured Tailoring B', 'look-b'),
    ('C / 04 Look Detail – Structured Tailoring A', 'look-a'), ('C / 15 Home – Clothes in Motion 01', 'motion-01'),
    ('C / 17 Home – Clothes in Motion 05', 'motion-05'), ('C / 03 Fitting – Look 05 Dashboard', 'fitting'),
    ('C / 16 Fitting Room – Structured Coat', 'fitting-room'), ('C / 18 Outfit – Structured Balance', 'outfit'),
    ('C / 19 Home – Clothes in Motion Cards', 'motion-cards'),
]

# label -> target screen, applied to buttons / text links
LINKS = {
    'LOOKS': 'looks', 'FITTING': 'fitting', 'JOURNAL': 'motion-cards',
    'ENTER FITTING': 'body', 'SAVE BODY PROFILE': 'analysis', 'BUILD MY FIT': 'profile',
    'VIEW FULL ANALYSIS': 'profile', 'CONTINUE': 'taste', 'SAVE MY TASTE': 'chat-session',
    'VIEW FIT': 'loading', 'TRY LOOK 02': 'fitting-room', 'VIEW ALL 3': 'directions',
    'SELECT FORM': 'looks', 'TRY THIS LOOK': 'fitting', 'SAVE THIS LOOK': 'outfit',
    'CHANGE GARMENT': 'looks', 'OPEN FULL LOOK': 'look-a', 'RELATED LOOKS': 'look-b',
}
SKIP_NEXT = {'body': 'analysis', 'taste': 'chat-session'}
PHOTO_LINK = {'looks': 'look-a', 'home': 'looks', 'motion-cards': 'looks', 'motion-01': 'looks',
              'look-a': 'look-b', 'look-b': 'look-a', 'chat': 'fitting-room',
              'chat-session': 'look-a', 'outfit': 'look-a'}
ARROW_LINK = {'home': 'looks', 'looks': 'look-a', 'motion-cards': 'body', 'look-a': 'look-b',
              'analysis': 'profile', 'chat': 'directions'}

WEIGHT = {'Thin': 100, 'ExtraLight': 200, 'Light': 300, 'Regular': 400, 'Medium': 500,
          'SemiBold': 600, 'Bold': 700, 'ExtraBold': 800, 'Black': 900}

frames, svgs = {}, json.load(open(os.path.join(FIG, 'svgs.json'), encoding='utf-8'))
for part in 'ABCDEF':
    for f in json.load(open(os.path.join(FIG, part + '.json'), encoding='utf-8')).values():
        frames[f['nm']] = f


def svg_kind(key):
    d = re.search(r' d="([^"]+)"', svgs[key])
    d = d.group(1) if d else ''
    if re.fullmatch(r'(M0 [\d.]+H[\d.]+){3}', d):
        return 'menu'
    if d.startswith('M0 ') and 'L' in d:
        return 'arrow'
    return ''


# ---------- flatten groups (children move into the group's parent) ----------
def flatten(n):
    if 'c' not in n:
        return n
    out = []
    for c in n['c']:
        if c['t'] == 'GR':
            gx, gy = c['b'][0], c['b'][1]
            for k in flatten(c).get('c', []):
                k = copy.deepcopy(k)
                k['b'] = [k['b'][0] + gx, k['b'][1] + gy] + k['b'][2:]
                out.append(k)
        else:
            out.append(flatten(c))
    n = dict(n)
    n['c'] = out
    return n


# ---------- the Figma re-layout rule ----------
def refit(p, W, H):
    if not isinstance(p, dict) or p.get('m') != 'CROP':
        return p
    iw, ih = IMG_SIZE[p['h']]
    (a, _, tx), (_, d, ty) = p['x']
    R, cx = W / H, tx + a / 2
    d2, a2 = d, R * d * ih / iw
    if a2 > 1:
        a2, d2 = 1, iw / (R * ih)
    if d2 > 1:
        d2, a2 = 1, R * ih / iw
    tx2 = min(max(cx - a2 / 2, 0), 1 - a2)
    ty2 = min(max(ty, 0), 1 - d2)
    return dict(p, x=[[a2, 0, tx2], [0, d2, ty2]])


def is_icon(n):
    return n['t'] == 'FR' and n.get('c') and all(c['t'] == 'SV' for c in n['c']) and n['b'][2] <= 50 and n['b'][3] <= 50


def scale_fx(fx, U):
    return [[e[0], e[1] * U, e[2], e[3] * U, e[4] * U, e[5]] for e in fx]


def uniform(n, U):
    """scale a node and its children uniformly (icons)."""
    n = copy.deepcopy(n)
    n['b'] = [v * U for v in n['b']]
    if 'c' in n:
        n['c'] = [uniform(c, U) for c in n['c']]
    return n


def tf(n, SX, SY, U):
    n = copy.deepcopy(n)
    x, y, w, h = n['b']
    t = n['t']
    if 'fx' in n:
        n['fx'] = scale_fx(n['fx'], U)
    if t == 'TE':
        for g in n['g']:
            g[4] *= U
            if isinstance(g[5], (int, float)):
                g[5] *= U
            if isinstance(g[6], (int, float)) and g[6]:
                g[6] *= U
        w2, h2 = w * U, h * U
        al = n.get('al')
        nx = (x + w / 2) * SX - w2 / 2 if al == 'C' else (x + w) * SX - w2 if al == 'R' else x * SX
        n['b'] = [nx, y * SY, w2, h2]
        return n
    if t == 'LG':
        n['b'] = [x * SX, y * SY, w * U, h * U]
        return n
    if t == 'EL' or (t == 'SV' and not n.get('big')) or is_icon(n):
        w2, h2 = w * U, h * U
        n['b'] = [(x + w / 2) * SX - w2 / 2, (y + h / 2) * SY - h2 / 2, w2, h2]
        if 'c' in n:
            n['c'] = [uniform(c, U) for c in n['c']]
        if 'f' in n:
            n['f'] = [refit(p, w2, h2) for p in n['f']]
        return n
    if t == 'RE' and h <= 3 and w > h:
        nb = [x * SX, y * SY, w * SX, h]
    elif t == 'RE' and w <= 3 and h > w:
        nb = [x * SX, y * SY, w, h * SY]
    else:
        nb = [x * SX, y * SY, w * SX, h * SY]
    n['b'] = nb
    if 'r' in n:
        n['r'] = [v * U for v in n['r']] if isinstance(n['r'], list) else n['r'] * U
    if 'f' in n:
        n['f'] = [refit(p, nb[2], nb[3]) for p in n['f']]
    if 'c' in n:
        n['c'] = [tf(c, SX, SY, U) for c in n['c']]
    return n


# ---------- HTML ----------
def px(v):
    return ('%g' % round(float(v), 2)) + 'px'


def color(p):
    h, a = (p if isinstance(p, list) else (p, 1))
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return h if a >= 1 else 'rgba(%d,%d,%d,%g)' % (r, g, b, round(a, 3))


def texts(n):
    if n['t'] == 'TE':
        return [n['x']]
    return [s for c in n.get('c', []) for s in texts(c)]


def background(n):
    layers = []
    w, h = n['b'][2], n['b'][3]
    for p in reversed(n.get('f', [])):
        if isinstance(p, dict):
            url = 'url(assets/img/%s.webp)' % IMG[p['h']]
            if p['m'] == 'CROP':
                (a, _, tx), (_, d, ty) = p['x']
                sw, sh = w / a, h / d
                layers.append('%s %s %s / %s %s no-repeat' % (url, px(-tx * sw), px(-ty * sh), px(sw), px(sh)))
            elif p['m'] == 'FIT':
                layers.append('%s center / contain no-repeat' % url)
            else:
                layers.append('%s center / cover no-repeat' % url)
        elif p != 'G':
            c = color(p)
            layers.append('linear-gradient(%s,%s)' % (c, c))
    return ','.join(layers)


def shadow(fx, text=False):
    out = []
    for e in fx:
        if e[0] == 'DROP_SHADOW':
            out.append(('%s %s %s %s' if text else '%s %s %s %s %s') %
                       ((px(e[3]), px(e[4]), px(e[1]), color(e[2])) if text else
                        (px(e[3]), px(e[4]), px(e[1]), px(e[5]), color(e[2]))))
    return ','.join(out)


def render(n, screen, area_k):
    x, y, w, h = n['b']
    t = n['t']
    st = ['left:%s' % px(x), 'top:%s' % px(y)]
    attrs = ' data-b="%s"' % ','.join('%g' % round(v, 2) for v in n['b'])
    if 'o' in n:
        attrs += ' data-o="%s"' % ','.join('%g' % v for v in n['o'])
    cls = 'n'
    if 'op' in n:
        st.append('opacity:%g' % round(n['op'], 3))

    if t == 'LG':
        st += ['width:%s' % px(w), 'height:%s' % px(h), 'background:%s' % color(n['col'])]
        if n.get('fx'):
            st.append('filter:%s' % ' '.join('drop-shadow(%s)' % s for s in shadow(n['fx'], True).split(',')))
        return '<div class="n logo link" style="%s"%s data-go="hero"></div>' % (';'.join(st), attrs)

    if t == 'SV':
        st += ['width:%s' % px(w), 'height:%s' % px(h)]
        svg = re.sub(r'<svg width="[^"]*" height="[^"]*"',
                     '<svg width="100%" height="100%" preserveAspectRatio="none"', svgs[n['sv']], 1)
        return '<div class="n" style="%s"%s>%s</div>' % (';'.join(st), attrs, svg)

    if t == 'TE':
        txt = n['x']
        st.append('width:%s' % px(w))
        st.append('white-space:pre' if n.get('ar') == 'W' else 'white-space:pre-wrap')
        al = {'C': 'center', 'R': 'right', 'J': 'justify'}.get(n.get('al'))
        if al:
            st.append('text-align:' + al)
        if n.get('fx'):
            st.append('text-shadow:' + shadow(n['fx'], True))
        spans = []
        for a, b, fam, sty, size, ls, lh, fill, tc, td in n['g']:
            s = ["font-family:'%s'" % fam, 'font-weight:%d' % WEIGHT.get(sty.replace(' ', ''), 400),
                 'font-size:%s' % px(size)]
            if isinstance(ls, str) and ls.endswith('%'):
                v = float(ls[:-1]) / 100
                if v:
                    s.append('letter-spacing:%gem' % round(v, 4))
            elif ls:
                s.append('letter-spacing:%s' % px(ls))
            if isinstance(lh, str) and lh.endswith('%'):
                s.append('line-height:%g%%' % round(float(lh[:-1]), 2))
            elif lh:
                s.append('line-height:%s' % px(lh))
            else:
                s.append('line-height:normal')
            if fill:
                s.append('color:' + color(fill))
            if tc == 'UPPER':
                s.append('text-transform:uppercase')
            if td == 'UNDERLINE':
                s.append('text-decoration:underline')
            spans.append('<span style="%s">%s</span>' % (';'.join(s), html.escape(txt[a:b])))
        label = txt.strip()
        if label in LINKS:
            attrs += ' data-go="%s"' % LINKS[label]
            cls += ' link'
        elif label == 'SKIP' and screen in SKIP_NEXT:
            attrs += ' data-go="%s"' % SKIP_NEXT[screen]
            cls += ' link'
        return '<div class="%s t" style="%s"%s>%s</div>' % (cls, ';'.join(st), attrs, ''.join(spans))

    st += ['width:%s' % px(w), 'height:%s' % px(h)]
    bg = background(n)
    if bg:
        st.append('background:' + bg)
    if t == 'EL':
        st.append('border-radius:50%')
    elif 'r' in n:
        r = n['r']
        st.append('border-radius:' + (' '.join(px(v) for v in r) if isinstance(r, list) else px(r)))
    if n.get('s'):
        sc, sw = color(n['s'][0]), n.get('sw', 1)
        if n.get('sws'):
            st.append('border-style:solid;border-color:%s;border-width:%s' % (sc, ' '.join(px(v) for v in n['sws'])))
        elif n.get('sa') == 'OUTSIDE':
            st.append('box-shadow:0 0 0 %s %s' % (px(sw), sc))
        else:
            st.append('border:%s solid %s' % (px(sw), sc))
    if n.get('fx'):
        st.append('box-shadow:' + shadow(n['fx']))
    if n.get('cl'):
        st.append('overflow:hidden')

    kids = n.get('c', [])
    if t in ('FR', 'IN'):
        label = ' '.join(texts(n)).strip()
        kinds = {svg_kind(c['sv']) for c in kids if c['t'] == 'SV'}
        if kids and not label and kinds == {'menu'}:
            attrs += ' data-menu="1"'
            cls += ' link'
        elif kids and not label and kinds == {'arrow'} and screen in ARROW_LINK:
            attrs += ' data-go="%s"' % ARROW_LINK[screen]
            cls += ' link'
        elif label in LINKS and n.get('f'):
            attrs += ' data-go="%s"' % LINKS[label]
            cls += ' link btn'
    if t in ('RE', 'EL') and any(isinstance(p, dict) for p in n.get('f', [])) and screen in PHOTO_LINK \
            and w * h / area_k > 40000:
        attrs += ' data-go="%s"' % PHOTO_LINK[screen]
        cls += ' link photo'
    inner = ''.join(render(c, screen, area_k) for c in kids)
    return '<div class="%s" style="%s"%s>%s</div>' % (cls, ';'.join(st), attrs, inner)


stages, menu = [], []
for set_id, W, H, U in SETS:
    SX, SY = W / 1440, H / 900
    area_k = (W / 1920) * (H / 1080)     # photo areas compared in original 1920 units
    out = []
    for name, slug in SCREENS:
        f = flatten(frames[name])
        kids = [tf(c, SX, SY, U) for c in f.get('c', [])]
        body = ''.join(render(c, slug, area_k) for c in kids)
        title = name.split('/', 1)[1].strip()
        out.append('<section class="screen" data-set="%s" data-slug="%s" data-title="%s" style="background:%s">%s</section>'
                   % (set_id, slug, html.escape(title), background(f) or '#fff', body))
    stages.append('<div class="stage" data-set="%s" data-w="%d" data-h="%d" style="width:%dpx;height:%dpx">%s</div>'
                  % (set_id, W, H, W, H, '\n'.join(out)))

menu = ''.join('<a href="#/%s"><span>%02d</span>%s</a>' % (s, i + 1, html.escape(n.split('/', 1)[1].strip()))
               for i, (n, s) in enumerate(SCREENS))
tpl = open(os.path.join(ROOT, 'tools', 'template.html'), encoding='utf-8').read()
page = tpl.replace('{{STAGES}}', '\n'.join(stages)).replace('{{MENU}}', menu) \
          .replace('{{ORDER}}', json.dumps([s for _, s in SCREENS]))
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(page)
print('index.html', len(page) // 1024, 'KB,', len(SCREENS), 'screens x', len(SETS), 'sets')
