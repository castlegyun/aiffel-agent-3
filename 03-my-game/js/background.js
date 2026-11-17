// 던전 바닥과 바닥 장식. 이미지 에셋 없이 도트로 직접 찍어 만든다.
// 막마다 색이 다른 타일 한 장을 그림판 해상도(세계 좌표의 절반)로 구워 두고 반복해서 깐다.

// 시드 고정 난수: 새로고침해도 같은 바닥 무늬가 나오게 한다
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 돌판 한 장을 (x, y)에 찍는다. 크기는 도트 픽셀. 모든 요소가 돌판 안에 머물러서 타일 경계가 이어진다.
// F: 그 막의 색 묶음 (CONFIG.floor.acts[i])
function drawSlab(c, x, y, w, h, rng, F) {
  const px = (color, ax, ay, aw, ah) => {
    c.fillStyle = color;
    c.fillRect(x + ax, y + ay, aw, ah);
  };

  // 줄눈 1픽셀을 남기고 돌판 바탕
  px(F.slabs[Math.floor(rng() * F.slabs.length)], 1, 1, w - 2, h - 2);

  // 얼룩: 어둡거나 밝은 점을 흩뿌린다
  const specks = Math.floor((w * h) / 26);
  for (let i = 0; i < specks; i++) {
    const sx = 2 + Math.floor(rng() * (w - 5));
    const sy = 2 + Math.floor(rng() * (h - 5));
    px(rng() < 0.62 ? F.shade : F.speck, sx, sy, rng() < 0.25 ? 2 : 1, 1);
  }

  // 큰 얼룩 하나: 점을 성기게 찍은 원. 돌판마다 명암이 조금씩 다르게 보이게 한다.
  if (rng() < 0.55) {
    const cx = 6 + Math.floor(rng() * (w - 12));
    const cy = 6 + Math.floor(rng() * (h - 12));
    const r = 3 + Math.floor(rng() * 4);
    const color = rng() < 0.6 ? F.shade : F.speck;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r || (dx + dy) & 1) continue; // 한 칸 걸러 찍는다
        const ax = cx + dx;
        const ay = cy + dy;
        if (ax > 1 && ax < w - 2 && ay > 1 && ay < h - 2) px(color, ax, ay, 1, 1);
      }
    }
  }

  // 위·왼쪽 모서리는 밝게, 아래·오른쪽은 어둡게: 돌판이 도톰해 보인다
  px(F.highlight, 1, 1, w - 2, 1);
  px(F.highlight, 1, 1, 1, h - 2);
  px(F.shade, 1, h - 2, w - 2, 1);
  px(F.shade, w - 2, 1, 1, h - 2);

  // 가끔 균열: 위에서 아래로 한 칸씩 비틀거리며 내려간다 (2막은 용암빛, 3막은 보랏빛)
  if (rng() < 0.32) {
    let cx = 4 + Math.floor(rng() * (w - 8));
    const from = 2 + Math.floor(rng() * 6);
    const to = h - 3 - Math.floor(rng() * 8);
    for (let cy = from; cy < to; cy++) {
      px(F.crack, cx, cy, 1, 1);
      const turn = rng();
      if (turn < 0.3 && cx > 3) cx--;
      else if (turn > 0.7 && cx < w - 4) cx++;
    }
  }

  // 가끔 깨진 모서리: 줄눈 색으로 한 귀퉁이를 파낸다
  if (rng() < 0.18) {
    const right = rng() < 0.5;
    const bottom = rng() < 0.5;
    for (let i = 0; i < 3; i++) {
      px(F.mortar, right ? w - 2 - (2 - i) : 1, bottom ? h - 2 - i : 1 + i, 3 - i, 1);
    }
  }
}

// 반복해서 깔 수 있는 바닥 패턴 한 장을 만든다
function createFloorTile(F) {
  const U = CONFIG.view.unit;
  const T = CONFIG.floor.tileSize / U;
  const S = CONFIG.floor.slabSize / U;
  const rng = makeRng(CONFIG.floor.seed);

  const tile = document.createElement('canvas');
  tile.width = T;
  tile.height = T;
  const c = tile.getContext('2d');

  c.fillStyle = F.mortar;
  c.fillRect(0, 0, T, T);

  // 줄마다 반 칸씩 엇갈리게 놓는다. 타일 오른쪽을 넘는 부분은 왼쪽에 다시 그려 이어붙인다.
  const rows = T / S;
  for (let row = 0; row < rows; row++) {
    const shift = row % 2 ? S / 2 : 0;
    for (let col = 0; col < rows; col++) {
      const x = col * S + shift;
      const y = row * S;
      const seed = Math.floor(rng() * 1e9);
      drawSlab(c, x, y, S, S, makeRng(seed), F);
      if (x + S > T) drawSlab(c, x - T, y, S, S, makeRng(seed), F);
    }
  }
  return tile;
}

// 막마다 놓이는 장식. glow가 있으면 스스로 빛난다.
const DECOR = [
  [{ sprite: 'bones' }, { sprite: 'rubble' }, { sprite: 'brazier', light: CONFIG.light.brazier, glow: '#4a2408' }],
  [{ sprite: 'lava', light: 120, glow: '#5a2408' }, { sprite: 'rubble' }, { sprite: 'brazier', light: CONFIG.light.brazier, glow: '#4a2408' }, { sprite: 'bones' }],
  [{ sprite: 'crystal', light: 130, glow: '#2c1a5a' }, { sprite: 'bones' }, { sprite: 'crystal', light: 130, glow: '#2c1a5a' }, { sprite: 'rubble' }],
];

const Background = {
  tiles: [],
  patterns: [],
  act: 0,
  vis: [], // 이번 프레임에 화면에 보이는 빛나는 장식 { d, bx, by }
  visN: 0,

  init() {
    this.tiles = CONFIG.floor.acts.map(createFloorTile);
    this.patterns = this.tiles.map((t) => Render.g.createPattern(t, 'repeat'));
  },

  setAct(i) {
    this.act = Math.min(i, this.tiles.length - 1);
  },

  // 카메라 위치만큼 어긋나게 패턴을 깔아 무한히 이어지는 바닥처럼 보이게 한다
  drawFloor(g) {
    const T = this.tiles[0].width;
    const ox = ((Render.ox % T) + T) % T;
    const oy = ((Render.oy % T) + T) % T;
    g.save();
    g.translate(-ox, -oy);
    g.fillStyle = this.patterns[this.act];
    g.fillRect(0, 0, Render.bw + T, Render.bh + T);
    g.restore();
  },

  // 칸 좌표로 정해지는 0~1 난수: 같은 칸에는 언제나 같은 값이 나온다 (무한 맵에서도 장식이 제자리에 있다)
  hash(cx, cy, salt) {
    let h = Math.imul(cx, 374761393) ^ Math.imul(cy, 668265263) ^ Math.imul(salt + 1, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  },

  // 화면에 걸친 칸마다, 그 칸에 장식이 있으면 그린다. 빛나는 장식은 조명에도 등록한다.
  drawDecor(g) {
    const F = CONFIG.floor;
    const cell = F.decorCell;
    const list = DECOR[this.act];
    const wx = Render.ox * 2;
    const wy = Render.oy * 2;
    this.visN = 0;
    for (let cx = Math.floor(wx / cell) - 1; cx <= Math.floor((wx + Render.viewW) / cell) + 1; cx++) {
      for (let cy = Math.floor(wy / cell) - 1; cy <= Math.floor((wy + Render.viewH) / cell) + 1; cy++) {
        if (this.hash(cx, cy, 0) > F.decorChance) continue;
        const d = list[Math.floor(this.hash(cx, cy, 1) * list.length)];
        const x = (cx + 0.15 + this.hash(cx, cy, 2) * 0.7) * cell;
        const y = (cy + 0.15 + this.hash(cx, cy, 3) * 0.7) * cell;
        const S = Sprites[d.sprite];
        const bx = Render.X(x);
        const by = Render.Y(y);
        if (!Render.onScreen(bx, by, 90)) continue;
        const f = S.frames[S.frames.length > 1 ? Math.floor(Effects.clock * 7 + cx) % S.frames.length : 0];
        Render.spr(f, bx - S.cx, by - (S.h >> 1));
        if (d.light) {
          Render.light(x, y - 6, d.light);
          const v = this.vis[this.visN] || (this.vis[this.visN] = {});
          v.d = d;
          v.bx = bx;
          v.by = by;
          this.visN++;
        }
      }
    }
  },

  // 화로·용암·수정의 빛무리 (가산 합성 상태에서 부른다)
  drawDecorGlow() {
    for (let i = 0; i < this.visN; i++) {
      const v = this.vis[i];
      Render.glow(v.bx, v.by - 3, 22, v.d.glow);
      // 빛나는 장식은 어둠에 가려지지 않게 한 번 더 그린다
      const S = Sprites[v.d.sprite];
      const f = S.frames[S.frames.length > 1 ? Math.floor(Effects.clock * 7) % S.frames.length : 0];
      if (v.d.sprite !== 'brazier') Render.spr(f, v.bx - S.cx, v.by - (S.h >> 1));
    }
  },
};
