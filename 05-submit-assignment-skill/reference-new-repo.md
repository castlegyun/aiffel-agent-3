# 새 레포로 올리기

모음 레포 대신 과제 하나를 독립 레포로 올릴 때만 쓴다.

1. **레포 이름**: `aiffel-NN-이름` 형식을 제안하고 확인받는다. 번호는 GitHub에 이미 있는 과제 레포를 보고 정한다.
2. **`.gitignore`**: `node_modules`, `.venv`, `__pycache__`, `.env`, `.env.*`(`!.env.example` 제외)를 넣는다.
3. **GitHub CLI(깃허브 씨엘아이) 확인**: `gh --version`, `gh auth status`.
4. **준비됐으면** 과제 폴더에서:
   ```
   git init            # 이미 있으면 생략
   git add .
   git commit -m "NN-이름 과제 제출"
   gh repo create <레포이름> --public --source=. --push
   ```
5. **없으면**: 사용자에게 github.com에서 같은 이름의 빈 레포를 만들어 달라고 안내한 뒤
   ```
   git remote add origin https://github.com/castlegyun/<레포이름>.git
   git push -u origin <브랜치>
   ```
6. 강사님이 봐야 하므로 공개(public)로 만든다. 비공개를 원하면 강사님을 협력자로 초대해야 한다고 알린다.
7. **링크**: `https://github.com/castlegyun/<레포이름>`

push 전 확인과 `--force` 금지 규칙은 SKILL.md와 같다.
