// 바닥 아이템: 포션(체력 회복), 자석(경험치 구슬 전부 흡수), 폭탄(화면의 적에게 큰 피해), 상자(정예·보스가 떨어뜨림).
// 포션·자석·폭탄은 일정 시간마다 플레이어 주변 무작위 위치에 생기고, 화면 밖이면 가장자리에 방향 표시가 뜬다.

const ITEM_LOOK = {
  potion: { sprite: 'potion', glow: '#7a1c14', mark: '#ff5a44' },
  magnet: { sprite: 'magnet', glow: '#24406a', mark: '#78b4ff' },
  bomb:   { sprite: 'bomb',   glow: '#6a3408', mark: '#ffb43a' },
  chest:  { sprite: 'chest',  glow: '#6a5418', mark: '#ffd23a' },
};

class Pickup {
  // count: 상자에 든 보상 수 (상자만 쓴다)
  constructor(type, x, y, count) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.count = count || 0;
    this.t = Math.random() * Math.PI * 2; // 둥실거리는 박자
  }

  // 플레이어가 주웠으면 true
  update(dt, player) {
    this.t += dt * 3;
    return Math.hypot(player.x - this.x, player.y - this.y) < CONFIG.items.radius + player.radius;
  }

  // 빛무리 (가산 합성 상태에서 부른다)
  drawGlow() {
    Render.glow(Render.X(this.x), Render.Y(this.y), Math.sin(this.t * 1.5) > 0 ? 16 : 12, ITEM_LOOK[this.type].glow);
  }

  draw() {
    const S = Sprites[ITEM_LOOK[this.type].sprite];
    const bx = Render.X(this.x);
    const by = Render.Y(this.y);
    if (!Render.onScreen(bx, by, 16)) return;
    Render.light(this.x, this.y, CONFIG.light.item);
    const bob = this.type === 'chest' ? 0 : Math.round(Math.sin(this.t) * 1.5); // 둥실거림 (상자는 바닥에 놓여 있다)
    Render.spr(S.shadow, bx - (S.shadow.w >> 1), by + (S.h >> 1) + 1);
    Render.spr(S.frames[0], bx - S.cx, by - (S.h >> 1) + bob);
  }
}

const Items = {
  list: [],
  timers: { potion: 0, magnet: 0, bomb: 0 },

  reset() {
    this.list.length = 0;
    for (const type in this.timers) this.timers[type] = CONFIG.items[type].interval;
  },

  // hooks: { potion(), magnet(), bomb(), chest(count) } 줍는 순간 실행할 효과
  update(dt, player, hooks) {
    for (const type in this.timers) {
      this.timers[type] -= dt;
      if (this.timers[type] <= 0) {
        this.timers[type] += CONFIG.items[type].interval;
        this.spawn(type, player);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.update(dt, player)) {
        this.list.splice(i, 1);
        hooks[p.type](p.count);
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

  // 정예·보스가 쓰러진 자리에 상자를 놓는다
  dropChest(x, y, count) {
    this.list.push(new Pickup('chest', x, y, count));
  },

  draw() {
    for (const p of this.list) p.draw();
  },

  drawGlow() {
    for (const p of this.list) p.drawGlow();
  },

  // 화면 밖 아이템은 가장자리에 아이템 그림과 방향 표시로 알려준다 (그림판 좌표로 그린다)
  drawIndicators() {
    const mx = 16; // 좌우 여백
    const my = 44; // 위아래 여백: 상단 타이머와 하단 HUD를 피한다
    const w = Render.bw;
    const h = Render.bh;
    for (const p of this.list) {
      const sx = Render.X(p.x);
      const sy = Render.Y(p.y);
      if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) continue; // 화면 안이면 표시 안 함

      const dx = sx - w / 2;
      const dy = sy - h / 2;
      const t = Math.min((w / 2 - mx) / (Math.abs(dx) || 1e-6), (h / 2 - my) / (Math.abs(dy) || 1e-6));
      const px = Math.round(w / 2 + dx * t);
      const py = Math.round(h / 2 + dy * t);
      const L = ITEM_LOOK[p.type];
      const S = Sprites[L.sprite];
      const d = Math.hypot(dx, dy) || 1;
      const blink = Math.sin(p.t * 1.5) > 0;

      // 어두운 원판 위에 아이템 그림, 바깥쪽으로 점 세 개가 방향을 가리킨다
      Render.disc(px, py, 10, '#0d0807');
      Render.ring(px, py, 10, blink ? L.mark : '#4a3f38', 1);
      Render.spr(S.frames[0], px - S.cx, py - (S.h >> 1));
      for (let i = 0; i < 3; i++) {
        const k = 13 + i * 3;
        Render.rect(Math.round(px + (dx / d) * k), Math.round(py + (dy / d) * k), 2 - (i >> 1), 2 - (i >> 1), L.mark);
      }
    }
  },
};
