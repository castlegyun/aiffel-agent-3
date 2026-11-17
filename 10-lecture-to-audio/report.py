"""사람 판정(human*.json)과 자동 점검(work/check/*.json)을 모아 결과표를 만든다.

사용법: python report.py heami-plain heami-listen piper-plain piper-listen [elevenlabs-listen] --human work/human.json work/human-judge-v2.json
결과: results.csv (어려운 곳 한 줄씩), results.html (요약 표 + 구간별 비교), 화면에 요약 출력
"""
import argparse
import csv
import html
import json
from pathlib import Path

HERE = Path(__file__).parent
LABEL = {"plain": "교안 그대로", "listen": "듣기용 대본"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("versions", nargs="+")
    ap.add_argument("--human", nargs="*", default=[])
    ap.add_argument("--key", default="answer_key.json")
    ap.add_argument("--segments", default="work/test_input.json")
    ap.add_argument("--script", default="work/listen_script_test.json")
    a = ap.parse_args()

    key = {s["id"]: s for s in json.loads((HERE / a.key).read_text(encoding="utf-8"))["segments"]}
    raw = {s["id"]: s["raw"] for s in json.loads((HERE / a.segments).read_text(encoding="utf-8"))}
    script = {s["id"]: s["listen"] for s in json.loads((HERE / a.script).read_text(encoding="utf-8"))}
    human = {}
    for h in a.human:
        human |= json.loads((HERE / h).read_text(encoding="utf-8"))["marks"]

    rows, per_seg = [], {}
    for v in a.versions:
        chk = json.loads((HERE / "work/check" / f"{v}.json").read_text(encoding="utf-8"))["segments"]
        for sid, r in chk.items():
            for i, sp in enumerate(r["spots"]):
                hm = human.get(f"{v}|{sid}|{i}")
                rows.append({"version": v, "segment": sid, "spot": sp["text"], "auto_ok": sp["ok"],
                             "human_ok": None if hm is None else hm == "ok", "transcript": r["transcript"]})
            per_seg.setdefault(sid, {})[v] = r

    with open(HERE / "results.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    # 요약: 버전별 잘못 들린 곳(사람), 자동 점검 틀림, 일치
    summ = []
    for v in a.versions:
        rs = [r for r in rows if r["version"] == v]
        judged = [r for r in rs if r["human_ok"] is not None]
        summ.append({"v": v, "n": len(rs), "judged": len(judged),
                     "human_bad": sum(not r["human_ok"] for r in judged),
                     "auto_bad": sum(not r["auto_ok"] for r in rs),
                     "agree": sum(r["auto_ok"] == r["human_ok"] for r in judged)})
    lines = []
    for s in summ:
        eng, txt = s["v"].split("-")
        lines.append(f"{eng} · {LABEL[txt]}: 어려운 곳 {s['n']}곳 | 사람 판정 잘못 들림 {s['human_bad']}/{s['judged']} | "
                     f"자동 점검 틀림 {s['auto_bad']}/{s['n']} | 사람과 일치 {s['agree']}/{s['judged']}")
    print("\n".join(lines))

    # 엔진마다 대본이 줄인 비율 (사람 판정 기준)
    red = []
    for eng in sorted({s["v"].split("-")[0] for s in summ}):
        p = next((s for s in summ if s["v"] == f"{eng}-plain"), None)
        l = next((s for s in summ if s["v"] == f"{eng}-listen"), None)
        if p and l and p["judged"] and p["human_bad"]:
            red.append(f"{eng}: 잘못 들림 {p['human_bad']} → {l['human_bad']} "
                       f"({(p['human_bad'] - l['human_bad']) / p['human_bad'] * 100:.1f}% 줄어듦)")
    all_j = [r for r in rows if r["human_ok"] is not None]
    agree = f"자동 점검과 사람 판정 일치: {sum(r['auto_ok'] == r['human_ok'] for r in all_j)}/{len(all_j)}"
    print("\n".join(red + [agree]))

    css = """:root{--bg:#f7f7f5;--card:#fff;--ink:#1d1d1f;--sub:#5b5b60;--line:#dddde2;--ok:#1f7a4d;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#15161a;--card:#1f2026;--ink:#ececf0;--sub:#a3a3ad;--line:#33343c;--ok:#6fd39f;--bad:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,"Malgun Gothic",sans-serif}
main{max-width:1000px;margin:0 auto;padding:16px}h1{font-size:22px}h2{font-size:17px;margin-top:28px}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;background:var(--card)}td,th{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}.sub{color:var(--sub);font-size:13px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0}audio{width:100%;max-width:360px}"""
    mark = lambda b: "—" if b is None else (f'<span class="ok">맞음</span>' if b else f'<span class="bad">틀림</span>')
    summ_rows = "".join(
        (f"<tr><td>{s['v'].split('-')[0]}</td><td>{LABEL[s['v'].split('-')[1]]}</td>"
        + (f"<td>{s['human_bad']} / {s['judged']}</td>" if s["judged"] else "<td>판정 안 함</td>")
        + f"<td>{s['auto_bad']} / {s['n']}</td>"
        + (f"<td>{s['agree']} / {s['judged']}</td></tr>" if s["judged"] else "<td>—</td></tr>")) for s in summ)
    secs = []
    for sid, vs in per_seg.items():
        body = []
        for v, r in vs.items():
            eng, txt = v.split("-")
            spots = "".join(
                f"<tr><td>{html.escape(sp['text'])}</td><td>{mark(human.get(f'{v}|{sid}|{i}') == 'ok' if human.get(f'{v}|{sid}|{i}') else None)}</td>"
                f"<td>{mark(sp['ok'])}</td></tr>" for i, sp in enumerate(r["spots"]))
            body.append(f"<h3>{eng} · {LABEL[txt]}</h3><audio controls preload=none src='work/audio/{v}/{r['file']}'></audio>"
                        f"<p class=sub>받아 적은 글: {html.escape(r['transcript'])}</p>"
                        f"<div class=wrap><table><tr><th>어려운 곳</th><th>사람</th><th>자동 점검</th></tr>{spots}</table></div>")
        secs.append(f"<section><h2>{sid}</h2><p class=sub>원문: {html.escape(raw[sid])}</p>"
                    f"<p class=sub>듣기용 대본: {html.escape(script[sid])}</p>{''.join(body)}</section>")
    page = (f"<!doctype html><html lang=ko><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<title>교안 듣기 결과</title><style>{css}</style></head><body><main><h1>교안 → 듣기용 음성: 결과</h1>"
            f"<div class=wrap><table><tr><th>음성 엔진</th><th>입력</th><th>잘못 들림 (사람)</th><th>틀림 (자동 점검)</th><th>사람과 일치</th></tr>{summ_rows}</table></div>"
            f"<p>{'<br>'.join(html.escape(x) for x in red + [agree])}</p>{''.join(secs)}</main></body></html>")
    (HERE / "results.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
