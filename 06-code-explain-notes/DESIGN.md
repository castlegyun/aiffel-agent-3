# DESIGN.md — 코드 해설 노트 (GitHub 스타일)

이 사이트(보관함 `index.html`, 노트 틀 `templates/note.html`·`note-text.html`, 만들어 둔 `notes/*/index.html`)의 디자인 규칙이다. 새 값을 지어내지 말고 아래 토큰만 쓴다.

> 출처 메모: 색 값은 GitHub 화면의 색 구성(Primer)을 기억에 따라 옮긴 것이며 공식 문서로 확인하지 않았다. 다른 서비스의 로고나 이름은 쓰지 않는다. 이전에 쓰던 Brightpath 규칙은 `design-drafts/DESIGN-brightpath.md`에 보관해 두었다.

## 분위기

차분하고 촘촘하다. 얇은 테두리, 작은 모서리, 파란 링크, 그림자 없음. 장식보다 읽기가 먼저다.

## 색

CSS 변수로만 쓴다. 다크 모드는 시스템 설정을 따른다(`prefers-color-scheme`, `data-theme="light"`로 끌 수 있음).

| 변수 | 역할 | 밝은 모드 | 다크 모드 |
|---|---|---|---|
| `--canvas` | 페이지 배경 | `#ffffff` | `#0d1117` |
| `--subtle` | 헤더 줄, 접기 상자, 표 머리 | `#f6f8fa` | `#161b22` |
| `--border` | 모든 테두리와 구분선 | `#d0d7de` | `#30363d` |
| `--fg` | 본문과 제목 | `#1f2328` | `#e6edf3` |
| `--muted` | 보조 글자 | `#656d76` | `#a0a9b4` |
| `--link` | 링크, 포커스 링 | `#0969da` | `#4493f8` |
| `--tab-line` | 선택된 탭 밑줄 | `#fd8c73` | `#f78166` |
| `--blue-bg` / `--blue-fg` | `텍스트` 라벨 | `#ddf4ff` / `#0969da` | `rgba(56,139,253,.15)` / `#4493f8` |
| `--green-bg` / `--green-fg` | `코드` 라벨 | `#dafbe1` / `#1a7f37` | `rgba(46,160,67,.15)` / `#3fb950` |

## 글꼴과 크기

- 본문: 시스템 글꼴(`-apple-system, "Segoe UI", "Noto Sans KR", "Malgun Gothic", sans-serif`). 웹폰트를 받지 않는다.
- 코드와 날짜 숫자: `ui-monospace, SFMono-Regular, Consolas, monospace`.
- 크기: 제목 1.875rem(600), 노트 본문 1.0625rem(줄 높이 1.65), 보관함 목록 제목 1.0625rem(600)·요약 .9375rem·날짜와 라벨 .8125rem, 탭과 표 1rem. 큰 화면에서 작아 보이지 않도록 이 크기 밑으로 줄이지 않는다.
- 한글은 단어 단위로 줄을 바꾼다(`word-break: keep-all; overflow-wrap: break-word`).
- 한 줄 길이는 약 68자 이내(`max-width: 68ch`).

## 모양

- 모서리 6px(상자, 버튼, 표, iframe), 알약 라벨은 완전히 둥글게(`2em`).
- 테두리 1px `--border`. 그림자는 쓰지 않는다.
- 보관함은 한 상자 안에 탭 줄(`--subtle`)과 노트 목록을 넣는다. 노트 한 줄은 제목 + 라벨 + 요약 + 날짜다.

## 구성 요소

- **탭:** 밑줄형. 선택된 탭은 글자를 굵게 하고 `--tab-line` 밑줄 2px을 긋는다. 개수는 회색 알약 안에 쓴다.
- **라벨:** `텍스트`는 파랑, `코드`는 초록. 1px 투명 테두리, 12px, 알약형.
- **표:** 머리 줄 `--subtle` 배경과 굵은 글자, 칸마다 1px `--border`.
- **버튼(그림 고르기 등):** `--subtle` 배경, 1px `--border`, 6px 모서리. 눌린 상태는 `--link` 테두리와 글자.
- **접기 상자(새 용어):** `--subtle` 배경, 1px `--border`, 6px 모서리.
- **포커스:** 키보드 포커스는 2px `--link` 윤곽선, 간격 2px.

## 움직임

호버와 눌림 같은 사용자 동작에 대한 반응만 둔다. `prefers-reduced-motion`이면 전환을 끈다.

## 적용 범위

적용: `index.html`, `templates/note.html`, `templates/note-text.html`, `notes/*/index.html`의 `<style>`.
적용하지 않음: 노트 안에서 iframe으로 불러오는 `summary.html`, `diagram.html`, `eli5.html`과 `templates/simulator.html`(각자 스타일 유지).
