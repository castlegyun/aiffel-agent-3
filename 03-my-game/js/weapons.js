// 무기 8종. 능력치·강화·각성·진화 내용은 전부 CONFIG.weapons에 있고, 여기는 "어떻게 공격하고 어떻게 그리는가"만 있다.
// 모두 같은 인터페이스를 따른다.
//   update(dt, player, enemies, projectiles)   매 프레임 공격 처리
//   drawUnder(g, player)   바닥에 깔리는 것 (예고 표시, 불타는 바닥)
//   addLights(player)      주변을 밝히는 빛 등록
//   drawGlow(g, player)    빛무리 (가산 합성 상태에서 불린다)
//   draw(g, player)        본체

const fmt1 = (n) => String(Math.round(n * 100) / 100);

// 능력치 묶음에 변경을 적용한다: add 더하기 → mul 곱하기 → set 덮어쓰기
function applyMods(stats, mods) {
  if (!mods) return;
  for (const k in mods.add) stats[k] += mods.add[k];
  for (const k in mods.mul) stats[k] *= mods.mul[k];
  for (const k in mods.set) stats[k] = mods.set[k];
}

class Weapon {
  constructor(id) {
    const cfg = CONFIG.weapons[id];
    this.id = id;
    this.cfg = cfg;
    this.name = cfg.name;
    this.icon = cfg.icon;
    this.level = 1;
    this.maxLevel = cfg.maxLevel;
    this.evolved = false;
    this.awakened = 0;
    this.stats = Object.assign({}, cfg.stats); // 강화가 값을 직접 바꿀 수 있게 복사해 둔다
    this.clock = 0; // 이 무기가 흘려보낸 시간(적마다 피격 간격을 잴 때 쓴다)
    this.timer = 0.3;
    this._eff = {};
    this._v = -1;
  }

  // 실제로 싸울 때 쓰는 능력치 = 무기 능력치 x 패시브 배율. 무언가 바뀌었을 때만 다시 계산한다.
  get eff() {
    if (this._v !== Build.version) {
      const e = this._eff;
      for (const k in this.stats) e[k] = this.stats[k];
      e.damage *= Build.might;
      if (e.cooldown) e.cooldown *= Build.haste;
      if (e.hitInterval) e.hitInterval *= Build.haste;
      for (const k of this.cfg.area) if (e[k]) e[k] *= Build.area;
      this._v = Build.version;
    }
    return this._eff;
  }

  // 한 단계 강화했을 때의 능력치
  nextStats() {
    const P = this.cfg.perLevel;
    const n = Object.assign({}, this.stats);
    applyMods(n, P);
    for (const k in P.at) if (P.at[k].includes(this.level + 1)) n[k]++;
    return n;
  }

  // 강화 카드에 보여 줄 "피해 12 → 14" 같은 줄들
  upgradeLines() {
    const n = this.nextStats();
    const lines = [];
    for (const k in n) {
      if (n[k] !== this.stats[k] && CONFIG.statLabels[k]) lines.push(`${CONFIG.statLabels[k]} ${fmt1(this.stats[k])} → ${fmt1(n[k])}`);
    }
    return lines;
  }

  levelUp() {
    this.stats = this.nextStats();
    this.level++;
    Build.touch();
  }

  // 진화: 최대 레벨 + 짝 패시브를 가지고 있어야 한다
  get maxed() {
    return this.level >= this.maxLevel && !this.evolved;
  }

  get canEvolve() {
    return this.maxed && Build.has(this.cfg.evolve.needs);
  }

  evolveLines() {
    const E = this.cfg.evolve;
    const lines = [`${E.name} 획득`].concat(E.text);
    if (E.mul && E.mul.damage) lines.push(`피해 ${fmt1(this.stats.damage)} → ${fmt1(this.stats.damage * E.mul.damage)}`);
    return lines;
  }

  evolve() {
    applyMods(this.stats, this.cfg.evolve);
    this.evolved = true;
    this.name = this.cfg.evolve.name;
    Build.touch();
  }

  introLines() {
    return this.cfg.intro.concat([`피해 ${fmt1(this.stats.damage)}`]);
  }

  // Lv3 달성 각성: 그 스킬만 강해진다
  lv3Boost() {
    applyMods(this.stats, this.cfg.lv3);
    Build.touch();
  }

  lv3Lines() {
    return [`★ Lv3 각성: ${this.cfg.lv3.text}`];
  }

  // 스킬 공명: 모든 스킬의 피해와 속도가 오르고, 무기마다 고유한 추가 강화가 붙는다
  awaken(tier) {
    const A = CONFIG.awaken;
    this.awakened = tier;
    this.stats.aw = Math.max(this.stats.aw || 0, tier); // 그리기 코드가 금빛 이펙트를 더할 때 쓴다
    this.stats.damage *= A.damageMul[tier - 1];
    if (this.stats.cooldown) this.stats.cooldown *= A.cooldownMul[tier - 1];
    if (this.stats.hitInterval) this.stats.hitInterval *= A.cooldownMul[tier - 1];
    applyMods(this.stats, this.cfg.awaken);
    if (tier === 1 && this.cfg.awaken) applyMods(this.stats, this.cfg.awaken.t1);
    Build.touch();
  }

  // 같은 적을 interval초 안에 다시 때리지 않게 한다. 때릴 수 있으면 true.
  canHit(e, interval) {
    if (!e.cd) e.cd = {};
    if ((e.cd[this.id] || 0) > this.clock) return false;
    e.cd[this.id] = this.clock + interval;
    return true;
  }

  // 사거리 안에서 가장 가까운 살아 있는 적
  nearest(x, y, enemies, range) {
    let best = null;
    let bestD2 = range * range;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.hp <= 0 || e.spawnT > 0) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    return best;
  }

  drawUnder() {}
  addLights() {}
  drawGlow() {}
  draw() {}
}

// ---- 불꽃탄: 가장 가까운 적에게 자동 발사, 맞은 자리에서 폭발 ----
class BoltWeapon extends Weapon {
  constructor() {
    super('bolt');
    this.timer = 0;
  }

  update(dt, player, enemies, projectiles) {
    this.clock += dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    const S = this.eff;
    const target = this.nearest(player.x, player.y, enemies, S.range);
    if (!target) return; // 사거리 안에 적이 없으면 쏘지 않고 대기

    this.timer = S.cooldown;
    const base = Math.atan2(target.y - (player.y - 10), target.x - player.x);
    for (let i = 0; i < S.count; i++) {
      const a = base + (i - (S.count - 1) / 2) * S.spread; // 여러 발이면 부채꼴로
      projectiles.push(new Projectile(player.x, player.y - 10, Math.cos(a), Math.sin(a), S));
    }
    // 총구 불꽃
    Effects.burst(player.x + Math.cos(base) * 16, player.y - 10 + Math.sin(base) * 16, 4, ['#ffb43a', '#ffe27a', '#ffffff'], 130, 0.22);
    Sfx.shoot();
  }
}

// ---- 회전 구슬: 플레이어 주위를 돌며 닿은 적을 때린다 ----
class OrbWeapon extends Weapon {
  constructor() {
    super('orbs');
    this.angle = 0;
  }

  update(dt, player, enemies) {
    this.clock += dt;
    const S = this.eff;
    this.angle += S.speed * dt;
    for (let i = 0; i < S.count; i++) {
      const a = this.angle + (i * Math.PI * 2) / S.count;
      const x = player.x + Math.cos(a) * S.orbitRadius;
      const y = player.y - 8 + Math.sin(a) * S.orbitRadius;
      const list = AI.near(x, y);
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        if (e.hp <= 0) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        const r = e.radius + S.hitRadius;
        if (dx * dx + dy * dy < r * r && this.canHit(e, S.hitInterval)) {
          hitEnemy(e, S.damage, this.id, player.x, player.y, 0.9);
          Effects.burst(e.x, e.y, 4, ['#6aa8ff', '#e6f2ff', '#9ac4ff'], 130, 0.3);
        }
      }
    }
  }

  addLights(player) {
    const S = this.eff;
    for (let i = 0; i < S.count; i++) {
      const a = this.angle + (i * Math.PI * 2) / S.count;
      Render.light(player.x + Math.cos(a) * S.orbitRadius, player.y - 8 + Math.sin(a) * S.orbitRadius, 56);
    }
  }

  // 구슬이 지나온 궤도를 따라 푸른 꼬리가 남는다 (과거 각도를 계산해서 그리므로 저장할 것이 없다)
  drawGlow(g, player) {
    const S = this.eff;
    const r = Math.max(2, Math.round(S.hitRadius * 0.5));
    for (let i = 0; i < S.count; i++) {
      const a = this.angle + (i * Math.PI * 2) / S.count;
      for (let k = 4; k >= 1; k--) {
        const b = a - k * 0.13;
        Render.disc(Render.X(player.x + Math.cos(b) * S.orbitRadius), Render.Y(player.y - 8 + Math.sin(b) * S.orbitRadius), Math.max(1, r - k - 1), k > 2 ? '#0a1430' : '#14285a');
      }
      Render.glow(Render.X(player.x + Math.cos(a) * S.orbitRadius), Render.Y(player.y - 8 + Math.sin(a) * S.orbitRadius), r * 3, S.aw ? '#6a5418' : '#1c3a7a');
    }
  }

  draw(g, player) {
    const S = this.eff;
    const r = Math.max(2, Math.round(S.hitRadius * 0.5));
    for (let i = 0; i < S.count; i++) {
      const a = this.angle + (i * Math.PI * 2) / S.count;
      const bx = Render.X(player.x + Math.cos(a) * S.orbitRadius);
      const by = Render.Y(player.y - 8 + Math.sin(a) * S.orbitRadius);
      if (S.aw) Render.ring(bx, by, r + 2, '#ffd664', 1); // 각성: 금빛 테두리
      Render.disc(bx, by, r, '#2a4fd0');
      Render.disc(bx, by, r - 1, '#6aa8ff');
      Render.rect(bx - 1, by - 2, 2, 2, '#e6f2ff');
    }
  }
}

// ---- 레이저: 긴 광선으로 직선 위의 모든 적을 관통 ----
class LaserWeapon extends Weapon {
  constructor() {
    super('laser');
    this.timer = 0.4;
    this.beams = []; // 화면에 남아 있는 광선들 (그리기용)
  }

  update(dt, player, enemies) {
    this.clock += dt;
    for (const b of this.beams) b.t -= dt;
    removeDead(this.beams, (b) => b.t <= 0);

    this.timer -= dt;
    if (this.timer > 0) return;
    const S = this.eff;
    const target = this.nearest(player.x, player.y, enemies, S.length);
    if (!target) return;

    this.timer = S.cooldown;
    const base = Math.atan2(target.y - (player.y - 10), target.x - player.x);
    for (let i = 0; i < S.beams; i++) this.fire(player, enemies, base + (i - (S.beams - 1) / 2) * S.spread, S);
    Effects.shake(this.evolved ? 3 : 1.6, 0.14);
    Sfx.laser();
  }

  // 광선은 발사 순간 즉시 직선 위의 모든 적을 맞힌다 (점-선분 거리로 판정)
  fire(player, enemies, angle, S) {
    const x1 = player.x;
    const y1 = player.y - 10;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.hp <= 0) continue;
      const ex = e.x - x1;
      const ey = e.y - y1;
      const along = ex * dx + ey * dy;            // 광선 방향으로 얼마나 떨어져 있나
      if (along < 0 || along > S.length) continue;
      const across = Math.abs(ex * dy - ey * dx); // 광선 중심선에서 옆으로 얼마나 떨어져 있나
      if (across <= S.width / 2 + e.radius) {
        hitEnemy(e, S.damage, this.id, x1, y1, 0.7);
        Effects.burst(e.x, e.y, 4, ['#c9a0ff', '#ffffff', '#9a6aff'], 170, 0.35);
      }
    }
    // 지직거리는 잔가지의 모양은 쏘는 순간 정해 둔다 (그릴 때마다 바뀌면 게임이 멈춰도 움직인다)
    const jit = [];
    for (let i = 0; i < 9; i++) jit.push((Math.random() - 0.5) * S.width * 1.4);
    this.beams.push({ x1, y1, dx, dy, len: S.length, t: 0.3, max: 0.3, w: S.width, jit, aw: S.aw });
    Effects.ring(x1, y1, 40, '200, 160, 255', 0.28);
    Effects.burst(x1 + dx * 18, y1 + dy * 18, 6, ['#c9a0ff', '#ffffff'], 170, 0.25);
  }

  addLights() {
    for (const b of this.beams) {
      for (let d = 60; d < b.len; d += 150) Render.light(b.x1 + b.dx * d, b.y1 + b.dy * d, 120);
    }
  }

  drawGlow(g) {
    for (const b of this.beams) {
      const k = b.t / b.max; // 1 -> 0 으로 가늘어지며 사라진다
      const x0 = Render.X(b.x1);
      const y0 = Render.Y(b.y1);
      const x1 = Render.X(b.x1 + b.dx * b.len);
      const y1 = Render.Y(b.y1 + b.dy * b.len);
      const w = Math.max(1, Math.round(b.w * 0.5 * k));
      if (b.aw) Render.line(x0, y0, x1, y1, '#4a3a10', w + 6); // 각성: 금빛이 감싼다
      Render.line(x0, y0, x1, y1, '#3a1c7a', w + 3);
      Render.line(x0, y0, x1, y1, '#9a6aff', w);
    }
  }

  draw() {
    for (const b of this.beams) {
      const k = b.t / b.max;
      const x0 = Render.X(b.x1);
      const y0 = Render.Y(b.y1);
      const x1 = Render.X(b.x1 + b.dx * b.len);
      const y1 = Render.Y(b.y1 + b.dy * b.len);
      Render.line(x0, y0, x1, y1, '#ffffff', Math.max(1, Math.round(b.w * 0.18 * k)));
      if (k < 0.45) continue;
      // 광선 주위로 튀는 잔가지
      let px = x0;
      let py = y0;
      const n = b.jit.length;
      for (let i = 0; i < n; i++) {
        const d = ((i + 1) / n) * b.len;
        const qx = Render.X(b.x1 + b.dx * d - b.dy * b.jit[i]);
        const qy = Render.Y(b.y1 + b.dy * d + b.dx * b.jit[i]);
        Render.line(px, py, qx, qy, '#e6d4ff', 1);
        px = qx;
        py = qy;
      }
    }
  }
}

// ---- 연쇄 번개: 맞은 적에서 주변 적으로 퍼진다 ----
class LightningWeapon extends Weapon {
  constructor() {
    super('lightning');
    this.arcs = []; // 화면에 남아 있는 번개들 (그리기용)
    this.hit = new Set();
  }

  update(dt, player, enemies) {
    this.clock += dt;
    for (const a of this.arcs) a.t -= dt;
    removeDead(this.arcs, (a) => a.t <= 0);

    this.timer -= dt;
    if (this.timer > 0) return;
    const S = this.eff;
    this.hit.clear(); // 이번에 이미 맞은 적(같은 적을 두 번 때리지 않는다)
    let struck = 0;
    for (let s = 0; s < S.strikes; s++) {
      const first = this.nextTarget(player.x, player.y, enemies, S.range, 0);
      if (!first) break;
      this.strike(player, enemies, first, S);
      struck++;
    }
    if (!struck) return; // 사거리 안에 적이 없으면 대기
    this.timer = S.cooldown;
    Sfx.thunder();
    Effects.shake(1.2, 0.1);
  }

  // (x, y)에서 가장 가까운, 아직 안 맞은 적. pad = 적의 몸집만큼 거리를 덜어 줄지
  nextTarget(x, y, enemies, range, pad) {
    let best = null;
    let bestD = range;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.hp <= 0 || this.hit.has(e)) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.radius * pad;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // 첫 대상을 내려치고, 가장 가까운 다음 적으로 chains번까지 튄다
  strike(player, enemies, first, S) {
    const pts = [player.x, player.y - 10];
    let cur = first;
    let dmg = S.damage;
    let px = player.x;
    let py = player.y - 10;
    for (let i = 0; i <= S.chains; i++) {
      this.hit.add(cur);
      const tx = cur.x;
      const ty = cur.y - cur.radius * 0.5;
      // 두 점 사이를 지그재그로 잇는다. 모양은 내려치는 순간 한 번만 정한다.
      const len = Math.hypot(tx - px, ty - py) || 1;
      const n = Math.max(1, Math.round(len / 26));
      for (let j = 1; j < n; j++) {
        const off = (Math.random() - 0.5) * 16;
        pts.push(px + ((tx - px) * j) / n - ((ty - py) / len) * off, py + ((ty - py) * j) / n + ((tx - px) / len) * off);
      }
      pts.push(tx, ty);
      hitEnemy(cur, dmg, this.id, px, py, 0.5);
      Effects.burst(cur.x, cur.y, 4, ['#aef0ff', '#ffffff', '#ffe97a'], 150, 0.3);
      px = tx;
      py = ty;
      const next = this.nextTarget(cur.x, cur.y, enemies, S.jumpRange, 1);
      if (!next) break;
      cur = next;
      dmg *= S.falloff;
    }
    this.arcs.push({ pts, t: 0.3, max: 0.3, aw: S.aw });
  }

  addLights() {
    for (const a of this.arcs) {
      for (let i = 0; i < a.pts.length; i += 6) Render.light(a.pts[i], a.pts[i + 1], 90);
    }
  }

  path(a, color, thick) {
    const p = a.pts;
    for (let i = 2; i < p.length; i += 2) {
      Render.line(Render.X(p[i - 2]), Render.Y(p[i - 1]), Render.X(p[i]), Render.Y(p[i + 1]), color, thick);
    }
  }

  drawGlow(g) {
    for (const a of this.arcs) {
      const k = a.t / a.max;
      g.globalAlpha = k > 0.5 ? 1 : 0.5;
      if (a.aw) this.path(a, '#4a3a10', 5); // 각성: 금빛이 감싼다
      this.path(a, '#14506a', 3);
    }
    g.globalAlpha = 1;
  }

  draw() {
    for (const a of this.arcs) {
      const k = a.t / a.max;
      if (k < 0.3) continue; // 끝에는 빛무리만 남는다
      this.path(a, k > 0.6 ? '#ffffff' : '#aef0ff', 1);
    }
  }
}

// ---- 서리 파동: 주변 전체를 때리고 느리게 만든다 ----
class FrostWeapon extends Weapon {
  constructor() {
    super('frost');
    this.timer = 1;
  }

  update(dt, player, enemies) {
    this.clock += dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    const S = this.eff;
    let any = false;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.hp <= 0) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const r = S.radius + e.radius;
      if (dx * dx + dy * dy > r * r) continue;
      any = true;
      hitEnemy(e, S.damage, this.id, player.x, player.y, 0.6);
      e.slow(S.slow, S.slowTime);
      if (S.freeze) e.freeze(S.freeze);
    }
    if (!any) return; // 범위 안에 적이 없으면 아껴 둔다
    this.timer = S.cooldown;

    // 얼음 고리가 퍼지고, 둘레에 눈가루가 날린다
    Effects.ring(player.x, player.y, S.radius * 2, '122, 208, 255', 0.4);
    Effects.ring(player.x, player.y, S.radius * 1.5, '230, 248, 255', 0.3);
    if (S.aw) Effects.ring(player.x, player.y, S.radius * 2.2, '255, 214, 100', 0.5);
    Effects.flash(player.x, player.y, 34, 0.14, true);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      Effects.burst(player.x + Math.cos(a) * S.radius * 0.8, player.y + Math.sin(a) * S.radius * 0.8, 2, ['#e6f8ff', '#7ad0ff', '#ffffff'], 70, 0.6, 0.15);
    }
    Sfx.frost();
  }
}

// ---- 유성: 적이 몰린 곳에 예고 뒤 떨어져 크게 터진다 ----
class MeteorWeapon extends Weapon {
  constructor() {
    super('meteor');
    this.timer = 1.2;
    this.falling = []; // 떨어지는 중인 유성 { x, y, t, delay, ... }
    this.fires = [];   // 불타는 바닥 { x, y, r, t, tick, dps }
  }

  // 사거리 안의 적 몇을 뽑아, 주변에 적이 가장 많은 쪽을 고른다
  pickTarget(player, enemies, S, taken) {
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < 10; i++) {
      const e = enemies[(Math.random() * enemies.length) | 0];
      if (!e || e.hp <= 0 || taken.includes(e)) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      if (dx * dx + dy * dy > S.range * S.range) continue;
      const score = AI.near(e.x, e.y).length + (e.isBoss || e.elite ? 6 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  update(dt, player, enemies) {
    this.clock += dt;
    const S = this.eff;

    for (const m of this.falling) {
      m.t += dt;
      if (m.t >= m.delay) {
        this.impact(m, enemies);
        m.dead = true;
      }
    }
    removeDead(this.falling, (m) => m.dead);

    for (const f of this.fires) {
      f.t -= dt;
      f.tick -= dt;
      if (f.tick > 0) continue;
      f.tick += 0.4;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.hp <= 0) continue;
        const dx = e.x - f.x;
        const dy = e.y - f.y;
        const r = f.r + e.radius;
        if (dx * dx + dy * dy < r * r) hitEnemy(e, f.dps * 0.4, this.id);
      }
    }
    removeDead(this.fires, (f) => f.t <= 0);

    this.timer -= dt;
    if (this.timer > 0) return;
    const taken = [];
    for (let i = 0; i < S.count; i++) {
      const e = this.pickTarget(player, enemies, S, taken);
      if (!e) break;
      taken.push(e);
      this.falling.push({ x: e.x, y: e.y, t: 0, delay: S.delay, r: S.radius, damage: S.damage, burn: S.burn, burnTime: S.burnTime, aw: S.aw });
    }
    if (!taken.length) return;
    this.timer = S.cooldown;
    Sfx.meteorFall();
  }

  impact(m, enemies) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.hp <= 0) continue;
      const dx = e.x - m.x;
      const dy = e.y - m.y;
      const r = m.r + e.radius;
      if (dx * dx + dy * dy < r * r) hitEnemy(e, m.damage, this.id, m.x, m.y, 1.8);
    }
    Effects.flash(m.x, m.y, m.r * 1.1, 0.24);
    Effects.ring(m.x, m.y, m.r * 2.4, '255, 150, 50', 0.4);
    if (m.aw) Effects.ring(m.x, m.y, m.r * 3, '255, 214, 100', 0.5);
    Effects.burst(m.x, m.y, 20, ['#ff7a1a', '#ffb43a', '#fff4c8', '#5c3a1c'], 260, 0.6);
    Effects.shake(3.5, 0.22);
    Sfx.meteor();
    if (m.burn) this.fires.push({ x: m.x, y: m.y, r: m.r * 0.85, t: m.burnTime, tick: 0.2, dps: m.damage * m.burn });
  }

  // 유성이 떨어질 자리(주황 원이 차오른다)와 불타는 바닥
  drawUnder(g) {
    for (const m of this.falling) {
      const k = m.t / m.delay;
      const bx = Render.X(m.x);
      const by = Render.Y(m.y);
      const r = Math.round(m.r * 0.5);
      g.globalAlpha = 0.12 + 0.2 * k;
      Render.disc(bx, by, Math.round(r * k), '#ff7a1a');
      g.globalAlpha = 0.4 + 0.5 * k;
      Render.ring(bx, by, r, '#ffb43a', 1);
    }
    for (const f of this.fires) {
      const bx = Render.X(f.x);
      const by = Render.Y(f.y);
      const r = f.r * 0.5;
      g.globalAlpha = Math.min(0.5, f.t);
      Render.disc(bx, by, Math.round(r), '#5a1c08');
      // 일렁이는 불꽃: 시간에 따라 크기가 바뀌는 작은 불덩이 여러 개
      g.globalAlpha = Math.min(0.9, f.t * 2);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + 0.4;
        const d = r * (0.25 + 0.1 * (i % 4));
        const s = 1 + Math.round(1.4 + 1.4 * Math.sin(this.clock * 9 + i * 2.1));
        Render.disc(Math.round(bx + Math.cos(a) * d), Math.round(by + Math.sin(a) * d * 0.8), s, i % 2 ? '#ff7a1a' : '#ffb43a');
      }
    }
    g.globalAlpha = 1;
  }

  // 떨어지는 유성의 지금 위치: 마지막 0.3초 동안 왼쪽 위에서 내리꽂힌다
  meteorPos(m, out) {
    const k = Math.max(0, 1 - (m.delay - m.t) / 0.3);
    out.x = m.x - 80 * (1 - k);
    out.y = m.y - 300 * (1 - k);
    return k > 0;
  }

  addLights() {
    for (const f of this.fires) Render.light(f.x, f.y, f.r * 2.2);
    const p = MeteorWeapon.tmp;
    for (const m of this.falling) if (this.meteorPos(m, p)) Render.light(p.x, p.y, 110);
  }

  drawGlow() {
    const p = MeteorWeapon.tmp;
    for (const m of this.falling) {
      if (!this.meteorPos(m, p)) continue;
      const bx = Render.X(p.x);
      const by = Render.Y(p.y);
      Render.line(Render.X(p.x - 20), Render.Y(p.y - 75), bx, by, '#7a3408', 5);
      Render.glow(bx, by, 16, m.aw ? '#8a6a20' : '#7a3408');
    }
  }

  draw() {
    const p = MeteorWeapon.tmp;
    for (const m of this.falling) {
      if (!this.meteorPos(m, p)) continue;
      const bx = Render.X(p.x);
      const by = Render.Y(p.y);
      Render.line(Render.X(p.x - 10), Render.Y(p.y - 38), bx, by, '#ffb43a', 2);
      Render.disc(bx, by, 4, '#5c3a1c');
      Render.disc(bx, by, 3, '#ff7a1a');
      Render.disc(bx, by, 1, '#fff4c8');
    }
  }
}
MeteorWeapon.tmp = { x: 0, y: 0 };

// ---- 귀환 낫: 날아갔다가 돌아오며 지나는 길의 적을 전부 벤다 ----
class ScytheWeapon extends Weapon {
  constructor() {
    super('scythe');
    this.timer = 0.6;
    this.blades = [];
  }

  update(dt, player, enemies) {
    this.clock += dt;
    const S = this.eff;

    for (const b of this.blades) {
      b.t += dt;
      if (b.out) {
        // 멀어질수록 느려지다가 사거리 끝에서 되돌아선다
        const v = Math.max(110, S.speed * (1 - b.trav / b.range));
        b.x += b.dx * v * dt;
        b.y += b.dy * v * dt;
        b.trav += v * dt;
        if (b.trav >= b.range) b.out = false;
      } else {
        // 지금 플레이어가 있는 곳을 향해 점점 빠르게 돌아온다
        const dx = player.x - b.x;
        const dy = player.y - 8 - b.y;
        const d = Math.hypot(dx, dy) || 1;
        b.back = Math.min(S.speed * 1.4, b.back + 1100 * dt);
        b.x += (dx / d) * b.back * dt;
        b.y += (dy / d) * b.back * dt;
        if (d < 24) b.dead = true;
      }
      // 낫이 커지면 격자 한 칸을 넘으므로 전체를 훑는다
      const list = S.radius > 28 ? enemies : AI.near(b.x, b.y);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.hp <= 0) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const r = S.radius + e.radius;
        if (dx * dx + dy * dy < r * r && this.canHit(e, S.hitInterval)) {
          hitEnemy(e, S.damage, this.id, b.x, b.y, 0.8);
          Effects.burst(e.x, e.y, 3, ['#dfe4ee', '#ffffff', '#9aa2b4'], 140, 0.28);
        }
      }
    }
    removeDead(this.blades, (b) => b.dead);

    this.timer -= dt;
    if (this.timer > 0) return;
    const target = this.nearest(player.x, player.y, enemies, S.range * 1.3);
    if (!target) return;
    this.timer = S.cooldown;
    const base = Math.atan2(target.y - (player.y - 8), target.x - player.x);
    for (let i = 0; i < S.count; i++) {
      const a = base + (i - (S.count - 1) / 2) * 0.55;
      this.blades.push({ x: player.x, y: player.y - 8, dx: Math.cos(a), dy: Math.sin(a), out: true, trav: 0, range: S.range, back: 120, t: 0 });
    }
    Sfx.scythe();
  }

  addLights() {
    for (const b of this.blades) Render.light(b.x, b.y, 60);
  }

  drawGlow() {
    const S = this.eff;
    const r = Math.round(S.radius * 0.5);
    for (const b of this.blades) {
      Render.ring(Render.X(b.x), Render.Y(b.y), r, this.evolved ? '#5a2a9a' : S.aw ? '#6a5418' : '#3a4050', 2);
    }
  }

  draw() {
    const sp = this.evolved ? Sprites.scytheEvo : Sprites.scythe;
    for (const b of this.blades) {
      const f = sp.frames[Math.floor(b.t * 16) % 4];
      Render.spr(f, Render.X(b.x) - (f.w >> 1), Render.Y(b.y) - (f.h >> 1));
    }
  }
}

// ---- 영혼 불: 스스로 적을 쫓아가 터지는 유도탄 ----
class WispWeapon extends Weapon {
  constructor() {
    super('wisp');
    this.timer = 0.8;
    this.wisps = [];
  }

  update(dt, player, enemies) {
    this.clock += dt;
    const S = this.eff;

    for (const w of this.wisps) {
      w.life -= dt;
      w.seek -= dt;
      if (w.seek <= 0 || (w.target && w.target.hp <= 0)) {
        // 가끔씩만 새 목표를 찾는다 (매 프레임 찾으면 무겁다)
        w.seek = 0.25;
        w.target = this.nearest(w.x, w.y, enemies, 520);
      }
      // 목표 쪽으로 방향을 조금씩 튼다. 목표가 없으면 플레이어 둘레를 맴돈다.
      let tx;
      let ty;
      if (w.target) {
        tx = w.target.x - w.x;
        ty = w.target.y - w.y;
      } else {
        const px = w.x - player.x;
        const py = w.y - player.y;
        tx = -py - px * 0.4;
        ty = px - py * 0.4;
      }
      const d = Math.hypot(tx, ty) || 1;
      const k = Math.min(1, S.turn * dt);
      w.vx += ((tx / d) * S.speed - w.vx) * k;
      w.vy += ((ty / d) * S.speed - w.vy) * k;
      w.x += w.vx * dt;
      w.y += w.vy * dt;

      const list = AI.near(w.x, w.y);
      let hit = null;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.hp <= 0) continue;
        const dx = e.x - w.x;
        const dy = e.y - w.y;
        const r = S.radius + e.radius;
        if (dx * dx + dy * dy < r * r) {
          hit = e;
          break;
        }
      }
      if (hit) {
        hitEnemy(hit, S.damage, this.id, w.x - w.vx, w.y - w.vy, 0.6);
        // 작은 폭발: 주변 적에게도 피해
        const around = AI.near(w.x, w.y);
        for (let i = 0; i < around.length; i++) {
          const o = around[i];
          if (o === hit || o.hp <= 0) continue;
          const r = S.splash + o.radius;
          if ((o.x - w.x) ** 2 + (o.y - w.y) ** 2 < r * r) hitEnemy(o, S.damage * S.splashMul, this.id);
        }
        Effects.ring(w.x, w.y, S.splash * 2, '125, 255, 138', 0.25);
        Effects.burst(w.x, w.y, 6, ['#7dff8a', '#ffffff', '#2fd07a'], 140, 0.35, 0.2);
        w.life = 0;
      }
    }
    removeDead(this.wisps, (w) => w.life <= 0);

    this.timer -= dt;
    if (this.timer > 0) return;
    if (!this.nearest(player.x, player.y, enemies, 560)) return;
    this.timer = S.cooldown;
    for (let i = 0; i < S.count; i++) {
      const a = Math.random() * Math.PI * 2;
      this.wisps.push({ x: player.x, y: player.y - 10, vx: Math.cos(a) * S.speed, vy: Math.sin(a) * S.speed, life: S.life, seek: 0.12, target: null });
    }
    Sfx.wisp();
  }

  addLights() {
    for (const w of this.wisps) Render.light(w.x, w.y, 44);
  }

  drawGlow() {
    const gold = this.eff.aw;
    for (const w of this.wisps) {
      const bx = Render.X(w.x);
      const by = Render.Y(w.y);
      // 꼬리: 지나온 방향으로 작아지는 불씨 두 개
      Render.disc(Render.X(w.x - w.vx * 0.035), Render.Y(w.y - w.vy * 0.035), 1, '#1c6a3a');
      Render.disc(Render.X(w.x - w.vx * 0.07), Render.Y(w.y - w.vy * 0.07), 0, '#1c6a3a');
      Render.glow(bx, by, 10, gold ? '#6a5418' : '#145a30');
    }
  }

  draw() {
    for (const w of this.wisps) {
      const bx = Render.X(w.x);
      const by = Render.Y(w.y);
      Render.disc(bx, by, 2, '#2fd07a');
      Render.disc(bx, by, 1, '#b6ffd6');
      Render.rect(bx, by, 1, 1, '#ffffff');
    }
  }
}

// 카드에서 새로 얻을 수 있는 무기들 (불꽃탄은 처음부터 들고 시작한다)
const WEAPON_TYPES = [OrbWeapon, LaserWeapon, LightningWeapon, FrostWeapon, MeteorWeapon, ScytheWeapon, WispWeapon];
