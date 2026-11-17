// 도트 그림. 글자 도안을 작은 캔버스로 굽고, 한 장의 큰 캔버스(아틀라스)에 모아 둔다.
// 굽는 과정에서 자동으로 만든다: 1픽셀 외곽선, 좌우 반전본, 맞았을 때 쓰는 흰 실루엣, 흩어지는 죽음 프레임, 바닥 그림자.
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
      this.c.width = 2048;
      this.c.height = 2048;
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

// 시계 방향으로 90도 돌린 그림 (낫이 빙글빙글 도는 프레임을 만들 때 쓴다)
function rotatedOf(src) {
  const c = blankCanvas(src.height, src.width);
  const g = c.getContext('2d');
  g.translate(src.height, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  return c;
}

// 도트를 듬성듬성 지운 그림. amount(0~1)가 클수록 많이 지워진다 (죽을 때 흩어지는 프레임)
function dissolvedOf(src, amount) {
  const c = blankCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if ((h % 100) / 100 < amount) g.clearRect(x, y, 1, 1);
    }
  }
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
// frames 오른쪽 보기 / flip 왼쪽 보기 / white·whiteFlip 맞았을 때 / die·dieFlip 죽을 때 흩어짐 / shadow 그림자
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
  const first = canvases[0];
  const white = tintOf(first, '#ffffff');
  const w = first.width;
  const h = first.height;
  const bodyW = cx === undefined ? w : cx * 2;
  return Object.assign(sets, {
    w,
    h,
    cx: cx === undefined ? w >> 1 : cx,
    src: first, // 금빛 테두리(정예)를 나중에 만들 때 쓴다
    die: [0.3, 0.55, 0.8].map((a) => SpriteAtlas.add(dissolvedOf(white, a))),
    dieFlip: [0.3, 0.55, 0.8].map((a) => SpriteAtlas.add(dissolvedOf(flippedOf(white), a))),
    shadow: SpriteAtlas.add(shadowCanvas(Math.max(4, Math.round(bodyW * 0.8)))),
  });
}

// 정예용 금빛 실루엣. 본 그림 뒤에 사방으로 한 칸씩 밀어 그리면 금빛 테두리가 된다. 처음 쓸 때 한 번만 만든다.
function goldOf(S) {
  if (!S.gold) {
    const c = tintOf(S.src, '#ffd23a');
    S.gold = SpriteAtlas.add(c);
    S.goldFlip = SpriteAtlas.add(flippedOf(c));
  }
  return S;
}

// 좌우 대칭 도안은 왼쪽 절반만 적고 거울로 복사한다
const mirror = (rows) => rows.map((r) => r + [...r].reverse().join(''));

// 도안(외곽선 없이 적는다) → 외곽선 붙은 캔버스
const drawn = (name, rows, pal) => outlined(mapCanvas(name, rows, pal), OUTLINE);

// 몸통은 공통이고 맨 아래 다리 줄만 프레임마다 다른 도안
function walkSprite(name, body, legs, pal, opt = {}) {
  return makeSprite(legs.map((l, i) => drawn(`${name}#${i}`, body.concat(l), pal)), opt.order, opt.cx);
}

// 프레임마다 그림 전체가 다른 도안
function frameSprite(name, frames, pal, opt = {}) {
  return makeSprite(frames.map((rows, i) => drawn(`${name}#${i}`, rows, pal)), opt.order, opt.cx);
}

// ================= 플레이어 =================

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

// ================= 적 =================

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

// ---- 중갑병: 투구 틈으로 불빛이 새는 기사 (16x14) ----
const BRUTE_PAL = { a: '#6a707e', A: '#9aa2b2', l: '#c8d0de', d: '#3a3e48', k: '#1c1e24', y: '#ff7a1a', g: '#c8922e' };
const BRUTE_BODY = mirror([
  '......aa', '.....aAA', '.....aAl', '.....dyk', '.....aAa', '..aaAdaa',
  '.aAlAdAA', '.aAAadAl', '.dad.aAA', '.dad.aaA', '.ddd.dgg', '.....aad',
]);
const BRUTE_LEGS = [
  ['....add..dda....', '....ddd..ddd....'],
  ['...add....dda...', '...ddd....ddd...'],
  ['.....add.dda....', '.....ddd.ddd....'],
];

// ---- 광신도: 두건 속에서 눈만 빛나는 원거리 마법사 (12x14) ----
const MAGE_PAL = { u: '#3a2a5c', U: '#5a4494', v: '#261a40', s: '#120c0a', y: '#ff5a44', g: '#c4221a', G: '#ff8a70' };
const MAGE_BODY = mirror([
  '....uU', '...uUU', '..uUUU', '..uUss', '..uUys', '..uuss',
  '.uuUuu', '.uUuug', 'uuUuuG', 'uuuuug', 'uvuuuu', 'uvuuUu',
]);
const MAGE_LEGS = [
  ['.vuuuuuuuuv.', '..vvv..vvv..'],
  ['.vuuuuuuuuv.', '.vvv....vvv.'],
  ['.vuuuuuuuuv.', '...vvvvvv...'],
];

// ---- 지옥 사냥개: 등에 불꽃 갈기가 난 개, 옆모습 (14x10) ----
const HOUND_PAL = { q: '#6a2a1a', Q: '#a04a28', d: '#3c140c', y: '#ffb43a', z: '#f0e8d8', f: '#ff7a1a' };
const HOUND_BODY = [
  '..........d.d.',
  '..f.f.....qqq.',
  '.fQfQf...qQQyq',
  '.qQQQQqqqqQQqz',
  'qqQQQQQQQqqqz.',
  'qqqQQQQQqqq...',
  'dqqqqqqqqqd...',
  '.dqq...dqq....',
];
const HOUND_LEGS = [
  ['.dq....dq.....', '.dd....dd.....'],
  ['dq......dq....', 'dd.......dd...'],
  ['..dq..dq......', '..dd..dd......'],
];

// ---- 박쥐 (12x6) ----
const BAT_PAL = { b: '#3a2a4a', B: '#5c4474', w: '#241a30', y: '#ff5a44' };
const BAT_FRAMES = [
  mirror(['ww....', 'wbw..b', 'wbbwbB', '.wbbyB', '..wbBB', '....bB']),
  mirror(['......', '.....b', '..wwbB', 'wwbbyB', 'wbbwBB', 'w...bB']),
];

// ---- 자폭병: 심지에 불이 붙은 폭탄 (12x11) ----
const BOMBER_PAL = { k: '#2a2a34', K: '#4a4a5c', h: '#8a8aa0', y: '#ffd23a', f: '#ff7a1a', r: '#c4221a' };
const BOMBER_BODY = mirror([
  '.....f', '.....K', '...kkk', '..kKKK', '.kKhKK', '.kKyyK', '.kKKKK', '.kKKrr', '..kKKK', '...kkk',
]);
const BOMBER_LEGS = [['...kk..kk...'], ['..kk....kk..'], ['....kkkk....']];

// ---- 슬라임 (16x10) / 작은 슬라임 (10x6) ----
const SLIME_PAL = { g: '#3fae4a', G: '#7fe07a', d: '#1f6a30', e: '#0d2a14', h: '#d8ffd0' };
const SLIME_FRAMES = [
  mirror(['.....ggg', '...ggGGG', '..gGhGGG', '.gGhGGGG', '.gGGGeGG', 'gGGGGeGG', 'gGGGGGGG', 'gGGGGGdd', 'dgGGGGGG', '.ddggggg']),
  mirror(['........', '....gggg', '..ggGGGG', '.gGhGGGG', 'gGhGGeGG', 'gGGGGeGG', 'gGGGGGGG', 'gGGGGGdd', 'dgGGGGGG', 'dddggggg']),
];
const SLIMELET_FRAMES = [
  mirror(['...gg', '.ggGG', 'gGhGG', 'gGGeG', 'gGGGG', 'dgggg']),
  mirror(['.....', '..ggg', 'gghGG', 'gGGeG', 'gGGGG', 'ddggg']),
];

// ---- 유령 (12x13) ----
const GHOST_PAL = { w: '#c8e8f0', W: '#88b4c8', d: '#4a6a80', e: '#0c1820' };
const GHOST_HEAD = ['...www', '..wwww', '.wwwww', '.wweew', '.wweew', '.wwwww', '.wwwwe', 'Wwwwww', 'Wwwwww', 'WWwwww', 'WWwwWw'];
const GHOST_FRAMES = [
  mirror(GHOST_HEAD.concat(['dW.Ww.', '.d..W.'])),
  mirror(GHOST_HEAD.concat(['.Ww.Ww', '..W..d'])),
];

// ---- 강령술사: 뿔 달린 해골 가면, 손에서 초록 불빛 (12x15) ----
const NECRO_PAL = { n: '#1e3a2c', N: '#2f5c44', v: '#112018', k: '#e8e0c8', K: '#a69c82', y: '#7dff8a', h: '#8a7a68' };
const NECRO_BODY = mirror([
  'h.....', 'hh..kk', '.hkkkk', '..kykk', '..kkkK', '...kKk', '..nnNN',
  '.nnNNN', 'ynNNNy', '.nnNNN', '.nNNNN', 'nnNNNN', 'nvNNvN',
]);
const NECRO_LEGS = [
  ['nvvnnnnnnvvn', '.vvv....vvv.'],
  ['nvvnnnnnnvvn', 'vvv......vvv'],
  ['nvvnnnnnnvvn', '..vvvvvvvv..'],
];

// ---- 감시자의 눈: 줄기 위에 박힌 커다란 눈알 (14x13) ----
const EYE_PAL = { m: '#7a2a3a', M: '#a8485a', w: '#f0e8d8', W: '#b8ae9c', i: '#ffb43a', p: '#1a0e0a', v: '#4a1420' };
const EYE_STALK = ['...mmmm', '....vmm', '...vvmm', '..vvvvv'];
const EYE_FRAMES = [
  mirror(['...mmmm', '..mMMMM', '.mMwwww', '.mwwwii', 'mMwwiip', 'mMwwiip', '.mWwwii', '.mMWWww', '..mMMMM'].concat(EYE_STALK)),
  mirror(['...mmmm', '..mMMMM', '.mMwwww', '.mwwiii', 'mMwwipp', 'mMwwipp', '.mWwiii', '.mMWWww', '..mMMMM'].concat(EYE_STALK)),
];

// ================= 보스 (7배 확대 없이 제 크기로 그린다) =================

// ---- 해골 기사단장 (32x32) ----
const KNIGHT_PAL = {
  a: '#5a6070', A: '#8a92a6', l: '#c8d0de', d: '#343844', k: '#1c1e26', // 갑옷
  b: '#e8e0c8', B: '#a69c82', y: '#7df0ff',                             // 해골 얼굴과 푸른 눈빛
  r: '#6a1e24', R: '#9a2e30', g: '#c8922e', G: '#f2c14e',               // 망토와 금장식
};
const KNIGHT_BODY = mirror([
  '......A.........', '......AA....gggg', '.......Aa..aaAAA', '.......AaaaAAAll', '........aAAAAAll',
  '........aAAAkkkk', '........aAAkbbbb', '........aAAkbyyb', '........aAAkbbbb', '.........aAkBbBb',
  '....aaa..aaakkBB', '..aaAAAaa.dddddd', '.aAAlAAAAad.gggg', '.aAlAAAAAaddaAAA', 'aAAAAAAAaadaAAAl',
  'aAAAAAaaad.aAAGG', '.aaaaadd.d.aAAGg', '..dddd.aad.aAAAA', '..RR..aAAd.aaAAA', '.RRr..aAAd.daaaa',
  '.RRr..aAad.dgggg', '.Rrr..aAad..aaAA', '.Rrr.aAAAd..aAAA', 'RRrr.aAlAd..aAAd', 'RRrr.aAAAd..aAad',
  'RRrr..aad...aAad', 'Rrrr........aAad', 'Rrrr.......aaAad', '.rrr.......aAAad',
]);
const KNIGHT_LEGS = [
  mirror(['...........aAAdd', '..........aaaadd', '..........kkkkkk']),
  mirror(['..........aAAdd.', '.........aaaadd.', '.........kkkkkk.']),
];
// 2페이즈: 눈빛이 붉어지고 망토가 타오른다
const KNIGHT_RAGE_PAL = Object.assign({}, KNIGHT_PAL, { y: '#ff5a44', r: '#a8341a', R: '#ff7a1a', a: '#64566a', A: '#96849c' });

// ---- 심연의 리치: 왕관을 쓴 해골 마법사, 공중에 떠 있다 (30x32) ----
const LICH_PAL = {
  p: '#3a1e5c', P: '#5c34a0', l: '#8a5ce0', v: '#1e0f30', // 로브
  k: '#e8e0c8', K: '#a69c82', y: '#e08aff',               // 해골과 눈빛
  g: '#f2c14e', G: '#c8922e', c: '#7df0ff',               // 왕관과 보석
};
const LICH_BODY = mirror([
  '..........g...g', '..........gG.Gg', '..........gGGGc', '.........ppkkkk', '........pPkkkkk',
  '.......pPPkyykk', '.......pPPkyykk', '.......pPPkkkkK', '.......pPPPkKkK', '......ppPPPkkkk',
  '....pppPPPPvvvv', '..ppPPPPPlPPvcc', '.pPPPlPPPPPPvcc', 'pPPlPPPPpPPPPvv', 'pPPPPPPpvpPPPPP',
  'pPPPPPpv.pPPlPP', '.pPPPpv..pPPlPP', '.kkPPv...pPPPPP', '.kKk.....pPPPPP', '..k......pPPPlP',
  '.........pPPPlP', '........ppPPPPP', '........pPPPPPP', '.......ppPPlPPP', '.......pPPPlPPP',
  '.......pPPPPPPP', '......ppPPPPPvP', '......pPPvPPPvP', '......pPvvPPvvP', '.......pv.pPv.p',
  '.......v..pv...', '..........v....',
]);
const LICH_RAGE_PAL = Object.assign({}, LICH_PAL, { y: '#ff5a44', c: '#ff5a44', p: '#4a1a4a', P: '#8a2a7a', l: '#e05ab4' });

// ---- BOSS 해창: 뿔과 날개가 달린 거대한 악마 (46x41) ----
const DEMON_PAL = {
  D: '#3c0f0f', E: '#7a2218', F: '#a83a22', H: '#d85a2a', // 몸: 어두움 → 밝음
  j: '#d8d0b8', J: '#8a8068',                             // 뿔
  y: '#ffb43a', Y: '#fff2b0',                             // 눈
  z: '#f0e8d8', m: '#1a0606',                             // 이빨과 입속
  w: '#4a1414', W: '#6a1e1a', c: '#e8e0c8',               // 날개와 발톱
};
const DEMON_BODY = mirror([
  '...j...................', '...jj..................', '...jJj.................', '....jJj................',
  '....jJJj.......EEEEEEEE', '.....jJJj....EEFFFFFFFF', '.....jjJJj..EFFFHHHFFFF', '......jjJJEEFFHHFFFFFFF',
  '.......jJEFFFFFFFFFFFFF', '........EFFDDDFFFFFFFFF', '........EFDyyYDDFFFFFFD', '........EFFDyyyDFFFFFDD',
  '........EEFFDDDFFFFFFDD', '.........EFFFFFFFmmmmmm', '.........EEFzmzmzmzmzmz', '..........EFmmmmmmmmmmm',
  '..........EEzmzmzmzmzmz', '...........EEFFFFFFFFFF', '....ww......EEEEEDDDDDD', '..wwWWw..EEEEFFFFFEEEEE',
  '.wWWWWwEEFFFFHHFFFFEEEE', 'wWWwWWEFFFHHFFFFFFFFEED', 'wWwwWEFFFHFFFFEEFFFFFED', 'wWw.wEFFFFFFFEEEEFFFFFD',
  'wW..EFFFFEFFFFEEFFFFFFD', 'w...EFFFE.EFFFFFFFFFFFD', '....EFFE..EEFFFFFEEFFFD', '...EFFFE...EFFFFEEEEFFD',
  '...EFFE....EFFFFFEEFFFD', '..EFFFE....EEFFFFFFFFFD', '..EFFE......EFFFFEEFFFD', '..EFFE......EEFFEEEEFFD',
  '.cEFFEc.....DDDDDDDDDDD', '.cEEEEc.....EEFFFFDEFFF', '.c.cc.c.....EFFFFFDEFFF', '............EFFFHFDEFFF',
  '............EFFFFFD.EFF', '............EEFFFED.EEF',
]);
const DEMON_LEGS = [
  mirror(['............EEFFFE...EF', '...........DEEEEED..DEE', '...........cDDDDDc..cDD']),
  mirror(['...........EEFFFE....EF', '..........DEEEEED...DEE', '..........cDDDDDc...cDD']),
];
// 2페이즈: 달아오른다 / 3페이즈: 불덩이가 된다
const DEMON_PAL2 = Object.assign({}, DEMON_PAL, { D: '#5a1408', E: '#a8341a', F: '#d85a2a', H: '#ff8a3a', y: '#fff2b0', w: '#6a1e1a', W: '#9a2e20' });
const DEMON_PAL3 = Object.assign({}, DEMON_PAL, { D: '#7a1c08', E: '#d8521a', F: '#ff8a2a', H: '#ffd23a', y: '#ffffff', Y: '#ffffff', w: '#a8341a', W: '#d8521a', j: '#fff2b0' });

// ================= 아이템 · 보석 · 무기 그림 · 장식 =================
const ITEM_PAL = {
  g: '#b8d8e0', L: '#d83a2a', l: '#ff8a70', b: '#9a6a30', h: '#ffffff', // 포션
  n: '#dfe4ee', N: '#9aa2b4',                                           // 자석 끝
  k: '#2a2a34', K: '#4a4a5c', s: '#8a8aa0', f: '#ff7a1a', F: '#fff2b0', // 폭탄
  w: '#8a5a30', W: '#5c3a1c', G: '#c8922e', y: '#f2c14e', d: '#2a1c14', // 상자
};
const POTION_ROWS = ['...bb...', '...gg...', '...gg...', '..gggg..', '.gLLLLg.', 'gLhLLLLg', 'gLhLLLLg', 'gLLLLLLg', '.gLLLLg.', '..gggg..'];
const MAGNET_ROWS = ['nnn......nnn', 'nNn......nNn', 'LLL......LLL', 'LlL......LlL', 'LlL......LlL', 'LlLL....LLLL', '.LlLLLLLLLL.', '..LLllllLL..', '...LLLLLL...'];
const BOMB_ROWS = ['......F...', '.....f....', '....K.....', '..kkkkk...', '.kKKsKKk..', 'kKKsKKKKk.', 'kKKKKKKKk.', 'kKKKKKKKk.', '.kKKKKKk..', '..kkkkk...'];
const CHEST_ROWS = [
  '..GGGGGGGGGG..', '.GwwwwwwwwwwG.', 'GwwWwwwwwwWwwG', 'GwwWwwwwwwWwwG', 'GGGGGGyyGGGGGG',
  'GwwWwwydywWwwG', 'GwwWwwyyywWwwG', 'GwwWwwwwwwWwwG', 'GwwWwwwwwwWwwG', 'GGGGGGGGGGGGGG',
];

// 경험치 보석: 값이 클수록 초록 → 파랑 → 빨강 → 금빛. 빨강부터는 큰 보석.
const GEM_SMALL = ['..L..', '.LGg.', 'LGGgd', 'LGggd', '.Ggd.', '..d..'];
const GEM_BIG = ['..LLL..', '.LGGGg.', 'LGGGGgd', 'LGGGggd', 'LGGgggd', '.Ggggd.', '..gdd..', '...d...'];
const GEM_PALS = [
  { L: '#b6ffd6', G: '#2fd07a', g: '#1fa860', d: '#127a48' },
  { L: '#c8e6ff', G: '#4a9aff', g: '#2a6ad8', d: '#1a3f96' },
  { L: '#ffd0c8', G: '#ff5a44', g: '#d02a24', d: '#8a1414' },
  { L: '#fff8d0', G: '#ffd23a', g: '#e09a1a', d: '#9a5a0a' },
];

// 귀환 낫: 한 장을 그려 90도씩 돌려 네 프레임을 만든다
const SCYTHE_PAL = { s: '#dfe4ee', S: '#9aa2b4', h: '#ffffff', w: '#5c3a1c' };
const SCYTHE_EVO_PAL = { s: '#e0b4ff', S: '#8a4ad0', h: '#ffffff', w: '#2a1c3c' };
const SCYTHE_ROWS = ['..sssss..', '.shhhhSs.', 'sh....SSs', 's......Ss', '........s', '.......w.', '......w..', '.....w...', '....w....'];

// 바닥 장식
const DECOR_PAL = {
  i: '#4a3f38', I: '#8a7a68', f: '#ff7a1a', F: '#ffd23a', w: '#fff2b0', // 화로
  k: '#e8e0c8', K: '#a69c82',                                           // 뼈
  a: '#3a2a20', A: '#4a3628', d: '#140e0b',                             // 돌무더기
  o: '#ff7a1a', y: '#ffd23a', r: '#8a2a0c',                             // 용암 균열
  p: '#7a4ad0', P: '#c9a0ff', W: '#ffffff', v: '#3a1e6a',               // 수정
};
const BRAZIER_BASE = ['IIIIIIII', '.iIIIIi.', '..iIIi..', '...ii...', '...ii...', '..iiii..', '.iiiiii.'];
const BRAZIER_FRAMES = [
  ['...f....', '..fFf...', '..fFFf..', '.fFwFf..', '.fFwwFf.'].concat(BRAZIER_BASE),
  ['....f...', '...fFf..', '..fFFf..', '..fFwFf.', '.fFwwFf.'].concat(BRAZIER_BASE),
];
const BONES_ROWS = ['.k....k.', '..kKKk..', '.KkkkkK.', 'k.KkkK.k', '...kk...'];
const RUBBLE_ROWS = ['...aa.....', '.aAAa..aa.', 'aAAAAaaAAa', 'aAAaAAaAAa', 'ddaaddaadd'];
const LAVA_ROWS = ['r.........r.', '.ro....rr...', '..oyo.ro....', '...oyoyo....', '....oyyor...', '...ro.oyor..', '..r....ryo..', '.........or.'];
const CRYSTAL_ROWS = ['...P....', '..PWP...', '..PPp.P.', '.PWPpPWP', '.PPppPPp', 'vPPppPpv', 'vvppppvv', '.vvvvvv.'];

const scytheFrames = (pal) => {
  const a = drawn('scythe', SCYTHE_ROWS, pal);
  const b = rotatedOf(a);
  const c = rotatedOf(b);
  return makeSprite([a, b, c, rotatedOf(c)]);
};

const Sprites = {
  wizard: walkSprite('wizard', WIZARD_BODY, WIZARD_LEGS, WIZARD_PAL, { order: [0, 1, 0, 2], cx: 7 }),
  skeleton: walkSprite('skeleton', SKELETON_BODY, SKELETON_LEGS, SKELETON_PAL, { order: [0, 1, 0, 2] }),
  imp: frameSprite('imp', IMP_FRAMES, IMP_PAL),
  brute: walkSprite('brute', BRUTE_BODY, BRUTE_LEGS, BRUTE_PAL, { order: [0, 1, 0, 2] }),
  mage: walkSprite('mage', MAGE_BODY, MAGE_LEGS, MAGE_PAL, { order: [0, 1, 0, 2] }),
  hound: walkSprite('hound', HOUND_BODY, HOUND_LEGS, HOUND_PAL, { order: [0, 1, 0, 2] }),
  bat: frameSprite('bat', BAT_FRAMES, BAT_PAL),
  bomber: walkSprite('bomber', BOMBER_BODY, BOMBER_LEGS, BOMBER_PAL, { order: [0, 1, 0, 2] }),
  slime: frameSprite('slime', SLIME_FRAMES, SLIME_PAL, { order: [0, 0, 1, 1] }),
  slimelet: frameSprite('slimelet', SLIMELET_FRAMES, SLIME_PAL, { order: [0, 0, 1, 1] }),
  ghost: frameSprite('ghost', GHOST_FRAMES, GHOST_PAL, { order: [0, 0, 1, 1] }),
  necro: walkSprite('necro', NECRO_BODY, NECRO_LEGS, NECRO_PAL, { order: [0, 1, 0, 2] }),
  eye: frameSprite('eye', EYE_FRAMES, EYE_PAL, { order: [0, 0, 0, 1] }),
  knight: walkSprite('knight', KNIGHT_BODY, KNIGHT_LEGS, KNIGHT_PAL),
  knight2: walkSprite('knight2', KNIGHT_BODY, KNIGHT_LEGS, KNIGHT_RAGE_PAL),
  lich: frameSprite('lich', [LICH_BODY], LICH_PAL),
  lich2: frameSprite('lich2', [LICH_BODY], LICH_RAGE_PAL),
  demon: walkSprite('demon', DEMON_BODY, DEMON_LEGS, DEMON_PAL),
  demon2: walkSprite('demon2', DEMON_BODY, DEMON_LEGS, DEMON_PAL2),
  demon3: walkSprite('demon3', DEMON_BODY, DEMON_LEGS, DEMON_PAL3),
  potion: frameSprite('potion', [POTION_ROWS], ITEM_PAL),
  magnet: frameSprite('magnet', [MAGNET_ROWS], ITEM_PAL),
  bomb: frameSprite('bomb', [BOMB_ROWS], ITEM_PAL),
  chest: frameSprite('chest', [CHEST_ROWS], ITEM_PAL),
  gem0: frameSprite('gem0', [GEM_SMALL], GEM_PALS[0]),
  gem1: frameSprite('gem1', [GEM_SMALL], GEM_PALS[1]),
  gem2: frameSprite('gem2', [GEM_BIG], GEM_PALS[2]),
  gem3: frameSprite('gem3', [GEM_BIG], GEM_PALS[3]),
  scythe: scytheFrames(SCYTHE_PAL),
  scytheEvo: scytheFrames(SCYTHE_EVO_PAL),
  brazier: frameSprite('brazier', BRAZIER_FRAMES, DECOR_PAL),
  bones: frameSprite('bones', [BONES_ROWS], DECOR_PAL),
  rubble: frameSprite('rubble', [RUBBLE_ROWS], DECOR_PAL),
  lava: frameSprite('lava', [LAVA_ROWS], DECOR_PAL),
  crystal: frameSprite('crystal', [CRYSTAL_ROWS], DECOR_PAL),
};
const GEM_SPRITES = [Sprites.gem0, Sprites.gem1, Sprites.gem2, Sprites.gem3];

// ================= 아이콘 (10x10). HTML의 HUD·카드에서 이모지 대신 쓴다 =================
const ICON_PAL = {
  o: '#ff7a1a', y: '#ffd23a', Y: '#fff2b0', r: '#d83a2a', R: '#8a1c1c',
  b: '#6aa8ff', B: '#2a4fd0', c: '#aef0ff', p: '#c9a0ff', P: '#7a4ad0',
  g: '#2fd07a', G: '#127a48', w: '#f2eee2', s: '#9aa2b4', S: '#5d6474',
  n: '#8a5a30', N: '#5c3a1c', k: '#2a1c14',
};
const ICON_ROWS = {
  bolt:      ['....o.....', '...oo..o..', '..oyo.oo..', '..oyyoyo..', '.oyYYyyo..', '.oyYYYyo..', '.oyYYYyo..', '.ooyYyoo..', '..ooyoo...', '...ooo....'],
  orbs:      ['...bbb....', '..bccBb...', '..bcBBb...', '...bbb..bb', '.......bcB', '.bbb...bBB', 'bccBb...bb', 'bcBBb.....', '.bbb......', '..........'],
  laser:     ['.........p', '........pw', '.......pwp', '......pwp.', '.....pwp..', '....pwp...', '...pwp....', '..pwp.....', '.pwp......', 'pwp.......'],
  lightning: ['.....yyy..', '....yYy...', '...yYy....', '..yYYyyy..', '..yyyYYy..', '....yYy...', '...yYy....', '..yYy.....', '..yy......', '..y.......'],
  frost:     ['....c.....', '.c..c..c..', '..c.c.c...', '...cwc....', 'cccwwwccc.', '...cwc....', '..c.c.c...', '.c..c..c..', '....c.....', '..........'],
  meteor:    ['.......oo.', '......oyo.', '..o..oyo..', '...ooyo...', '..nnnoo...', '.nNnnno...', '.nnnNnn...', '.nNnnnn...', '..nnnn....', '..........'],
  scythe:    ['..ssss....', '.swwwss...', 'sw...sss..', '......ss..', '......sn..', '.....n....', '....n.....', '...n......', '..n.......', '.n........'],
  wisp:      ['....g.....', '...gg.....', '...gcg..g.', '..gccg.gg.', '.gcwwcgg..', '.gcwwcg...', '.gcccg....', '..ggg.....', '..........', '..........'],
  might:     ['........ww', '.......wsw', '......wsw.', '.....wsw..', '.n..wsw...', '..nwsw....', '..nnw.....', '.n.nn.....', 'n...n.....', '..........'],
  haste:     ['.yyyyyyy..', '.ywwwwwy..', '..ywwwy...', '...ywy....', '....y.....', '...y.y....', '..y.w.y...', '.y.www.y..', '.yyyyyyy..', '..........'],
  area:      ['...cccc...', '..c....c..', '.c..bb..c.', 'c..b..b..c', 'c.b.ww.b.c', 'c.b.ww.b.c', 'c..b..b..c', '.c..bb..c.', '..c....c..', '...cccc...'],
  crit:      ['....y.....', '....y..y..', '.y.yYy.y..', '..yYYYy...', 'yyYYwYYyy.', '..yYYYy...', '.y.yYy.y..', '....y..y..', '....y.....', '..........'],
  regen:     ['...ggg....', '...gwg....', '...gwg....', 'ggggwgggg.', 'gwwwwwwwg.', 'ggggwgggg.', '...gwg....', '...gwg....', '...ggg....', '..........'],
  armor:     ['sssssssss.', 'swwsssSSs.', 'swssssSSs.', 'swssssSSs.', 'ssssssSSs.', '.sssssSs..', '.ssssSSs..', '..sssSs...', '...sSs....', '....s.....'],
  growth:    ['....g.....', '...ggg....', '..ggwgg...', '.ggwwwgg..', 'ggwwwwwgg.', '.ggwwwgg..', '..ggwgg...', '...ggg....', '....g.....', '..........'],
  speed:     ['..nnn.....', '..nNn.....', '..nNn.....', '..nNn.....', '..nNnn....', '..nNNnnn..', '.nnNNNNnn.', '.nNNNNNNn.', '.nnnnnnnn.', '..........'],
  maxhp:     ['.rr...rr..', 'rwrr.rrrr.', 'rwrrrrrrr.', 'rrrrrrrrr.', 'rrrrrrrrr.', '.rrrrrrr..', '..rrrrr...', '...rrr....', '....r.....', '..........'],
  magnet:    ['ss.....ss.', 'sS.....Ss.', 'rr.....rr.', 'rR.....Rr.', 'rR.....Rr.', 'rRr...rRr.', '.rRrrrRr..', '..rRRRr...', '...rrr....', '..........'],
  heal:      ['...rrr....', '...rwr....', '...rwr....', 'rrrrwrrrr.', 'rwwwwwwwr.', 'rrrrwrrrr.', '...rwr....', '...rwr....', '...rrr....', '..........'],
  dash:      ['..........', '.b...cc...', '..b...cwc.', '...b...cwc', 'bbbbbbbcwc', '...b...cwc', '..b...cwc.', '.b...cc...', '..........', '..........'],
  skull:     ['..wwwww...', '.wwwwwww..', '.wkkwkkw..', '.wkkwkkw..', '.wwwkwww..', '..wwwww...', '..wkwkw...', '..........', '..........', '..........'],
  chest:     ['..........', '.nnnnnnnn.', 'nNNNNNNNNn', 'nNNNNNNNNn', 'nnnnyynnnn', 'nNNNyyNNNn', 'nNNNNNNNNn', 'nnnnnnnnnn', '..........', '..........'],
};

const Icons = {
  cache: {},

  // 아이콘 이름 → <img>에 넣을 수 있는 주소(data URL). 한 번 만든 것은 다시 쓴다.
  url(name) {
    if (!this.cache[name]) {
      const rows = ICON_ROWS[name] || ICON_ROWS.skull;
      this.cache[name] = outlined(mapCanvas('icon:' + name, rows, ICON_PAL), OUTLINE).toDataURL();
    }
    return this.cache[name];
  },

  // 아이콘 <img> 요소를 만든다
  img(name, cls) {
    const el = document.createElement('img');
    el.src = this.url(name);
    el.className = cls || 'icon';
    el.alt = '';
    el.draggable = false;
    return el;
  },
};

// ================= 도트 숫자 글꼴 =================
// 작은 글꼴(3x5)은 보통 피해, 큰 글꼴(5x7)은 치명타·보스에 쓴다. 색마다 한 번만 굽는다.
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
