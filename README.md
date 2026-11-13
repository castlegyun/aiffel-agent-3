# aiffel-agent-3

모두의연구소 AIFFEL AI 에이전트 3기에서 만든 과제 모음입니다.
과제마다 폴더가 하나씩 있고, 폴더 안 `README.md`(또는 `index.html`)에서 내용을 볼 수 있습니다.

## 과제 목록

| # | 과제 | 설명 | 기술 | 바로가기 |
|---|---|---|---|---|
| 01 | [assignment-domain](01-assignment-domain) | 내 도메인(AI 서비스 개발)의 업무 분해 예시 | Markdown | [README](01-assignment-domain/README.md) |
| 02 | [card-match-quest](02-card-match-quest) | 카드 짝 맞추기 게임 | HTML | [▶ 게임 하기](https://castlegyun.github.io/aiffel-agent-3/02-card-match-quest/) |
| 03 | [my-game](03-my-game) | 나만의 뱀서류 게임 | JavaScript | [▶ 게임 하기](https://castlegyun.github.io/aiffel-agent-3/03-my-game/) |
| 04 | [todo-supabase](04-todo-supabase) | 로그인한 사용자가 자기 할 일만 관리하는 Todo 앱 | Flask, Supabase(Auth+RLS), Render | [배포](https://todo-app-iw2l.onrender.com) |
| 05 | [submit-assignment-skill](05-submit-assignment-skill) | 과제를 GitHub에 올리는 반복 작업을 자동화한 Claude Code 스킬 | Claude Code Skill, Markdown | [README](05-submit-assignment-skill/README.md) |
| 06 | [code-explain-notes](06-code-explain-notes) | 코드를 초보자용 해설 노트(쉬운 주석·단어장)로 만들어 모아 보는 도구 | HTML, Claude Code Skill | [▶ 보관함 열기](https://aiffel-agent-3.onrender.com/) (Render) |
| 07 | [yolo-service](07-yolo-service) | 사진을 넣으면 YOLO26 탐지·분할 결과를 저장하고 conf 0.25/0.50을 비교하는 노트북 | Python, Ultralytics YOLO26, Jupyter | [README](07-yolo-service/README.md) |
| 08 | [pose-image-tool](08-pose-image-tool) | 참조 사진의 포즈(OpenPose)를 조건으로 같은 자세의 이미지를 만드는 Colab 튜토리얼 노트 | Python, FLUX.2-klein 4B, Jupyter | [README](08-pose-image-tool/README.md) |
| 09 | [playground-3d-viewer](09-playground-3d-viewer) | 폰으로 찍은 8초 영상에서 놀이터를 3차원 알갱이(가우시안 스플랫) 장면으로 만들어 브라우저에서 돌려 보는 뷰어 | HTML, three.js, Spark, MapAnything, Colab | [▶ 뷰어 열기](https://castlegyun.github.io/aiffel-agent-3/09-playground-3d-viewer/) |

> ▶ 표시는 브라우저에서 바로 열리는 사이트입니다. 02, 03, 09는 GitHub Pages(`https://castlegyun.github.io/aiffel-agent-3/폴더이름/`), 06은 Render입니다.

> 새 과제 추가: `05-이름/` 폴더를 만들고 위 표에 한 줄을 추가합니다.

## 폴더 규칙

- 폴더명은 `번호-영어소문자-하이픈` (예: `05-chatbot`)
- 과제마다 설명(README 등)을 둡니다
- 비밀키는 `.env`에만 두고 올리지 않습니다 (`.env.example`로 양식만 공유)
