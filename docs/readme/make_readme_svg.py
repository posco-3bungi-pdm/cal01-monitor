"""README용 애니메이션 SVG (다크, 라이트 두 벌). pdm-project figures/readme/make_readme_svg.py와 같은 스타일

실행 (저장소 루트에서):
    python docs/readme/make_readme_svg.py
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif"

THEMES = {
    "dark": {"bg": "#0d110e", "bg2": "#161d17", "plate": "#1a231c", "plate2": "#212c23", "deep": "#080b09",
             "ink": "#eef4ec", "sub": "#9fb39d", "accent": "#a8ff3e", "warm": "#ffb347", "hot": "#ff5a5f", "cool": "#5ec8ff",
             "hi": "#ffffff", "lo": "#000000", "hi_a": "0.10", "lo_a": "0.55", "shadow_a": "0.45", "grain_a": "0.05"},
    "light": {"bg": "#eef1ea", "bg2": "#e4e9df", "plate": "#f7f9f4", "plate2": "#eef2ea", "deep": "#d9dfd4",
              "ink": "#17221b", "sub": "#5b6b5d", "accent": "#3f8f1a", "warm": "#d9741a", "hot": "#d8323a", "cool": "#1f7fb8",
              "hi": "#ffffff", "lo": "#1a2a1e", "hi_a": "0.9", "lo_a": "0.18", "shadow_a": "0.18", "grain_a": "0.06"},
}

ZONES = [("CLN", "cool"), ("Z1", "warm"), ("Z2", "warm"), ("Z3", "hot"), ("Z4", "hot"), ("Z5", "hot"), ("Z6", "hot"),
         ("Z7", "warm"), ("Z8", "warm"), ("Z9", "warm"), ("OUT", "cool")]


def defs(t):
    return (
        '<defs>\n'
        '<filter id="shadow" x="-10%%" y="-10%%" width="120%%" height="140%%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity="%s"/></filter>\n'
        '<filter id="shadow-sm" x="-10%%" y="-10%%" width="120%%" height="140%%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="%s"/></filter>\n'
        '<filter id="inset" x="-10%%" y="-10%%" width="120%%" height="130%%">'
        '<feOffset dx="0" dy="3"/><feGaussianBlur stdDeviation="3" result="ob"/>'
        '<feComposite operator="out" in="SourceGraphic" in2="ob" result="inv"/>'
        '<feFlood flood-color="#000" flood-opacity="0.55" result="col"/>'
        '<feComposite operator="in" in="col" in2="inv" result="sh"/>'
        '<feComposite operator="over" in="sh" in2="SourceGraphic"/></filter>\n'
        '<filter id="glow" x="-50%%" y="-50%%" width="200%%" height="200%%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>\n'
        '<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.6 0"/></filter>\n'
        '<linearGradient id="plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>\n'
        '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>\n'
        '<radialGradient id="coin" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="%s" stop-opacity="0.9"/><stop offset="0.55" stop-color="%s" stop-opacity="0"/><stop offset="1" stop-color="%s" stop-opacity="0.35"/></radialGradient>\n'
        '</defs>\n' % (t["shadow_a"], t["shadow_a"], t["plate"], t["plate2"], t["bg"], t["bg2"], t["hi"], t["hi"], t["lo"]))


def head(width, height, t):
    s = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" font-family="%s">\n'
         % (width, height, width, height, FONT))
    s += defs(t)
    s += '<rect width="%d" height="%d" rx="22" fill="url(#bg)"/>\n' % (width, height)
    s += '<rect width="%d" height="%d" rx="22" filter="url(#grain)" opacity="%s"/>\n' % (width, height, t["grain_a"])
    return s


def text(x, y, s, size, fill, weight="normal", anchor="start", extra=""):
    return '<text x="%s" y="%s" font-size="%s" fill="%s" font-weight="%s" text-anchor="%s" %s>%s</text>\n' % (
        x, y, size, fill, weight, anchor, extra, s)


def emboss_text(t, x, y, s, size, fill, weight="bold", anchor="start"):
    out = text(x + 1, y + 2, s, size, t["lo"], weight, anchor, 'opacity="%s"' % t["lo_a"])
    out += text(x - 1, y - 1, s, size, t["hi"], weight, anchor, 'opacity="%s"' % t["hi_a"])
    out += text(x, y, s, size, fill, weight, anchor)
    return out


def raised(t, x, y, w, h, r=16, fill="url(#plate)", back=True, edge=None):
    s = ""
    if back:
        s += '<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s" opacity="0.55"/>\n' % (x + 10, y + 12, w, h, r, t["deep"])
    s += '<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s" filter="url(#shadow)"/>\n' % (x, y, w, h, r, fill)
    if edge:
        s += '<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="none" stroke="%s" stroke-opacity="0.55" stroke-width="1.5"/>\n' % (x, y, w, h, r, edge)
    s += '<path d="M %d %d L %d %d Q %d %d %d %d L %d %d" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="1.5"/>\n' % (
        x + 1, y + h - r, x + 1, y + r, x + 1, y + 1, x + r, y + 1, x + w - r, y + 1, t["hi"], t["hi_a"])
    s += '<path d="M %d %d L %d %d Q %d %d %d %d L %d %d" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="1.5"/>\n' % (
        x + r, y + h - 1, x + w - r, y + h - 1, x + w - 1, y + h - 1, x + w - 1, y + h - r, x + w - 1, y + r, t["lo"], t["lo_a"])
    return s


def inset(t, x, y, w, h, r=12, fill=None):
    fill = fill or t["deep"]
    s = '<rect x="%d" y="%d" width="%d" height="%d" rx="%d" fill="%s" filter="url(#inset)"/>\n' % (x, y, w, h, r, fill)
    s += '<path d="M %d %d L %d %d" stroke="%s" stroke-opacity="%s" stroke-width="1.5"/>\n' % (x + r, y + h + 1, x + w - r, y + h + 1, t["hi"], t["hi_a"])
    return s


def groove(t, x1, y1, x2, y2, dash=""):
    d = ' stroke-dasharray="%s"' % dash if dash else ""
    s = '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-opacity="%s" stroke-width="3"%s/>\n' % (x1, y1, x2, y2, t["lo"], t["lo_a"], d)
    s += '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-opacity="%s" stroke-width="1.5"%s/>\n' % (x1, y1 + 2, x2, y2 + 2, t["hi"], t["hi_a"], d)
    return s


def coin(t, cx, cy, r, fill, extra=""):
    s = '<circle cx="%d" cy="%d" r="%d" fill="%s" filter="url(#shadow-sm)"%s/>\n' % (cx, cy, r, fill, extra)
    s += '<circle cx="%d" cy="%d" r="%d" fill="url(#coin)"/>\n' % (cx, cy, r)
    return s


def pipe(t, x1, x2, y, col, label="", dur=1.6):
    """연결 관: 파인 홈 속을 빛 덩이가 지나가고 끝에 화살촉. label은 무엇이 흐르는지"""
    s = inset(t, x1, y - 8, x2 - x1 - 10, 16, 8)
    s += '<polygon points="%d,%d %d,%d %d,%d" fill="%s" filter="url(#shadow-sm)"/>\n' % (x2 - 14, y - 11, x2, y, x2 - 14, y + 11, col)
    for begin in [0, dur / 2]:
        s += ('<rect x="%d" y="%d" width="22" height="8" rx="4" fill="%s" filter="url(#glow)" opacity="0">'
              '<animate attributeName="x" from="%d" to="%d" dur="%ss" begin="%ss" repeatCount="indefinite"/>'
              '<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur="%ss" begin="%ss" repeatCount="indefinite"/></rect>\n'
              % (x1 + 2, y - 4, col, x1 + 2, x2 - 36, dur, begin, dur, begin))
    if label:
        s += text((x1 + x2) / 2 - 5, y - 16, label, 11, t["sub"], anchor="middle")
    return s


def curve_pipe(t, d, col, label="", lx=0, ly=0, dur=2.4):
    """굽은 관: 홈 선 위로 캡슐이 경로(d)를 따라 감. 화살촉은 호출 쪽에서 붙임"""
    s = '<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="10" stroke-linecap="round"/>\n' % (d, t["lo"], t["lo_a"])
    s += '<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="3" stroke-linecap="round"/>\n' % (d, t["hi"], t["hi_a"])
    s += '<path d="%s" fill="none" stroke="%s" stroke-opacity="0.35" stroke-width="2"/>\n' % (d, col)
    s += ('<rect x="-14" y="-4" width="28" height="8" rx="4" fill="%s" filter="url(#glow)">'
          '<animateMotion dur="%ss" repeatCount="indefinite" rotate="auto" path="%s"/></rect>\n' % (col, dur, d))
    if label:
        s += text(lx, ly, label, 11.5, col, "bold", "middle")
    return s


def up_arrow(t, x, y, col):
    return '<polygon points="%d,%d %d,%d %d,%d" fill="%s" filter="url(#shadow-sm)"/>\n' % (x - 9, y + 10, x + 9, y + 10, x, y - 4, col)


def pill(t, x, y, label, col, size=14):
    w = 26 + len(label) * size * 0.68
    s = raised(t, x, y, w, 36, 18, back=False, edge=col)
    s += coin(t, x + 18, y + 18, 7, col)
    s += text(x + 34, y + 23, label, size, t["ink"])
    return s, w


def layered_decor(t, x, y, r, col):
    s = ""
    for i, op in enumerate(["0.05", "0.08", "0.12"]):
        s += '<circle cx="%d" cy="%d" r="%d" fill="%s" opacity="%s"/>\n' % (x - i * 26, y + i * 18, r - i * 28, col, op)
    return s


def write(name, theme, body):
    path = os.path.join(HERE, "%s-%s.svg" % (name, theme))
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    print("wrote", os.path.relpath(path))


def furnace_strip(t, bx, by, bw=92, bh=44, gap=8):
    s = inset(t, bx - 16, by - 10, 11 * (bw + gap) + 24, bh + 20, 16)
    y_line = by + bh / 2
    s += groove(t, bx - 8, y_line, bx + 11 * (bw + gap) + 2, y_line, dash="6 6")
    for i, (zone, kind) in enumerate(ZONES):
        x0 = bx + i * (bw + gap)
        col = t[kind]
        s += '<rect x="%d" y="%d" width="%d" height="%d" rx="10" fill="url(#plate)" filter="url(#shadow-sm)"/>\n' % (x0, by, bw, bh)
        s += '<rect x="%d" y="%d" width="%d" height="%d" rx="10" fill="%s" fill-opacity="0.15">' % (x0, by, bw, bh, col)
        s += '<animate attributeName="fill-opacity" values="0.15;0.85;0.15" keyTimes="0;0.5;1" dur="6s" begin="%.2fs" repeatCount="indefinite"/></rect>\n' % (i * 0.45)
        s += '<path d="M %d %d L %d %d" stroke="%s" stroke-opacity="%s" stroke-width="1.5"/>\n' % (x0 + 10, by + 1, x0 + bw - 10, by + 1, t["hi"], t["hi_a"])
        s += emboss_text(t, x0 + bw / 2, by + 28, zone, 15, t["ink"], anchor="middle")
    s += '<g><animateMotion dur="6s" repeatCount="indefinite" path="M %d %d L %d %d"/>' % (bx - 8, y_line, bx + 11 * (bw + gap) + 2, y_line)
    s += '<circle r="9" fill="%s" filter="url(#glow)"/><circle r="9" fill="url(#coin)"/></g>\n' % t["accent"]
    return s


def hero(theme):
    t = THEMES[theme]
    W, H = 1200, 400
    s = head(W, H, t)
    s += layered_decor(t, 1060, 90, 190, t["cool"])
    s += layered_decor(t, 210, 390, 150, t["accent"])
    s += text(56, 78, "CAL01 MONITOR · 소둔로 관제", 15, t["sub"], extra='letter-spacing="3"')
    s += emboss_text(t, 56, 134, "설비의 흐름을 보고,", 40, t["ink"])
    s += emboss_text(t, 56, 186, "같은 구간을 함께 확인함", 40, t["accent"])
    s += text(56, 226, "채널값과 설비 위치를 한 화면에서. 모니터링팀과 현장팀이 같은 기록을 봄", 16, t["sub"])
    x = 56
    for label, col in [("3D 소둔로 · 홀로그램 · 기록 재생", t["cool"]), ("Z-score 경보 · 현장 요청 · 팀 알림", t["warm"]),
                       ("구역별 모델 9개 (v6 registry)", t["accent"])]:
        piece, w = pill(t, x, 250, label, col)
        s += piece
        x += w + 14
    s += furnace_strip(t, 56, 318)
    s += "</svg>\n"
    write("hero", theme, s)


def flow(theme):
    t = THEMES[theme]
    W, H = 1200, 420
    s = head(W, H, t)
    s += layered_decor(t, 1120, 40, 150, t["warm"])
    s += emboss_text(t, 56, 48, "한 건의 업무가 끝까지 가는 길", 20, t["ink"])
    cards = [("1 데이터 연결", ["원본 CSV 재생", "채널값 수집 (단축키로 속도 조절)"], t["cool"]),
             ("2 Z-score와 3D", ["기준을 벗어난 채널을 3D 위치로", "채널 그래프, 과거 LOT 이상 후보"], t["accent"]),
             ("3 현장 확인", ["같은 구간을 붙여 점검 요청", "현장팀이 조치 기록"], t["warm"]),
             ("4 결과 공유", ["요청자 확인, 팀 알림", "달력과 기록으로 남김"], t["hot"])]
    cw, ch, y0 = 238, 150, 78
    xs = [56, 339, 622, 905]
    for (title, lines, col), x in zip(cards, xs):
        s += raised(t, x, y0, cw, ch, 18)
        s += '<rect x="%d" y="%d" width="10" height="%d" rx="5" fill="%s" filter="url(#shadow-sm)"/>\n' % (x + 16, y0 + 18, ch - 36, col)
        s += '<rect x="%d" y="%d" width="3" height="%d" rx="1.5" fill="%s" opacity="0.5"/>\n' % (x + 18, y0 + 22, ch - 44, t["hi"])
        s += emboss_text(t, x + 40, y0 + 44, title, 19, t["ink"])
        s += inset(t, x + 36, y0 + 62, cw - 52, 70, 10)
        for i, line in enumerate(lines):
            s += coin(t, x + 52, y0 + 84 + i * 26, 4, col)
            s += text(x + 64, y0 + 89 + i * 26, line, 12, t["ink"])
    # 카드 사이 관: 무엇이 흐르는지 적음
    for x, label, col in [(294, "채널값", t["cool"]), (577, "경보 구간", t["accent"]), (860, "조치 기록", t["warm"])]:
        s += pipe(t, x, x + 45, y0 + 80, col, label)
    # 아래 띠: 모델 레지스트리가 2단계로 들어옴
    by = y0 + ch + 60
    s += inset(t, 56, by, 1088, 96, 16)
    s += coin(t, 92, by + 48, 16, t["accent"])
    s += emboss_text(t, 124, by + 40, "모델 레지스트리", 17, t["ink"])
    s += text(124, by + 64, "pdm-project 05 노트북이 구역별 모델 9개를 저장 → models/registry.json → 예측 모델 선택에서 읽어 분마다 점수를 냄", 13, t["sub"])
    s += text(124, by + 84, "이름: cal01-&lt;정답 버전&gt;-&lt;입력 태그&gt;-&lt;구역&gt;-&lt;모델&gt;-&lt;학습 범위&gt;-&lt;날짜&gt; · 근거 단계와 걷기 F1을 함께 적음", 12, t["sub"])
    d = "M 741 %d L 741 %d" % (by - 2, y0 + ch + 6)
    s += curve_pipe(t, d, t["accent"], "구역별 모델", 790, by - 22, dur=1.8)
    s += up_arrow(t, 741, y0 + ch + 2, t["accent"])
    s += "</svg>\n"
    write("flow", theme, s)


if __name__ == "__main__":
    for theme in THEMES:
        hero(theme)
        flow(theme)
