"""사람이 듣고 판정하는 화면(work/judge.html)을 만든다.

사용법: python make_judge.py heami-plain heami-listen [더 많은 음성 폴더 ...] [--ids s004,s096]
- 구간마다 원문, 음성 재생 버튼, 어려운 곳마다 [맞게 들림 / 잘못 들림] 버튼이 나온다.
- 자동 점검 결과는 보여 주지 않는다(판정이 쏠리지 않게).
- 판정은 브라우저에 저장되고, 아래 '판정 파일 저장' 버튼으로 human.json 을 내려받는다 → work/human.json 에 둔다.
"""
import argparse
import html
import json
from pathlib import Path

HERE = Path(__file__).parent

CSS = """
:root{--bg:#f7f7f5;--card:#fff;--ink:#1d1d1f;--sub:#5b5b60;--line:#dddde2;--ok:#1f7a4d;--okbg:#e3f4ea;--bad:#b3261e;--badbg:#fbe6e4;--acc:#2f5bd3;--accink:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#15161a;--card:#1f2026;--ink:#ececf0;--sub:#a3a3ad;--line:#33343c;--ok:#6fd39f;--okbg:#1d3328;--bad:#ff8a80;--badbg:#3a2220;--acc:#8fb0ff;--accink:#10131a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,"Malgun Gothic",sans-serif}
main{max-width:860px;margin:0 auto;padding:16px}h1{font-size:22px;margin:8px 0}p.lead{color:var(--sub);margin:0 0 16px}
.seg{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin:0 0 14px}
.seg h2{font-size:15px;margin:0 0 6px;color:var(--sub)}.src{font-size:14px;color:var(--sub);white-space:pre-wrap;margin:0 0 10px}
.ver{border-top:1px solid var(--line);padding:10px 0 4px}.ver b{font-size:14px}audio{width:100%;margin:6px 0}
.spot{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}.spot span{flex:1 1 180px;font-size:14px}
@media (max-width:560px){.spot span{flex-basis:100%}.spot button{flex:1}}
button{font:inherit;font-size:14px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 10px;cursor:pointer}
button.on.ok{background:var(--okbg);border-color:var(--ok);color:var(--ok)}button.on.bad{background:var(--badbg);border-color:var(--bad);color:var(--bad)}
.bar{position:sticky;bottom:0;background:var(--bg);padding:10px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.bar .save{background:var(--acc);color:var(--accink);border-color:var(--acc);font-weight:600}.none{font-size:14px;color:var(--sub)}
"""

JS = """
const KEY='judge-v3';let st={};try{st=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
function paint(){document.querySelectorAll('.spot').forEach(el=>{const v=st[el.dataset.k];el.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===v))});
const all=document.querySelectorAll('.spot').length,done=Object.keys(st).filter(k=>document.querySelector(`.spot[data-k="${k}"]`)).length;document.getElementById('count').textContent=`판정 ${done} / ${all}`}
document.addEventListener('click',e=>{const b=e.target.closest('.spot button');if(!b)return;st[b.parentElement.dataset.k]=b.dataset.v;try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}paint()});
document.getElementById('save').onclick=()=>{const blob=new Blob([JSON.stringify({judged_at:new Date().toISOString(),marks:st},null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='human-'+KEY+'.json';a.click()};
paint();
"""

LABEL = {"plain": "교안 그대로", "listen": "듣기용 대본"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("versions", nargs="+", help="work/audio 아래 폴더 이름 (예: heami-plain)")
    ap.add_argument("--ids", default="")
    ap.add_argument("--key", default="answer_key.json")
    ap.add_argument("--segments", default="work/test_input.json")
    ap.add_argument("--out", default="work/judge.html")
    ap.add_argument("--no-src", action="store_true", help="원문 글을 숨긴다")
    a = ap.parse_args()

    key = json.loads((HERE / a.key).read_text(encoding="utf-8"))
    raw = {s["id"]: s["raw"] for s in json.loads((HERE / a.segments).read_text(encoding="utf-8"))}
    want = set(a.ids.split(",")) if a.ids else None
    cards = []
    for seg in key["segments"]:
        sid = seg["id"]
        if want and sid not in want:
            continue
        vers = []
        for v in a.versions:
            f = next((HERE / "work/audio" / v).glob(f"{sid}.*"), None)
            if not f:
                continue
            eng, txt = v.split("-")
            spots = "".join(
                f'<div class="spot" data-k="{v}|{sid}|{i}"><span>{html.escape(sp["text"])}</span>'
                f'<button data-v="ok" class="ok">맞게 들림</button><button data-v="bad" class="bad">잘못 들림</button></div>'
                for i, sp in enumerate(seg["spots"]))
            if not seg["spots"]:
                spots = (f'<div class="spot" data-k="{v}|{sid}|all"><span>전체가 자연스럽게 들리나요? (대조군)</span>'
                         f'<button data-v="ok" class="ok">괜찮음</button><button data-v="bad" class="bad">이상함</button></div>')
            vers.append(f'<div class="ver"><b>{eng} · {LABEL.get(txt, txt)}</b>'
                        f'<audio controls preload="none" src="audio/{v}/{f.name}"></audio>{spots}</div>')
        if vers:
            cards.append(f'<section class="seg"><h2>{sid}{" · 대조군" if seg.get("control") else ""}</h2>'
                         + ("" if a.no_src else f'<div class="src">{html.escape(raw[sid])}</div>') + f'{"".join(vers)}</section>')
    page = (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>듣기 판정</title><style>{CSS}</style></head><body><main><h1>듣기 판정</h1>'
            f'<p class="lead">듣고 맞게 들렸는지만 고르세요.</p>'
            f'{"".join(cards)}<div class="bar"><span id="count"></span><button id="save" class="save">판정 파일 저장</button></div>'
            f'</main><script>{JS}</script></body></html>')
    (HERE / a.out).write_text(page, encoding="utf-8")
    print(f"{len(cards)}개 구간 → {HERE / a.out}")


if __name__ == "__main__":
    main()
