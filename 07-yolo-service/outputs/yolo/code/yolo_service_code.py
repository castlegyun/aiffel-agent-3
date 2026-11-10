# yolo_service.ipynb 의 코드 셀을 순서대로 이어 붙인 사본 (이 폴더에서 python 으로 실행 가능)

import json, hashlib, platform, sys, time, subprocess, shutil
from collections import Counter
from datetime import datetime
from importlib.metadata import version
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import torch
import matplotlib.pyplot as plt
from ultralytics import YOLO
from ultralytics.utils.downloads import attempt_download_asset

plt.rcParams["font.family"] = ["Malgun Gothic", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

ROOT = Path.cwd()
INPUT_DIR = ROOT / "inputs"
MODEL_DIR = ROOT / "models"
OUT = ROOT / "outputs" / "yolo"
for d in ("images", "json", "masks", "verify", "code"):
    (OUT / d).mkdir(parents=True, exist_ok=True)

IMGSZ = 640
DEVICE = "cpu"
CONFS = (0.25, 0.50)
MODELS = {"det": "yolo26n.pt", "seg": "yolo26n-seg.pt"}
# 입력 폴더가 비었을 때만 내려받는 공개 샘플 (bus: Ultralytics 문서 샘플, coco_*: COCO val2017 이미지)
SAMPLES = {
    "bus.jpg": "https://ultralytics.com/images/bus.jpg",
    "coco_000000000139.jpg": "http://images.cocodataset.org/val2017/000000000139.jpg",
    "coco_000000001000.jpg": "http://images.cocodataset.org/val2017/000000001000.jpg",
}
IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

def sha256(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def rel(p):
    return Path(p).resolve().relative_to(ROOT.resolve()).as_posix()

RUN_STARTED = datetime.now().astimezone().isoformat(timespec="seconds")
print("설정:", dict(imgsz=IMGSZ, device=DEVICE, confs=CONFS, models=MODELS))

# ----- 다음 셀 -----

PKGS = ["ultralytics", "torch", "torchvision", "numpy", "opencv-python", "pillow", "pandas", "matplotlib"]
env = {
    "run_location": "로컬 PC (클라우드 아님)",
    "os": platform.platform(),
    "cpu": platform.processor(),
    "python": sys.version.split()[0],
    "device_used": DEVICE,
    "torch_cuda_available": torch.cuda.is_available(),
    "torch_build": torch.__version__,
    "packages": {p: version(p) for p in PKGS},
}
print(json.dumps(env, ensure_ascii=False, indent=2))

# ----- 다음 셀 -----

MODEL_DIR.mkdir(exist_ok=True)
models, model_info = {}, {}
for kind, fname in MODELS.items():
    path = MODEL_DIR / fname
    if not path.exists():
        attempt_download_asset(str(path))   # ultralytics 공식 GitHub assets에서 받음
    models[kind] = YOLO(str(path))
    model_info[kind] = {"file": rel(path), "bytes": path.stat().st_size, "sha256": sha256(path),
                        "task": models[kind].task, "n_classes": len(models[kind].names)}
print(json.dumps(model_info, ensure_ascii=False, indent=2))

# ----- 다음 셀 -----

INPUT_DIR.mkdir(exist_ok=True)
images = sorted(p for p in INPUT_DIR.iterdir() if p.suffix.lower() in IMG_EXT)
input_source = {}
if not images:
    import urllib.request
    images = []
    for name, url in SAMPLES.items():
        target = INPUT_DIR / name
        urllib.request.urlretrieve(url, target)
        images.append(target)
        input_source[name] = url
        print("inputs/ 가 비어 있어 샘플 사진을 내려받음:", url)

input_info = []
for p in images:
    im = cv2.imread(str(p))
    if im is None:
        print("읽기 실패(건너뜀):", p.name)
        continue
    h, w = im.shape[:2]
    input_info.append({"file": rel(p), "bytes": p.stat().st_size, "sha256": sha256(p),
                       "width": w, "height": h, "source_url": input_source.get(p.name)})
images = [ROOT / i["file"] for i in input_info]
pd.DataFrame(input_info)[["file", "width", "height", "bytes", "source_url"]]

# ----- 다음 셀 -----

def tag(c):
    return f"conf{int(round(c * 100)):03d}"

runs = {}       # (이미지이름, kind, conf) -> {"dets": [...], "ms": ...}
timings = []
for img in images:
    orig = cv2.imread(str(img))
    H, W = orig.shape[:2]
    for kind in MODELS:
        for conf in CONFS:
            t0 = time.perf_counter()
            r = models[kind].predict(str(img), imgsz=IMGSZ, device=DEVICE, conf=conf, verbose=False)[0]
            ms = (time.perf_counter() - t0) * 1000
            assert tuple(r.orig_shape) == (H, W), "결과 좌표 기준 크기가 원본과 다름"
            stem = f"{img.stem}__{kind}__{tag(conf)}"
            cv2.imwrite(str(OUT / "images" / f"{stem}.jpg"), r.plot())

            dets = []
            for i, b in enumerate(r.boxes):
                x1, y1, x2, y2 = b.xyxy[0].tolist()
                d = {"id": i, "class_id": int(b.cls), "class_name": r.names[int(b.cls)],
                     "score": round(float(b.conf), 4),
                     "box_xyxy": [round(v, 1) for v in (x1, y1, x2, y2)]}
                if r.masks is not None:
                    poly = r.masks.xy[i]
                    m = np.zeros((H, W), np.uint8)
                    if len(poly) >= 3:
                        cv2.fillPoly(m, [np.round(poly).astype(np.int32)], 255)
                    mfile = OUT / "masks" / f"{stem}__{i}.png"
                    cv2.imwrite(str(mfile), m)
                    d["mask_file"] = rel(mfile)
                    d["mask_area_px"] = int((m > 0).sum())
                dets.append(d)

            doc = {"image": rel(img), "image_size": {"width": W, "height": H}, "model": MODELS[kind],
                   "settings": {"imgsz": IMGSZ, "device": DEVICE, "conf": conf},
                   "n_detections": len(dets), "detections": dets}
            (OUT / "json" / f"{stem}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
            runs[(img.name, kind, conf)] = {"dets": dets, "ms": ms, "stem": stem, "size": (W, H)}
            timings.append({"image": img.name, "model": MODELS[kind], "conf": conf,
                            "detections": len(dets), "ms": round(ms, 1)})
pd.DataFrame(timings)

# ----- 다음 셀 -----

def iou(a, b):
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0

rows, dropped_rows = [], []
for img in images:
    for kind in MODELS:
        lo, hi = runs[(img.name, kind, 0.25)]["dets"], runs[(img.name, kind, 0.50)]["dets"]
        rows.append({"image": img.name, "model": MODELS[kind],
                     "n@0.25": len(lo), "n@0.50": len(hi), "0.25에만 있음": len(lo) - len(hi),
                     "classes@0.25": dict(Counter(d["class_name"] for d in lo)),
                     "classes@0.50": dict(Counter(d["class_name"] for d in hi))})
        for d in lo:
            kept = any(h["class_id"] == d["class_id"] and iou(d["box_xyxy"], h["box_xyxy"]) > 0.9 for h in hi)
            if not kept:
                dropped_rows.append({"image": img.name, "model": MODELS[kind], "class": d["class_name"],
                                     "score": d["score"], "box_xyxy": d["box_xyxy"]})
        # 점검: 0.50 결과는 점수 0.50 이상뿐이어야 하고, 0.25에서 사라진 것은 점수 0.50 미만뿐이어야 함
        assert all(h["score"] >= 0.50 for h in hi)
        assert all(x["score"] < 0.50 for x in dropped_rows if x["image"] == img.name and x["model"] == MODELS[kind])
summary = pd.DataFrame(rows)
print(summary)
print("conf를 0.50으로 올렸을 때 사라진 탐지:")
print(pd.DataFrame(dropped_rows) if dropped_rows else "없음 (두 conf 결과가 같음)")

# ----- 다음 셀 -----

for img in images:
    fig, axes = plt.subplots(2, 2, figsize=(11, 15))
    for ri, kind in enumerate(MODELS):
        for ci, conf in enumerate(CONFS):
            run = runs[(img.name, kind, conf)]
            im = cv2.cvtColor(cv2.imread(str(OUT / "images" / f"{run['stem']}.jpg")), cv2.COLOR_BGR2RGB)
            ax = axes[ri][ci]
            ax.imshow(im)
            ax.set_title(f"{MODELS[kind]}  conf={conf:.2f}  탐지 {len(run['dets'])}개")
            ax.axis("off")
    plt.tight_layout()
    cmp_path = OUT / f"comparison__{img.stem}.png"
    plt.savefig(cmp_path, dpi=110)
    plt.show()
    print("저장:", rel(cmp_path))

# ----- 다음 셀 -----

review = []
rng = np.random.default_rng(0)
for img in images:
    orig = cv2.imread(str(img))
    H, W = orig.shape[:2]
    for kind in MODELS:
        other = "seg" if kind == "det" else "det"
        for conf in CONFS:
            stem = runs[(img.name, kind, conf)]["stem"]
            doc = json.loads((OUT / "json" / f"{stem}.json").read_text(encoding="utf-8"))   # 저장된 파일에서 다시 읽음
            canvas = orig.copy()
            overlay = orig.copy()
            for d in doc["detections"]:
                x1, y1, x2, y2 = d["box_xyxy"]
                color = tuple(int(c) for c in rng.integers(60, 255, 3))
                mask_iou = None
                if "mask_file" in d:
                    m = cv2.imread(str(ROOT / d["mask_file"]), cv2.IMREAD_GRAYSCALE)
                    overlay[m > 0] = color
                    ys, xs = np.where(m > 0)
                    if len(xs):
                        mask_iou = round(iou([xs.min(), ys.min(), xs.max() + 1, ys.max() + 1], d["box_xyxy"]), 3)
                    else:
                        mask_iou = 0.0
                cv2.rectangle(canvas, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                cv2.putText(canvas, f"#{d['id']} {d['class_name']} {d['score']:.2f}", (int(x1), max(15, int(y1) - 5)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

                reasons = []
                in_range = (0 <= x1 < x2 <= W) and (0 <= y1 < y2 <= H)
                if not in_range:
                    reasons.append("박스가 원본 범위를 벗어남")
                if d["score"] < 0.50:
                    reasons.append("낮은 점수(<0.50)")
                if x1 <= 2 or y1 <= 2 or x2 >= W - 2 or y2 >= H - 2:
                    reasons.append("사진 가장자리에 닿음")
                if (x2 - x1) * (y2 - y1) < 0.005 * W * H:
                    reasons.append("작은 대상")
                if mask_iou is not None and mask_iou < 0.7:
                    reasons.append(f"마스크-박스 겹침 낮음({mask_iou})")
                peers = runs[(img.name, other, conf)]["dets"]
                if not any(p["class_id"] == d["class_id"] and iou(d["box_xyxy"], p["box_xyxy"]) >= 0.5 for p in peers):
                    reasons.append(f"{MODELS[other]} 에서 못 찾음")

                review.append({
                    "image": img.name, "model": MODELS[kind], "conf": conf, "id": d["id"],
                    "class": d["class_name"], "score": d["score"], "box_xyxy": d["box_xyxy"],
                    "원본범위_안": in_range, "mask_box_iou": mask_iou,
                    "확인필요": bool(reasons), "사유": "; ".join(reasons),
                    "수정내역": "없음 (좌표는 소수 첫째 자리 반올림만 적용)",
                    "근거파일": f"json/{stem}.json" + (f", {d['mask_file'].split('outputs/yolo/')[-1]}" if "mask_file" in d else ""),
                })
            blended = cv2.addWeighted(overlay, 0.45, canvas, 0.55, 0) if kind == "seg" else canvas
            cv2.imwrite(str(OUT / "verify" / f"{stem}__from_json.jpg"), blended)

review_df = pd.DataFrame(review)
review_df.to_csv(OUT / "review.csv", index=False, encoding="utf-8-sig")
print("검토 행:", len(review_df), "/ 확인 필요:", int(review_df["확인필요"].sum()), "/ 원본 범위 밖:", int((~review_df["원본범위_안"]).sum()))
print(review_df[review_df["conf"] == 0.25].drop(columns=["수정내역", "근거파일", "conf", "원본범위_안"]))

# ----- 다음 셀 -----

scope = []
for img in images:
    for kind in MODELS:
        for conf in CONFS:
            n = len(runs[(img.name, kind, conf)]["dets"])
            scope.append({"image": img.name, "model": MODELS[kind], "conf": conf, "탐지수": n,
                          "비고": "탐지 0개 — 대상이 없다는 뜻이 아니라 이 설정에서 못 찾았다는 뜻" if n == 0 else ""})
print(pd.DataFrame(scope))
print("처리한 사진 수:", len(images), "| 읽기 실패로 건너뛴 사진: 위 4번 칸 출력 참고")
print("두 모델이 아는 클래스 수:", {MODELS[k]: len(models[k].names) for k in MODELS})
if not dropped_rows:
    print("[주의] conf 를 0.25 -> 0.50 으로 올려도 사라진 탐지가 없음: 이 입력에서는 두 설정의 결과가 같아, "
          "'낮은 점수' 검사와 conf 비교 효과는 실제로 시험되지 않았음. 다른 사진을 inputs/ 에 넣어 확인 필요.")

# ----- 다음 셀 -----

# 이 노트북의 코드 셀을 .py 로 내보내 outputs/yolo/code/ 에 보관 (노트북 파일이 디스크에 있을 때)
nb_path = ROOT / "yolo_service.ipynb"
code_path = OUT / "code" / "yolo_service_code.py"
nbj = json.loads(nb_path.read_text(encoding="utf-8"))
chunks = ["".join(c["source"]) for c in nbj["cells"] if c["cell_type"] == "code"]
code_path.write_text("# yolo_service.ipynb 의 코드 셀을 순서대로 이어 붙인 사본 (이 폴더에서 python 으로 실행 가능)\n\n"
                     + "\n\n# ----- 다음 셀 -----\n\n".join(chunks).replace("print(", "print(") + "\n", encoding="utf-8")

outputs = sorted(p for p in OUT.rglob("*") if p.is_file() and p.name != "manifest.json")
manifest = {
    "created_at": RUN_STARTED,
    "finished_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    "run_location": env["run_location"],
    "environment": env,
    "settings": {"imgsz": IMGSZ, "device": DEVICE, "conf": list(CONFS)},
    "models": model_info,
    "inputs": input_info,
    "code": {"notebook": rel(nb_path), "code_copy": rel(code_path), "code_copy_sha256": sha256(code_path)},
    "results_summary": {"images_processed": len(images),
                        "detections": {f"{MODELS[k]}@{c}": sum(len(runs[(i.name, k, c)]['dets']) for i in images)
                                       for k in MODELS for c in CONFS},
                        "review_rows": int(len(review_df)), "review_needs_check": int(review_df["확인필요"].sum())},
    "outputs": [{"file": rel(p), "bytes": p.stat().st_size} for p in outputs],
    "limitations": "정답 라벨 없음: 정확도 미평가. COCO 80 클래스 범위. 자세한 내용은 노트북 8번 칸.",
}
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print("manifest.json 저장 | 출력 파일", len(outputs), "개")
print(json.dumps(manifest["results_summary"], ensure_ascii=False, indent=2))
