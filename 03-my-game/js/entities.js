class Player {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.radius = CONFIG.player.radius;
    this.speed = CONFIG.player.speed;
    this.hp = CONFIG.player.maxHp;
    this.maxHp = CONFIG.player.maxHp;
    this.facing = 1;     // 1: 오른쪽, -1: 왼쪽
    this.moving = false;
    this.walkTime = 0;   // 걷기 애니메이션 타이머
    this.invuln = 0;     // 남은 무적 시간(초)
    this.magnet = CONFIG.player.magnet;
    this.level = 1;
    this.xp = 0;
    this.upgradeLevels = {}; // 강화 카드별로 몇 번 골랐는지
  }

  get xpToNext() {
    return CONFIG.xp.base + (this.level - 1) * CONFIG.xp.growth;
  }

  // 경험치를 얻고, 오른 레벨 수를 돌려준다(한 번에 여러 레벨이 오를 수 있다)
  gainXp(amount) {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      gained++;
    }
    return gained;
  }

  // 무적 중이면 피해를 무시한다. 실제로 맞았으면 true.
  takeDamage(amount) {
    if (this.invuln > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = CONFIG.player.invuln;
    // 피격 연출: 화면 흔들림 + 붉은 비네팅 + 숫자 + 소리
    Effects.shake(CONFIG.fx.hurtShake.amp, CONFIG.fx.hurtShake.dur);
    Effects.number(this.x, this.y - 44, amount, '#ff5a44', true);
    UI.hurtFlash();
    Sfx.hurt();
    return true;
  }

  update(dt, input) {
    if (this.invuln > 0) this.invuln -= dt;
    let dx = input.x;
    let dy = input.y;
    const len = Math.hypot(dx, dy);
    this.moving = len > 0;
    if (this.moving) {
      // 대각선도 같은 속도가 되도록 정규화
      dx /= len;
      dy /= len;
      this.x += dx * this.speed * dt;
      this.y += dy * this.speed * dt;
      if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
      this.walkTime += dt;
    } else {
      this.walkTime = 0;
    }
  }

  draw(g) {
    const S = Sprites.wizard;
    const i = this.moving ? Math.floor(this.walkTime / CONFIG.player.stepTime) % S.frames.length : 0;
    const bob = i & 1; // 발을 든 프레임에서는 한 칸 들썩인다
    const bx = Render.X(this.x);
    const foot = Render.Y(this.y) + Math.round(this.radius * 0.45);

    Render.spr(S.shadow, bx - (S.shadow.w >> 1), foot - (S.shadow.h >> 1));
    // 무적 중에는 깜빡여서 맞았음을 알려준다
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) g.globalAlpha = 0.35;
    // 이동 방향에 맞춰 미리 뒤집어 둔 그림을 고른다. 몸의 중심(cx)이 발 위치에 오게 놓는다.
    if (this.facing > 0) Render.spr(S.frames[i], bx - S.cx, foot - S.h - bob);
    else Render.spr(S.flip[i], bx - (S.w - S.cx), foot - S.h - bob);
    g.globalAlpha = 1;
  }

  // 머리 위 칸 나누기 체력바. 적·탄에 가려지지 않게 main.js에서 맨 위에 따로 그린다.
  drawHpBar(g) {
    const B = CONFIG.player.hpBar;
    const cells = Math.ceil(this.maxHp / B.segmentHp);
    const cellW = Math.max(2, Math.floor((B.width - (cells - 1)) / cells)); // 칸 사이는 1픽셀
    const width = cells * cellW + cells - 1;
    const foot = Render.Y(this.y) + Math.round(this.radius * 0.45);
    const x = Render.X(this.x) - (width >> 1);
    const y = foot - Sprites.wizard.h - B.offset - B.height;

    // 테두리 + 바탕
    Render.rect(x - 1, y - 1, width + 2, B.height + 2, '#0d0807');
    for (let i = 0; i < cells; i++) {
      const cx = x + i * (cellW + 1);
      // 이 칸에 차 있는 비율(0~1): 마지막으로 깎이는 칸은 부분만 채운다
      const fill = Math.min(1, Math.max(0, (this.hp - i * B.segmentHp) / B.segmentHp));
      const w = Math.ceil(cellW * fill);
      Render.rect(cx, y, cellW, B.height, '#2a1210');
      if (w > 0) {
        Render.rect(cx, y, w, B.height, '#c42a1e');
        Render.rect(cx, y, w, 1, '#ff6a50'); // 윗면 하이라이트
      }
    }
  }
}

class Enemy {
  constructor(type, x, y, hpMul = 1) {
    const T = type === 'boss' ? CONFIG.boss : CONFIG.enemies[type];
    this.type = type;
    this.cfg = T;
    this.isBoss = type === 'boss';
    this.x = x;
    this.y = y;
    this.radius = T.radius;
    this.baseSpeed = T.speed;
    this.speed = T.speed;
    this.hp = T.hp * hpMul;
    this.maxHp = this.hp;
    this.damage = T.damage; // 닿았을 때 주는 피해
    this.xp = T.xp;
    this.sprite = Sprites[T.sprite];
    this.facing = 1;
    this.anim = Math.random(); // 적마다 걷는 박자를 다르게
    this.sepScale = this.isBoss ? 0.15 : 1; // 군집 이동에 밀리는 정도
    this.dashing = false;      // 돌진 중에는 밀리지 않고 속도 제한도 없다
    this.telegraph = null;     // 돌진 예고선 { dx, dy, len, progress }
    this.flash = 0;            // 맞은 뒤 하얗게 번쩍이는 남은 시간
    this.age = 0;              // 생겨난 뒤 지난 시간(초)
    this.phase = 1;            // 보스 페이즈
    AI.initBehavior(this);
  }

  // sep: AI.separation()이 계산한 밀어내는 벡터, world: 탄 발사·적 소환 등 바깥 세계와 닿는 창구
  update(dt, player, sep, world) {
    // 시간에 따른 속도 증가 (보스는 자체 페이즈 속도를 쓴다)
    if (!this.isBoss) this.speed = this.baseSpeed * world.speedMul;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const c = AI.ctx;
    c.player = player;
    c.dist = dist;
    c.tx = dist > 0 ? dx / dist : 0;
    c.ty = dist > 0 ? dy / dist : 0;
    c.world = world;
    c.out.x = 0;
    c.out.y = 0;
    AI.behaviors[this.cfg.behavior || 'chase'](this, dt, c);

    const k = CONFIG.separation.strength * (this.dashing ? 0 : this.sepScale);
    let vx = c.out.x + sep.x * this.speed * k;
    let vy = c.out.y + sep.y * this.speed * k;
    if (!this.dashing) {
      const m = Math.hypot(vx, vy);
      const max = this.speed * 1.5;
      if (m > max) {
        vx = (vx / m) * max;
        vy = (vy / m) * max;
      }
    }
    this.x += vx * dt;
    this.y += vy * dt;

    if (Math.abs(c.tx) > 0.1) this.facing = c.tx > 0 ? 1 : -1;
    this.anim += dt;
    if (this.flash > 0) this.flash -= dt;
    this.age += dt;
  }

  // 바닥에 깔리는 돌진 예고선: 달려갈 길을 붉은 띠로 보여 주고, 돌진이 가까울수록 진해진다
  drawGround(g) {
    const t = this.telegraph;
    if (!t) return;
    const x0 = Render.X(this.x);
    const y0 = Render.Y(this.y + this.radius * 0.6);
    const x1 = Render.X(this.x + t.dx * t.len);
    const y1 = Render.Y(this.y + this.radius * 0.6 + t.dy * t.len);
    const thick = Math.max(3, Math.round(this.radius * 0.8));
    g.globalAlpha = 0.14 + 0.3 * t.progress;
    Render.line(x0, y0, x1, y1, '#c4221a', thick);
    g.globalAlpha = 0.45 + 0.5 * t.progress;
    Render.line(x0, y0, x1, y1, '#ff5a3c', 1);
    g.globalAlpha = 1;
  }

  draw(g) {
    const S = this.phase === 2 && this.cfg.sprite2 ? Sprites[this.cfg.sprite2] : this.sprite;
    const i = Math.floor(this.anim / CONFIG.player.stepTime) % S.frames.length;
    const bx = Render.X(this.x);
    const foot = Render.Y(this.y) + Math.round(this.radius * 0.45);
    Render.spr(S.shadow, bx - (S.shadow.w >> 1), foot - (S.shadow.h >> 1));
    // 맞은 직후에는 같은 모양의 하얀 실루엣으로 바꿔 그려 번쩍이게 한다
    const set = this.flash > 0
      ? (this.facing > 0 ? S.white : S.whiteFlip)
      : (this.facing > 0 ? S.frames : S.flip);
    Render.spr(set[i], bx - (this.facing > 0 ? S.cx : S.w - S.cx), foot - S.h);
  }
}

// 적이 쏘는 탄. 플레이어에게만 맞는다.
class EnemyProjectile {
  constructor(x, y, dirX, dirY, speed, damage) {
    this.x = x;
    this.y = y;
    this.vx = dirX * speed;
    this.vy = dirY * speed;
    this.radius = 6;
    this.damage = damage;
    this.life = 4;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  // 붉은 빛무리 (가산 합성 상태에서 부른다)
  drawGlow(g) {
    Render.glow(Render.X(this.x), Render.Y(this.y), 8, '#7a1420');
  }

  draw() {
    const bx = Render.X(this.x);
    const by = Render.Y(this.y);
    Render.disc(bx, by, 4, '#2a0a10'); // 어두운 테두리: 플레이어의 주황 탄과 구분
    Render.disc(bx, by, 3, '#e02a3a');
    Render.rect(bx - 1, by - 2, 2, 2, '#ff9a8a');
  }
}

class Projectile {
  constructor(x, y, dirX, dirY, stats) {
    this.x = x;
    this.y = y;
    this.vx = dirX * stats.speed;
    this.vy = dirY * stats.speed;
    this.radius = stats.radius;
    this.damage = stats.damage;
    this.life = stats.range / stats.speed; // 남은 수명(초)
    this.dead = false;
    this.pierce = stats.pierce || 0;               // 더 뚫을 수 있는 적 수
    this.hit = this.pierce > 0 ? new Set() : null; // 이미 맞힌 적(같은 적을 두 번 때리지 않게)
    this.beam = !!stats.beam;                      // 진화한 레이저 모양
    this.splash = stats.splash || 0;               // 맞았을 때 터지는 폭발 반경
    this.splashMul = stats.splashMul || 0;
    this.aw = stats.aw || 0;                       // 스킬 공명 단계 (금빛 이펙트)
    this.trail = [];                               // 지나온 자리 (꼬리 그리기용)
  }

  update(dt) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 9) this.trail.shift();
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  // 불꽃 꼬리와 빛무리 (가산 합성 상태에서 부른다: 겹치면 더 밝아진다)
  drawGlow(g) {
    const bx = Render.X(this.x);
    const by = Render.Y(this.y);
    const r = Math.max(1, Math.round(this.radius * 0.5));
    if (this.beam) {
      // 진행 방향으로 길게 늘어난 빛줄기
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const tx = Render.X(this.x - (this.vx / sp) * 52);
      const ty = Render.Y(this.y - (this.vy / sp) * 52);
      if (this.aw) Render.line(tx, ty, bx, by, '#5a4410', r * 2 + 3); // 공명: 금빛 후광
      Render.line(tx, ty, bx, by, '#7a3408', r * 2 + 1);
      Render.glow(bx, by, r * 4, '#7a3408');
      return;
    }
    // 뒤로 갈수록 작고 어두워지는 불씨
    for (let i = 0; i < this.trail.length; i += 2) {
      const k = (i + 1) / (this.trail.length + 1);
      Render.disc(Render.X(this.trail[i].x), Render.Y(this.trail[i].y), Math.round(r * k), k < 0.5 ? '#5a1c08' : '#8a3a0c');
    }
    Render.glow(bx, by, r * 4, this.aw ? '#8a6a20' : '#7a3408'); // 공명하면 금빛
  }

  draw() {
    const bx = Render.X(this.x);
    const by = Render.Y(this.y);
    const r = Math.max(1, Math.round(this.radius * 0.5));
    if (this.beam) {
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const tx = Render.X(this.x - (this.vx / sp) * 52);
      const ty = Render.Y(this.y - (this.vy / sp) * 52);
      Render.line(tx, ty, bx, by, '#ffb43a', Math.max(2, r));
      Render.line(tx, ty, bx, by, '#fff4c8', 1);
      Render.disc(bx, by, r, '#fff4c8');
      return;
    }
    Render.disc(bx, by, r, '#ff7a1a');
    Render.disc(bx, by, r - 1, '#ffb43a');
    if (r > 2) Render.disc(bx, by, r - 2, '#fff4c8');
  }
}

// 적이 죽을 때 떨어뜨리는 경험치 보석. 플레이어가 가까이 오면 끌려간다.
class Gem {
  constructor(x, y, value) {
    this.x = x;
    this.y = y;
    this.value = value;
    this.radius = CONFIG.gem.radius;
    this.pulled = false; // 한 번 끌리기 시작하면 끝까지 따라간다
    this.speed = CONFIG.gem.pullSpeed;
    this.t = Math.random() * Math.PI * 2; // 둥실거리는 박자
  }

  // 플레이어가 주웠으면 true
  update(dt, player) {
    this.t += dt * 4;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.hypot(dx, dy);
    if (!this.pulled && d < player.magnet) this.pulled = true;
    if (this.pulled && d > 0) {
      this.speed += CONFIG.gem.pullAccel * dt;
      this.x += (dx / d) * this.speed * dt;
      this.y += (dy / d) * this.speed * dt;
    }
    return d < player.radius + this.radius;
  }

  draw() {
    const S = Sprites.gem;
    const bx = Render.X(this.x);
    const by = Render.Y(this.y);
    if (!Render.onScreen(bx, by, 8)) return;
    Render.light(this.x, this.y, CONFIG.light.gem); // 어둠 속에서도 보석 주변은 은은하게 밝다
    const bob = Math.sin(this.t) > 0.3 ? -1 : 0;    // 둥실거림
    Render.spr(S.shadow, bx - (S.shadow.w >> 1), by + 3);
    Render.spr(S.frames[0], bx - S.cx, by - (S.h >> 1) + bob);
  }
}
