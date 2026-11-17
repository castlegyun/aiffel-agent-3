// 적 AI: 군집 이동, 타입별 행동, AI 디렉터.
// (보스는 js/bosses.js, 등장 시간표는 js/waves.js)

const AI = {
  grid: new Map(),
  used: [],  // 이번 프레임에 적이 들어간 칸들 (다음 프레임에 비울 때 쓴다)
  big: [],   // 격자 한 칸보다 큰 몸집(보스 등). 격자에 넣지 않고 항상 따로 검사한다.
  hits: [],  // near()가 돌려주는 후보 목록 (매번 새로 만들지 않고 다시 쓴다)

  // 행동 함수에 넘기는 공용 정보 (매 호출마다 새로 만들지 않고 재사용)
  ctx: { player: null, dist: 0, tx: 0, ty: 0, world: null, out: { x: 0, y: 0 } },

  // 적들을 공간 분할 격자에 넣는다. 이웃 검사를 O(n²) 대신 거의 O(n)으로 줄인다.
  rebuild(enemies) {
    for (const b of this.used) b.length = 0;
    this.used.length = 0;
    this.big.length = 0;
    if (this.grid.size > 6000) this.grid.clear(); // 멀리 돌아다니며 쌓인 빈 칸을 가끔 치운다
    const cell = CONFIG.separation.cell;
    for (const e of enemies) {
      if (e.radius > cell * 0.55) {
        this.big.push(e);
        continue;
      }
      const key = this.key(Math.floor(e.x / cell), Math.floor(e.y / cell));
      let bucket = this.grid.get(key);
      if (!bucket) this.grid.set(key, (bucket = []));
      if (!bucket.length) this.used.push(bucket);
      bucket.push(e);
    }
  },

  key(cx, cy) {
    return (cx & 0xffff) * 65536 + (cy & 0xffff);
  },

  // (x, y) 주변 3x3 칸의 적 + 큰 몸집 전부를 목록으로 돌려준다. 충돌 후보를 좁힐 때 쓴다.
  // 돌려준 목록은 다음에 near()를 부르면 바뀌므로, 받은 자리에서 바로 써야 한다.
  near(x, y) {
    const out = this.hits;
    out.length = 0;
    const cell = CONFIG.separation.cell;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const bucket = this.grid.get(this.key(ix, iy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    for (let i = 0; i < this.big.length; i++) out.push(this.big[i]);
    return out;
  },

  // 겹친 이웃들의 반대 방향으로 밀어내는 벡터를 out에 담는다.
  separation(e, out) {
    out.x = 0;
    out.y = 0;
    if (e.cfg.noSep) return; // 유령은 밀리지 않는다
    const cell = CONFIG.separation.cell;
    const cx = Math.floor(e.x / cell);
    const cy = Math.floor(e.y / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const bucket = this.grid.get(this.key(ix, iy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) this.pushApart(e, bucket[i], out);
      }
    }
    for (let i = 0; i < this.big.length; i++) this.pushApart(e, this.big[i], out);
  },

  pushApart(e, o, out) {
    if (o === e || o.cfg.noSep) return; // 유령은 남을 밀지도 않는다
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const minD = e.radius + o.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD) return;
    if (d2 < 0.0001) {
      // 완전히 같은 자리면 임의 방향으로 살짝 떼어 놓는다
      const a = Math.random() * Math.PI * 2;
      out.x += Math.cos(a);
      out.y += Math.sin(a);
      return;
    }
    const d = Math.sqrt(d2);
    const push = (minD - d) / minD;
    out.x += (dx / d) * push;
    out.y += (dy / d) * push;
  },

  // 행동에 필요한 상태값을 적에게 붙인다
  initBehavior(e) {
    const b = e.cfg.behavior || 'chase';
    e.dir = { x: 1, y: 0 };
    if (b === 'ranged') {
      e.shootTimer = 1 + Math.random() * 1.5;
      e.strafeDir = Math.random() < 0.5 ? 1 : -1;
    } else if (b === 'charge') {
      e.st = 'approach';
      e.timer = 0;
    } else if (b === 'fly') {
      e.life = e.cfg.life;
    } else if (b === 'bomber') {
      e.st = 'chase';
      e.timer = 0;
    } else if (b === 'ghost') {
      e.weave = Math.random() * Math.PI * 2;
    } else if (b === 'necro') {
      e.strafeDir = Math.random() < 0.5 ? 1 : -1;
      e.timer = 2 + Math.random() * 2;
      e.st = 'walk';
    } else if (b === 'turret') {
      e.timer = 1 + Math.random() * 1.5;
    } else if (b === 'boss') {
      BossFSM.init(e);
    }
  },

  // 돌진을 시작할 때 소리를 낸다. 멀리 있는 적일수록 작게, 아주 멀면 아예 안 낸다.
  dashSound(e, c) {
    const vol = 1 - c.dist / 900;
    if (vol > 0.05) Sfx.dash(vol, e.isBoss);
  },

  // 직선 예고선을 갱신한다
  setTelegraph(e, dirX, dirY, len, progress) {
    const t = e.telegraph || (e.telegraph = { dx: 0, dy: 0, len: 0, progress: 0 });
    t.dx = dirX;
    t.dy = dirY;
    t.len = len;
    t.progress = progress;
  },

  // 원형 예고를 갱신한다
  setTele(e, r, progress) {
    const t = e.tele || (e.tele = { r: 0, progress: 0 });
    t.r = r;
    t.progress = progress;
  },
};

// ---- 행동 함수들: c.out에 "이번 프레임에 가고 싶은 속도"를 적는다 ----
AI.behaviors = {
  // 추적: 플레이어를 향해 직진
  chase(e, dt, c) {
    if (c.dist > e.radius + c.player.radius) {
      c.out.x = c.tx * e.speed;
      c.out.y = c.ty * e.speed;
    }
  },

  // 거리 유지: 가까우면 물러나고 멀면 다가오며, 적정 거리에서는 옆으로 천천히 돈다
  keepAway(e, c, keepDist) {
    if (c.dist > keepDist) {
      c.out.x = c.tx * e.speed;
      c.out.y = c.ty * e.speed;
    } else if (c.dist < keepDist - 50) {
      c.out.x = -c.tx * e.speed * 0.9;
      c.out.y = -c.ty * e.speed * 0.9;
    } else {
      c.out.x = -c.ty * e.strafeDir * e.speed * 0.5;
      c.out.y = c.tx * e.strafeDir * e.speed * 0.5;
    }
  },

  // 원거리: 적당한 거리를 유지하며 주기적으로 쏜다
  ranged(e, dt, c) {
    const T = e.cfg;
    this.keepAway(e, c, T.keepDist);
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && c.dist < T.shootRange) {
      e.shootTimer = T.shootInterval + Math.random() * 0.4;
      c.world.shoot(e.x, e.y, c.tx, c.ty, T.bulletSpeed, T.bulletDamage);
    }
  },

  // 돌진: 접근 → 멈춤 + 예고선 → 직선 돌진 → 쉬는 시간
  charge(e, dt, c) {
    const T = e.cfg;
    if (e.st === 'approach') {
      c.out.x = c.tx * e.speed;
      c.out.y = c.ty * e.speed;
      if (c.dist < T.chargeRange) {
        e.st = 'windup';
        e.timer = T.windup;
      }
    } else if (e.st === 'windup') {
      e.timer -= dt;
      // 마지막 0.15초 전까지는 플레이어를 따라 조준하고, 그 뒤에는 방향을 고정한다
      if (e.timer > 0.15) {
        e.dir.x = c.tx;
        e.dir.y = c.ty;
      }
      AI.setTelegraph(e, e.dir.x, e.dir.y, T.dashSpeed * T.dashTime, 1 - e.timer / T.windup);
      if (e.timer <= 0) {
        e.st = 'dash';
        e.timer = T.dashTime;
        e.dashing = true;
        e.telegraph = null;
        AI.dashSound(e, c);
      }
    } else if (e.st === 'dash') {
      c.out.x = e.dir.x * T.dashSpeed;
      c.out.y = e.dir.y * T.dashSpeed;
      e.timer -= dt;
      if (e.timer <= 0) {
        e.st = 'rest';
        e.timer = T.rest;
        e.dashing = false;
      }
    } else {
      // 쉬는 동안은 느리게 따라온다
      c.out.x = c.tx * e.speed * 0.4;
      c.out.y = c.ty * e.speed * 0.4;
      e.timer -= dt;
      if (e.timer <= 0) e.st = 'approach';
    }
  },

  // 비행(박쥐 떼): 정해진 방향으로 곧장 날아가 화면을 가로지른 뒤 사라진다
  fly(e, dt, c) {
    c.out.x = e.dir.x * e.speed;
    c.out.y = e.dir.y * e.speed;
    e.facing = e.dir.x >= 0 ? 1 : -1;
    e.life -= dt;
    if (e.life <= 0) e.dead = true;
  },

  // 자폭: 달려와서 가까워지면 멈추고, 붉은 원이 다 차면 터진다. 터지기 전에 잡거나 원 밖으로 피해야 한다.
  bomber(e, dt, c) {
    const T = e.cfg;
    if (e.st === 'chase') {
      c.out.x = c.tx * e.speed;
      c.out.y = c.ty * e.speed;
      if (c.dist < T.fuseRange) {
        e.st = 'fuse';
        e.timer = T.fuse;
      }
      return;
    }
    e.timer -= dt;
    e.flash = 0.03; // 터지기 직전에는 계속 번쩍인다
    AI.setTele(e, T.blastRadius, 1 - e.timer / T.fuse);
    if (e.timer > 0) return;
    if (c.dist < T.blastRadius + c.player.radius) c.player.takeDamage(T.blastDamage);
    Effects.flash(e.x, e.y, T.blastRadius * 0.9, 0.2);
    Effects.ring(e.x, e.y, T.blastRadius * 2, '255, 150, 50', 0.35);
    Effects.burst(e.x, e.y, 22, ['#ff7a1a', '#ffb43a', '#fff4c8', '#2a2a34'], 240, 0.5);
    Effects.shake(4, 0.25);
    Sfx.blast();
    e.dead = true; // 스스로 터지면 경험치를 주지 않는다
  },

  // 유령: 다른 적을 그대로 통과하며, 좌우로 흔들리면서 다가온다
  ghost(e, dt, c) {
    e.weave += dt * 3;
    const side = Math.sin(e.weave) * 0.6;
    c.out.x = (c.tx - c.ty * side) * e.speed;
    c.out.y = (c.ty + c.tx * side) * e.speed;
  },

  // 강령술사: 거리를 두고 맴돌다가, 초록 원을 그린 뒤 그 안에서 해골을 일으킨다
  necro(e, dt, c) {
    const T = e.cfg;
    e.timer -= dt;
    if (e.st === 'walk') {
      this.keepAway(e, c, T.keepDist);
      if (e.timer <= 0 && c.dist < 520) {
        e.st = 'cast';
        e.timer = T.summonWindup;
      }
      return;
    }
    AI.setTele(e, 70, 1 - e.timer / T.summonWindup);
    if (e.timer > 0) return;
    for (let k = 0; k < T.summonCount; k++) {
      const a = Math.random() * Math.PI * 2;
      c.world.spawnEnemy(T.summonType, e.x + Math.cos(a) * 44, e.y + Math.sin(a) * 44, { rise: true });
    }
    Effects.burst(e.x, e.y, 10, ['#7dff8a', '#2f5c44', '#ffffff'], 130, 0.4, 0);
    e.tele = null;
    e.st = 'walk';
    e.timer = T.summonInterval;
  },

  // 포탑: 제자리에서 플레이어를 겨누다가(붉은 예고선) 부채꼴로 쏜다
  turret(e, dt, c) {
    const T = e.cfg;
    e.timer -= dt;
    if (c.dist > T.range) {
      e.telegraph = null;
      e.timer = Math.max(e.timer, T.aim);
      return;
    }
    if (e.timer < T.aim) {
      // 쏘기 직전 0.2초 전까지만 따라 겨눈다: 그 뒤에 옆으로 피하면 빗나간다
      if (e.timer > 0.2) {
        e.dir.x = c.tx;
        e.dir.y = c.ty;
      }
      AI.setTelegraph(e, e.dir.x, e.dir.y, T.range, 1 - e.timer / T.aim);
    }
    if (e.timer > 0) return;
    const base = Math.atan2(e.dir.y, e.dir.x);
    for (let k = 0; k < T.bullets; k++) {
      const a = base + (k - (T.bullets - 1) / 2) * T.spread;
      c.world.shoot(e.x, e.y, Math.cos(a), Math.sin(a), T.bulletSpeed, T.bulletDamage);
    }
    e.telegraph = null;
    e.timer = T.shootInterval;
  },

  // 보스: 상태머신 (js/bosses.js)
  boss(e, dt, c) {
    BossFSM.update(e, dt, c);
  },
};

// ---- AI 디렉터: 플레이어의 체력과 처치 속도를 보고 스폰량을 조절한다 ----
// 체력이 넉넉하고 잘 잡고 있으면 더 몰아치고, 위기이거나 못 잡고 있으면 숨 돌릴 틈을 준다.
const Director = {
  mult: 1,       // 스폰 속도 배율 (min~max)
  recent: 0,     // 지수 감쇠로 합친 최근 처치 수
  killRate: 0,   // 최근 처치 속도(마리/초)

  reset() {
    this.mult = 1;
    this.recent = 0;
    this.killRate = 0;
  },

  // refRate: 지금 시간대의 기본 등장 속도(마리/초). 이만큼 잡고 있으면 "보통"으로 본다.
  update(dt, player, killsThisFrame, refRate) {
    const D = CONFIG.director;
    this.recent = this.recent * Math.exp(-dt / D.tau) + killsThisFrame;
    this.killRate = this.recent / D.tau;

    const hpRatio = player.hp / player.maxHp;
    const killScore = Math.min(this.killRate / refRate, 2) - 1; // -1 ~ +1
    const score = (hpRatio - 0.5) * 0.8 + killScore * 0.2;
    const target = Math.min(D.max, Math.max(D.min, 1 + score));
    this.mult += (target - this.mult) * Math.min(1, D.smooth * dt); // 급변하지 않게 천천히 따라간다
  },
};
