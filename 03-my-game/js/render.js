// 픽셀 화면. 세계를 작은 그림판(버퍼)에 그린 뒤 정수 배로 확대해 화면에 붙인다.
// 그림판 1픽셀 = 세계 좌표 CONFIG.view.unit(2). 그래서 탄·숫자·빛까지 전부 같은 크기의 도트가 된다.
// 좌표 이름: w* = 세계 좌표, b* = 그림판 픽셀(정수).

const Render = {
  canvas: null, // 실제 화면 캔버스
  out: null,
  buf: null,    // 그림판
  g: null,
  dark: null,   // 어둠 레이어: 빛이 닿는 자리만 뚫는다
  dg: null,
  K: 2,         // 그림판 1픽셀이 차지하는 기기 픽셀 수
  bw: 0,
  bh: 0,
  viewW: 0,     // 화면에 보이는 세계의 크기 (세계 좌표)
  viewH: 0,
  ox: 0,        // 그림판 왼쪽 위가 세계의 어디인지 (그림판 픽셀)
  oy: 0,
  lights: [],
  lightCount: 0,
  discs: {},
  rings: {},
  stamps: [],
  glows: {},
  edges: {},

  init(canvas) {
    this.canvas = canvas;
    this.out = canvas.getContext('2d');
    this.buf = document.createElement('canvas');
    this.g = this.buf.getContext('2d');
    this.dark = document.createElement('canvas');
    this.dg = this.dark.getContext('2d');
  },

  // 창 크기에 맞춰 확대 배율을 정한다. 화면이 커져도 보이는 넓이는 비슷하게 유지된다.
  resize() {
    const V = CONFIG.view;
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const cssK = Math.max(V.minCssPx, Math.round(Math.sqrt((cssW * cssH) / V.targetArea)));
    this.K = Math.max(1, Math.round(cssK * dpr));
    // 윈도우 배율 125%·150%에서도 번지지 않게: 실제 크기는 기기 픽셀, CSS 크기는 그 값을 dpr로 나눈 값
    const devW = Math.round(cssW * dpr);
    const devH = Math.round(cssH * dpr);
    this.canvas.width = devW;
    this.canvas.height = devH;
    this.canvas.style.width = devW / dpr + 'px';
    this.canvas.style.height = devH / dpr + 'px';
    this.bw = Math.ceil(devW / this.K);
    this.bh = Math.ceil(devH / this.K);
    this.buf.width = this.dark.width = this.bw;
    this.buf.height = this.dark.height = this.bh;
    this.viewW = this.bw * V.unit;
    this.viewH = this.bh * V.unit;
    this.edges = {}; // 화면 크기에 맞춰 만든 가장자리 섬광은 다시 만든다
    // 캔버스 크기를 바꾸면 설정이 초기화되므로 다시 끈다 (확대할 때 도트가 번지지 않게)
    this.out.imageSmoothingEnabled = false;
    this.g.imageSmoothingEnabled = false;
    // HTML 테두리도 도트 한 칸과 같은 굵기를 쓰도록 내보낸다
    document.documentElement.style.setProperty('--px', this.K / dpr + 'px');
  },

  // 한 프레임 시작. (cx, cy) = 화면 중앙에 둘 세계 좌표, (sx, sy) = 화면 흔들림(그림판 픽셀)
  begin(cx, cy, sx, sy) {
    const U = CONFIG.view.unit;
    this.ox = Math.round(cx / U) - (this.bw >> 1) + sx;
    this.oy = Math.round(cy / U) - (this.bh >> 1) + sy;
    this.lightCount = 0;
  },

  X(wx) { return Math.round(wx * 0.5) - this.ox; },
  Y(wy) { return Math.round(wy * 0.5) - this.oy; },

  // 화면(여유 margin 픽셀 포함) 안에 있는가: 밖이면 그리지 않는다
  onScreen(bx, by, margin) {
    return bx > -margin && bx < this.bw + margin && by > -margin && by < this.bh + margin;
  },

  // 아틀라스의 한 조각(frame)을 그림판 (bx, by)에 그대로 찍는다
  spr(f, bx, by) {
    this.g.drawImage(f.c, f.x, f.y, f.w, f.h, bx, by, f.w, f.h);
  },

  rect(bx, by, w, h, color) {
    this.g.fillStyle = color;
    this.g.fillRect(bx, by, w, h);
  },

  // 반지름 r 안쪽~바깥쪽 사이의 픽셀을 가로줄 단위로 칠한다 (계단 모양 원). inner < 0 이면 꽉 찬 원.
  _spans(c, cx, cy, r, inner) {
    const out2 = r * r + r;
    const in2 = inner < 0 ? -1 : inner * inner + inner;
    for (let y = -r; y <= r; y++) {
      const xo = Math.floor(Math.sqrt(out2 - y * y));
      const rest = in2 - y * y;
      if (rest < 0) {
        c.fillRect(cx - xo, cy + y, xo * 2 + 1, 1);
      } else {
        const xi = Math.floor(Math.sqrt(rest));
        if (xo > xi) {
          c.fillRect(cx - xo, cy + y, xo - xi, 1);
          c.fillRect(cx + xi + 1, cy + y, xo - xi, 1);
        }
      }
    }
  },

  _stamp(r, color, inner) {
    const c = document.createElement('canvas');
    c.width = c.height = r * 2 + 1;
    const k = c.getContext('2d');
    k.fillStyle = color;
    this._spans(k, r, r, r, inner);
    return c;
  },

  // 꽉 찬 도트 원. 같은 크기·색은 한 번만 만들어 두고 다시 쓴다.
  disc(bx, by, r, color) {
    if (r <= 0) {
      this.g.fillStyle = color;
      this.g.fillRect(bx, by, 1, 1);
      return;
    }
    const set = this.discs[color] || (this.discs[color] = []);
    const c = set[r] || (set[r] = this._stamp(r, color, -1));
    this.g.drawImage(c, bx - r, by - r);
  },

  // 도트 고리. 큰 고리(각성 충격파 등)는 드물어서 그때그때 직접 그린다.
  ring(bx, by, r, color, thick) {
    if (r < 1) return;
    const inner = Math.max(0, r - thick);
    if (r > 48) {
      this.g.fillStyle = color;
      this._spans(this.g, bx, by, r, inner);
      return;
    }
    const key = color + thick;
    const set = this.rings[key] || (this.rings[key] = []);
    const c = set[r] || (set[r] = this._stamp(r, color, inner));
    this.g.drawImage(c, bx - r, by - r);
  },

  // 계단 모양 직선 (굵기 thick 픽셀)
  line(x0, y0, x1, y1, color, thick) {
    const g = this.g;
    g.fillStyle = color;
    const h = thick >> 1;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      g.fillRect(x0 - h, y0 - h, thick, thick);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  },

  // ---- 조명 ----
  // 가운데는 완전히 밝고 가장자리로 갈수록 계단식으로 어두워지는 빛 도장. 계단 사이는 점무늬(디더)로 잇는다.
  _lightStamp(r) {
    const size = r * 2;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const k = c.getContext('2d');
    const img = k.createImageData(size, size);
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const steps = 5;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
        if (d >= 1) continue;
        const v = Math.min(1, (1 - d) / 0.62) * steps; // 안쪽 38%는 가장 밝다
        let level = Math.floor(v);
        if (v - level > (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16) level++;
        img.data[(y * size + x) * 4 + 3] = Math.round((Math.min(steps, level) / steps) * 255);
      }
    }
    k.putImageData(img, 0, 0);
    return c;
  },

  _lightOf(r) {
    const i = Math.max(1, Math.round(r / 4)); // 반지름을 4픽셀 단위로 묶어 도장 수를 줄인다
    return this.stamps[i] || (this.stamps[i] = this._lightStamp(i * 4));
  },

  // 이번 프레임에 이 자리(세계 좌표)가 반지름 radius(세계)만큼 밝다고 등록한다
  light(wx, wy, radius) {
    const L = this.lights[this.lightCount] || (this.lights[this.lightCount] = { x: 0, y: 0, r: 0 });
    L.x = this.X(wx);
    L.y = this.Y(wy);
    L.r = radius * 0.5;
    this.lightCount++;
  },

  // 어둠을 깔고 빛이 닿는 자리를 뚫은 뒤 세계 위에 덮는다. 이 뒤에 그리는 것은 스스로 빛나는 것(탄, 숫자)이다.
  drawDarkness() {
    const C = CONFIG.light;
    const d = this.dg;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, this.bw, this.bh);
    d.fillStyle = `rgba(${C.color}, ${C.ambient})`;
    d.fillRect(0, 0, this.bw, this.bh);
    d.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < this.lightCount; i++) {
      const L = this.lights[i];
      if (!this.onScreen(L.x, L.y, L.r)) continue;
      const s = this._lightOf(L.r);
      d.drawImage(s, L.x - (s.width >> 1), L.y - (s.height >> 1));
    }
    this.g.drawImage(this.dark, 0, 0);
  },

  // 색이 있는 빛무리. 가산 합성('lighter') 상태에서 부르면 겹칠수록 밝아진다.
  glow(bx, by, r, color) {
    const set = this.glows[color] || (this.glows[color] = []);
    const i = Math.max(1, Math.round(r / 4));
    let c = set[i];
    if (!c) {
      const s = this._lightOf(i * 4);
      c = set[i] = document.createElement('canvas');
      c.width = c.height = s.width;
      const k = c.getContext('2d');
      k.fillStyle = color;
      k.fillRect(0, 0, c.width, c.height);
      k.globalCompositeOperation = 'destination-in'; // 빛 도장 모양만 남긴다
      k.drawImage(s, 0, 0);
    }
    this.g.drawImage(c, bx - (c.width >> 1), by - (c.height >> 1));
  },

  // 화면 가장자리를 점무늬로 물들인다 (피격·경고·각성 섬광). color = [r, g, b], alpha = 세기(0~1)
  edge(color, alpha) {
    if (alpha <= 0.01) return;
    const key = color.join(',');
    let c = this.edges[key];
    if (!c) {
      const w = this.bw;
      const h = this.bh;
      c = this.edges[key] = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const k = c.getContext('2d');
      const img = k.createImageData(w, h);
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const reach = Math.min(w, h) * 0.3; // 가장자리에서 이만큼 안쪽까지 물든다
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = Math.min(x, y, w - 1 - x, h - 1 - y) / reach;
          if (d >= 1) continue;
          const v = (1 - d) * (1 - d) * 4;
          let level = Math.floor(v);
          if (v - level > (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16) level++;
          if (!level) continue;
          const i = (y * w + x) * 4;
          img.data[i] = color[0];
          img.data[i + 1] = color[1];
          img.data[i + 2] = color[2];
          img.data[i + 3] = Math.min(255, level * 64);
        }
      }
      k.putImageData(img, 0, 0);
    }
    this.g.globalAlpha = Math.min(1, alpha);
    this.g.drawImage(c, 0, 0);
    this.g.globalAlpha = 1;
  },

  // 그림판을 정수 배로 확대해 화면에 붙인다
  present() {
    this.out.drawImage(this.buf, 0, 0, this.bw * this.K, this.bh * this.K);
  },
};
