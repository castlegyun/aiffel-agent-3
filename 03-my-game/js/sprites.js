// 도트 그림. 글자 도안을 작은 캔버스로 굽고, 한 장의 큰 캔버스(아틀라스)에 모아 둔다.
// 굽는 과정에서 자동으로 만든다: 1픽셀 외곽선, 좌우 반전본, 맞았을 때 쓰는 흰 실루엣, 바닥 그림자.
// (이미지 파일 없이 코드만으로 도트 그래픽을 만든다)

const OUTLINE = '#120c0a';

// ---- 아틀라스: 모든 그림 조각을 한 장에 차곡차곡 놓는다 (한 장에서 꺼내 그리면 빠르다) ----
const SpriteAtlas = {
  c: null,
  g: null,
  x: 1,
  y: 1,
  rowH: 0,

  // 캔버스 한 장을 아틀라스에 옮겨 놓고, 그 자리를 가리키는 조각 정보를 돌려준다
  add(src) {
    if (!this.c) {
      this.c = document.createElement('canvas');
      this.c.width = 1024;
      this.c.height = 1024;
      this.g = this.c.getContext('2d');
    }
    if (this.x + src.width + 1 > this.c.width) {
      this.x = 1;
      this.y += this.rowH + 1;
      this.rowH = 0;
    }
    if (this.y + src.height + 1 > this.c.height) throw new Error('아틀라스가 가득 찼다');
    this.g.drawImage(src, this.x, this.y);
    const f = { c: this.c, x: this.x, y: this.y, w: src.width, h: src.height };
    this.x += src.width + 1;
    this.rowH = Math.max(this.rowH, src.height);
    return f;
  },
};

function blankCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 글자 도안 → 캔버스. 줄 길이가 다르거나 팔레트에 없는 글자가 있으면 바로 알려준다.
function mapCanvas(name, rows, pal) {
  const c = blankCanvas(rows[0].length, rows.length);
  const g = c.getContext('2d');
  for (let y = 0; y < rows.length; y++) {
    if (rows[y].length !== rows[0].length) throw new Error(`${name}: ${y}번째 줄 길이가 다르다 (${rows[y].length} / ${rows[0].length})`);
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      if (!pal[ch]) throw new Error(`${name}: 팔레트에 없는 글자 '${ch}' (${y}번째 줄)`);
      g.fillStyle = pal[ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// 도트가 있는 자리만 한 가지 색으로 칠한 실루엣
function tintOf(src, color) {
  const c = blankCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in'; // 기존 도트가 있는 곳만 남기고 색을 덮는다
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// 둘레에 1픽셀 외곽선을 두른다 (사방으로 한 칸씩 민 실루엣 위에 원본을 얹는다). diag: 대각선 방향도 채울지
function outlined(src, color, diag) {
  const c = blankCanvas(src.width + 2, src.height + 2);
  const g = c.getContext('2d');
  const sil = tintOf(src, color);
  g.drawImage(sil, 0, 1);
  g.drawImage(sil, 2, 1);
  g.drawImage(sil, 1, 0);
  g.drawImage(sil, 1, 2);
  if (diag) {
    g.drawImage(sil, 0, 0);
    g.drawImage(sil, 2, 0);
    g.drawImage(sil, 0, 2);
    g.drawImage(sil, 2, 2);
  }
  g.drawImage(src, 1, 1);
  return c;
}

function flippedOf(src) {
  const c = blankCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

function scaledOf(src, k) {
  const c = blankCanvas(src.width * k, src.height * k);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// 발밑에 까는 납작한 타원 그림자
function shadowCanvas(w) {
  const h = Math.max(2, Math.round(w * 0.3));
  const c = blankCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0, 0, 0, 0.42)';
  for (let y = 0; y < h; y++) {
    const t = ((y + 0.5) / h) * 2 - 1;
    const half = Math.max(1, Math.round((w / 2) * Math.sqrt(1 - t * t)));
    g.fillRect(Math.round(w / 2) - half, y, half * 2, 1);
  }
  return c;
}

// 프레임 캔버스들을 아틀라스에 올려 스프라이트 하나로 묶는다.
// frames 오른쪽 보기 / flip 왼쪽 보기 / white·whiteFlip 맞았을 때 / shadow 그림자
// order: 같은 그림을 여러 프레임에 다시 쓸 때의 순서 (예: [0, 1, 0, 2])
// cx: 오른쪽을 볼 때 몸의 중심이 그림의 몇 번째 칸인지 (지팡이처럼 한쪽으로 튀어나온 그림용)
function makeSprite(canvases, order, cx) {
  const sets = { frames: [], flip: [], white: [], whiteFlip: [] };
  for (const c of canvases) {
    const f = flippedOf(c);
    sets.frames.push(SpriteAtlas.add(c));
    sets.flip.push(SpriteAtlas.add(f));
    sets.white.push(SpriteAtlas.add(tintOf(c, '#ffffff')));
    sets.whiteFlip.push(SpriteAtlas.add(tintOf(f, '#ffffff')));
  }
  if (order) for (const k in sets) sets[k] = order.map((i) => sets[k][i]);
  const w = canvases[0].width;
  const h = canvases[0].height;
  const bodyW = cx === undefined ? w : cx * 2;
  return Object.assign(sets, {
    w,
    h,
    cx: cx === undefined ? w >> 1 : cx,
    shadow: SpriteAtlas.add(shadowCanvas(Math.max(4, Math.round(bodyW * 0.8)))),
  });
}

// 몸통은 공통이고 맨 아래 다리 줄만 프레임마다 다른 도안
function walkSprite(name, body, legs, pal, opt = {}) {
  const canvases = legs.map((l, i) => outlined(mapCanvas(`${name}#${i}`, body.concat(l), pal), OUTLINE));
  return makeSprite(canvases, opt.order, opt.cx);
}

// 좌우 대칭 도안은 왼쪽 절반만 적고 거울로 복사한다
const mirror = (rows) => rows.map((r) => r + [...r].reverse().join(''));

// ================= 새 도안 (외곽선 없이 적는다. 외곽선은 굽는 과정에서 붙는다) =================

// ---- 마법사: 뾰족 모자, 흰 수염, 푸른 로브, 불씨가 달린 지팡이 (15x21) ----
const WIZARD_PAL = {
  h: '#23263f', H: '#3a4070', i: '#5a64a6', // 모자: 어두움 / 기본 / 밝음
  b: '#b07a24', B: '#f2c14e',               // 금빛 띠와 옷단
  F: '#b9805a', f: '#e6b287', e: '#1a1210', // 얼굴
  W: '#b9b3a2', w: '#f2eee2',               // 수염
  R: '#27306a', r: '#3c4a9a', q: '#6074c8', // 로브
  s: '#8a5a30', S: '#5c3a1c',               // 지팡이
  y: '#ffb43a', Y: '#fff2b0',               // 지팡이 끝 불씨
  k: '#3a2618', K: '#5a3c26',               // 신발
};
const WIZARD_BODY = [
  '.....hH........',
  '....hHHi.....Y.',
  '....hHHi....YyY',
  '...hhHHHi....y.',
  '...hHHHHi....s.',
  '..hhHHHHii...s.',
  '..bBbbbBbb...S.',
  'hhhHHHHHHiih.s.',
  '.hhhhhhhhhh..s.',
  '..FfeffefF...s.',
  '..WwwwwwwW...S.',
  '.RWwwwwwwWr..s.',
  'RrrWwwwwWrrq.s.',
  'RrrrWwwWrrrqfs.',
  'RrrrrWWrrrrq.S.',
  'RrrrrrrrrrRq.s.',
  '.RrrrrrrrrrR.s.',
  '.RrrrrrrrrrR.s.',
  '.RbBbbbbBbbR.S.',
];
const WIZARD_LEGS = [
  ['..kK...kK....s.', '..kk...kk....S.'], // 서 있기
  ['..kk...kK....s.', '.......kk....S.'], // 왼발 들기
  ['..kK...kk....s.', '..kk.........S.'], // 오른발 들기
];

// ---- 해골 (10x13) ----
const SKELETON_PAL = {
  k: '#e8e0c8', K: '#a69c82', // 뼈
  d: '#2a1c1a', y: '#ff7a1a', // 눈구멍과 그 안의 불빛
  c: '#6a3030', C: '#3f1c1e', // 낡은 천
};
const SKELETON_BODY = [
  '..kkkkkk..',
  '.kkkkkkkK.',
  '.kdykkdyK.',
  '.kkkkdkkK.',
  '..kKkKkK..',
  '...KkkK...',
  '.cckkkkcc.',
  'kcKkKkKkck',
  'k.ckkkkc.k',
  'k.CcKkcC.k',
  '..CccccC..',
];
const SKELETON_LEGS = [
  ['..kK..kK..', '..kk..kk..'],
  ['..kK..Kk..', '.kk...kk..'],
  ['..Kk..kK..', '..kk...kk.'],
];

// ---- 임프: 날개를 퍼덕이는 작은 악마 (10x8) ----
const IMP_PAL = {
  p: '#8a3aa0', P: '#c468e0', u: '#5a2270', // 몸 / 밝은 곳 / 날개
  y: '#ffd23a', j: '#eadcc0', t: '#ff5a44', // 눈 / 뿔 / 입
};
const IMP_FRAMES = [
  ['..j....j..', 'u.pPPPPp.u', 'uupyPPypuu', '.upPPPPpu.', '..ppttpp..', '..pppppp..', '...p..p...', '..u....u..'], // 날개 위
  ['..j....j..', '..pPPPPp..', '.upyPPypu.', 'uupPPPPpuu', 'u.ppttpp.u', '..pppppp..', '...p..p...', '...u..u...'], // 날개 아래
];

// ---- 경험치 보석 (5x6) ----
const GEM_PAL = { L: '#b6ffd6', G: '#2fd07a', g: '#1fa860', d: '#127a48' };
const GEM_ROWS = ['..L..', '.LGg.', 'LGGgd', 'LGggd', '.Ggd.', '..d..'];

// ================= 옛 도안 (외곽선 'o'가 도안 안에 들어 있다. 뒤 단계에서 새로 그린다) =================
const PALETTE = {
  o: OUTLINE,
  y: '#ff7a1a', // 눈 불빛
  a: '#5a5f6a', // 갑옷
  A: '#8a909c', // 갑옷 하이라이트
  d: '#34373f', // 어두운 갑옷
  u: '#3d2a5a', // 두건
  U: '#5e4590', // 두건 하이라이트
  e: '#1a1210', // 눈
  q: '#6a2a1a', // 사냥개 털
  Q: '#9a4a2a', // 사냥개 털 하이라이트
  z: '#e8e2d4', // 이빨
  D: '#4a1414', // 보스 어두운 몸
  E: '#7a2218', // 보스 몸
  F: '#a83a22', // 보스 하이라이트
  j: '#d8d0b8', // 뿔
  b: '#9a6a30', // 포션 마개
  L: '#d83a2a', // 포션 액체 / 자석 몸
  l: '#ff8a70', // 포션 하이라이트
  g: '#b8d8e0', // 유리
  n: '#dfe4ee', // 자석 끝(은색)
  N: '#9aa2b4', // 자석 끝 그림자
};

// 보스 2페이즈: 불타오르는 색
const BOSS_RAGE_PALETTE = Object.assign({}, PALETTE, { D: '#6a1a0a', E: '#c4421a', F: '#ff7a1a', y: '#fff4c8' });

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

// 보스: 뿔 달린 거대한 악마 (20x22). 새 도안이 나오기 전까지는 3배로 늘려 쓴다.
const BOSS_BODY = mirror([
  '..oj......', '..ojo.....', '...ojoooo.', '...ojEEEEE', '....oEFEEE',
  '...oEEEEEE', '...oEEyyEE', '...oEEEEEE', '....oEzzzz', '....ooEEEE',
  '..ooDDDEEE', '.oDDDDEEFE', 'oDDDDEEFFE', 'oDDDEEEFFE', 'oDDDEEEEEE',
  'oDDDEEEEFE', '.oDDDEEEEE', '.oDDDDEEEE', '..oDDDDEEE', '..oDDDDDEE',
]);
const BOSS_LEGS = [mirror(['..oDDDo...', '..oooooo..']), mirror(['.oDDDo....', '.oooooo...'])];

const POTION_ROWS = [
  '...oooo...', '...obbo...', '...oggo...', '...oggo...', '..oggggo..', '.ogLLLLgo.',
  '.oLLlLLLo.', '.oLlLLLLo.', '.oLLLLLLo.', '.oLLLLLLo.', '..oLLLLo..', '...oooo...',
];
const MAGNET_ROWS = [
  '.ooo......ooo.', '.onNo....oNno.', '.onNo....oNno.', '.oLLo....oLLo.', '.oLLo....oLLo.', '.oLLo....oLLo.',
  '.oLLoo..ooLLo.', '.oLLLLooLLLLo.', '..oLLLLLLLLo..', '...ooLLLLoo...', '.....oooo.....',
];

function legacySprite(name, body, legs, pal = PALETTE, scale = 1) {
  return makeSprite(legs.map((l, i) => {
    const c = mapCanvas(`${name}#${i}`, body.concat(l), pal);
    return scale > 1 ? scaledOf(c, scale) : c;
  }));
}

const Sprites = {
  wizard: walkSprite('wizard', WIZARD_BODY, WIZARD_LEGS, WIZARD_PAL, { order: [0, 1, 0, 2], cx: 7 }),
  skeleton: walkSprite('skeleton', SKELETON_BODY, SKELETON_LEGS, SKELETON_PAL, { order: [0, 1, 0, 2] }),
  imp: makeSprite(IMP_FRAMES.map((rows, i) => outlined(mapCanvas(`imp#${i}`, rows, IMP_PAL), OUTLINE))),
  brute: legacySprite('brute', BRUTE_BODY, BRUTE_LEGS),
  mage: legacySprite('mage', MAGE_BODY, MAGE_LEGS),
  hound: legacySprite('hound', HOUND_BODY, HOUND_LEGS),
  boss: legacySprite('boss', BOSS_BODY, BOSS_LEGS, PALETTE, 3),
  boss2: legacySprite('boss2', BOSS_BODY, BOSS_LEGS, BOSS_RAGE_PALETTE, 3),
  potion: legacySprite('potion', POTION_ROWS, [[]]),
  magnet: legacySprite('magnet', MAGNET_ROWS, [[]]),
  gem: makeSprite([outlined(mapCanvas('gem', GEM_ROWS, GEM_PAL), OUTLINE)]),
};

// ================= 도트 숫자 글꼴 =================
// 작은 글꼴(3x5)은 보통 피해, 큰 글꼴(5x7)은 강한 피해에 쓴다. 색마다 한 번만 굽는다.
const DIGITS_SMALL = [
  ['###', '#.#', '#.#', '#.#', '###'],
  ['.#.', '##.', '.#.', '.#.', '###'],
  ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '###', '..#', '###'],
  ['#.#', '#.#', '###', '..#', '..#'],
  ['###', '#..', '###', '..#', '###'],
  ['###', '#..', '###', '#.#', '###'],
  ['###', '..#', '..#', '.#.', '.#.'],
  ['###', '#.#', '###', '#.#', '###'],
  ['###', '#.#', '###', '..#', '###'],
];
const DIGITS_BIG = [
  ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
];

const PixelFont = {
  cache: {},

  // 색 하나에 대한 숫자 10개를 한 줄로 구운 캔버스. cell = 숫자 한 칸의 폭(외곽선 포함)
  sheet(color, big) {
    const key = color + (big ? 'B' : 'S');
    let s = this.cache[key];
    if (!s) {
      const glyphs = big ? DIGITS_BIG : DIGITS_SMALL;
      const cell = glyphs[0][0].length + 2;
      const c = blankCanvas(cell * 10, glyphs[0].length + 2);
      const g = c.getContext('2d');
      glyphs.forEach((rows, i) => g.drawImage(outlined(mapCanvas('digit' + i, rows, { '#': color }), OUTLINE, true), i * cell, 0));
      s = this.cache[key] = { c, cell, h: c.height };
    }
    return s;
  },

  // 그림판 (cx, by)를 가운데 위로 삼아 숫자를 찍는다. 칸끼리 외곽선 1픽셀이 겹치게 붙인다.
  draw(g, text, cx, by, color, big) {
    const s = this.sheet(color, big);
    const step = s.cell - 1;
    let x = cx - ((text.length * step + 1) >> 1);
    for (let i = 0; i < text.length; i++) {
      const d = text.charCodeAt(i) - 48;
      if (d >= 0 && d <= 9) g.drawImage(s.c, d * s.cell, 0, s.cell, s.h, x, by, s.cell, s.h);
      x += step;
    }
  },
};
