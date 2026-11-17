"""교안 ipynb 를 구간(문단·표·코드·그림·제목) 목록으로 나눈다.

사용법: python extract.py <교안.ipynb> <저장할 segments.json>

구간마다 두 가지 글을 남긴다.
- raw:   교안 마크다운 원문
- plain: "그대로 읽기"(기준선)용 글. 화면에 보이는 글자만 남기고 마크다운 기호를 지운 것.
         그림은 대체 글(alt), 표는 칸 글자를 순서대로, 코드는 그대로 둔다.
"""
import json
import re
import sys
from pathlib import Path


def to_plain(text):
    t = re.sub(r"^```\w*\s*$", "", text, flags=re.M)          # 코드 블록 울타리(```text)는 화면에 안 보임
    t = re.sub(r"<figure>.*?<img[^>]*alt=\"([^\"]*)\".*?</figure>", r"\1", t, flags=re.S)  # 그림 → 대체 글
    t = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", t)          # ![대체 글](주소) → 대체 글
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)           # [글](주소) → 글
    t = re.sub(r"<[^>]+>", "", t)                              # 남은 html 태그
    t = re.sub(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", "", t, flags=re.M)  # 표 구분 줄 |---|---|
    t = t.replace("|", " ")
    t = re.sub(r"^#{1,6}\s*", "", t, flags=re.M)              # 제목 #
    t = re.sub(r"^>\s?", "", t, flags=re.M)                    # 인용 >
    t = re.sub(r"^\s*[-*]\s+", "", t, flags=re.M)              # 목록 점
    t = t.replace("**", "").replace("`", "")
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()


def kind_of(block):
    if block.startswith("```"):
        return "code"
    if block.lstrip().startswith("|"):
        return "table"
    if block.startswith("![") or block.startswith("<figure"):
        return "image"
    if block.startswith("#"):
        return "heading"
    return "text"


def split_blocks(md):
    """빈 줄로 나누되, 코드 블록(```)과 <figure> 안은 자르지 않는다."""
    blocks, cur, fence, fig = [], [], False, False
    for line in md.splitlines():
        if line.strip().startswith("```"):
            fence = not fence
        if "<figure" in line:
            fig = True
        if "</figure>" in line:
            fig = False
        if not line.strip() and not fence and not fig:
            if cur:
                blocks.append("\n".join(cur))
                cur = []
            continue
        cur.append(line)
    if cur:
        blocks.append("\n".join(cur))
    return blocks


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    nb = json.loads(src.read_text(encoding="utf-8"))
    segs = []
    for ci, cell in enumerate(nb["cells"]):
        if cell["cell_type"] != "markdown":
            continue
        for block in split_blocks("".join(cell["source"])):
            segs.append({
                "id": f"s{len(segs) + 1:03d}",
                "cell": ci,
                "kind": kind_of(block),
                "raw": block,
                "plain": to_plain(block),
            })
    out.write_text(json.dumps(segs, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = {}
    for s in segs:
        counts[s["kind"]] = counts.get(s["kind"], 0) + 1
    print(f"구간 {len(segs)}개 저장: {out}  종류별 {counts}")


if __name__ == "__main__":
    main()
