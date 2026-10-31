// 무기 3종. 모두 같은 인터페이스를 따른다.
//   update(dt, player, enemies, projectiles)   매 프레임 공격 처리
//   drawUnder(ctx, player) / drawOver(ctx, player)   적 아래 / 위에 그릴 이펙트
//   upgradeLines() / levelUp()    다음 레벨 카드 문구 / 강화 적용
//   evolveLines() / evolve()      진화 카드 문구 / 진화 적용 (최대 레벨에서만)
//   introLines()                  새 무기 카드 문구

const fmt1 = (n) => String(Math.round(n * 100) / 100);

class Weapon {
  constructor(id, name, icon, cfg) {
    this.id = id;
    this.name = name;
    this.icon = icon;
    this.level = 1;
    this.maxLevel = cfg.maxLevel;
    this.evolved = false;
    // 업그레이드가 값을 직접 바꿀 수 있게 config에서 복사해 둔다
    this.stats = Object.assign({}, cfg);
    this.clock = 0; // 이 무기가 흘려보낸 시간(적마다 피격 간격을 잴 때 쓴다)
  }

  get canEvolve() {
    return this.level >= this.maxLevel && !this.evolved;
  }

  drawUnder() {}
  drawOver() {}

  // 스킬 공명: 피해와 발사 속도가 오르고, 무기마다 고유한 추가 강화(awakenExtra)가 붙는다
  awaken(tier) {
    const A = CONFIG.awaken;
    this.awakened = tier;
    this.stats.aw = Math.max(this.stats.aw || 0, tier); // 그리기 코드가 금빛 이펙트를 더할 때 쓴다
    this.stats.damage *= A.damageMul[tier - 1];
    if (this.stats.cooldown) this.stats.cooldown *= A.cooldownMul[tier - 1];
    if (this.stats.hitInterval) this.stats.hitInterval *= A.cooldownMul[tier - 1];
    this.awakenExtra(tier);
  }

  awakenExtra() {}

  // Lv3 달성 각성: 능력치 보너스(lv3Boost)와 카드에 보여줄 문구(lv3Lines). 스킬마다 다르다.
  lv3Boost() {}
  lv3Lines() {
    return [];
  }

  // 같은 적을 interval초 안에 다시 때리지 않게 한다. 때릴 수 있으면 true.
  canHit(e, interval) {
    if (!e.cd) e.cd = {};
    if ((e.cd[this.id] || 0) > this.clock) return false;
    e.cd[this.id] = this.clock + interval;
    return true;
  }
}

// ---- 기본 탄: 가장 가까운 적에게 자동 발사 ----
class BoltWeapon extends Weapon {
  constructor() {
    super('bolt', '불꽃탄', '✦', CONFIG.weapons.bolt);
    this.timer = 0;
  }

  update(dt, player, enemies, projectiles) {
    this.clock += dt;
    this.timer -= dt;
    if (this.timer > 0) return;

    const target = this.findTarget(player, enemies);
    if (!target) return; // 사거리 안에 적이 없으면 쏘지 않고 대기

    this.timer = this.stats.cooldown;
    const base = Math.atan2(target.y - (player.y - 10), target.x - player.x);
    const n = this.stats.count;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * this.stats.spread; // 여러 발이면 부채꼴로
      projectiles.push(new Projectile(player.x, player.y - 10, Math.cos(a), Math.sin(a), this.stats));
    }
    // 총구 불꽃
    Effects.burst(player.x + Math.cos(base) * 16, player.y - 10 + Math.sin(base) * 16, 4, ['#ffb43a', '#ffe27a', '#ffffff'], 130, 0.22);
    Sfx.shoot();
  }

  findTarget(player, enemies) {
    let best = null;
    let bestD2 = this.stats.range * this.stats.range;
    for (const e of enemies) {
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  nextStats() {
    const P = CONFIG.weapons.bolt.perLevel;
    return {
      damage: this.stats.damage + P.damage,
      cooldown: this.stats.cooldown * P.cooldownMul,
      splash: this.stats.splash + P.splash,
      count: this.stats.count + (P.countAtLevels.includes(this.level + 1) ? 1 : 0),
    };
  }

  upgradeLines() {
    const n = this.nextStats();
    const lines = [
      `피해 ${fmt1(this.stats.damage)} → ${fmt1(n.damage)}`,
      `공격 속도 ${fmt1(1 / this.stats.cooldown)}/초 → ${fmt1(1 / n.cooldown)}/초`,
      `폭발 범위 ${this.stats.splash} → ${n.splash}`,
    ];
    if (n.count > this.stats.count) lines.push(`발사 수 ${this.stats.count}발 → ${n.count}발`);
    return lines;
  }

  levelUp() {
    const n = this.nextStats();
    this.stats.damage = n.damage;
    this.stats.cooldown = n.cooldown;
    this.stats.splash = n.splash;
    this.stats.count = n.count;
    this.level++;
  }

  evolveLines() {
    const E = CONFIG.weapons.bolt.evolve;
    return [
      '관통 화염탄 획득',
      `모든 적을 관통 (${this.stats.count}발)`,
      `피해 ${fmt1(this.stats.damage)} → ${fmt1(this.stats.damage * E.damageMul)}`,
      `사거리 ${this.stats.range} → ${E.range}`,
    ];
  }

  evolve() {
    const E = CONFIG.weapons.bolt.evolve;
    this.evolved = true;
    this.name = '관통 화염탄';
    this.stats.damage *= E.damageMul;
    this.stats.speed = E.speed;
    this.stats.radius = E.radius;
    this.stats.range = E.range;
    this.stats.pierce = Infinity;
    this.stats.beam = true;
    this.stats.splash = 0; // 관통탄은 터지지 않고 뚫고 지나간다
  }

  // 공명: 탄이 커지고 폭발 범위가 넓어진다
  awakenExtra() {
    this.stats.splash *= 1.25;
    this.stats.radius *= 1.15;
  }

  lv3Boost() {
    const L = CONFIG.weapons.bolt.lv3;
    this.stats.splash *= L.splashMul;
    this.stats.splashMul = L.splashDamage;
    this.stats.radius *= L.radiusMul;
  }

  lv3Lines() {
    const L = CONFIG.weapons.bolt.lv3;
    return [`★ Lv3 각성: 폭발 범위 x${L.splashMul}, 폭발 피해 ${Math.round(L.splashDamage * 100)}%`];
  }

  introLines() {
    return [];
  }
}

// ---- 회전 구슬: 플레이어 주위를 돌며 공격 ----
class OrbWeapon extends Weapon {
  constructor() {
    super('orbs', '회전 구슬', '◉', CONFIG.weapons.orbs);
    this.angle = 0;
    this.positions = []; // 이번 프레임의 구슬 위치 (그리기용)
    this.trails = [];    // 구슬마다 지나온 자리 (혜성 꼬리)
  }

  update(dt, player, enemies) {
    this.clock += dt;
    const S = this.stats;
    this.angle += S.speed * dt;
    this.positions.length = 0;
    for (let i = 0; i < S.count; i++) {
      const a = this.angle + (i * Math.PI * 2) / S.count;
      const x = player.x + Math.cos(a) * S.orbitRadius;
      const y = player.y - 8 + Math.sin(a) * S.orbitRadius;
      this.positions.push({ x, y });
      const trail = this.trails[i] || (this.trails[i] = []);
      trail.push({ x, y });
      if (trail.length > 11) trail.shift();
      AI.forNearby(x, y, (e) => {
        if (e.hp <= 0) return;
        const dx = e.x - x;
        const dy = e.y - y;
        const r = e.radius + S.hitRadius;
        if (dx * dx + dy * dy < r * r && this.canHit(e, S.hitInterval)) {
          hitEnemy(e, S.damage);
          Effects.burst(e.x, e.y, 5, ['#6aa8ff', '#e6f2ff', '#9ac4ff'], 130, 0.3);
          Effects.ring(e.x, e.y, 26, '106, 168, 255', 0.25);
        }
      });
    }
    this.trails.length = S.count;
  }

  drawOver(ctx) {
    const r = this.stats.hitRadius;
    // 구슬이 지나간 자리에 푸른 꼬리가 남는다
    ctx.globalCompositeOperation = 'lighter';
    for (const trail of this.trails) {
      if (!trail) continue;
      for (let j = 0; j < trail.length; j++) {
        const k = (j + 1) / (trail.length + 1);
        ctx.fillStyle = `rgba(106, 168, 255, ${0.34 * k})`;
        ctx.beginPath();
        ctx.arc(trail[j].x, trail[j].y, r * (0.3 + 1.0 * k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.positions) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(106, 168, 255, 0.28)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (this.stats.aw) {
        // 공명: 금빛 테두리와 바깥 빛무리
        ctx.strokeStyle = 'rgba(255, 214, 100, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 1.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 214, 100, 0.14)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#6aa8ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e6f2ff';
      ctx.beginPath();
      ctx.arc(p.x - r * 0.25, p.y - r * 0.25, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  gainsOrbAt(level) {
    return CONFIG.weapons.orbs.perLevel.countAtLevels.includes(level);
  }

  upgradeLines() {
    const P = CONFIG.weapons.orbs.perLevel;
    const lines = [`피해 ${fmt1(this.stats.damage)} → ${fmt1(this.stats.damage + P.damage)}`];
    if (this.gainsOrbAt(this.level + 1)) lines.push(`구슬 ${this.stats.count}개 → ${this.stats.count + 1}개`);
    return lines;
  }

  levelUp() {
    this.level++;
    this.stats.damage += CONFIG.weapons.orbs.perLevel.damage;
    if (this.gainsOrbAt(this.level)) this.stats.count++;
  }

  evolveLines() {
    const E = CONFIG.weapons.orbs.evolve;
    const S = this.stats;
    return [
      '구슬 군단 획득',
      `구슬 ${S.count}개 → ${S.count * E.countMul}개`,
      `궤도 반경 ${fmt1(S.orbitRadius)} → ${fmt1(S.orbitRadius * E.radiusMul)}`,
      `피해 ${fmt1(S.damage)} → ${fmt1(S.damage * E.damageMul)}`,
    ];
  }

  evolve() {
    const E = CONFIG.weapons.orbs.evolve;
    this.evolved = true;
    this.name = '구슬 군단';
    this.stats.count *= E.countMul;
    this.stats.orbitRadius *= E.radiusMul;
    this.stats.damage *= E.damageMul;
  }

  // 공명: 구슬이 커지고, 1단계에서는 구슬이 하나 늘어난다
  awakenExtra(tier) {
    this.stats.hitRadius *= 1.2;
    if (tier === 1) this.stats.count++;
  }

  lv3Boost() {
    const L = CONFIG.weapons.orbs.lv3;
    this.stats.hitRadius *= L.hitRadiusMul;
    this.stats.orbitRadius *= L.orbitMul;
    this.stats.hitInterval *= L.intervalMul;
  }

  lv3Lines() {
    const L = CONFIG.weapons.orbs.lv3;
    return [`★ Lv3 각성: 구슬 x${L.hitRadiusMul}, 궤도 확대, 타격 간격 단축`];
  }

  introLines() {
    return [`구슬 ${this.stats.count}개가 주위를 돈다`, `피해 ${this.stats.damage}`];
  }
}

// ---- 레이저: 긴 광선으로 직선 위의 모든 적을 관통 ----
class LaserWeapon extends Weapon {
  constructor() {
    super('laser', '레이저', '═', CONFIG.weapons.laser);
    this.timer = 0.4;
    this.beams = []; // 화면에 남아 있는 광선들 (그리기용)
  }

  update(dt, player, enemies) {
    this.clock += dt;
    for (const b of this.beams) b.t -= dt;
    removeDead(this.beams, (b) => b.t <= 0);

    this.timer -= dt;
    if (this.timer > 0) return;
    const target = this.findTarget(player, enemies);
    if (!target) return; // 사거리 안에 적이 없으면 대기

    this.timer = this.stats.cooldown;
    const base = Math.atan2(target.y - (player.y - 10), target.x - player.x);
    const n = this.stats.beams;
    for (let i = 0; i < n; i++) {
      this.fire(player, enemies, base + (i - (n - 1) / 2) * this.stats.spread);
    }
    Sfx.laser();
  }

  findTarget(player, enemies) {
    let best = null;
    let bestD2 = this.stats.length * this.stats.length;
    for (const e of enemies) {
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  // 광선은 발사 순간 즉시 직선 위의 모든 적을 맞힌다 (점-선분 거리로 판정)
  fire(player, enemies, angle) {
    const S = this.stats;
    const x1 = player.x;
    const y1 = player.y - 10;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (const e of enemies) {
      const ex = e.x - x1;
      const ey = e.y - y1;
      const along = ex * dx + ey * dy;          // 광선 방향으로 얼마나 떨어져 있나
      if (along < 0 || along > S.length) continue;
      const across = Math.abs(ex * dy - ey * dx); // 광선 중심선에서 옆으로 얼마나 떨어져 있나
      if (across <= S.width / 2 + e.radius) {
        hitEnemy(e, S.damage);
        // 광선에 맞은 적마다 보라색 불꽃과 충격 고리가 터진다
        Effects.burst(e.x, e.y, 7, ['#c9a0ff', '#ffffff', '#9a6aff'], 170, 0.35);
        Effects.ring(e.x, e.y, 30, '200, 160, 255', 0.3);
      }
    }
    this.beams.push({ x1, y1, x2: x1 + dx * S.length, y2: y1 + dy * S.length, t: 0.3, max: 0.3, w: S.width });
    // 발사 순간: 총구에 충격 고리와 불꽃, 약한 화면 흔들림
    Effects.ring(x1, y1, 40, '200, 160, 255', 0.28);
    Effects.burst(x1 + dx * 18, y1 + dy * 18, 6, ['#c9a0ff', '#ffffff'], 170, 0.25);
    Effects.shake(this.evolved ? 3 : 1.6, 0.14);
  }

  drawOver(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const b of this.beams) {
      const k = b.t / b.max; // 1 -> 0 으로 가늘어지며 사라진다
      this.drawLightning(ctx, b, k);
      const layers = [
        [b.w * 1.6 * k + 2, `rgba(150, 100, 255, ${0.3 * k})`],
        [b.w * 0.9 * k + 1, `rgba(200, 160, 255, ${0.85 * k})`],
        [b.w * 0.4 * k + 1, `rgba(255, 255, 255, ${k})`],
      ];
      for (const [width, color] of layers) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // 광선 주위로 튀는 번개 줄기: 매 프레임 모양이 달라져서 지직거린다
  drawLightning(ctx, b, k) {
    const dx = b.x2 - b.x1;
    const dy = b.y2 - b.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    if (this.stats.aw) {
      // 공명: 광선 전체를 금빛이 감싼다
      ctx.strokeStyle = `rgba(255, 214, 100, ${0.32 * k})`;
      ctx.lineWidth = b.w * 1.6 * k + 4;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
    const seg = 34;
    const n = Math.floor(len / seg);
    for (let strand = 0; strand < 2; strand++) {
      ctx.strokeStyle = `rgba(${strand ? '255, 255, 255' : '190, 140, 255'}, ${0.85 * k})`;
      ctx.lineWidth = strand ? 1.2 : 2;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      for (let i = 1; i <= n; i++) {
        const off = (Math.random() - 0.5) * b.w * (strand ? 1.3 : 1.9) * k;
        ctx.lineTo(b.x1 + (dx * i) / n + nx * off, b.y1 + (dy * i) / n + ny * off);
      }
      ctx.stroke();
    }
    // 끝에 맺히는 빛무리
    ctx.fillStyle = `rgba(200, 160, 255, ${0.35 * k})`;
    ctx.beginPath();
    ctx.arc(b.x2, b.y2, b.w * 1.4 * k + 2, 0, Math.PI * 2);
    ctx.fill();
  }

  nextStats() {
    const P = CONFIG.weapons.laser.perLevel;
    return {
      damage: this.stats.damage + P.damage,
      cooldown: this.stats.cooldown * P.cooldownMul,
      width: this.stats.width + P.width,
    };
  }

  gainsBeamAt(level) {
    return CONFIG.weapons.laser.perLevel.beamsAtLevels.includes(level);
  }

  upgradeLines() {
    const n = this.nextStats();
    const lines = [
      `피해 ${fmt1(this.stats.damage)} → ${fmt1(n.damage)}`,
      `발사 간격 ${fmt1(this.stats.cooldown)}초 → ${fmt1(n.cooldown)}초`,
      `두께 ${this.stats.width} → ${n.width}`,
    ];
    if (this.gainsBeamAt(this.level + 1)) lines.push(`광선 ${this.stats.beams}줄기 → ${this.stats.beams + 1}줄기`);
    return lines;
  }

  levelUp() {
    const n = this.nextStats();
    this.stats.damage = n.damage;
    this.stats.cooldown = n.cooldown;
    this.stats.width = n.width;
    this.level++;
    if (this.gainsBeamAt(this.level)) this.stats.beams++;
  }

  evolveLines() {
    const E = CONFIG.weapons.laser.evolve;
    return [
      '폭풍 레이저 획득',
      `광선 ${this.stats.beams}줄기 → ${E.beams}줄기`,
      `피해 ${fmt1(this.stats.damage)} → ${fmt1(this.stats.damage * E.damageMul)}`,
      `길이 ${Math.round(this.stats.length)} → ${Math.round(this.stats.length * E.lengthMul)}`,
    ];
  }

  evolve() {
    const E = CONFIG.weapons.laser.evolve;
    this.evolved = true;
    this.name = '폭풍 레이저';
    this.stats.beams = E.beams;
    this.stats.damage *= E.damageMul;
    this.stats.length *= E.lengthMul;
  }

  // 공명: 광선이 굵고 길어진다
  awakenExtra() {
    this.stats.width *= 1.2;
    this.stats.length *= 1.08;
  }

  // 레이저는 능력치 보너스 없이 금빛 이펙트만 붙는다 (밸런스 때문)
  lv3Lines() {
    return ['★ Lv3 각성: 금빛 광선 (능력치 변화 없음)'];
  }

  introLines() {
    return [
      '직선상의 적 전부 관통',
      `피해 ${this.stats.damage} / ${this.stats.cooldown}초`,
      `길이 ${this.stats.length}`,
    ];
  }
}

// ---- 연쇄 번개: 맞은 적에서 주변 적으로 퍼진다 ----
class LightningWeapon extends Weapon {
  constructor() {
    super('lightning', '연쇄 번개', 'ϟ', CONFIG.weapons.lightning);
    this.timer = 0.3;
    this.arcs = []; // 화면에 남아 있는 번개들 (그리기용)
  }

  update(dt, player, enemies) {
    this.clock += dt;
    for (const a of this.arcs) a.t -= dt;
    removeDead(this.arcs, (a) => a.t <= 0);

    this.timer -= dt;
    if (this.timer > 0) return;
    const firsts = this.findTargets(player, enemies, this.stats.strikes);
    if (!firsts.length) return; // 사거리 안에 적이 없으면 대기

    this.timer = this.stats.cooldown;
    const hit = new Set(); // 이번에 이미 맞은 적(같은 적을 두 번 때리지 않는다)
    for (const f of firsts) this.strike(player, enemies, f, hit);
    Sfx.thunder();
    Effects.shake(1.2, 0.1);
  }

  // 사거리 안에서 가까운 순서대로 count마리
  findTargets(player, enemies, count) {
    const r2 = this.stats.range * this.stats.range;
    const near = [];
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const d2 = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
      if (d2 < r2) near.push({ e, d2 });
    }
    near.sort((a, b) => a.d2 - b.d2);
    return near.slice(0, count).map((n) => n.e);
  }

  // 첫 대상을 내려치고, 가장 가까운 다음 적으로 chains번까지 튄다
  strike(player, enemies, first, hit) {
    const S = this.stats;
    const pts = [{ x: player.x, y: player.y - 10 }];
    let cur = first;
    let dmg = S.damage;
    for (let i = 0; i <= S.chains; i++) {
      hit.add(cur);
      hitEnemy(cur, dmg);
      pts.push({ x: cur.x, y: cur.y - cur.radius * 0.5 });
      Effects.ring(cur.x, cur.y, 28, '130, 225, 255', 0.28);
      Effects.burst(cur.x, cur.y, 5, ['#aef0ff', '#ffffff', '#ffe97a'], 150, 0.3);

      // 아직 안 맞은 가장 가까운 적을 찾는다
      let next = null;
      let best = Infinity;
      for (const e of enemies) {
        if (hit.has(e) || e.hp <= 0) continue;
        const d = Math.hypot(e.x - cur.x, e.y - cur.y) - e.radius;
        if (d < S.jumpRange && d < best) {
          best = d;
          next = e;
        }
      }
      if (!next) break;
      cur = next;
      dmg *= S.falloff;
    }
    this.arcs.push({ pts, t: 0.38, max: 0.38 });
  }

  drawOver(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const a of this.arcs) {
      const k = a.t / a.max;
      // 지그재그 선분 목록: 마디마다 모양이 매 프레임 달라져서 지직거린다
      const path = [a.pts[0]];
      for (let i = 1; i < a.pts.length; i++) {
        const p = a.pts[i - 1];
        const q = a.pts[i];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const n = Math.max(2, Math.round(len / 22));
        for (let j = 1; j < n; j++) {
          const off = (Math.random() - 0.5) * 18 * k;
          path.push({ x: p.x + (dx * j) / n + nx * off, y: p.y + (dy * j) / n + ny * off });
        }
        path.push(q);
      }
      for (const [w, color] of [
        [8 * k + 2, `rgba(110, 215, 255, ${0.28 * k})`],
        [3.2 * k + 1, `rgba(174, 240, 255, ${0.9 * k})`],
        [1.5, `rgba(255, 255, 255, ${k})`],
      ]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
      }
      if (this.stats.aw) {
        // 공명: 번개 줄기를 금빛이 감싼다
        ctx.strokeStyle = `rgba(255, 214, 100, ${0.3 * k})`;
        ctx.lineWidth = 14 * k + 3;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
      }
      // 맞은 자리마다 번쩍이는 빛무리
      ctx.fillStyle = `rgba(170, 235, 255, ${0.4 * k})`;
      for (let i = 1; i < a.pts.length; i++) {
        ctx.beginPath();
        ctx.arc(a.pts[i].x, a.pts[i].y, 12 * k + 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  gainsChainAt(level) {
    return CONFIG.weapons.lightning.perLevel.chainAtLevels.includes(level);
  }

  upgradeLines() {
    const P = CONFIG.weapons.lightning.perLevel;
    const S = this.stats;
    const lines = [
      `피해 ${fmt1(S.damage)} → ${fmt1(S.damage + P.damage)}`,
      `확산 거리 ${S.jumpRange} → ${S.jumpRange + P.jumpRange}`,
    ];
    if (this.gainsChainAt(this.level + 1)) lines.push(`최대 대상 ${S.chains + 1}마리 → ${S.chains + 2}마리`);
    return lines;
  }

  levelUp() {
    const P = CONFIG.weapons.lightning.perLevel;
    this.level++;
    this.stats.damage += P.damage;
    this.stats.cooldown *= P.cooldownMul;
    this.stats.jumpRange += P.jumpRange;
    if (this.gainsChainAt(this.level)) this.stats.chains++;
  }

  evolveLines() {
    const E = CONFIG.weapons.lightning.evolve;
    const S = this.stats;
    return [
      '천둥 폭풍 획득',
      `번개 ${S.strikes}줄기 → ${E.strikes}줄기 동시`,
      `최대 대상 ${S.chains + 1}마리 → ${S.chains + 1 + E.chainsAdd}마리`,
      `확산 거리 ${S.jumpRange} → ${Math.round(S.jumpRange * E.jumpMul)}`,
    ];
  }

  evolve() {
    const E = CONFIG.weapons.lightning.evolve;
    this.evolved = true;
    this.name = '천둥 폭풍';
    this.stats.strikes = E.strikes;
    this.stats.chains += E.chainsAdd;
    this.stats.jumpRange *= E.jumpMul;
    this.stats.damage *= E.damageMul;
  }

  // 공명: 1단계에서는 번개가 한 마리 더 튀고, 확산 거리가 넓어진다
  awakenExtra(tier) {
    if (tier === 1) this.stats.chains++;
    this.stats.jumpRange *= 1.15;
  }

  lv3Boost() {
    const L = CONFIG.weapons.lightning.lv3;
    this.stats.chains += L.chainsAdd;
    this.stats.jumpRange *= L.jumpMul;
    this.stats.falloff = L.falloff;
  }

  lv3Lines() {
    const L = CONFIG.weapons.lightning.lv3;
    return [`★ Lv3 각성: +${L.chainsAdd}마리, 확산 x${L.jumpMul}, 피해 감소 완화`];
  }

  introLines() {
    return [
      '맞은 적에서 주변으로 확산',
      `최대 ${this.stats.chains + 1}마리 / 확산 ${this.stats.jumpRange}`,
      `피해 ${this.stats.damage} / ${this.stats.cooldown}초`,
    ];
  }
}

// 카드에서 새로 얻을 수 있는 무기들
const WEAPON_TYPES = [OrbWeapon, LaserWeapon, LightningWeapon];
