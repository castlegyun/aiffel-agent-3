# submit-assignment 스킬

수업 과제를 GitHub에 올리는 반복 작업을 Claude Code 스킬(skill)로 만든 과제입니다.

## 무엇을 하나

"과제 제출", "과제 올려줘" 같은 말을 하면 Claude가 아래를 대신 처리합니다.

1. 올릴 과제 폴더를 `NN-영어이름` 규칙에 맞게 정리 (번호는 자동으로 다음 번호)
2. `.git`, `node_modules`, `.env` 같은 올리면 안 되는 파일 제외
3. 루트 README의 과제 목록 표에 한 줄 추가
4. 올리기 전에 한 번만 확인 후 commit(커밋) & push(푸시)
5. 소스 링크와 실행 링크(GitHub Pages)를 알려줌

## 파일

| 파일 | 역할 |
|---|---|
| [SKILL.md](SKILL.md) | 스킬 본문. 모음 레포에 폴더로 추가하는 기본 절차 |
| [reference-new-repo.md](reference-new-repo.md) | 과제를 새 레포로 올려야 할 때만 읽는 보조 문서 |

## 설계할 때 신경 쓴 점

- 레포 주소, 브랜치, Pages 주소 규칙을 미리 채워 두어 설정을 묻지 않게 함
- 확인은 push 직전에 한 번만 해서 초보도 덜 피곤하게 함
- 드문 경우(새 레포)는 별도 파일로 분리해 본문을 짧게 유지
- `--force` push와 확인 없는 push 금지

## 사용 위치

실제로 동작하는 스킬 파일은 `.claude/skills/submit-assignment/`에 있습니다. 이 폴더의 파일은 제출용 사본입니다.
