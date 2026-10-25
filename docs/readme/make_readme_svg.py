"""README용 애니메이션 SVG: 관제실 HUD 스타일 (다크, 라이트 두 벌)

실행 (저장소 루트에서):
    python docs/readme/make_readme_svg.py

- 외부 도구 없이 문자열로 SVG를 씀. 애니메이션은 SVG 표준(SMIL)이라 GitHub에서 그대로 움직임
- pdm-project(양각 카드), 조직 프로필(외부 위젯)과 다르게 관제실 계기 화면처럼 꾸밈
  격자 바탕, 괄호 모서리 패널, 고정폭 글자, 깜박이는 커서, 구역 LED, 파형 그래프, 콘솔 기록
- 만드는 파일: hero, flow (각각 -dark.svg, -light.svg)
"""

import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
MONO = "'JetBrains Mono', Consolas, 'Cascadia Mono', 'Courier New', monospace"
SANS = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif"

THEMES = {
    "dark": {"bg": "#050a0f", "panel": "#08131c", "grid": "#39d8ff", "grid_a": "0.10", "ink": "#d6f3ff", "sub": "#6f98ad",
             "cyan": "#39d8ff", "amber": "#ffb020", "red": "#ff3b5c", "green": "#39ff88", "scan_a": "0.18"},
    "light": {"bg": "#f1f5f8", "panel": "#ffffff", "grid": "#0b4a66", "grid_a": "0.10", "ink": "#0b1f2a", "sub": "#4f6b7a",
              "cyan": "#007fa8", "amber": "#b86f00", "red": "#c92040", "green": "#0f8a4c", "scan_a": "0.0"},
}

ZONES = ["CLN", "Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7", "Z8", "Z9", "OUT"]


def defs(t):
    return (
        '<defs>\n'
        '<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">'
        '<path d="M 40 0 L 0 0 0 40" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="1"/></pattern>\n'
        '<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">'
        '<rect width="4" height="1.2" fill="#000" fill-opacity="%s"/></pattern>\n'
        '<filter id="glow" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="3" result="b"/>'
        '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>\n'
        '<filter id="glow-lg" x="-30%%" y="-30%%" width="160%%" height="160%%"><feGaussianBlur stdDeviation="8" result="b"/>'
        '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>\n'
        '</defs>\n' % (t["grid"], t["grid_a"], t["scan_a"]))


def head(W, H, t):
    s = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" font-family="%s">\n' % (W, H, W, H, SANS))
    s += defs(t)
    s += '<rect width="%d" height="%d" rx="8" fill="%s"/>\n' % (W, H, t["bg"])
    s += '<rect width="%d" height="%d" rx="8" fill="url(#grid)"/>\n' % (W, H)
    return s


def tail(W, H, t):
    return '<rect width="%d" height="%d" rx="8" fill="url(#scan)" pointer-events="none"/>\n</svg>\n' % (W, H)


def text(x, y, s, size, fill, weight="normal", anchor="start", mono=False, extra=""):
    fam = ' font-family="%s"' % MONO if mono else ""
    return '<text x="%s" y="%s" font-size="%s" fill="%s" font-weight="%s" text-anchor="%s"%s %s>%s</text>\n' % (
        x, y, size, fill, weight, anchor, fam, extra, s)


def panel(t, x, y, w, h, col, title=""):
    """괄호 모서리 패널: 반투명 판 + 네 귀퉁이 ㄱ자 선 + 제목"""
    s = '<rect x="%d" y="%d" width="%d" height="%d" fill="%s" fill-opacity="0.75" stroke="%s" stroke-opacity="0.35" stroke-width="1"/>\n' % (x, y, w, h, t["panel"], col)
    L = 16
    for (cx, cy, dx, dy) in [(x, y, 1, 1), (x + w, y, -1, 1), (x, y + h, 1, -1), (x + w, y + h, -1, -1)]:
        s += '<polyline points="%d,%d %d,%d %d,%d" fill="none" stroke="%s" stroke-width="2.5"/>\n' % (cx, cy + dy * L, cx, cy, cx + dx * L, cy, col)
    if title:
        s += text(x + 14, y - 8, title, 11, col, "bold", mono=True, extra='letter-spacing="2"')
    return s


def led(t, x, y, col, blink=None, label=""):
    s = '<rect x="%d" y="%d" width="14" height="14" rx="2" fill="%s" filter="url(#glow)"' % (x, y, col)
    if blink:
        s += '><animate attributeName="fill" values="%s" dur="%ss" repeatCount="indefinite"/></rect>\n' % blink
    else:
        s += '/>\n'
    if label:
        s += text(x + 22, y + 12, label, 12, t["ink"], mono=True)
    return s


def cursor(t, x, y, col, h=16):
    return ('<rect x="%d" y="%d" width="9" height="%d" fill="%s"><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1s" repeatCount="indefinite"/></rect>\n'
            % (x, y, h, col))


def write(name, theme, body):
    path = os.path.join(HERE, "%s-%s.svg" % (name, theme))
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    print("wrote", os.path.relpath(path))


# ---------------------------------------------------------------- 1. 머리: 관제 화면
def hero(theme):
    t = THEMES[theme]
    W, H = 1200, 420
    s = head(W, H, t)
    # 상단 상태 줄
    s += text(40, 40, "CAL01 MONITOR // CONTROL ROOM", 13, t["cyan"], "bold", mono=True, extra='letter-spacing="3"')
    s += cursor(t, 318, 28, t["cyan"], 14)
    s += text(W - 40, 40, "SRC cal01_base_v1.csv · 1 s · 345,390 rows", 12, t["sub"], anchor="end", mono=True)
    # 제목
    s += text(40, 104, "설비의 흐름을 보고,", 40, t["ink"], "bold")
    s += text(40, 154, "같은 구간을 함께 확인함", 40, t["cyan"], "bold", extra='filter="url(#glow)"')
    s += text(40, 190, "팀 로그인 → 실제 CSV 재생 → 소둔로 3D → Z-score 경보 → 현장 확인 요청 → 조치와 확인을 한 건으로", 14, t["sub"])
    # 오른쪽: 구역 LED 패널
    px, py, pw, ph = 760, 60, 400, 150
    s += panel(t, px, py, pw, ph, t["cyan"], "ZONE STATUS")
    for i, z in enumerate(ZONES):
        col_i, row = i % 4, i // 4
        x, y = px + 22 + col_i * 96, py + 24 + row * 40
        if z == "Z4":
            s += led(t, x, y, t["amber"], blink=("%s;%s;%s;%s" % (t["amber"], t["red"], t["amber"], t["amber"]), 2.4), label=z)
        elif z == "Z3":
            s += led(t, x, y, t["amber"], blink=("%s;%s;%s" % (t["amber"], t["green"], t["amber"]), 5), label=z)
        else:
            s += led(t, x, y, t["green"], label=z)
    s += text(px + 22, py + ph - 14, "Z4 CP +3σ 02:28 ~ 02:42 → 현장 확인 요청", 11.5, t["amber"], mono=True)
    # 아래: 파형 그래프 패널
    gx, gy, gw, gh = 40, 230, 1120, 150
    s += panel(t, gx, gy, gw, gh, t["cyan"], "TC-Z4 · 1 min · LOT 069")
    x0, x1, ymid = gx + 20, gx + gw - 20, gy + gh / 2 + 10
    pts = []
    n = 220
    for i in range(n):
        u = i / (n - 1)
        v = 18 * math.sin(u * 14) + 6 * math.sin(u * 53 + 1.2)
        if 0.66 < u < 0.72:
            v -= 48 * math.sin((u - 0.66) / 0.06 * math.pi)
        pts.append((x0 + u * (x1 - x0), ymid + v))
    path = "M " + " L ".join("%.1f %.1f" % p for p in pts)
    length = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts[:-1], pts[1:]))
    thr = ymid - 30
    s += '<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="%s" stroke-opacity="0.8" stroke-width="1" stroke-dasharray="6 5"/>\n' % (x0, thr, x1, thr, t["amber"])
    s += text(x1, thr - 5, "+3σ", 11, t["amber"], anchor="end", mono=True)
    s += '<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="%s" stroke-opacity="0.35" stroke-width="1"/>\n' % (x0, ymid, x1, ymid, t["sub"])
    s += ('<path d="%s" fill="none" stroke="%s" stroke-width="2" stroke-linejoin="round" filter="url(#glow)" stroke-dasharray="%.0f" stroke-dashoffset="%.0f">'
          '<animate attributeName="stroke-dashoffset" values="%.0f;0;0" keyTimes="0;0.85;1" dur="8s" repeatCount="indefinite"/></path>\n'
          % (path, t["cyan"], length + 2, length + 2, length + 2))
    # 쓸고 가는 세로 선
    s += ('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-opacity="0.9" stroke-width="1.5">'
          '<animate attributeName="x1" values="%d;%d;%d" keyTimes="0;0.85;1" dur="8s" repeatCount="indefinite"/>'
          '<animate attributeName="x2" values="%d;%d;%d" keyTimes="0;0.85;1" dur="8s" repeatCount="indefinite"/></line>\n'
          % (x0, gy + 18, x0, gy + gh - 14, t["green"], x0, x1, x1, x0, x1, x1))
    # 경보 칸이 켜짐
    ax, aw = x0 + 0.66 * (x1 - x0), 0.06 * (x1 - x0)
    s += ('<rect x="%.1f" y="%d" width="%.1f" height="%d" fill="%s" fill-opacity="0">'
          '<animate attributeName="fill-opacity" values="0;0;0.22;0.22" keyTimes="0;0.6;0.64;1" dur="8s" repeatCount="indefinite"/></rect>\n'
          % (ax, gy + 18, aw, gh - 32, t["red"]))
    s += ('<g opacity="0"><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.62;0.66;1" dur="8s" repeatCount="indefinite"/>'
          + text(ax + aw + 8, gy + 34, "ALERT  Z4  CP 0.88 ↑", 12, t["red"], "bold", mono=True) + "</g>\n")
    # 읽음 값 (셋이 번갈아 켜짐)
    for i, v in enumerate(["812.4 ℃", "812.9 ℃", "811.7 ℃"]):
        s += ('<text x="%d" y="%d" font-size="22" font-weight="bold" fill="%s" font-family="%s" text-anchor="end" opacity="0">'
              '<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.02;0.33;0.35;1" dur="3s" begin="%ss" repeatCount="indefinite"/>%s</text>\n'
              % (gx + gw - 24, gy + 52, t["ink"], MONO, i, v))
    s += text(gx + gw - 24, gy + 70, "NOW · 1 s", 10.5, t["sub"], anchor="end", mono=True)
    s += text(40, H - 14, "LOT 14 · SENSORS 21 · ZONES 11 · MODEL REGISTRY v6 → v7 · RENDER + POSTGRES", 11, t["sub"], mono=True, extra='letter-spacing="1"')
    s += tail(W, H, t)
    write("hero", theme, s)


# ---------------------------------------------------------------- 2. 흐름: 콘솔 기록
def flow(theme):
    t = THEMES[theme]
    W, H = 1200, 360
    s = head(W, H, t)
    s += text(40, 40, "ONE TICKET, END TO END", 13, t["cyan"], "bold", mono=True, extra='letter-spacing="3"')
    s += text(W - 40, 40, "한 건의 업무가 끝까지 가는 길", 14, t["sub"], anchor="end")
    # 왼쪽: 콘솔 기록
    px, py, pw, ph = 40, 70, 760, 250
    s += panel(t, px, py, pw, ph, t["cyan"], "LOG")
    lines = [
        ("> import ", "cal01_base_v1.csv  345,390 rows  1 s", "[OK]", t["green"]),
        ("> zscore ", "CP-Z4  +3σ  02:28 ~ 02:42  14 min", "[ALERT]", t["red"]),
        ("> 3d     ", "Z4 zone highlighted  ·  channel graph opened", "[VIEW]", t["cyan"]),
        ("> request", "현장 확인 요청  Z4 CP 02:28 ~ 02:42  → 현장팀", "[SENT]", t["amber"]),
        ("> action ", "현장 조치 기록  ·  확인 완료  ·  팀 알림", "[DONE]", t["green"]),
        ("> model  ", "registry  Z4 RandomForest v6  F1 0.59  → 예측 점수", "[LOADED]", t["cyan"]),
    ]
    T = 12
    for i, (cmd, body, tag, col) in enumerate(lines):
        y = py + 38 + i * 32
        t0 = 0.08 + i * 0.13
        s += ('<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;%.3f;%.3f;0.95;1" dur="%ds" repeatCount="indefinite"/>' % (t0, t0 + 0.01, T))
        s += text(px + 20, y, cmd, 13, t["sub"], mono=True)
        s += text(px + 118, y, body, 13, t["ink"], mono=True)
        s += text(px + pw - 20, y, tag, 13, col, "bold", anchor="end", mono=True)
        s += "</g>\n"
    s += ('<g><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.9;0.91;1" dur="%ds" repeatCount="indefinite"/>' % T)
    s += cursor(t, px + 20, py + 38 + 6 * 32 - 13, t["cyan"], 16) + "</g>\n"
    # 오른쪽: 단계 표시등
    sx, sy, sw, sh = 840, 70, 320, 250
    s += panel(t, sx, sy, sw, sh, t["amber"], "STEPS")
    steps = [("데이터 연결", "CSV 가져오기, 1초 재생", 0.08), ("Z-score와 3D", "경보 구간, 구역 강조", 0.21), ("현장 확인", "요청 → 조치 → 확인", 0.47), ("결과 공유", "팀 알림, 기록, 모델 점수", 0.73)]
    for i, (name, desc, t0) in enumerate(steps):
        y = sy + 40 + i * 54
        s += ('<rect x="%d" y="%d" width="14" height="14" rx="7" fill="%s"><animate attributeName="fill" values="%s;%s;%s;%s" keyTimes="0;%.3f;%.3f;1" dur="%ds" repeatCount="indefinite"/></rect>\n'
              % (sx + 22, y - 11, t["sub"], t["sub"], t["sub"], t["green"], t["green"], t0, t0 + 0.01, T))
        s += text(sx + 48, y, name, 15, t["ink"], "bold")
        s += text(sx + 48, y + 18, desc, 11.5, t["sub"], mono=True)
        if i < len(steps) - 1:
            s += '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-opacity="0.5" stroke-width="1.5" stroke-dasharray="3 4"/>\n' % (sx + 29, y + 8, sx + 29, y + 32, t["sub"])
    s += tail(W, H, t)
    write("flow", theme, s)


if __name__ == "__main__":
    for theme in THEMES:
        hero(theme)
        flow(theme)
