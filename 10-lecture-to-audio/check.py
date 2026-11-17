"""음성을 음성 인식(faster-whisper)으로 다시 받아 적고, answer_key.json 의 '맞게 읽힌 소리' 목록과 맞춰 본다.

사용법: python check.py work/audio/heami-plain [--model large-v3 --device cpu --compute int8]
결과: work/check/<폴더 이름>.json  (구간마다 받아 적은 글, 어려운 곳마다 맞음/틀림)
- 받아 적은 글은 저장해 두고, 다시 돌리면 이미 받아 적은 구간은 건너뛴다(--redo 로 다시).
- 비교 방법(answer_key.json rules): 띄어쓰기·문장부호를 지우고 소문자로 바꾼 뒤 accept 중 하나가 들어 있으면 맞음. '공'은 '영'으로 바꾼다.
- 한 구간에 같은 자리가 여러 번 나와도(예: "PoC (3번)") 한 번이라도 맞게 들리면 맞음으로 센다.
"""
import argparse
import json
import re
import time
from pathlib import Path

HERE = Path(__file__).parent


def norm(s):
    s = s.lower().replace("공", "영")
    return re.sub(r"[\s,!?\"'“”‘’·…~\-_/():;]", "", s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio_dir")
    ap.add_argument("--key", default="answer_key.json")
    ap.add_argument("--model", default="large-v3")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--compute", default="int8")
    ap.add_argument("--beam", type=int, default=5)
    ap.add_argument("--out-dir", default="work/check")
    ap.add_argument("--redo", action="store_true")
    a = ap.parse_args()

    audio_dir = Path(a.audio_dir)
    out = HERE / a.out_dir / f"{audio_dir.name}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    old = json.loads(out.read_text(encoding="utf-8")) if out.exists() and not a.redo else {"segments": {}}
    key = json.loads((HERE / a.key).read_text(encoding="utf-8"))

    model = None
    result = {"audio_dir": audio_dir.name, "stt": {"model": a.model, "device": a.device, "compute": a.compute, "beam": a.beam},
              "segments": {}}
    for seg in key["segments"]:
        sid = seg["id"]
        files = list(audio_dir.glob(f"{sid}.*"))
        if not files:
            continue
        prev = old["segments"].get(sid)
        if prev and "transcript" in prev:
            text, secs = prev["transcript"], prev.get("stt_seconds")
        else:
            if model is None:
                from faster_whisper import WhisperModel
                model = WhisperModel(a.model, device=a.device, compute_type=a.compute)
            t0 = time.time()
            parts, _ = model.transcribe(str(files[0]), language="ko", beam_size=a.beam)
            text = " ".join(p.text.strip() for p in parts)
            secs = time.time() - t0
            print(f"{sid} 받아 적음 ({secs:.1f}초)")
        n = norm(text)
        spots = []
        for sp in seg["spots"]:
            hit = next((v for v in sp["accept"] if norm(v) in n), None)
            spots.append({"text": sp["text"], "ok": hit is not None, "matched": hit})
        result["segments"][sid] = {"file": files[0].name, "transcript": text, "stt_seconds": secs,
                                   "control": bool(seg.get("control")), "spots": spots}
        out.write_text(json.dumps(result | {"segments": old["segments"] | result["segments"]}, ensure_ascii=False, indent=1),
                       encoding="utf-8")
    ok = sum(s["ok"] for v in result["segments"].values() for s in v["spots"])
    total = sum(len(v["spots"]) for v in result["segments"].values())
    print(f"{audio_dir.name}: 어려운 곳 {total}곳 중 맞게 들린 곳 {ok}곳 → {out}")


if __name__ == "__main__":
    main()
