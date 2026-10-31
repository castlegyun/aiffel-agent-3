// 바닥 아이템: 포션(체력 회복)과 자석(경험치 구슬 전부 흡수).
// 일정 시간마다 플레이어 주변 무작위 위치에 생기고, 화면 밖이면 가장자리에 방향 화살표가 뜬다.

const ITEM_LOOK = {
  potion: { sprite: 'potion', scale: 3, glow: '255, 70, 50', icon: '✚' },
  magnet: { sprite: 'magnet', scale: 3, glow: '120, 180, 255', icon: '◎' },
};

class Pickup {
  constructor(type, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.t = Math.random() * Math.PI * 2; // 둥실거리는 박자
  }

  // 플레이어가 주웠으면 true
  update(dt, player) {
    this.t += dt * 3;
    return Math.hypot(player.x - this.x, player.y - this.y) < CONFIG.items.radius + player.radius;
  }

  draw(ctx) {
    const L = ITEM_LOOK[this.type];
    const S = Sprites[L.sprite];
    const w = S.w * L.scale;
    const h = S.h * L.scale;
    const bob = Math.sin(this.t) * 3;

    // 바닥 그림자
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + h * 0.35, w * 0.4, w * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    // 맥동하는 빛 (가산 합성)
    const pulse = 0.75 + Math.sin(this.t * 1.5) * 0.25;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${L.glow}, ${0.28 * pulse})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y + bob, w * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(S.frames[0], this.x - w / 2, this.y - h / 2 + bob, w, h);
  }
}

const Items = {
  list: [],
  timers: { potion: 0, magnet: 0 },

  reset() {
    this.list.length = 0;
    for (const type in this.timers) this.timers[type] = CONFIG.items[type].interval;
  },

  // hooks: { potion(), magnet() } 줍는 순간 실행할 효과
  update(dt, player, hooks) {
    for (const type in this.timers) {
      this.timers[type] -= dt;
      if (this.timers[type] <= 0) {
        this.timers[type] += CONFIG.items[type].interval;
        this.spawn(type, player);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].update(dt, player)) {
        hooks[this.list[i].type]();
        this.list.splice(i, 1);
      }
    }
  },

  // 플레이어 주변 무작위 위치. 같은 종류가 이미 있으면 옮겨 와서 항상 하나만 존재한다.
  spawn(type, player) {
    const C = CONFIG.items[type];
    this.list = this.list.filter((p) => p.type !== type);
    const a = Math.random() * Math.PI * 2;
    const d = C.minDist + Math.random() * (C.maxDist - C.minDist);
    this.list.push(new Pickup(type, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d));
  },

  draw(ctx) {
    for (const p of this.list) p.draw(ctx);
  },

  // 화면 밖 아이템은 가장자리에 방향 화살표로 알려준다 (화면 좌표로 그린다)
  drawIndicators(ctx, camera, w, h) {
    const mx = 44; // 좌우 여백
    const my = 130; // 위아래 여백: 상단 타이머와 하단 HUD를 피한다
    for (const p of this.list) {
      const sx = p.x - camera.x;
      const sy = p.y - camera.y;
      if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) continue; // 화면 안이면 표시 안 함

      const dx = sx - w / 2;
      const dy = sy - h / 2;
      const t = Math.min((w / 2 - mx) / (Math.abs(dx) || 1e-6), (h / 2 - my) / (Math.abs(dy) || 1e-6));
      const px = w / 2 + dx * t;
      const py = h / 2 + dy * t;
      const L = ITEM_LOOK[p.type];
      const angle = Math.atan2(dy, dx);
      const pulse = 0.8 + Math.sin(p.t * 1.5) * 0.2;

      ctx.save();
      ctx.translate(px, py);
      // 바깥쪽을 가리키는 삼각형
      ctx.rotate(angle);
      ctx.fillStyle = `rgba(${L.glow}, ${0.9 * pulse})`;
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(14, -8);
      ctx.lineTo(14, 8);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(-angle);
      // 아이콘 원
      ctx.fillStyle = 'rgba(13, 8, 7, 0.85)';
      ctx.strokeStyle = `rgba(${L.glow}, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgb(${L.glow})`;
      ctx.font = 'bold 16px "Segoe UI Symbol", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(L.icon, 0, 1);
      ctx.restore();
    }
  },
};
