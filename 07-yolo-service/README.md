# 07 · YOLO26 로컬 서비스 (노트북)

사진을 넣으면 `yolo26n.pt`(박스·클래스·점수)와 `yolo26n-seg.pt`(박스·클래스·점수 + 마스크)로 추론하고,
`conf=0.25` 와 `conf=0.50` 결과를 나란히 비교해 저장하는 Jupyter 노트북입니다. 웹 화면은 없습니다.

- 노트북: [`yolo_service.ipynb`](yolo_service.ipynb) (실행한 결과가 셀 안에 그대로 들어 있음)
- 결과 폴더: [`outputs/yolo/`](outputs/yolo/)
- 실행 기록: [`outputs/yolo/manifest.json`](outputs/yolo/manifest.json)
- 검토 기록: [`outputs/yolo/review.csv`](outputs/yolo/review.csv)

## 실행 위치와 환경

로컬 PC(클라우드 아님), Windows 10, CPU(`device=cpu`), Python 3.14, ultralytics 8.4.208, torch 2.10.0+cpu.
전체 버전은 `manifest.json` 의 `environment` 에 있습니다.

## 실행 방법

```powershell
python -m venv --system-site-packages .venv
.\.venv\Scripts\python.exe -m pip install ultralytics ipykernel pandas matplotlib
.\.venv\Scripts\python.exe -m ipykernel install --prefix .venv --name python3
.\.venv\Scripts\python.exe -m nbconvert --to notebook --execute --inplace yolo_service.ipynb
```

- `--system-site-packages` 는 PC에 이미 있는 torch·numpy·opencv 를 다시 받지 않으려는 선택입니다. (이 PC의 torch 는 CPU 빌드)
- `python -m jupyter` 가 아니라 `python -m nbconvert` 로 실행해야 가상환경 커널을 찾습니다.
- `inputs/` 가 비어 있으면 공개 샘플 3장(`bus.jpg`, COCO val2017 이미지 2장)을 노트북이 내려받습니다. 내 사진을 쓰려면 `inputs/` 에 넣고 실행하세요.
- 모델(`models/`)은 없으면 ultralytics 공식 GitHub assets 에서 받습니다. 용량 때문에 이 레포에는 올리지 않았습니다.

## 결과 요약 (샘플 3장)

| 모델 | conf 0.25 탐지 수 | conf 0.50 탐지 수 |
|---|---|---|
| yolo26n | 31 | 22 |
| yolo26n-seg | 33 | 21 |

- 0.50 에서 사라진 탐지는 모두 점수 0.50 미만이었습니다(코드로 검사).
- 사라진 것 중 눈으로 보기에 맞은 것(꽃병 0.44, 라켓 0.40·0.42)도 있었고, 점수가 높아도 의심스러운 것(tv 0.69)이 남기도 했습니다. 자세한 대조는 노트북 7번 칸.

## 한계 (정직하게)

- 정답 라벨이 없어 **정확도는 평가하지 않았습니다.** 맞고 틀림은 사람이 눈으로만 판단했습니다.
- 모델은 COCO 80개 클래스만 압니다.
- 마스크 윤곽이 손·발 같은 가는 부분까지 맞는지는 확인하지 못했습니다.
- 사진이 3장뿐이라 모델 간 우열이나 일반적인 conf 효과를 말할 수 없습니다.
- COCO 이미지의 개별 라이선스는 확인하지 않았습니다. 그래서 입력 사진 파일은 레포에 올리지 않았지만, `outputs/yolo/images`·`verify` 의 결과 이미지에는 그 사진 위에 그린 결과가 들어 있습니다.
- `outputs/yolo/code/yolo_service_code.py`(노트북 코드 사본)를 별도 폴더에서 실행해 결과 파일이 같은지 개발 중 1회 확인했습니다. 노트북이 스스로 검사하는 것은 아닙니다.
