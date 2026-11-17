// 어두운 던전 바닥. 이미지 에셋 없이 도트로 직접 찍어 만든다.
// 타일 한 장을 그림판 해상도(세계 좌표의 절반)로 구워 두고 반복해서 깐다.

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
function drawSlab(c, x, y, w, h, rng) {
  const F = CONFIG.floor;
  const px = (color, ax, ay, aw, ah) => {
    c.fillStyle = color;
    c.fillRect(x + ax, y + ay, aw, ah);
  };

  // 줄눈 1픽셀을 남기고 돌판 바탕
  px(F.slabColors[Math.floor(rng() * F.slabColors.length)], 1, 1, w - 2, h - 2);

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

  // 가끔 균열: 위에서 아래로 한 칸씩 비틀거리며 내려간다
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
function createFloorTile() {
  const F = CONFIG.floor;
  const U = CONFIG.view.unit;
  const T = F.tileSize / U;
  const S = F.slabSize / U;
  const rng = makeRng(F.seed);

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
      drawSlab(c, x, y, S, S, makeRng(seed));
      if (x + S > T) drawSlab(c, x - T, y, S, S, makeRng(seed));
    }
  }
  return tile;
}

const Background = {
  tile: null,
  pattern: null,

  init() {
    this.tile = createFloorTile();
    this.pattern = Render.g.createPattern(this.tile, 'repeat');
  },

  // 카메라 위치만큼 어긋나게 패턴을 깔아 무한히 이어지는 바닥처럼 보이게 한다
  drawFloor(g) {
    const T = this.tile.width;
    const ox = ((Render.ox % T) + T) % T;
    const oy = ((Render.oy % T) + T) % T;
    g.save();
    g.translate(-ox, -oy);
    g.fillStyle = this.pattern;
    g.fillRect(0, 0, Render.bw + T, Render.bh + T);
    g.restore();
  },
};
