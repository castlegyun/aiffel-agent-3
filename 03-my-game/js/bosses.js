// 보스 상태머신과, 보스가 만드는 위험 지대(충격파 고리, 예고 뒤 터지는 지대, 휩쓰는 광선).
// 보스마다 CONFIG.bosses의 sequence(행동 순서)를 따라 상태를 돌고, 체력이 줄면 페이즈가 올라 더 거세진다.

// ---- 위험 지대: 플레이어만 다치게 하는 바닥·공중의 공격 ----
const Hazards = {
  list: [],

  reset() {
    this.list.length = 0;
  },

  // 퍼져 나가는 충격파 고리. gap 방향으로 gapWidth(라디안)만큼 틈이 있어서 그쪽으로 피한다.
  ring(x, y, speed, max, damage, gap, gapWidth) {
    this.list.push({ kind: 'ring', x, y, r: 24, speed, max, damage, gap, gw: gapWidth, t: 0 });
  },

  // 바닥에 붉은 원이 차오른 뒤(delay초) 터지는 지대
  zone(x, y, r, delay, damage) {
    this.list.push({ kind: 'zone', x, y, r, delay, damage, t: 0 });
  },

  // 아무 피해 없이 자리만 알려 주는 표시 (순간이동해 올 자리)
  mark(x, y, r, time) {
    this.list.push({ kind: 'mark', x, y, r, delay: time, t: 0 });
  },

  // owner에게서 뻗는 광선. windup 동안 가는 예고선이 보이고, 그 뒤 sweep(라디안)만큼 휩쓴다.
  beam(owner, C, angle, sign) {
    this.list.push({ kind: 'beam', owner, C, angle, sign, t: 0 });
  },

  beamAngle(h) {
    const k = Math.min(1, Math.max(0, (h.t - h.C.windup) / h.C.duration));
    return h.angle + h.sign * h.C.sweep * (k - 0.5);
  },

  update(dt, player) {
    for (const h of this.list) {
      h.t += dt;
      const dx = player.x - h.x;
      const dy = player.y - h.y;
      if (h.kind === 'ring') {
        h.r += h.speed * dt;
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - h.r) < 12 + player.radius) {
          // 틈 방향에 서 있으면 맞지 않는다
          let a = Math.atan2(dy, dx) - h.gap;
          a = Math.atan2(Math.sin(a), Math.cos(a));
          if (Math.abs(a) > h.gw / 2) player.takeDamage(h.damage);
        }
        if (h.r > h.max) h.dead = true;
      } else if (h.kind === 'zone') {
        if (h.t >= h.delay) {
          if (dx * dx + dy * dy < (h.r + player.radius * 0.6) ** 2) player.takeDamage(h.damage);
          Effects.flash(h.x, h.y, h.r * 0.9, 0.22);
          Effects.ring(h.x, h.y, h.r * 2, '255, 120, 60', 0.35);
          Effects.burst(h.x, h.y, 14, ['#ff7a1a', '#ffb43a', '#c4221a'], 200, 0.45);
          Sfx.blast();
          h.dead = true;
        }
      } else if (h.kind === 'mark') {
        if (h.t >= h.delay) h.dead = true;
      } else if (h.kind === 'beam') {
        const o = h.owner;
        const C = h.C;
        if (o.hp <= 0 || o.dead || h.t >= C.windup + C.duration) {
          h.dead = true;
        } else if (h.t >= C.windup) {
          // 점과 선분 사이의 거리로 맞았는지 본다
          const a = this.beamAngle(h);
          const ux = Math.cos(a);
          const uy = Math.sin(a);
          const px = player.x - o.x;
          const py = player.y - o.y;
          const along = px * ux + py * uy;
          const across = Math.abs(px * uy - py * ux);
          if (along > 0 && along < C.length && across < C.width / 2 + player.radius * 0.7) player.takeDamage(C.damage);
        }
      }
    }
    removeDead(this.list, (h) => h.dead);
  },

  // 바닥에 깔리는 예고 표시
  drawGround(g) {
    for (const h of this.list) {
      if (h.kind === 'zone' || h.kind === 'mark') {
        const k = Math.min(1, h.t / h.delay);
        const bx = Render.X(h.x);
        const by = Render.Y(h.y);
        const r = Math.round(h.r * 0.5);
        const mark = h.kind === 'mark';
        g.globalAlpha = 0.1 + 0.25 * k;
        Render.disc(bx, by, Math.round(r * k), mark ? '#7a4ad0' : '#c4221a');
        g.globalAlpha = 0.5 + 0.5 * k;
        Render.ring(bx, by, r, mark ? '#c9a0ff' : '#ff5a3c', 1);
        g.globalAlpha = 1;
      } else if (h.kind === 'beam' && h.t < h.C.windup) {
        // 광선이 지나갈 부채꼴의 양 끝과 시작 방향을 가는 선으로 미리 보여 준다
        const o = h.owner;
        const k = h.t / h.C.windup;
        const x0 = Render.X(o.x);
        const y0 = Render.Y(o.y);
        g.globalAlpha = 0.25 + 0.6 * k;
        for (const s of [-0.5, 0.5]) {
          const a = h.angle + h.sign * h.C.sweep * s;
          Render.line(x0, y0, Render.X(o.x + Math.cos(a) * h.C.length), Render.Y(o.y + Math.sin(a) * h.C.length), s < 0 ? '#ff5a3c' : '#8a2a1c', s < 0 ? 2 : 1);
        }
        g.globalAlpha = 1;
      }
    }
  },

  addLights() {
    for (const h of this.list) {
      if (h.kind === 'beam' && h.t >= h.C.windup) {
        const a = this.beamAngle(h);
        for (let d = 80; d < h.C.length; d += 140) Render.light(h.owner.x + Math.cos(a) * d, h.owner.y + Math.sin(a) * d, 150);
      }
    }
  },

  // 어둠 위에 그리는 것: 충격파 고리와 광선 (가산 합성)
  draw(g) {
    g.globalCompositeOperation = 'lighter';
    for (const h of this.list) {
      if (h.kind === 'ring') {
        const bx = Render.X(h.x);
        const by = Render.Y(h.y);
        const r = h.r * 0.5;
        const steps = Math.ceil(r * 4.2);
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          let d = a - h.gap;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) < h.gw / 2) continue; // 틈
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          g.fillStyle = '#c4521a';
          g.fillRect(Math.round(bx + cx * r) - 1, Math.round(by + cy * r) - 1, 3, 3);
          g.fillStyle = '#ffe27a';
          g.fillRect(Math.round(bx + cx * (r - 1)), Math.round(by + cy * (r - 1)), 1, 1);
        }
      } else if (h.kind === 'beam' && h.t >= h.C.windup) {
        const o = h.owner;
        const a = this.beamAngle(h);
        const x0 = Render.X(o.x);
        const y0 = Render.Y(o.y);
        const x1 = Render.X(o.x + Math.cos(a) * h.C.length);
        const y1 = Render.Y(o.y + Math.sin(a) * h.C.length);
        const w = Math.round(h.C.width * 0.5);
        const flick = Math.floor(h.t * 30) % 2; // 두 프레임마다 굵기가 바뀌며 이글거린다
        Render.line(x0, y0, x1, y1, '#7a1c08', w + 4 + flick * 2);
        Render.line(x0, y0, x1, y1, '#ff7a1a', w);
        Render.line(x0, y0, x1, y1, '#fff4c8', Math.max(2, w >> 1));
      }
    }
    g.globalCompositeOperation = 'source-over';
  },
};

// ---- 보스 상태머신 ----
// 상태마다 enter(시작할 때 한 번)와 update(매 프레임)를 가진다.
//   e 보스, f 상태 기억(e.fsm), C 그 상태의 설정(CONFIG.bosses[..][상태 이름]), rage 페이즈-1 (0, 1, 2)
const BossFSM = {
  init(e) {
    e.fsm = { i: 0, state: e.cfg.sequence[0], t: e.cfg.chaseTime, sub: '', n: 0, timer: 0, angle: 0, flag: false, x: 0, y: 0 };
  },

  update(e, dt, c) {
    const B = e.cfg;
    const f = e.fsm;

    // 체력이 정해진 비율 아래로 내려가면 다음 페이즈 (한 번씩만)
    while (e.phase <= B.phases.length && e.hp <= e.maxHp * B.phases[e.phase - 1]) {
      e.phase++;
      e.sprite = Sprites[B.sprites[Math.min(e.phase - 1, B.sprites.length - 1)]];
      c.world.announce(`${B.name} 분노!`);
      Sfx.bossRage();
      Effects.shake(8, 0.6);
      Effects.pulse([196, 34, 26], 1, 0.7);
      Effects.ring(e.x, e.y, 300, '255, 90, 60', 0.5);
    }
    this.states[f.state].update(e, f, dt, c, B[f.state], e.phase - 1);
  },

  // 다음 상태로 넘어간다
  next(e) {
    const f = e.fsm;
    const B = e.cfg;
    f.i = (f.i + 1) % B.sequence.length;
    f.state = B.sequence[f.i];
    f.sub = '';
    f.n = 0;
    f.timer = 0;
    f.flag = false;
    e.dashing = false;
    e.telegraph = null;
    e.tele = null;
    this.states[f.state].enter(e, f, B[f.state], e.phase - 1);
  },

  // 페이즈가 오를수록 행동 간격이 줄어든다
  quick(rage) {
    return 1 - CONFIG.bossRage.interval * rage;
  },
};

BossFSM.states = {
  // 추적: 정해진 시간 동안 플레이어를 쫓는다
  chase: {
    enter(e, f, C, rage) {
      f.t = e.cfg.chaseTime * (1 - CONFIG.bossRage.chase * rage);
    },
    update(e, f, dt, c) {
      AI.behaviors.chase(e, dt, c);
      f.t -= dt;
      if (f.t <= 0) BossFSM.next(e);
    },
  },

  // 돌진: 멈춰서 예고선을 그린 뒤 직선으로 달린다. 페이즈가 오르면 연달아 한 번씩 더 돌진한다.
  charge: {
    enter(e, f, C) {
      f.sub = 'windup';
      f.t = C.windup;
    },
    update(e, f, dt, c, C, rage) {
      f.t -= dt;
      if (f.sub === 'windup') {
        if (f.t > 0.2) {
          e.dir.x = c.tx;
          e.dir.y = c.ty;
        }
        const total = f.n ? C.windup * 0.55 : C.windup;
        AI.setTelegraph(e, e.dir.x, e.dir.y, C.dashSpeed * C.dashTime, 1 - f.t / total);
        if (f.t <= 0) {
          f.sub = 'dash';
          f.t = C.dashTime;
          e.dashing = true;
          e.telegraph = null;
          AI.dashSound(e, c);
        }
      } else {
        c.out.x = e.dir.x * C.dashSpeed;
        c.out.y = e.dir.y * C.dashSpeed;
        if (f.t <= 0) {
          e.dashing = false;
          if (f.n < rage) {
            f.n++;
            f.sub = 'windup';
            f.t = C.windup * 0.55;
          } else {
            BossFSM.next(e);
          }
        }
      }
    },
  },

  // 원형 탄막: 제자리에서 고리 모양으로 여러 번 쏜다. 줄마다 틈이 엇갈린다.
  barrage: {
    enter(e, f, C) {
      f.t = C.duration;
    },
    update(e, f, dt, c, C, rage) {
      f.t -= dt;
      f.timer -= dt;
      if (f.timer <= 0) {
        f.timer += C.interval * BossFSM.quick(rage);
        const n = C.bullets + CONFIG.bossRage.bullets * rage;
        const offset = (f.n % 2) * (Math.PI / n);
        for (let k = 0; k < n; k++) {
          const a = offset + (k * Math.PI * 2) / n;
          c.world.shoot(e.x, e.y, Math.cos(a), Math.sin(a), C.bulletSpeed, C.damage, true);
        }
        f.n++;
      }
      if (f.t <= 0) BossFSM.next(e);
    },
  },

  // 나선 탄막: 여러 갈래의 탄 줄기가 빙글빙글 돌며 퍼진다. 천천히 다가오면서 쏜다.
  spiral: {
    enter(e, f, C) {
      f.t = C.duration;
      f.angle = Math.random() * Math.PI * 2;
    },
    update(e, f, dt, c, C, rage) {
      c.out.x = c.tx * e.speed * 0.3;
      c.out.y = c.ty * e.speed * 0.3;
      f.t -= dt;
      f.timer -= dt;
      if (f.timer <= 0) {
        f.timer += C.interval * BossFSM.quick(rage);
        const arms = C.arms + rage;
        for (let k = 0; k < arms; k++) {
          const a = f.angle + (k * Math.PI * 2) / arms;
          c.world.shoot(e.x, e.y, Math.cos(a), Math.sin(a), C.bulletSpeed, C.damage, true);
        }
        f.angle += C.turn;
      }
      if (f.t <= 0) BossFSM.next(e);
    },
  },

  // 소환: 발밑에 원을 그린 뒤 둘레에 졸개를 불러낸다
  summon: {
    enter(e, f, C) {
      f.t = C.windup;
    },
    update(e, f, dt, c, C, rage) {
      f.t -= dt;
      if (!f.flag) AI.setTele(e, e.radius + 70, 1 - Math.max(0, f.t) / C.windup);
      if (f.t > 0) return;
      if (f.flag) return BossFSM.next(e);
      f.flag = true;
      e.tele = null;
      const n = C.count + CONFIG.bossRage.summon * rage;
      for (let k = 0; k < n; k++) {
        const a = (k * Math.PI * 2) / n;
        c.world.spawnEnemy(C.types[k % C.types.length], e.x + Math.cos(a) * (e.radius + 40), e.y + Math.sin(a) * (e.radius + 40), { rise: true });
      }
      f.t = 0.8; // 소환 직후 잠깐 멈춤
    },
  },

  // 내려찍기: 발밑에 원이 차오른 뒤, 틈이 하나 있는 충격파 고리가 연달아 퍼진다
  slam: {
    enter(e, f, C) {
      f.t = C.windup;
    },
    update(e, f, dt, c, C, rage) {
      f.t -= dt;
      if (f.n === 0) AI.setTele(e, 150, 1 - Math.max(0, f.t) / C.windup);
      if (f.t > 0) return;
      const rings = C.rings + rage;
      if (f.n >= rings) return BossFSM.next(e);
      e.tele = null;
      // 틈은 플레이어가 있는 방향에서 조금 벗어난 곳에 생긴다: 옆으로 움직여 틈에 들어가야 한다
      const toPlayer = Math.atan2(c.ty, c.tx);
      const gap = toPlayer + (Math.random() < 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.5);
      Hazards.ring(e.x, e.y, C.speed, C.max, C.damage, gap, 1.0);
      Effects.shake(7, 0.35);
      Effects.flash(e.x, e.y + e.radius * 0.5, 70, 0.18);
      Effects.burst(e.x, e.y + e.radius * 0.5, 16, ['#8a7a68', '#4a3f38', '#ffffff'], 220, 0.5);
      Sfx.slam();
      f.n++;
      f.t = f.n >= rings ? 0.7 : C.gap;
    },
  },

  // 순간이동: 보랏빛 원으로 나타날 자리를 알린 뒤 그곳으로 옮겨 간다
  teleport: {
    enter(e, f, C) {
      const a = Math.random() * Math.PI * 2;
      f.x = Math.cos(a) * C.dist;
      f.y = Math.sin(a) * C.dist;
      f.t = C.windup;
    },
    update(e, f, dt, c, C) {
      if (!f.flag) {
        // 나타날 자리는 "지금 플레이어 위치" 기준으로 한 번 정한다
        f.flag = true;
        f.x += c.player.x;
        f.y += c.player.y;
        Hazards.mark(f.x, f.y, e.radius + 20, C.windup);
      }
      f.t -= dt;
      e.flash = 0.03;
      if (f.t > 0) return;
      Effects.burst(e.x, e.y, 26, ['#c9a0ff', '#7a4ad0', '#ffffff'], 220, 0.5, 0);
      e.x = f.x;
      e.y = f.y;
      Effects.burst(e.x, e.y, 26, ['#c9a0ff', '#7a4ad0', '#ffffff'], 220, 0.5, 0);
      Effects.ring(e.x, e.y, 120, '201, 160, 255', 0.35);
      Sfx.teleport();
      BossFSM.next(e);
    },
  },

  // 저주 지대: 플레이어 주변 바닥에 붉은 원을 차례로 깔고, 잠시 뒤 터뜨린다
  zones: {
    enter() {},
    update(e, f, dt, c, C, rage) {
      c.out.x = c.tx * e.speed * 0.4;
      c.out.y = c.ty * e.speed * 0.4;
      const count = C.count + rage * 2;
      f.timer -= dt;
      if (f.timer > 0) return;
      if (f.n >= count) return BossFSM.next(e);
      // 첫 번째는 플레이어 발밑, 나머지는 그 둘레에 흩뿌린다
      const spread = f.n === 0 ? 0 : 130;
      Hazards.zone(c.player.x + (Math.random() * 2 - 1) * spread, c.player.y + (Math.random() * 2 - 1) * spread, C.radius, C.delay, C.damage);
      f.n++;
      f.timer = f.n >= count ? C.delay + 0.3 : C.gap * BossFSM.quick(rage);
    },
  },

  // 광선: 예고선을 보여 준 뒤 부채꼴로 휩쓴다. 광선이 오는 반대쪽으로 돌거나 점멸로 넘는다.
  beam: {
    enter(e, f, C) {
      f.t = C.windup + C.duration + 0.3;
    },
    update(e, f, dt, c, C) {
      if (!f.flag) {
        f.flag = true;
        Hazards.beam(e, C, Math.atan2(c.ty, c.tx), Math.random() < 0.5 ? 1 : -1);
        Sfx.beam();
      }
      f.t -= dt;
      if (f.t <= 0) BossFSM.next(e);
    },
  },
};
