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

  draw(ctx) {
    const P = CONFIG.player;
    const frame = this.moving && Math.floor(this.walkTime / P.stepTime) % 2 === 1 ? 1 : 0;
    const bob = this.moving && frame === 1 ? -1 : 0; // 걸을 때 살짝 들썩
    const sprite = Sprites.wizard[frame];
    const w = Sprites.wizardSize.w * P.scale;
    const h = Sprites.wizardSize.h * P.scale;

    ctx.save();
    ctx.translate(this.x, this.y);
    // 무적 중에는 깜빡여서 맞았음을 알려준다
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.35;

    // 바닥 그림자
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, this.radius * 0.8, w * 0.38, w * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // 도트가 번지지 않게 확대하고, 이동 방향에 맞춰 좌우 반전
    ctx.imageSmoothingEnabled = false;
    ctx.scale(this.facing, 1);
    ctx.drawImage(sprite, -w / 2, -h + this.radius * 0.9 + bob * P.scale, w, h);
    ctx.restore();
  }

  // 머리 위 칸 나누기 체력바. 적·탄에 가려지지 않게 main.js에서 맨 위에 따로 그린다.
  drawHpBar(ctx) {
    const P = CONFIG.player;
    const B = P.hpBar;
    const cells = Math.ceil(this.maxHp / B.segmentHp);
    const cellW = (B.width - (cells - 1) * B.gap) / cells;
    const spriteTop = this.y + this.radius * 0.9 - Sprites.wizardSize.h * P.scale;
    const x = Math.round(this.x - B.width / 2);
    const y = Math.round(spriteTop - B.height - B.offset);

    // 테두리 + 바탕
    ctx.fillStyle = '#4a3f38';
    ctx.fillRect(x - 2, y - 2, B.width + 4, B.height + 4);
    ctx.fillStyle = '#0d0807';
    ctx.fillRect(x - 1, y - 1, B.width + 2, B.height + 2);

    for (let i = 0; i < cells; i++) {
      const cx = x + i * (cellW + B.gap);
      // 이 칸에 차 있는 비율(0~1): 마지막으로 깎이는 칸은 부분만 채운다
      const fill = Math.min(1, Math.max(0, (this.hp - i * B.segmentHp) / B.segmentHp));
      ctx.fillStyle = '#2a1210';
      ctx.fillRect(cx, y, cellW, B.height);
      if (fill > 0) {
        ctx.fillStyle = '#c42a1e';
        ctx.fillRect(cx, y, cellW * fill, B.height);
        ctx.fillStyle = '#ff6a50'; // 윗면 하이라이트
        ctx.fillRect(cx, y, cellW * fill, 1);
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
    this.scale = T.scale;
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

  // 바닥에 깔리는 돌진 예고선
  drawGround(ctx) {
    const t = this.telegraph;
    if (!t) return;
    const w = this.radius * 1.6;
    ctx.save();
    ctx.translate(this.x, this.y + this.radius * 0.6);
    ctx.rotate(Math.atan2(t.dy, t.dx));
    ctx.fillStyle = `rgba(196, 34, 26, ${0.12 + 0.3 * t.progress})`;
    ctx.fillRect(0, -w / 2, t.len, w);
    ctx.strokeStyle = `rgba(255, 90, 60, ${0.4 + 0.5 * t.progress})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, -w / 2, t.len, w);
    ctx.restore();
  }

  draw(ctx) {
    const S = this.phase === 2 && this.cfg.sprite2 ? Sprites[this.cfg.sprite2] : this.sprite;
    const frame = Math.floor(this.anim / CONFIG.player.stepTime) % 2;
    const w = S.w * this.scale;
    const h = S.h * this.scale;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, this.radius * 0.8, w * 0.4, w * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.imageSmoothingEnabled = false;
    ctx.scale(this.facing, 1);
    ctx.drawImage(S.frames[frame], -w / 2, -h + this.radius * 0.9, w, h);
    if (this.flash > 0) {
      // 맞은 직후: 같은 모양의 하얀 실루엣을 덧그려 번쩍이게 한다
      ctx.globalAlpha = Math.min(1, this.flash / CONFIG.fx.flashTime) * 0.9;
      ctx.drawImage(whiteOf(S.frames[frame]), -w / 2, -h + this.radius * 0.9, w, h);
    }
    ctx.restore();
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

  draw(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(224, 42, 58, 0.3)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2a0a10'; // 어두운 테두리: 플레이어의 주황 탄과 구분
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e02a3a';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9a8a';
    ctx.beginPath();
    ctx.arc(this.x - 1.5, this.y - 1.5, this.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
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

  draw(ctx) {
    if (this.beam) return this.drawBeam(ctx);
    // 가산 합성으로 겹치면 더 밝아지는 불덩이
    ctx.globalCompositeOperation = 'lighter';
    // 불꽃 꼬리: 뒤로 갈수록 작고 투명하다
    for (let i = 0; i < this.trail.length; i++) {
      const k = (i + 1) / (this.trail.length + 1);
      ctx.fillStyle = `rgba(255, ${Math.round(90 + 110 * k)}, 30, ${0.38 * k})`;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, this.radius * (0.5 + 1.1 * k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 122, 26, 0.28)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 2.6, 0, Math.PI * 2);
    ctx.fill();
    if (this.aw) {
      // 공명: 금빛 후광
      ctx.fillStyle = 'rgba(255, 220, 120, 0.22)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffb43a';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // 진행 방향으로 길게 늘어난 빛줄기
  drawBeam(ctx) {
    const sp = Math.hypot(this.vx, this.vy) || 1;
    const len = 52;
    const tx = this.x - (this.vx / sp) * len;
    const ty = this.y - (this.vy / sp) * len;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const layers = [
      ...(this.aw ? [[this.radius * 4.2, 'rgba(255, 214, 100, 0.2)']] : []), // 공명: 금빛 후광
      [this.radius * 2.8, 'rgba(255, 122, 26, 0.25)'],
      [this.radius * 1.5, '#ffb43a'],
      [this.radius * 0.7, '#fff4c8'],
    ];
    for (const [w, color] of layers) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
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

  draw(ctx) {
    const r = this.radius;
    const y = this.y + Math.sin(this.t) * 1.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(47, 208, 122, 0.22)';
    ctx.beginPath();
    ctx.arc(this.x, y, r * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = '#2fd07a';
    ctx.beginPath(); // 마름모
    ctx.moveTo(this.x, y - r);
    ctx.lineTo(this.x + r * 0.7, y);
    ctx.lineTo(this.x, y + r);
    ctx.lineTo(this.x - r * 0.7, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9affc4'; // 윗면 하이라이트
    ctx.beginPath();
    ctx.moveTo(this.x, y - r);
    ctx.lineTo(this.x + r * 0.7, y);
    ctx.lineTo(this.x, y - r * 0.1);
    ctx.closePath();
    ctx.fill();
  }
}
