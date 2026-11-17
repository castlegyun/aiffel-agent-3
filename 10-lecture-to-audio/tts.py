"""구간마다 음성 파일을 만든다.

사용법:
  python tts.py --engine heami --text plain  --ids answer_key.json
  python tts.py --engine heami --text listen --ids answer_key.json --script work/listen_script_test.json
  python tts.py --engine elevenlabs --text listen --ids answer_key.json --script work/listen_script_test.json

- --text plain : 교안 그대로 읽기(기준선, segments.json 의 plain)
- --text listen: 듣기용 대본(listen_script 의 listen). skip 이 있는 구간은 만들지 않는다.
- --ids        : 만들 구간 목록. answer_key.json(시험 구간) 또는 all(전체)
- 결과: work/audio/<engine>-<text>/<id>.<wav|mp3>. 이미 있는 파일은 다시 만들지 않는다(덮어쓰지 않음).

엔진
- heami      : Windows 내장 한국어 음성(Microsoft Heami Desktop). 인터넷 없이 돈다.
- piper      : 오픈 음성 모델 Piper, 한국어 목소리 ko_KR-kss-medium (voices/ 에 받아 둠). CPU 로 돈다.
               받기: python -m piper.download_voices --download-dir voices ko_KR-kss-medium
- google      : Google Cloud Text-to-Speech(REST). 환경 변수 GOOGLE_TTS_API_KEY 필요(출력하지 않음). 기본 목소리 ko-KR-Neural2-C.
- elevenlabs : ElevenLabs API. 환경 변수 ELEVENLABS_API_KEY 필요(출력하지 않음). 무료 요금제는 글자 수 한도가 있다.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent

HEAMI_PS = r"""
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Heami Desktop')
$s.Rate = [int]$args[2]
$s.SetOutputToWaveFile($args[1])
$s.Speak([IO.File]::ReadAllText($args[0], [Text.Encoding]::UTF8))
$s.Dispose()
"""


def heami(text, out, rate):
    with tempfile.TemporaryDirectory() as d:
        txt, ps1 = Path(d) / "t.txt", Path(d) / "say.ps1"
        txt.write_text(text, encoding="utf-8")
        ps1.write_text(HEAMI_PS, encoding="utf-8-sig")
        subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps1),
                        str(txt), str(out), str(rate)], check=True)


def piper(text, out, voice_path):
    with tempfile.TemporaryDirectory() as d:
        txt = Path(d) / "t.txt"
        txt.write_text(text, encoding="utf-8")
        subprocess.run([sys.executable, "-m", "piper", "-m", str(voice_path), "-i", str(txt), "-f", str(out)],
                       check=True, capture_output=True)


def google(text, out, voice):
    import base64
    key = os.environ.get("GOOGLE_TTS_API_KEY", "")
    if not key:
        sys.exit("GOOGLE_TTS_API_KEY 가 없습니다")
    body = json.dumps({"input": {"text": text}, "voice": {"languageCode": "ko-KR", "name": voice},
                       "audioConfig": {"audioEncoding": "MP3"}}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request("https://texttospeech.googleapis.com/v1/text:synthesize", data=body,
                                 headers={"Content-Type": "application/json", "x-goog-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            out.write_bytes(base64.b64decode(json.load(r)["audioContent"]))
    except urllib.error.HTTPError as e:
        sys.exit(f"Google 오류 {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")


def elevenlabs(text, out, voice, model):
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key:
        sys.exit("ELEVENLABS_API_KEY 가 없습니다")
    body = json.dumps({"text": text, "model_id": model}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        data=body, headers={"xi-api-key": key, "Content-Type": "application/json; charset=utf-8"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            out.write_bytes(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs 오류 {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True, choices=["heami", "piper", "google", "elevenlabs"])
    ap.add_argument("--text", required=True, choices=["plain", "listen"])
    ap.add_argument("--ids", default="answer_key.json", help="answer_key.json 또는 all")
    ap.add_argument("--segments", default="work/segments_test6.json", help="구간 목록. 교안 전체는 extract.py 로 만든 work/segments.json")
    ap.add_argument("--script", default="work/listen_script_test.json")
    ap.add_argument("--out", default="work/audio")
    ap.add_argument("--rate", type=int, default=0, help="heami 말 빠르기 -10~10")
    ap.add_argument("--piper-voice", default="voices/ko_KR-kss-medium.onnx")
    ap.add_argument("--google-voice", default="ko-KR-Neural2-C")
    ap.add_argument("--voice", default=os.environ.get("VOICE_ID", "nPczCjzI2devNBz1zQrb"), help="ElevenLabs 목소리 id (기본 Brian)")
    ap.add_argument("--model", default="eleven_v4", help="ElevenLabs 모델 id")
    a = ap.parse_args()

    segs = {s["id"]: s for s in json.loads((HERE / a.segments).read_text(encoding="utf-8"))}
    ids = list(segs) if a.ids == "all" else [s["id"] for s in json.loads((HERE / a.ids).read_text(encoding="utf-8"))["segments"]]
    if a.text == "listen":
        script = {s["id"]: s for s in json.loads((HERE / a.script).read_text(encoding="utf-8"))}

    out_dir = HERE / a.out / f"{a.engine}-{a.text}"
    out_dir.mkdir(parents=True, exist_ok=True)
    made = skipped = 0
    for i in ids:
        if a.text == "plain":
            text = segs[i]["plain"]
        else:
            if script[i].get("skip"):
                continue
            text = script[i]["listen"]
        if not text.strip():
            continue
        out = out_dir / f"{i}.{'mp3' if a.engine in ('elevenlabs', 'google') else 'wav'}"
        if out.exists():
            skipped += 1
            continue
        if a.engine == "heami":
            heami(text, out, a.rate)
        elif a.engine == "piper":
            piper(text, out, HERE / a.piper_voice)
        elif a.engine == "google":
            google(text, out, a.google_voice)
        else:
            elevenlabs(text, out, a.voice, a.model)
        made += 1
        print(f"{i} 저장 ({len(text)}자)")
    print(f"새로 만듦 {made}개, 이미 있어 건너뜀 {skipped}개 → {out_dir}")


if __name__ == "__main__":
    main()
