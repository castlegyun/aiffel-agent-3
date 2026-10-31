// 어두운 던전 바닥 타일과 가장자리 비네팅. 이미지 에셋 없이 canvas로 직접 만든다.

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

// 돌판 한 장 (0,0)~(w,h)을 그린다. 모든 요소가 돌판 안에 머물러서 타일 경계가 이어진다.
function drawSlab(c, x, y, w, h, rng) {
  const F = CONFIG.floor;
  const gap = 2; // 줄눈 두께의 절반

  c.fillStyle = F.slabColors[Math.floor(rng() * F.slabColors.length)];
  c.fillRect(x + gap, y + gap, w - gap * 2, h - gap * 2);

  // 얼룩/질감: 작은 점들을 어둡거나 밝게 흩뿌린다
  const specks = Math.floor((w * h) / 28);
  for (let i = 0; i < specks; i++) {
    const px = x + gap + rng() * (w - gap * 2);
    const py = y + gap + rng() * (h - gap * 2);
    c.fillStyle = rng() < 0.6 ? 'rgba(0,0,0,0.18)' : 'rgba(150,110,80,0.07)';
    c.fillRect(px, py, 1 + rng() * 2, 1 + rng() * 2);
  }

  // 큰 얼룩 하나: 돌판마다 명암이 조금씩 다르게 보이게 한다
  const g = c.createRadialGradient(
    x + w * (0.3 + rng() * 0.4), y + h * (0.3 + rng() * 0.4), 2,
    x + w / 2, y + h / 2, w * 0.7
  );
  g.addColorStop(0, rng() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(120,80,55,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(x + gap, y + gap, w - gap * 2, h - gap * 2);

  // 위/왼쪽 모서리 하이라이트, 아래/오른쪽 그림자
  c.fillStyle = F.highlight;
  c.fillRect(x + gap, y + gap, w - gap * 2, 1);
  c.fillRect(x + gap, y + gap, 1, h - gap * 2);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(x + gap, y + h - gap - 1, w - gap * 2, 1);
  c.fillRect(x + w - gap - 1, y + gap, 1, h - gap * 2);

  // 가끔 균열
  if (rng() < 0.3) {
    c.strokeStyle = F.crack;
    c.lineWidth = 1;
    c.beginPath();
    let cx = x + gap + 4 + rng() * (w - 16);
    let cy = y + gap + 4;
    c.moveTo(cx, cy);
    const steps = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < steps; i++) {
      cx += (rng() - 0.5) * 12;
      cy += (h - 12) / steps;
      cx = Math.min(Math.max(cx, x + gap + 2), x + w - gap - 2);
      c.lineTo(cx, cy);
    }
    c.stroke();
  }
}

// 반복해서 깔 수 있는 바닥 패턴 한 장을 만든다
function createFloorTile() {
  const F = CONFIG.floor;
  const T = F.tileSize;
  const S = F.slabSize;
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

// 가장자리를 어둡게 누르는 비네팅 (화면 크기가 바뀔 때만 다시 만든다)
function createVignette(w, h) {
  const V = CONFIG.vignette;
  const v = document.createElement('canvas');
  v.width = w;
  v.height = h;
  const c = v.getContext('2d');
  const radius = Math.hypot(w, h) / 2;
  const g = c.createRadialGradient(w / 2, h / 2, radius * V.inner, w / 2, h / 2, radius);
  g.addColorStop(0, `rgba(${V.color}, 0)`);
  g.addColorStop(0.6, `rgba(${V.color}, ${V.alpha * 0.45})`);
  g.addColorStop(1, `rgba(${V.color}, ${V.alpha})`);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  return v;
}

const Background = {
  pattern: null,
  vignette: null,

  init(ctx) {
    this.pattern = ctx.createPattern(createFloorTile(), 'repeat');
  },

  resize(w, h) {
    this.vignette = createVignette(Math.ceil(w), Math.ceil(h));
  },

  // 카메라 위치만큼 어긋나게 패턴을 깔아 무한히 이어지는 바닥처럼 보이게 한다
  drawFloor(ctx, camera, w, h) {
    const T = CONFIG.floor.tileSize;
    const ox = -(((camera.x % T) + T) % T);
    const oy = -(((camera.y % T) + T) % T);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = this.pattern;
    ctx.fillRect(0, 0, w + T, h + T);
    ctx.restore();
  },

  drawVignette(ctx, w, h) {
    ctx.drawImage(this.vignette, 0, 0, w, h);
  },
};
