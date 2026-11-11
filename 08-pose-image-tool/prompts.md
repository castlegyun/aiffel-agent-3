# 테스트에 쓴 프롬프트

실제로 돌린 것만 적습니다. 모델은 Stable Diffusion 1.5 + OpenPose ControlNet, 20스텝, 시드 0입니다.

| 번호 | 포즈 | 프롬프트 | 결과 파일 | 관찰 |
|---|---|---|---|---|
| 1 | pose_01 | a worker in a yellow helmet standing in a factory | output_01.png | 다리를 벌린 자세와 한쪽 팔은 맞음. 반대쪽 팔은 어긋나고 얼굴이 일그러짐 |
| 2 (실험 A) | pose_01 | a young woman in a red dress standing in a park | output_01b.png | 사람·옷·배경이 완전히 바뀜. 자세는 1번과 비슷하게 유지 |
| 3 (실험 B) | pose_02 | a worker in a yellow helmet standing in a factory | output_02.png | 상체 구도. 팔을 굽혀 손을 모은 자세와 고개 방향은 맞음. 다리는 나오지 않음 |
