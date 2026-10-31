// 도트 스프라이트. 문자열 도안을 offscreen canvas로 한 번만 구워 두고 재사용한다.
// (이미지 파일 없이 코드만으로 도트 그래픽을 만든다)

const PALETTE = {
  o: '#120c0a', // 외곽선
  h: '#3b3f55', // 모자
  H: '#5d6384', // 모자 하이라이트
  b: '#9a6a30', // 모자 띠
  f: '#d9a77a', // 얼굴
  e: '#1a1210', // 눈
  w: '#e8e2d4', // 수염
  W: '#b2aa98', // 수염 그림자
  r: '#6c707c', // 로브
  R: '#474a56', // 로브 그림자
  s: '#7a4e2a', // 지팡이
  S: '#4d2f18', // 지팡이 그림자
  k: '#d8d0b8', // 뼈
  K: '#9a927c', // 뼈 그림자
  c: '#4a2a2a', // 해골 낡은 천
  y: '#ff7a1a', // 눈 불빛
  p: '#7a3a8a', // 임프
  P: '#b45ad0', // 임프 하이라이트
  a: '#5a5f6a', // 갑옷
  A: '#8a909c', // 갑옷 하이라이트
  d: '#34373f', // 어두운 갑옷
  u: '#3d2a5a', // 두건
  U: '#5e4590', // 두건 하이라이트
  q: '#6a2a1a', // 사냥개 털
  Q: '#9a4a2a', // 사냥개 털 하이라이트
  z: '#e8e2d4', // 이빨
  D: '#4a1414', // 보스 어두운 몸
  E: '#7a2218', // 보스 몸
  F: '#a83a22', // 보스 하이라이트
  j: '#d8d0b8', // 뿔
  L: '#d83a2a', // 포션 액체 / 자석 몸
  l: '#ff8a70', // 포션 하이라이트
  g: '#b8d8e0', // 유리
  n: '#dfe4ee', // 자석 끝(은색)
  N: '#9aa2b4', // 자석 끝 그림자
};

// 보스 2페이즈: 불타오르는 색
const BOSS_RAGE_PALETTE = Object.assign({}, PALETTE, { D: '#6a1a0a', E: '#c4421a', F: '#ff7a1a', y: '#fff4c8' });

// 마법사 16x20, 정면. 걷기 프레임은 다리 두 줄만 다르다.
const WIZARD_BODY = [
  '.......oo.......',
  '......ohho......',
  '......ohHo......',
  '.....ohhhho.....',
  '.....ohhHho.....',
  '....ohhhhhho....',
  '....obbbbbbo....',
  '..oohhhhhhhhoo..',
  '...oooooooooo...',
  '....offffffo....',
  '....ofeffefo....',
  '...owwwwwwwwo...',
  '...owwwwwwwwo...',
  '..orrwwwwwwrro..',
  '..orrrWwwWrrro..',
  '..orrrrWWrrrro..',
  '..orRrrrrrrRro..',
  '..oRRrrrrrrRRo..',
];
const WIZARD_LEGS = [
  ['...ooRRoooRRoo..', '....oooo.oooo...'],
  ['...oooRRooRRooo.', '....ooo..ooo....'],
];
// 지팡이: 오른손 쪽 세로줄 (x=14)
const STAFF = { x: 14, top: 5, bottom: 19 };

function bakeSprite(rows, pal = PALETTE) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d');
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      g.fillStyle = pal[ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function bakeWizardFrame(legIndex) {
  const rows = WIZARD_BODY.concat(WIZARD_LEGS[legIndex]);
  const c = bakeSprite(rows);
  const g = c.getContext('2d');
  // 지팡이 몸통(외곽선 + 나무)
  for (let y = STAFF.top; y <= STAFF.bottom; y++) {
    g.fillStyle = PALETTE.o;
    g.fillRect(STAFF.x - 1, y, 1, 1);
    g.fillRect(STAFF.x + 1, y, 1, 1);
    g.fillStyle = y % 3 === 0 ? PALETTE.S : PALETTE.s;
    g.fillRect(STAFF.x, y, 1, 1);
  }
  // 지팡이 끝 보석: 외곽선 + 주황색 불꽃
  g.fillStyle = PALETTE.o;
  g.fillRect(STAFF.x - 1, STAFF.top - 3, 3, 3);
  g.fillStyle = '#ffb43a';
  g.fillRect(STAFF.x, STAFF.top - 2, 1, 1);
  return c;
}

// ---- 적 도안: 몸통은 공통, 다리/꼬리 두 줄만 프레임별로 다르다 ----
const SKELETON_BODY = [
  '...oooooo...',
  '..okkkkkko..',
  '..okykkyko..',
  '..okkkkkko..',
  '...okkkko...',
  '..occkkcco..',
  '..ockKkKco..',
  '..occkkcco..',
  '...oocccoo..',
];
const SKELETON_LEGS = [
  ['...okKokKo..', '...ooo.ooo..'],
  ['..okKo.okKo.', '..ooo..ooo..'],
];

const IMP_BODY = [
  '..oooooo..',
  '.oppppppo.',
  '.opyppypo.',
  '.oppPPppo.',
  '.oppppppo.',
  '..opppppo.',
];
const IMP_LEGS = [
  ['..oppoppo.', '...o..o...'],
  ['.oppoppoo.', '..o..o....'],
];

const BRUTE_BODY = [
  '....oooooooo....',
  '...oaaAAAAaao...',
  '...odyddddydo...',
  '...oaddddddao...',
  '....oaaaaaao....',
  '..ooaAaaaaAaoo..',
  '.oaaaaAaaAaaaao.',
  '.oaaaaaddaaaaao.',
  '.oaAaaaddaaaAao.',
  '.ooaaaaddaaaaoo.',
  '..oooaaddaaaooo.',
  '....oaaddaao....',
];
const BRUTE_LEGS = [
  ['...oddo..oddo...', '...oooo..oooo...'],
  ['....oddooddo....', '....oooooooo....'],
];

// 도트가 있는 자리만 하얗게 칠한 실루엣. 맞았을 때 원본 위에 덧그려 번쩍이게 한다.
const whiteCache = new Map();
function whiteOf(frame) {
  let w = whiteCache.get(frame);
  if (!w) {
    w = document.createElement('canvas');
    w.width = frame.width;
    w.height = frame.height;
    const g = w.getContext('2d');
    g.drawImage(frame, 0, 0);
    g.globalCompositeOperation = 'source-in'; // 기존 도트가 있는 곳만 남기고
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w.width, w.height);        // 그 위를 흰색으로
    whiteCache.set(frame, w);
  }
  return w;
}

function bakeEnemy(body, legs, pal) {
  const frames = legs.map((l) => bakeSprite(body.concat(l), pal));
  return { frames, w: frames[0].width, h: frames[0].height };
}

// 좌우 대칭 도안은 왼쪽 절반만 적고 거울로 복사한다
const mirror = (rows) => rows.map((r) => r + [...r].reverse().join(''));

// 원거리형: 두건 쓴 광신도 (12x14)
const MAGE_BODY = mirror([
  '....oo', '...ouu', '..ouUU', '..ouye', '..ouee', '...oue',
  '..ouuu', '.ouUuu', '.ouuuu', '.ouuuu', 'ouuUuu', 'ouuuuu',
]);
const MAGE_LEGS = [mirror(['..ouuo', '..oooo']), mirror(['.ouuo.', '.oooo.'])];

// 돌진형: 지옥 사냥개 (14x12)
const HOUND_BODY = mirror([
  '.oq....', '.oqooo.', '..oqqqq', '..oqyqq', '..oqqqq', '...ozqo',
  '.ooqqQq', 'oqqQqqq', 'oqqqqqq', 'oqqqqqq',
]);
const HOUND_LEGS = [mirror(['oqo.oqo', 'ooo.ooo']), mirror(['.oqo.oq', '.ooo.oo'])];

// 보스: 뿔 달린 거대한 악마 (20x22)
const BOSS_BODY = mirror([
  '..oj......', '..ojo.....', '...ojoooo.', '...ojEEEEE', '....oEFEEE',
  '...oEEEEEE', '...oEEyyEE', '...oEEEEEE', '....oEzzzz', '....ooEEEE',
  '..ooDDDEEE', '.oDDDDEEFE', 'oDDDDEEFFE', 'oDDDEEEFFE', 'oDDDEEEEEE',
  'oDDDEEEEFE', '.oDDDEEEEE', '.oDDDDEEEE', '..oDDDDEEE', '..oDDDDDEE',
]);
const BOSS_LEGS = [mirror(['..oDDDo...', '..oooooo..']), mirror(['.oDDDo....', '.oooooo...'])];

// 아이템 도안
const POTION_ROWS = [
  '...oooo...', '...obbo...', '...oggo...', '...oggo...', '..oggggo..', '.ogLLLLgo.',
  '.oLLlLLLo.', '.oLlLLLLo.', '.oLLLLLLo.', '.oLLLLLLo.', '..oLLLLo..', '...oooo...',
];
const MAGNET_ROWS = [
  '.ooo......ooo.', '.onNo....oNno.', '.onNo....oNno.', '.oLLo....oLLo.', '.oLLo....oLLo.', '.oLLo....oLLo.',
  '.oLLoo..ooLLo.', '.oLLLLooLLLLo.', '..oLLLLLLLLo..', '...ooLLLLoo...', '.....oooo.....',
];
const bakeItem = (rows) => { const c = bakeSprite(rows); return { frames: [c], w: c.width, h: c.height }; };

const Sprites = {
  wizard: [bakeWizardFrame(0), bakeWizardFrame(1)],
  wizardSize: { w: 16, h: 20 },
  skeleton: bakeEnemy(SKELETON_BODY, SKELETON_LEGS),
  imp: bakeEnemy(IMP_BODY, IMP_LEGS),
  brute: bakeEnemy(BRUTE_BODY, BRUTE_LEGS),
  mage: bakeEnemy(MAGE_BODY, MAGE_LEGS),
  hound: bakeEnemy(HOUND_BODY, HOUND_LEGS),
  boss: bakeEnemy(BOSS_BODY, BOSS_LEGS),
  boss2: bakeEnemy(BOSS_BODY, BOSS_LEGS, BOSS_RAGE_PALETTE),
  potion: bakeItem(POTION_ROWS),
  magnet: bakeItem(MAGNET_ROWS),
};
