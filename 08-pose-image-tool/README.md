# 원하는 포즈로 이미지 만드는 도구

> 상태: Colab(T4)에서 생성과 실험 A·B를 직접 돌려 관찰을 적었고, 결과 이미지를 `samples/`에 넣었습니다.

## 도구 설명
- 참조 사진에서 OpenPose로 사람 관절(뼈대) 이미지를 뽑고, 그 뼈대와 프롬프트를 Stable Diffusion 1.5 + OpenPose ControlNet에 넣어 같은 자세의 다른 인물·장면을 만듭니다.
- 모델: `stable-diffusion-v1-5/stable-diffusion-v1-5`, `lllyasviel/sd-controlnet-openpose`, 포즈 추출은 `controlnet_aux`의 `OpenposeDetector`.

## 왜 FLUX.2-klein 4B를 쓰지 않았나
- 과제 예시는 FLUX.2-klein 4B에 포즈 조건을 얹는 방향이지만, 이 모델용 공식 ControlNet은 확인하지 못했습니다.
- 그래서 뼈대 이미지를 모델의 참조 이미지 입력(`image=`)에 넣는 방식으로 시도했습니다. 512×512로 낮추면 생성 단계(4스텝, 약 1분)까지는 돌았지만, 무료 Colab(RAM 12.7GB)에서 결과 이미지가 나오기 전에 "RAM을 모두 사용해 세션이 다운"되었습니다. 생성 중 RAM 사용량은 10.0GB까지 올라가는 것을 확인했습니다. 원인은 모델 파일이 약 16GB라 RAM에 다 올리기 어려운 것으로 추정하며, 확인하지는 못했습니다.
- 과제가 "FLUX.2-klein 4B 또는 비슷한 모델"을 허용하므로, 포즈 조건용으로 나온 ControlNet이 있는 Stable Diffusion 1.5로 바꿨습니다.

## 샘플
| 파일 | 내용 |
|---|---|
| `samples/ref_01.png` | 포즈 1의 참조 사진 |
| `samples/pose_01.png` → `samples/output_01.png` | 포즈 1과 결과 (프롬프트 1) |
| `samples/pose_01.png` → `samples/output_01b.png` | 같은 포즈, 프롬프트만 변경 (실험 A) |
| `samples/pose_02.png` → `samples/output_02.png` | 다른 포즈, 프롬프트 1 (실험 B) |

## 사용법
1. GitHub의 `pose_tool.ipynb`를 Colab에서 엽니다.
2. 런타임을 GPU(T4)로 바꾸고 셀을 위에서부터 순서대로 실행합니다 (설치 → 모델 로드 → 사진 올리기 → 포즈 추출 → 생성 → 저장).
3. `samples/`에서 포즈 이미지와 결과를 확인합니다.

## 테스트 결과
- 포즈 1: 한 팔을 오른쪽 위로 뻗고 다리를 넓게 벌린 자세 → 프롬프트: `a worker in a yellow helmet standing in a factory` → 결과: 다리를 벌린 자세와 오른쪽 위로 뻗은 팔은 따라왔고, 반대쪽 팔은 참조(가슴 앞으로 꺾임)와 달리 옆으로 뻗어 어긋났습니다. (Colab T4, 20스텝, 약 5초, seed 0)
- 실험 A (같은 포즈, 프롬프트만 바꿈): `a young woman in a red dress standing in a park` → 사람·옷·배경은 완전히 바뀌었고, 다리를 벌린 자세와 팔 모양은 포즈 1과 비슷하게 따라왔습니다.
- 실험 B (같은 프롬프트, 다른 포즈): 모델 카드 예시 사진(팔을 굽혀 손을 모으고 고개를 돌린 서 있는 자세)의 뼈대 → 상체 구도에서 팔 모양, 몸을 세운 것, 고개 방향은 따라왔고, 뼈대에서 잘린 다리는 나오지 않았습니다.
- 조건 이미지를 뼈대로 바꾸지 않고 사진을 그대로 넣으면 자세와 상관없는 이미지가 나왔습니다.
- 시드는 0 하나만 써 봤습니다. 다른 시드에서도 같은지는 확인하지 못했습니다.

## 한계
- 모델 카드 예시를 따라 안전 검사기를 껐습니다(`safety_checker=None`). 사용 시 모델 라이선스(CreativeML OpenRAIL-M)를 지켜야 합니다.
- 포즈 1에서 한쪽 팔이 참조와 다르게 뻗었고, 손가락이 뭉개지고 얼굴이 일그러진 결과가 있었습니다.
- 사진에서 몸 일부가 잘리면 뼈대에서도 잘려 결과에 그 부분이 나오지 않았습니다.

## 출처
- 포즈 2에 쓴 사진: 위 모델 카드의 예시 사진(`images/pose.png`). 이용 허락을 받은 사진을 썼습니다.
- ControlNet 사용법: [lllyasviel/sd-controlnet-openpose](https://huggingface.co/lllyasviel/sd-controlnet-openpose) 모델 카드
