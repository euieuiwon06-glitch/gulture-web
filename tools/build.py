"""Build index.html from the Figma node export (tools/figma/*.json).

Each Figma frame (1920x1080) becomes one screen. Nodes are placed absolutely,
so the page reproduces the Figma layout 1:1 and is scaled to the viewport.
Run: python tools/build.py
"""
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIG = os.path.join(ROOT, 'tools', 'figma')

IMG = {
    'b14bf15e': '01_hero_city_motion', 'ac017a72': '02_blue_layered_motion', 'f18073da': '03_black_coat_hall',
    '031ca4c3': '05_structured_front', '9ac76c94': '06_structured_side', 'a7590023': '07_structured_back',
    '26f179c2': '08_cream_sweater_male', 'dc8d7c16': '09_utility_black_woman', 'b32340ea': '10_layered_black_woman',
    '17401e82': '11_minimal_cream_woman', '25c6cfcc': '12_tailored_black_male', '8efddbd2': '13_charcoal_coat_flatlay',
    'de387654': '14_charcoal_trousers_flatlay', '78432044': '15_charcoal_wool_detail', '9fc93df9': '16_navy_technical_detail',
    'a23bf24f': '18_line_blazer_woman', '41587148': '19_relaxed_seated_black', '92330f06': '20_structured_studio_cutout',
    'aaceb54e': '17_body_analysis_cutout',
}

# screen order = reading order of the frames on the Figma "홈페이지" page
SCREENS = [
    ('93:875', 'hero'), ('93:448', 'home'), ('93:466', 'body'), ('93:535', 'analysis'), ('93:565', 'profile'),
    ('93:616', 'taste'), ('93:708', 'chat'), ('93:661', 'chat-session'), ('93:277', 'loading'),
    ('93:746', 'directions'), ('93:363', 'looks'), ('93:411', 'look-b'), ('93:328', 'look-a'),
    ('93:768', 'motion-01'), ('93:808', 'motion-05'), ('93:291', 'fitting'),
    ('93:779', 'fitting-room'), ('93:823', 'outfit'), ('93:858', 'motion-cards'),
]

# label -> target screen, applied to buttons / text links
LINKS = {
    'gulture': 'hero', 'LOOKS': 'looks', 'FITTING': 'fitting', 'JOURNAL': 'motion-cards',
    'ENTER FITTING': 'body', 'SAVE BODY PROFILE': 'analysis', 'BUILD MY FIT': 'profile',
    'VIEW FULL ANALYSIS': 'profile', 'CONTINUE': 'taste', 'SAVE MY TASTE': 'chat-session',
    'VIEW FIT': 'loading', 'SEND': 'chat-session', 'TRY LOOK 02': 'fitting-room', 'VIEW ALL 3': 'directions',
    'SELECT FORM': 'looks', 'TRY THIS LOOK': 'fitting', 'SAVE THIS LOOK': 'outfit',
    'CHANGE GARMENT': 'looks', 'OPEN FULL LOOK': 'look-a', 'RELATED LOOKS': 'look-b',
}
SKIP_NEXT = {'body': 'analysis', 'taste': 'chat-session'}
# photo click targets per screen
PHOTO_LINK = {'looks': 'look-a', 'home': 'looks', 'motion-cards': 'looks', 'motion-01': 'looks',
              'directions': 'looks', 'look-a': 'look-b', 'look-b': 'look-a', 'chat': 'fitting-room',
              'chat-session': 'look-a', 'fitting': 'fitting-room', 'outfit': 'look-a', 'profile': 'taste'}
# small arrow-only buttons
ARROW_LINK = {'home': 'looks', 'looks': 'look-a', 'motion-cards': 'body', 'look-a': 'look-b',
              'analysis': 'profile', 'chat': 'directions'}
HAMBURGERS = {'s0', 's1', 's18'}
ARROWS = {'s3', 's5', 's7', 's9', 's13', 's17'}

WEIGHT = {'Thin': 100, 'ExtraLight': 200, 'Light': 300, 'Regular': 400, 'Medium': 500,
          'SemiBold': 600, 'Bold': 700, 'ExtraBold': 800, 'Black': 900}

frames, svgs = {}, json.load(open(os.path.join(FIG, 'svgs.json'), encoding='utf-8'))
for part in 'ABCD':
    frames.update(json.load(open(os.path.join(FIG, part + '.json'), encoding='utf-8')))


def px(v):
    v = round(float(v), 2)
    return ('%g' % v) + 'px'


def color(p):
    if isinstance(p, list):
        h, a = p
    else:
        h, a = p, 1
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return h if a >= 1 else 'rgba(%d,%d,%d,%g)' % (r, g, b, round(a, 3))


def texts(n):
    if n['t'] == 'TE':
        return [n['x']]
    out = []
    for c in n.get('c', []):
        out += texts(c)
    return out


def background(n):
    layers = []
    w, h = n['b'][2], n['b'][3]
    for p in reversed(n.get('f', [])):  # Figma: last paint on top; CSS: first layer on top
        if isinstance(p, dict):
            name = IMG[p['h']]
            url = 'url(assets/img/%s.webp)' % name
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


def render(n, screen, depth=0):
    x, y, w, h = n['b']
    t = n['t']
    st = ['left:%s' % px(x), 'top:%s' % px(y)]
    attrs = ''
    cls = 'n'
    if 'op' in n:
        st.append('opacity:%g' % round(n['op'], 3))

    if t == 'SV':
        st += ['width:%s' % px(w), 'height:%s' % px(h)]
        svg = svgs[n['sv']]
        svg = re.sub(r'<svg width="[^"]*" height="[^"]*"', '<svg width="100%" height="100%" preserveAspectRatio="none"', svg, 1)
        return '<div class="n" style="%s">%s</div>' % (';'.join(st), svg)

    if t == 'TE':
        txt = n['x']
        st.append('width:%s' % px(w))
        if n.get('ar') == 'W':
            st.append('white-space:pre')
        else:
            st += ['white-space:pre-wrap', 'height:%s' % px(h)]
        al = {'C': 'center', 'R': 'right', 'J': 'justify'}.get(n.get('al'))
        if al:
            st.append('text-align:' + al)
        for fx in n.get('fx', []):
            if fx[0] == 'DROP_SHADOW':
                st.append('text-shadow:%s %s %s %s' % (px(fx[3]), px(fx[4]), px(fx[1]), color(fx[2])))
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
            attrs = ' data-go="%s"' % LINKS[label]
        elif label == 'SKIP' and screen in SKIP_NEXT:
            attrs = ' data-go="%s"' % SKIP_NEXT[screen]
        if attrs:
            cls += ' link'
        return '<div class="%s t" style="%s"%s>%s</div>' % (cls, ';'.join(st), attrs, ''.join(spans))

    # boxes: FR / IN / CO / GR / RE / EL
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
        sc = color(n['s'][0])
        sw = n.get('sw', 1)
        if n.get('sws'):
            st.append('border-style:solid;border-color:%s;border-width:%s' % (sc, ' '.join(px(v) for v in n['sws'])))
        elif n.get('sa') == 'OUTSIDE':
            st.append('box-shadow:0 0 0 %s %s' % (px(sw), sc))
        else:
            st.append('border:%s solid %s' % (px(sw), sc))
    for fx in n.get('fx', []):
        if fx[0] == 'DROP_SHADOW':
            st.append('box-shadow:%s %s %s %s %s' % (px(fx[3]), px(fx[4]), px(fx[1]), px(fx[5]), color(fx[2])))
    if n.get('cl'):
        st.append('overflow:hidden')

    kids = n.get('c', [])
    if t in ('FR', 'IN', 'CO'):
        label = ' '.join(texts(n)).strip()
        svk = [c.get('sv') for c in kids if c['t'] == 'SV']
        if kids and not texts(n) and svk and set(svk) <= HAMBURGERS:
            attrs, cls = ' data-menu="1"', cls + ' link'
        elif kids and not texts(n) and svk and set(svk) <= ARROWS and screen in ARROW_LINK:
            attrs, cls = ' data-go="%s"' % ARROW_LINK[screen], cls + ' link'
        elif depth > 0 and label in LINKS and n.get('f'):
            attrs, cls = ' data-go="%s"' % LINKS[label], cls + ' link btn'
    if t in ('RE', 'EL') and any(isinstance(p, dict) for p in n.get('f', [])) and screen in PHOTO_LINK \
            and w * h > 40000:
        attrs, cls = ' data-go="%s"' % PHOTO_LINK[screen], cls + ' link photo'
    inner = ''.join(render(c, screen, depth + 1) for c in kids)
    return '<div class="%s" style="%s"%s>%s</div>' % (cls, ';'.join(st), attrs, inner)


screens_html, index = [], []
for fid, slug in SCREENS:
    f = frames[fid]
    title = f['nm'].split('/', 1)[1].strip()
    index.append((slug, title))
    body = ''.join(render(c, slug, 1) for c in f.get('c', []))
    screens_html.append('<section class="screen" id="%s" data-title="%s" style="background:%s">%s</section>'
                        % (slug, html.escape(title), background(f) or '#fff', body))

menu = ''.join('<a href="#/%s"><span>%02d</span>%s</a>' % (s, i + 1, html.escape(t)) for i, (s, t) in enumerate(index))
tpl = open(os.path.join(ROOT, 'tools', 'template.html'), encoding='utf-8').read()
out = tpl.replace('{{SCREENS}}', '\n'.join(screens_html)).replace('{{MENU}}', menu) \
         .replace('{{ORDER}}', json.dumps([s for _, s in SCREENS]))
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(out)
print('index.html', len(out) // 1024, 'KB,', len(SCREENS), 'screens')
