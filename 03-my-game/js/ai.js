// 적 AI: 군집 이동, 타입별 행동, 보스 상태머신, AI 디렉터, 스폰.

const AI = {
  grid: new Map(),

  // 행동 함수에 넘기는 공용 정보 (매 호출마다 새로 만들지 않고 재사용)
  ctx: { player: null, dist: 0, tx: 0, ty: 0, world: null, out: { x: 0, y: 0 } },

  // 적들을 공간 분할 격자에 넣는다. 이웃 검사를 O(n²) 대신 거의 O(n)으로 줄인다.
  rebuild(enemies) {
    this.grid.clear();
    const cell = CONFIG.separation.cell;
    for (const e of enemies) {
      const key = this.key(Math.floor(e.x / cell), Math.floor(e.y / cell));
      const bucket = this.grid.get(key);
      if (bucket) bucket.push(e);
      else this.grid.set(key, [e]);
    }
  },

  key(cx, cy) {
    return (cx & 0xffff) * 65536 + (cy & 0xffff);
  },

  // (x, y) 주변 3x3 칸에 있는 적들을 fn으로 넘겨준다. 충돌 후보를 좁힐 때 쓴다.
  forNearby(x, y, fn) {
    const cell = CONFIG.separation.cell;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const bucket = this.grid.get(this.key(ix, iy));
        if (!bucket) continue;
        for (const e of bucket) fn(e);
      }
    }
  },

  // 겹친 이웃들의 반대 방향으로 밀어내는 벡터를 out에 담는다.
  separation(e, out) {
    out.x = 0;
    out.y = 0;
    const cell = CONFIG.separation.cell;
    const cx = Math.floor(e.x / cell);
    const cy = Math.floor(e.y / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const bucket = this.grid.get(this.key(ix, iy));
        if (!bucket) continue;
        for (const o of bucket) {
          if (o === e) continue;
          const dx = e.x - o.x;
          const dy = e.y - o.y;
          const minD = e.radius + o.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD) continue;
          if (d2 < 0.0001) {
            // 완전히 같은 자리면 임의 방향으로 살짝 떼어 놓는다
            const a = Math.random() * Math.PI * 2;
            out.x += Math.cos(a);
            out.y += Math.sin(a);
            continue;
          }
          const d = Math.sqrt(d2);
          const push = (minD - d) / minD;
          out.x += (dx / d) * push;
          out.y += (dy / d) * push;
        }
      }
    }
  },

  // 행동에 필요한 상태값을 적에게 붙인다
  initBehavior(e) {
    const b = e.cfg.behavior || 'chase';
    if (b === 'ranged') {
      e.shootTimer = 1 + Math.random() * 1.5;
      e.strafeDir = Math.random() < 0.5 ? 1 : -1;
    } else if (b === 'charge') {
      e.st = 'approach';
      e.timer = 0;
      e.dir = { x: 1, y: 0 };
    } else if (b === 'boss') {
      e.fsm = { i: 0, state: 'chase', t: e.cfg.chaseTime, shotTimer: 0, shots: 0, ring: 0, sub: 'windup', summoned: false };
      e.dir = { x: 1, y: 0 }; // 돌진 방향 (예고 단계에서 플레이어 쪽으로 갱신된다)
    }
  },

  // 돌진을 시작할 때 소리를 낸다. 멀리 있는 적일수록 작게, 아주 멀면 아예 안 낸다.
  dashSound(e, c) {
    const vol = 1 - c.dist / 900;
    if (vol > 0.05) Sfx.dash(vol, e.isBoss);
  },

  // 직선 돌진 준비/실행에 쓰는 공통 도우미: 예고선을 갱신한다
  setTelegraph(e, dirX, dirY, len, progress) {
    e.telegraph = { dx: dirX, dy: dirY, len, progress };
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

  // 원거리: 적당한 거리를 유지하고(가까우면 물러나고 멀면 다가옴) 주기적으로 쏜다
  ranged(e, dt, c) {
    const T = e.cfg;
    if (c.dist > T.keepDist) {
      c.out.x = c.tx * e.speed;
      c.out.y = c.ty * e.speed;
    } else if (c.dist < T.keepDist - 50) {
      c.out.x = -c.tx * e.speed * 0.9;
      c.out.y = -c.ty * e.speed * 0.9;
    } else {
      // 적정 거리에서는 옆으로 천천히 돈다
      c.out.x = -c.ty * e.strafeDir * e.speed * 0.5;
      c.out.y = c.tx * e.strafeDir * e.speed * 0.5;
    }
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

  // 보스: 상태머신 (추적 → 돌진 → 탄막 → 추적 → 소환 → 반복)
  boss(e, dt, c) {
    BossFSM.update(e, dt, c);
  },
};

const BossFSM = {
  update(e, dt, c) {
    const B = CONFIG.boss;
    const f = e.fsm;

    // 체력이 절반 이하가 되면 2페이즈로 넘어간다 (한 번만)
    if (e.phase === 1 && e.hp <= e.maxHp * B.phase2.hpRatio) {
      e.phase = 2;
      e.speed *= B.phase2.speedMul;
      c.world.announce(`${B.name}이 분노한다!`);
      Sfx.bossRage();
      Effects.shake(8, 0.6);
    }
    const rage = e.phase === 2;

    switch (f.state) {
      case 'chase':
        this.chase(e, f, dt, c, rage);
        break;
      case 'charge':
        this.charge(e, f, dt, c);
        break;
      case 'barrage':
        this.barrage(e, f, dt, c, rage);
        break;
      case 'summon':
        this.summon(e, f, dt, c, rage);
        break;
    }
  },

  // 다음 상태로 넘어간다
  next(e, f, rage) {
    const B = CONFIG.boss;
    f.i = (f.i + 1) % B.sequence.length;
    f.state = B.sequence[f.i];
    e.dashing = false;
    e.telegraph = null;
    if (f.state === 'chase') f.t = B.chaseTime * (rage ? B.phase2.chaseMul : 1);
    if (f.state === 'charge') { f.sub = 'windup'; f.t = B.charge.windup; }
    if (f.state === 'barrage') { f.t = B.barrage.duration; f.shotTimer = 0; f.ring = 0; }
    if (f.state === 'summon') { f.t = B.summon.windup; f.summoned = false; }
  },

  chase(e, f, dt, c, rage) {
    AI.behaviors.chase(e, dt, c);
    f.t -= dt;
    if (f.t <= 0) this.next(e, f, rage);
  },

  charge(e, f, dt, c) {
    const B = CONFIG.boss.charge;
    f.t -= dt;
    if (f.sub === 'windup') {
      if (f.t > 0.2) {
        e.dir = e.dir || { x: 0, y: 0 };
        e.dir.x = c.tx;
        e.dir.y = c.ty;
      }
      AI.setTelegraph(e, e.dir.x, e.dir.y, B.dashSpeed * B.dashTime, 1 - f.t / B.windup);
      if (f.t <= 0) {
        f.sub = 'dash';
        f.t = B.dashTime;
        e.dashing = true;
        e.telegraph = null;
        AI.dashSound(e, c);
      }
    } else {
      c.out.x = e.dir.x * B.dashSpeed;
      c.out.y = e.dir.y * B.dashSpeed;
      if (f.t <= 0) this.next(e, f, e.phase === 2);
    }
  },

  // 제자리에서 원형 탄막을 여러 번 쏜다. 2페이즈는 더 빠르고, 더 많이, 엇갈리게.
  barrage(e, f, dt, c, rage) {
    const B = CONFIG.boss.barrage;
    const P = CONFIG.boss.phase2;
    f.t -= dt;
    f.shotTimer -= dt;
    if (f.shotTimer <= 0) {
      f.shotTimer += B.interval * (rage ? P.intervalMul : 1);
      const n = B.bullets + (rage ? P.bulletsAdd : 0);
      const offset = (f.ring % 2) * (Math.PI / n); // 줄마다 틈이 어긋나게
      for (let k = 0; k < n; k++) {
        const a = offset + (k * Math.PI * 2) / n;
        c.world.shoot(e.x, e.y, Math.cos(a), Math.sin(a), B.bulletSpeed, B.damage);
      }
      f.ring++;
    }
    if (f.t <= 0) this.next(e, f, rage);
  },

  summon(e, f, dt, c, rage) {
    const B = CONFIG.boss.summon;
    f.t -= dt;
    if (f.t <= 0 && !f.summoned) {
      f.summoned = true;
      const n = B.count + (rage ? CONFIG.boss.phase2.summonAdd : 0);
      for (let k = 0; k < n; k++) {
        const a = (k * Math.PI * 2) / n;
        const type = B.types[k % B.types.length];
        c.world.spawnEnemy(type, e.x + Math.cos(a) * (e.radius + 30), e.y + Math.sin(a) * (e.radius + 30));
      }
      f.t = 0.8; // 소환 직후 잠깐 멈춤
    } else if (f.t <= 0 && f.summoned) {
      this.next(e, f, rage);
    }
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

  update(dt, player, killsThisFrame) {
    const D = CONFIG.director;
    this.recent = this.recent * Math.exp(-dt / D.tau) + killsThisFrame;
    this.killRate = this.recent / D.tau;

    const hpRatio = player.hp / player.maxHp;
    const killScore = Math.min(this.killRate / D.refKillRate, 2) - 1; // -1 ~ +1
    const score = (hpRatio - 0.5) * 0.8 + killScore * 0.2;
    const target = Math.min(D.max, Math.max(D.min, 1 + score));
    this.mult += (target - this.mult) * Math.min(1, D.smooth * dt); // 급변하지 않게 천천히 따라간다
  },
};

const Spawner = {
  timer: 0,

  // 지난 시간(초)과 디렉터 배율에 따른 스폰 간격
  interval(time, mult) {
    const S = CONFIG.spawn;
    return Math.max(S.minInterval, S.baseInterval - time * S.rampPerSec) / mult;
  },

  // 시간이 갈수록 늘어나는 적 체력 배율
  hpMul(time) {
    return 1 + time * CONFIG.spawn.hpRampPerSec;
  },

  // 1분이 지날 때마다 한 단계씩 빨라지는 적 이동 속도 배율 (상한 있음). 이미 나와 있는 적에게도 적용된다.
  speedMul(time) {
    const S = CONFIG.spawn;
    return Math.min(S.speedMulMax, 1 + Math.floor(time / 60) * S.speedStepPerMinute);
  },

  // 아직 등장 시간이 된 종류 중에서 비중대로 하나 뽑는다
  pickType(time) {
    let total = 0;
    const open = [];
    for (const type in CONFIG.enemies) {
      const T = CONFIG.enemies[type];
      if (time >= T.from) {
        open.push(type);
        total += T.weight;
      }
    }
    let r = Math.random() * total;
    for (const type of open) {
      r -= CONFIG.enemies[type].weight;
      if (r <= 0) return type;
    }
    return open[0];
  },

  // 화면 밖 원의 반지름
  spawnDistance(viewW, viewH) {
    return Math.hypot(viewW, viewH) / 2 + CONFIG.spawn.margin;
  },

  // 화면 밖 원 위의 무작위 지점
  randomPoint(player, viewW, viewH) {
    const a = Math.random() * Math.PI * 2;
    const dist = this.spawnDistance(viewW, viewH);
    return { x: player.x + Math.cos(a) * dist, y: player.y + Math.sin(a) * dist };
  },

  // rateMul: 디렉터 배율 x 보스 중 감쇠
  update(dt, time, player, enemies, viewW, viewH, rateMul) {
    this.timer -= dt;
    if (this.timer > 0 || enemies.length >= CONFIG.spawn.maxEnemies) return;
    this.timer += this.interval(time, rateMul);
    const p = this.randomPoint(player, viewW, viewH);
    enemies.push(new Enemy(this.pickType(time), p.x, p.y, this.hpMul(time)));
  },
};
