// 게임에 등장하는 것들: 플레이어, 적, 적의 탄, 불꽃탄, 경험치 보석.
// 위치·속도는 세계 좌표, 그릴 때만 Render가 그림판 픽셀로 옮긴다.

class Player {
  constructor() {
    const P = CONFIG.player;
    this.x = 0;
    this.y = 0;
    this.radius = P.radius;
    this.speed = P.speed;
    this.hp = P.maxHp;
    this.maxHp = P.maxHp;
    this.facing = 1;     // 1: 오른쪽, -1: 왼쪽
    this.dirX = 1;       // 마지막으로 움직인 방향 (가만히 서서 점멸할 때 쓴다)
    this.dirY = 0;
    this.moving = false;
    this.walkTime = 0;   // 걷기 애니메이션 타이머
    this.invuln = 0;     // 남은 무적 시간(초)
    this.magnet = P.magnet;
    this.regen = 0;      // 초당 체력 회복 (재생 패시브)
    this.armor = 0;      // 받는 피해 감소 비율 (방어 패시브)
    this.growth = 0;     // 경험치 추가 비율 (성장 패시브)
    this.dashCd = 0;     // 점멸을 다시 쓸 수 있을 때까지 남은 시간
    this.level = 1;
    this.xp = 0;
  }

  get xpToNext() {
    const X = CONFIG.xp;
    const n = this.level - 1;
    return Math.round(X.base + n * X.growth + n * n * X.curve);
  }

  // 경험치를 얻고, 오른 레벨 수를 돌려준다(한 번에 여러 레벨이 오를 수 있다)
  gainXp(amount) {
    this.xp += amount * (1 + this.growth);
    let gained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      gained++;
    }
    return gained;
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  // 무적 중이면 피해를 무시한다. 실제로 맞았으면 true.
  takeDamage(amount) {
    if (this.invuln > 0) return false;
    amount = Math.max(1, amount * (1 - this.armor));
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = CONFIG.player.invuln;
    // 피격 연출: 화면이 멈칫하고 흔들린다 + 붉은 가장자리 + 숫자 + 소리
    Effects.shake(CONFIG.fx.hurtShake.amp, CONFIG.fx.hurtShake.dur);
    Effects.stop(CONFIG.fx.hitStop.hurt);
    Effects.number(this.x, this.y - 50, amount, '#ff5a44', true);
    Effects.pulse([196, 34, 26], 0.6, 0.4);
    Sfx.hurt();
    return true;
  }

  // 점멸: 가는 방향(가만히 있으면 마지막으로 본 방향)으로 순간이동한다. 썼으면 true.
  dash() {
    const D = CONFIG.player.dash;
    if (this.dashCd > 0) return false;
    const S = Sprites.wizard;
    const set = this.facing > 0 ? S.white : S.whiteFlip;
    const cx = this.facing > 0 ? S.cx : S.w - S.cx;
    const foot = this.y + this.radius * 0.9;
    // 지나간 길에 잔상을 남긴다
    for (let i = 0; i < 5; i++) {
      const k = (i / 5) * D.distance;
      Effects.ghost(set[0], this.x + this.dirX * k, foot + this.dirY * k, cx);
    }
    Effects.burst(this.x, this.y, 10, ['#aef0ff', '#ffffff', '#6aa8ff'], 160, 0.35, 0);
    this.x += this.dirX * D.distance;
    this.y += this.dirY * D.distance;
    Effects.ring(this.x, this.y, 60, '174, 240, 255', 0.25);
    Effects.burst(this.x, this.y, 10, ['#aef0ff', '#ffffff', '#6aa8ff'], 160, 0.35, 0);
    this.invuln = Math.max(this.invuln, D.invuln);
    this.dashCd = D.cooldown;
    Sfx.blink();
    return true;
  }

  update(dt, input) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.regen > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
    let dx = input.x;
    let dy = input.y;
    const len = Math.hypot(dx, dy);
    this.moving = len > 0;
    if (this.moving) {
      // 대각선도 같은 속도가 되도록 정규화
      dx /= len;
      dy /= len;
      this.dirX = dx;
      this.dirY = dy;
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
  drawHpBar() {
    const B = CONFIG.player.hpBar;
    const cells = Math.ceil(this.maxHp / B.segmentHp);
    const cellW = Math.max(2, Math.floor((B.width - (cells - 1)) / cells)); // 칸 사이는 1픽셀
    const width = cells * cellW + cells - 1;
    const foot = Render.Y(this.y) + Math.round(this.radius * 0.45);
    const x = Render.X(this.x) - (width >> 1);
    const y = foot - Sprites.wizard.h - B.offset - B.height;

    Render.rect(x - 1, y - 1, width + 2, B.height + 2, '#0d0807'); // 테두리
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
    // 점멸 쿨다운: 체력바 아래의 가는 푸른 줄이 다 차면 다시 쓸 수 있다
    const D = CONFIG.player.dash;
    const ready = 1 - Math.max(0, this.dashCd) / D.cooldown;
    Render.rect(x, y + B.height + 1, Math.round(width * ready), 1, ready >= 1 ? '#aef0ff' : '#3a6aa8');
  }
}

class Enemy {
  // opt: { hpMul 체력 배율, elite 정예 여부, rise 땅에서 솟아오르며 등장 }
  constructor(type, x, y, opt = {}) {
    const T = CONFIG.bosses[type] || CONFIG.enemies[type];
    this.type = type;
    this.cfg = T;
    this.isBoss = !!CONFIG.bosses[type];
    this.x = x;
    this.y = y;
    this.radius = T.radius;
    this.baseSpeed = T.speed;
    this.speed = T.speed;
    this.hp = T.hp * (opt.hpMul || 1);
    this.damage = T.damage; // 닿았을 때 주는 피해
    this.xp = T.xp;
    this.mass = T.mass || 1;   // 넉백에 버티는 정도
    this.sprite = Sprites[this.isBoss ? T.sprites[0] : T.sprite];
    this.facing = 1;
    this.anim = Math.random(); // 적마다 걷는 박자를 다르게
    this.sepScale = this.isBoss ? 0.15 : 1; // 군집 이동에 밀리는 정도
    this.dashing = false;      // 돌진 중에는 밀리지 않고 속도 제한도 없다
    this.telegraph = null;     // 돌진 예고선 { dx, dy, len, progress }
    this.tele = null;          // 원형 예고 { r, progress } (자폭, 내려찍기, 소환)
    this.flash = 0;            // 맞은 뒤 하얗게 번쩍이는 남은 시간
    this.age = 0;              // 생겨난 뒤 지난 시간(초)
    this.phase = 1;            // 보스 페이즈
    this.kvx = 0;              // 넉백으로 밀리는 속도
    this.kvy = 0;
    this.slowT = 0;            // 둔화가 남은 시간과 그 배율
    this.slowMul = 1;
    this.frozenT = 0;          // 얼어붙어 멈춘 시간
    this.spawnT = opt.rise ? CONFIG.spawn.spawnIn : 0; // 땅에서 솟아오르는 중
    this.num = null;           // 머리 위에 떠 있는 데미지 숫자 (연달아 맞으면 합친다)
    this.dead = false;         // 죽지 않고 그냥 사라져야 할 때 (박쥐가 화면을 다 지나갔을 때 등)
    this.elite = false;
    this.affix = null;

    if (opt.elite) {
      const E = CONFIG.elite;
      this.elite = true;
      this.affix = E.affixes[(Math.random() * E.affixes.length) | 0];
      this.hp *= E.hpMul * (this.affix === 'tank' ? 1.6 : 1);
      this.damage *= E.damageMul;
      this.xp *= E.xpMul;
      this.mass *= E.massMul;
      if (this.affix === 'swift') this.baseSpeed *= 1.35;
      goldOf(this.sprite);
    }
    this.maxHp = this.hp;
    AI.initBehavior(this);
  }

  // 느리게 만든다. 더 강한 둔화가 이미 걸려 있으면 그쪽을 유지한다.
  slow(mul, time) {
    if (this.isBoss) mul = Math.max(mul, 0.8); // 보스는 조금만 느려진다
    this.slowMul = this.slowT > 0 ? Math.min(this.slowMul, mul) : mul;
    this.slowT = Math.max(this.slowT, time);
  }

  freeze(time) {
    if (!this.isBoss) this.frozenT = Math.max(this.frozenT, time); // 보스는 얼지 않는다
  }

  // sep: AI.separation()이 계산한 밀어내는 벡터, world: 탄 발사·적 소환 등 바깥 세계와 닿는 창구
  update(dt, player, sep, world) {
    this.age += dt;
    this.anim += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.slowT > 0) this.slowT -= dt;

    // 넉백: 맞은 방향으로 밀리다가 빠르게 멈춘다
    this.x += this.kvx * dt;
    this.y += this.kvy * dt;
    const drag = Math.max(0, 1 - 9 * dt);
    this.kvx *= drag;
    this.kvy *= drag;

    if (this.spawnT > 0) { this.spawnT -= dt; return; }   // 솟아오르는 동안은 움직이지 않는다
    if (this.frozenT > 0) { this.frozenT -= dt; this.anim -= dt; return; }

    const slow = this.slowT > 0 ? this.slowMul : 1;
    const rage = this.isBoss ? 1 + (this.phase - 1) * CONFIG.bossRage.speed : world.speedMul;
    this.speed = this.baseSpeed * rage * slow;

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

    const k = CONFIG.separation.strength * (this.dashing || this.cfg.noSep ? 0 : this.sepScale);
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
    if (Math.abs(c.tx) > 0.1 && this.cfg.behavior !== 'fly') this.facing = c.tx > 0 ? 1 : -1;
  }

  // 바닥에 깔리는 예고 표시: 돌진할 길(붉은 띠), 터질 범위(붉은 원). 때가 가까울수록 진해진다.
  drawGround(g) {
    const t = this.telegraph;
    if (t) {
      const x0 = Render.X(this.x);
      const y0 = Render.Y(this.y + this.radius * 0.6);
      const x1 = Render.X(this.x + t.dx * t.len);
      const y1 = Render.Y(this.y + this.radius * 0.6 + t.dy * t.len);
      g.globalAlpha = 0.14 + 0.3 * t.progress;
      Render.line(x0, y0, x1, y1, '#c4221a', Math.max(3, Math.round(this.radius * 0.8)));
      g.globalAlpha = 0.45 + 0.5 * t.progress;
      Render.line(x0, y0, x1, y1, '#ff5a3c', 1);
      g.globalAlpha = 1;
    }
    const c = this.tele;
    if (c) {
      const bx = Render.X(this.x);
      const by = Render.Y(this.y + this.radius * 0.5);
      const r = Math.round(c.r * 0.5);
      g.globalAlpha = 0.1 + 0.22 * c.progress;
      Render.disc(bx, by, Math.round(r * c.progress), '#c4221a');
      g.globalAlpha = 0.5 + 0.5 * c.progress;
      Render.ring(bx, by, r, '#ff5a3c', 1);
      g.globalAlpha = 1;
    }
  }

  draw(g) {
    const S = this.sprite;
    const i = Math.floor(this.anim / 0.14) % S.frames.length;
    const bx = Render.X(this.x);
    const float = this.cfg.float ? Math.round(Math.sin(this.age * 2.4) * 2) - 4 : 0; // 떠 있는 적은 둥실거린다
    const foot = Render.Y(this.y) + Math.round(this.radius * 0.45);
    const right = this.facing > 0;
    const left = bx - (right ? S.cx : S.w - S.cx);
    Render.spr(S.shadow, bx - (S.shadow.w >> 1), foot - (S.shadow.h >> 1));

    // 땅에서 솟아오르는 중: 그림의 윗부분만 잘라 그린다
    if (this.spawnT > 0) {
      const f = (right ? S.white : S.whiteFlip)[i];
      const h = Math.max(1, Math.round(S.h * (1 - this.spawnT / CONFIG.spawn.spawnIn)));
      g.drawImage(f.c, f.x, f.y, f.w, h, left, foot - h, f.w, h);
      return;
    }

    const top = foot - S.h + float;
    if (this.cfg.alpha) g.globalAlpha = this.cfg.alpha; // 유령은 반투명
    if (this.elite) {
      // 정예: 금빛 실루엣을 사방으로 한 칸씩 밀어 그려 테두리를 만든다
      const gold = right ? S.gold : S.goldFlip;
      Render.spr(gold, left - 1, top);
      Render.spr(gold, left + 1, top);
      Render.spr(gold, left, top - 1);
      Render.spr(gold, left, top + 1);
    }
    // 맞은 직후에는 같은 모양의 하얀 실루엣으로 바꿔 그려 번쩍이게 한다
    const set = this.flash > 0 ? (right ? S.white : S.whiteFlip) : (right ? S.frames : S.flip);
    Render.spr(set[i], left, top);
    if (this.frozenT > 0 || this.slowT > 0) {
      // 얼거나 느려진 적은 푸르스름하게 덮인다
      g.globalAlpha = this.frozenT > 0 ? 0.55 : 0.28;
      g.globalCompositeOperation = 'lighter';
      Render.spr((right ? S.white : S.whiteFlip)[i], left, top);
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;

    // 정예는 머리 위에 작은 체력바가 뜬다
    if (this.elite) {
      const w = 14;
      Render.rect(bx - 8, top - 5, w + 2, 3, '#0d0807');
      Render.rect(bx - 7, top - 4, Math.max(0, Math.round(w * (this.hp / this.maxHp))), 1, '#ffd23a');
    }
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
    this.life = 4.5;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  // 붉은 빛무리 (가산 합성 상태에서 부른다)
  drawGlow() {
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

// 불꽃탄. 적에게 맞으면 터지거나(기본) 뚫고 지나간다(진화).
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
    this.beam = !!stats.beam;                      // 진화한 관통탄 모양
    this.splash = stats.splash || 0;               // 맞았을 때 터지는 폭발 반경
    this.splashMul = stats.splashMul || 0;
    this.aw = stats.aw || 0;                       // 각성 단계 (금빛 이펙트)
    this.tx = new Float32Array(8);                 // 지나온 자리 (꼬리 그리기용, 돌려 쓰는 칸)
    this.ty = new Float32Array(8);
    this.tn = 0;
  }

  update(dt) {
    const i = this.tn % 8;
    this.tx[i] = this.x;
    this.ty[i] = this.y;
    this.tn++;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  // 불꽃 꼬리와 빛무리 (가산 합성 상태에서 부른다: 겹치면 더 밝아진다)
  drawGlow() {
    const bx = Render.X(this.x);
    const by = Render.Y(this.y);
    const r = Math.max(1, Math.round(this.radius * 0.5));
    if (this.beam) {
      // 진행 방향으로 길게 늘어난 빛줄기
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const tx = Render.X(this.x - (this.vx / sp) * 52);
      const ty = Render.Y(this.y - (this.vy / sp) * 52);
      if (this.aw) Render.line(tx, ty, bx, by, '#5a4410', r * 2 + 3); // 각성: 금빛 후광
      Render.line(tx, ty, bx, by, '#7a3408', r * 2 + 1);
      Render.glow(bx, by, r * 4, '#7a3408');
      return;
    }
    // 뒤로 갈수록 작고 어두워지는 불씨
    const n = Math.min(this.tn, 8);
    for (let k = 1; k < n; k += 2) {
      const i = (this.tn - 1 - k + 16) % 8;
      const f = 1 - k / 8;
      Render.disc(Render.X(this.tx[i]), Render.Y(this.ty[i]), Math.round(r * f), f < 0.5 ? '#5a1c08' : '#8a3a0c');
    }
    Render.glow(bx, by, r * 4, this.aw ? '#8a6a20' : '#7a3408'); // 각성하면 금빛
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

  // 값에 따른 등급 (0 초록 / 1 파랑 / 2 빨강 / 3 금빛)
  get tier() {
    const T = CONFIG.gem.tiers;
    let tier = 0;
    for (let i = 1; i < T.length; i++) if (this.value >= T[i]) tier = i;
    return tier;
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
    const bx = Render.X(this.x);
    const by = Render.Y(this.y);
    if (!Render.onScreen(bx, by, 8)) return;
    const S = GEM_SPRITES[this.tier];
    Render.light(this.x, this.y, CONFIG.light.gem); // 어둠 속에서도 보석 주변은 은은하게 밝다
    const bob = Math.sin(this.t) > 0.3 ? -1 : 0;    // 둥실거림
    Render.spr(S.shadow, bx - (S.shadow.w >> 1), by + 3);
    Render.spr(S.frames[0], bx - S.cx, by - (S.h >> 1) + bob);
  }
}
