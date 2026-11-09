# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Source: https://github.com/multica-ai/andrej-karpathy-skills (MIT, derived from Andrej Karpathy's observations).

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

<!--
  아래 5~7번은 kanginXD의 AGENTS.md(0BSD)에서 필요한 부분만 골라 원문 그대로 가져온 것.
  출처: https://gist.github.com/kanginXD/c6dfa2a0cda3d25fb9131fd6a0a4f342
  일부러 뺀 것: "문서·커밋은 영어로만" 규칙(이 레포는 한국어로 씀), 패키지 추가 때마다 승인받는 절차(과제에 너무 무거움).
-->

## 5. Evidence

<!-- 근거 확인: AI가 그럴듯하게 지어내는 걸 막는 규칙. 바깥 정보는 공식 문서로 확인하고, 확인 못 한 건 "미확인"이라고 밝히게 한다. -->

- External facts (APIs, versions, licenses, security) need a checked primary source; repo facts need the code itself. Mark the rest unverified or inferred.
- If a source is unreachable, say so and mark claims that depend on it unverified.
- Never invent URLs, domains, package names, or schemas, even as placeholders; omit them without a source.
- Check APIs, signatures, CLI flags, and config keys against the docs for the version in use.

## 6. Verification

<!-- 검증: 테스트를 느슨하게 고쳐서 통과시키거나, 실행 안 한 걸 "됐다"고 말하는 걸 막는다. 끝나면 바꾼 것 / 확인한 것 / 확인 못 한 것을 나눠서 보고하게 한다. -->

- Never weaken tests or remove assertions to make them pass.
- Never claim something ran or passed unless it did.
- Report what changed, what was verified, and what remains untested or failing, separate from suggestions.

## 7. Security

<!-- 보안: 비밀번호·API 키를 코드에 직접 쓰지 않게 하고, 이름만 비슷한 가짜 패키지를 설치하지 않도록 공식 저장소에서 이름을 확인하게 한다. -->

- No secrets or hardcoded sensitive values anywhere, tests and examples included; use env vars, secret stores, untracked config, or fakes.
- Confirm the exact name and publisher on the official registry to rule out typosquatting.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
