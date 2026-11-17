// 검수용 갤러리: 주소 끝에 ?gallery 를 붙이면 모든 도트 그림을 크게 늘어놓는다.
// 게임에는 영향이 없고, 그림을 고칠 때 한눈에 확인하려고 둔다.

(function gallery() {
  if (!location.search.includes('gallery')) return;

  const Z = 3; // 확대 배율
  const c = document.createElement('canvas');
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;image-rendering:pixelated';
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#241a15';
  g.fillRect(0, 0, c.width, c.height);

  const put = (f, x, y) => g.drawImage(f.c, f.x, f.y, f.w, f.h, x, y, f.w * Z, f.h * Z);
  const label = (text, x, y) => {
    g.fillStyle = '#e8dca0';
    g.font = '12px monospace';
    g.fillText(text, x, y);
  };

  // 스프라이트: 이름 / 걷기 프레임 / 반전 / 흰 실루엣 / 그림자
  let x = 12;
  let y = 24;
  let rowH = 0;
  for (const name in Sprites) {
    const S = Sprites[name];
    const cells = S.frames.concat([S.flip[0], S.white[0]]);
    const need = cells.length * (S.w * Z + 6) + 24;
    if (x + need > c.width) {
      x = 12;
      y += rowH + 30;
      rowH = 0;
    }
    label(`${name} ${S.w}x${S.h}`, x, y - 6);
    for (const f of cells) {
      put(S.shadow, x + ((S.cx * Z) | 0) - ((S.shadow.w * Z) >> 1), y + S.h * Z - ((S.shadow.h * Z) >> 1));
      put(f, x, y);
      x += S.w * Z + 6;
    }
    x += 24;
    rowH = Math.max(rowH, S.h * Z);
  }

  // 숫자 글꼴, 원·고리, 빛 도장, 바닥 타일
  y += rowH + 36;
  label('숫자 글꼴 / 원 / 고리 / 빛 / 바닥', 12, y - 6);
  const strip = document.createElement('canvas');
  strip.width = 240;
  strip.height = 70;
  const s = strip.getContext('2d');
  s.fillStyle = s.createPattern(Background.tiles[0], 'repeat');
  s.fillRect(0, 0, strip.width, strip.height);
  const keep = Render.g;
  Render.g = s; // 그리기 도우미가 이 캔버스에 찍도록 잠깐 바꿔 끼운다
  PixelFont.draw(s, '0123456789', 30, 4, '#e8dca0', false);
  PixelFont.draw(s, '0123456789', 36, 14, '#ffd23a', true);
  PixelFont.draw(s, '128', 80, 4, '#ff5a44', false);
  for (let r = 0; r <= 6; r++) Render.disc(8 + r * 12, 36, r, '#ffb43a');
  for (let r = 2; r <= 10; r += 2) Render.ring(100 + r * 9, 40, r, '#aef0ff', r > 6 ? 2 : 1);
  s.globalCompositeOperation = 'lighter';
  Render.glow(210, 30, 24, '#7a3408');
  s.globalCompositeOperation = 'source-over';
  Render.line(8, 56, 70, 64, '#ff5a3c', 1);
  Render.line(80, 64, 140, 54, '#c4221a', 3);
  Render.g = keep;
  g.drawImage(strip, 12, y, strip.width * Z, strip.height * Z);

  // 아이콘 (HTML의 HUD·카드에서 쓰는 그림)
  let ix = strip.width * Z + 40;
  let iy = y;
  for (const name in ICON_ROWS) {
    const img = new Image();
    const px = ix;
    const py = iy;
    img.onload = () => g.drawImage(img, px, py, 48, 48);
    img.src = Icons.url(name);
    label(name, ix, iy + 60);
    ix += 70;
    if (ix + 70 > c.width) { ix = strip.width * Z + 40; iy += 80; }
  }
})();
