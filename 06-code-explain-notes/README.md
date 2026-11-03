# 06 코드 해설 노트

코드나 배운 글(텍스트)을 넣으면 Claude Code가 초보자용 해설 노트(쉬운 주석·풀어쓰기·단어장·그림)를 HTML로 만들고, 웹사이트(Render 정적 사이트)에서 모아 보는 개인 공부 도구.

- 보관함 (Render 정적 사이트): https://aiffel-agent-3.onrender.com/
  - 레포에 푸시하면 Render가 자동으로 다시 배포한다. GitHub Pages는 쓰지 않는다.
- 기획서: [PRD.md](PRD.md) · 설명 규칙: [CLAUDE.md](CLAUDE.md) · 회고: [retrospective.md](retrospective.md)

## 쓰는 법

Claude Code 입력창에서 입력한다. (PowerShell에서는 안 된다.) 종류를 직접 고른다.

```
/explain-code 코드 파일경로     코드 파일을 해설
/explain-code 코드              채팅에 붙여 넣은 코드를 해설
/explain-code 텍스트 파일경로   글 파일을 해설
/explain-code 텍스트            채팅에 붙여 넣은 글을 해설
```

노트는 `notes/<날짜-주제>/` 에 만들어지고 `notes/index.json` 에 등록된다. 커밋·푸시하면 보관함에 나타난다.

## 다른 사람이 쓰려면

Claude Code 사용자가 이 레포를 받아 쓰는 순서다. 다른 컴퓨터에서 처음부터 따라 해 보지는 못했다 (문서와 내 설치 기록을 근거로 정리함).

1. 레포를 받는다: `git clone https://github.com/castlegyun/aiffel-agent-3.git`
2. 그림 3종(종합 정리, 그림 하나, 아주 쉽게)에 쓰는 플러그인 3개를 설치한다. Claude Code 2.1.292 이상이 필요하고, 종합 정리에는 Node.js 20 이상도 필요하다.
   ```
   claude plugin install answer-me-with-html --marketplace QingYunA/answer-me-with-html
   claude plugin install diagram-design --marketplace cathrynlavery/diagram-design
   claude plugin install eli5 --marketplace anthropics/claude-plugins-community
   ```
3. 받은 레포의 **맨 위 폴더(`aiffel-agent-3`)** 에서 `claude`를 실행한다. 폴더를 신뢰하겠느냐고 물으면 허용한다.
4. `/explain-code 텍스트 궁금한내용` 또는 `/explain-code 코드 궁금한코드`를 입력한다.
6. 노트는 `06-code-explain-notes/notes/` 에 생긴다. 보려면 그 폴더에서 `python -m http.server` 를 실행하고 `http://localhost:8000` 으로 연다.

**한계:** 다른 사람은 이 레포에 올릴 권한이 없어서, 위 배포 사이트에 자기 노트를 추가할 수 없다. 자기 노트는 자기 컴퓨터에서만 보인다. 남에게 보이려면 레포를 fork해서 자기 Render에 따로 배포해야 한다.

## 노트 하나의 구성

| 파일 | 내용 |
|---|---|
| `index.html` | 코드 노트: 흐름 / 자세히 / 단어장 / 그림 탭. 텍스트 노트: 요약 / 풀어쓰기 / 단어장 / 그림 탭 |
| `summary.html` | [종합 정리] answer-me-with-html로 만든 한 장 정리 (Blueprint · Cards · Paper 테마 선택) |
| `diagram.html` | [그림 하나] 내용에 맞는 그림. 한 줄씩 실행되는 코드는 단계별 시뮬레이터, 그 밖은 diagram-design |
| `eli5.html` | [아주 쉽게] 큰 그림과 적은 글 |

그림이 필요 없다고 판단하면 [아주 쉽게]만 만든다.

## 폴더

```
06-code-explain-notes/
├─ CLAUDE.md, PRD.md, README.md, retrospective.md
├─ index.html              노트 보관함 (notes/index.json을 읽어 목록 표시)
├─ templates/              note.html(코드) · note-text.html(텍스트) · simulator.html
├─ samples/                시험에 쓴 입력 (for-loop.py, list-loop.py, text-*.txt)
├─ notes/                  만들어진 노트들 + index.json
└─ .claude/skills/explain-code/SKILL.md   스킬 사본 (원본은 레포 루트 .claude/skills/)
```

## 알려진 한계

- 웹사이트는 보기 전용이다. 새 노트는 Claude Code에서만 만들 수 있다 (API 키가 필요 없는 대신).
- 보관함 목록은 `fetch`로 JSON을 읽어서, 파일을 더블클릭해 열면(`file://`) 브라우저가 막는다. 배포된 주소나 로컬 서버(`python -m http.server`)로 열어야 한다.
- 밝은 모드와 모바일 폭은 눈으로 확인하지 못했다.
