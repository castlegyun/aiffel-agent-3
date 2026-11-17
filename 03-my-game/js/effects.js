// 타격감 이펙트: 데미지 숫자, 파티클, 고리, 섬광, 죽음 연출, 잔상, 화면 가장자리 섬광, 화면 흔들림, 히트스톱.
// 그리고 모든 공격이 지나가는 hitEnemy().
// 위치와 속도는 세계 좌표로 계산하고, 그릴 때만 그림판의 정수 픽셀로 옮긴다.

// 무기별로 준 피해를 모은다 (일시정지·결과 화면에 보여 준다)
const DamageLog = {
  by: {},
  reset() { this.by = {}; },
  add(src, dmg) { if (src) this.by[src] = (this.by[src] || 0) + dmg; },
};

const Effects = {
  numbers: [],
  parts: [],     // 파티클: 한 번 만든 객체를 계속 다시 쓴다 (pn개만 살아 있다)
  pn: 0,
  rings: [],
  flashes: [],
  corpses: [],   // 죽은 적이 하얗게 흩어지는 연출
  ghosts: [],    // 점멸할 때 남는 잔상
  pulses: [],    // 화면 가장자리 섬광
  warn: 0,       // 보스 경고: 가장자리가 붉게 맥동하는 세기(0~1)
  clock: 0,
  freeze: 0,     // 히트스톱: 남은 멈춤 시간(초)
  shakeAmp: 0,
  shakeTime: 0,
  shakeMax: 0.001,

  reset() {
    this.numbers.length = 0;
    this.pn = 0;
    this.rings.length = 0;
    this.flashes.length = 0;
    this.corpses.length = 0;
    this.ghosts.length = 0;
    this.pulses.length = 0;
    this.warn = 0;
    this.freeze = 0;
    this.shakeTime = 0;
  },

  // ---- 화면 흔들림: 세기가 시간에 따라 줄어든다 ----
  shake(amp, dur) {
    if (!Settings.shake) return;
    if (amp * dur < this.shakeAmp * this.shakeTime) return; // 더 약한 흔들림은 무시
    this.shakeAmp = amp;
    this.shakeTime = dur;
    this.shakeMax = dur;
  },

  shakeOffset(out) {
    const k = this.shakeTime > 0 ? this.shakeTime / this.shakeMax : 0;
    out.x = (Math.random() * 2 - 1) * this.shakeAmp * k;
    out.y = (Math.random() * 2 - 1) * this.shakeAmp * k;
  },

  // ---- 히트스톱: 큰 타격의 순간에 게임을 아주 잠깐 멈춰 묵직하게 느끼게 한다 ----
  stop(sec) {
    this.freeze = Math.max(this.freeze, sec);
  },

  // ---- 데미지 숫자 ----
  number(x, y, value, color, big) {
    if (!Settings.numbers) return null;
    if (this.numbers.length >= CONFIG.fx.maxNumbers) this.numbers.shift().gone = true; // 가득 차면 가장 오래된 것을 지운다
    const n = {
      x: x + (Math.random() * 14 - 7),
      y,
      value,
      text: String(Math.max(1, Math.round(value))),
      color: color || '#e8dca0',
      big: !!big,
      life: CONFIG.fx.numberLife,
      max: CONFIG.fx.numberLife,
      gone: false,
    };
    this.numbers.push(n);
    return n;
  },

  // ---- 확산 고리: 폭발·충격 지점에서 퍼져 나가는 빛의 테두리 ----
  // color는 'r, g, b' 문자열
  ring(x, y, radius, color, life = 0.3) {
    if (this.rings.length >= 70) return;
    this.rings.push({ x, y, r: radius, color: `rgb(${color})`, life, max: life });
  },

  // ---- 섬광: 폭발 한가운데에서 잠깐 번쩍이고 줄어드는 불덩이. cold = 얼음색 ----
  flash(x, y, radius, life = 0.16, cold = false) {
    if (this.flashes.length >= 50) return;
    this.flashes.push({ x, y, r: radius, life, max: life, cold });
  },

  // ---- 파티클 ----
  // 사방으로 튀는 작은 조각들. colors 중 무작위, speed는 평균 속도, grav는 중력 배율(0이면 둥둥 뜬다).
  burst(x, y, count, colors, speed, life, grav = 1) {
    const max = CONFIG.fx.maxParticles;
    for (let i = 0; i < count; i++) {
      if (this.pn >= max) return;
      const p = this.parts[this.pn] || (this.parts[this.pn] = {});
      this.pn++;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.9);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s - speed * 0.2 * grav; // 살짝 위로 튄다
      p.life = life * (0.6 + Math.random() * 0.6);
      p.max = life;
      p.size = Math.random() < 0.35 ? 2 : 1; // 도트 픽셀
      p.grav = grav;
      p.color = colors[(Math.random() * colors.length) | 0];
    }
  },

  // ---- 죽음 연출: 하얀 실루엣이 듬성듬성 지워지며 떠오른다 ----
  corpse(e) {
    if (this.corpses.length >= 160) return;
    this.corpses.push({ S: e.sprite, flip: e.facing < 0, x: e.x, y: e.y, radius: e.radius, t: 0 });
  },

  // ---- 잔상: 점멸이 지나간 자리에 푸른 그림자가 남는다 ----
  ghost(frame, x, y, cx) {
    this.ghosts.push({ frame, x, y, cx, t: 0 });
  },

  // ---- 화면 가장자리 섬광. color = [r, g, b] ----
  pulse(color, strength, dur) {
    if (this.pulses.length >= 4) this.pulses.shift(); // 겹쳐도 화면이 통째로 물들지 않게
    this.pulses.push({ color, strength, life: dur, max: dur });
  },

  update(dt) {
    this.clock += dt;
    if (this.shakeTime > 0) this.shakeTime -= dt;
    for (const n of this.numbers) {
      n.life -= dt;
      n.y -= 42 * dt;
    }
    for (let i = this.pn - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        // 죽은 조각은 맨 끝의 살아 있는 조각과 자리를 바꾼다 (객체는 버리지 않는다)
        this.pn--;
        this.parts[i] = this.parts[this.pn];
        this.parts[this.pn] = p;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 380 * p.grav * dt; // 중력
      p.vx *= Math.max(0, 1 - 3 * dt); // 공기 저항
    }
    for (const g of this.rings) g.life -= dt;
    for (const f of this.flashes) f.life -= dt;
    for (const c of this.corpses) c.t += dt;
    for (const g of this.ghosts) g.t += dt;
    for (const p of this.pulses) p.life -= dt;
    removeDead(this.rings, (g) => g.life <= 0);
    removeDead(this.flashes, (f) => f.life <= 0);
    removeDead(this.corpses, (c) => c.t >= 0.27);
    removeDead(this.ghosts, (g) => g.t >= 0.3);
    removeDead(this.pulses, (p) => p.life <= 0);
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      if (this.numbers[i].life <= 0) {
        this.numbers[i].gone = true;
        this.numbers.splice(i, 1);
      }
    }
  },

  // 폭발이 주변 바닥을 잠깐 밝힌다 (어둠 레이어를 덮기 전에 부른다)
  addLights() {
    for (const f of this.flashes) Render.light(f.x, f.y, f.r * 2.4);
  },

  // 캐릭터와 같은 층: 죽은 적의 실루엣, 점멸 잔상
  drawActors(g) {
    for (const c of this.corpses) {
      const S = c.S;
      const i = Math.min(2, Math.floor((c.t / 0.27) * 3));
      const f = c.flip ? S.dieFlip[i] : S.die[i];
      Render.spr(f, Render.X(c.x) - (c.flip ? S.w - S.cx : S.cx), Render.Y(c.y) + Math.round(c.radius * 0.45) - S.h - i * 2);
    }
    for (const q of this.ghosts) {
      g.globalAlpha = 0.6 * (1 - q.t / 0.3);
      Render.spr(q.frame, Render.X(q.x) - q.cx, Render.Y(q.y) - q.frame.h);
    }
    g.globalAlpha = 1;
  },

  // 어둠 위에 그리는 빛나는 이펙트
  draw(g) {
    g.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const t = 1 - f.life / f.max; // 0 -> 1
      const bx = Render.X(f.x);
      const by = Render.Y(f.y);
      const r = f.r * 0.5;
      // 흰색 → 밝은 색 → 어두운 색으로 식으면서 줄어든다
      if (t < 0.35) Render.disc(bx, by, Math.round(r), f.cold ? '#e6f8ff' : '#fff4c8');
      else if (t < 0.7) Render.disc(bx, by, Math.round(r * 0.8), f.cold ? '#7ad0ff' : '#ffb43a');
      else Render.disc(bx, by, Math.round(r * 0.55), f.cold ? '#2a6ad8' : '#c4521a');
    }
    for (const q of this.rings) {
      const t = 1 - q.life / q.max; // 0 -> 1
      const r = Math.round(q.r * (0.35 + 0.65 * Math.sqrt(t)) * 0.5);
      g.globalAlpha = Math.ceil((1 - t) * 4) / 4; // 네 단계로 끊어서 흐려진다
      Render.ring(Render.X(q.x), Render.Y(q.y), r, q.color, t < 0.5 ? 2 : 1);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    for (let i = 0; i < this.pn; i++) {
      const p = this.parts[i];
      const s = p.life < p.max * 0.3 ? 1 : p.size; // 사라지기 직전에는 한 점으로 줄어든다
      g.fillStyle = p.color;
      g.fillRect(Render.X(p.x), Render.Y(p.y), s, s);
    }

    for (const n of this.numbers) {
      const k = n.life / n.max;
      if (k < 0.25 && Math.floor(n.life * 30) % 2) continue; // 끝날 때 깜빡이며 사라진다
      const pop = k > 0.85 ? -1 : 0; // 뜨는 순간 한 칸 튀어 오른다
      PixelFont.draw(g, n.text, Render.X(n.x), Render.Y(n.y) + pop, n.color, n.big);
    }
  },

  // 화면 전체에 덮는 가장자리 섬광 (피격, 경고, 각성)
  drawScreen() {
    if (this.warn > 0) {
      const beat = 0.5 + 0.5 * Math.sin(this.clock * (4 + 8 * this.warn));
      Render.edge([196, 34, 26], this.warn * (0.3 + 0.5 * beat));
    }
    for (const p of this.pulses) Render.edge(p.color, p.strength * (p.life / p.max));
  },
};

// 모든 공격은 이 함수를 거쳐 적에게 피해를 준다: 치명타 판정 + 체력 감소 + 밀림 + 하얀 깜빡임 + 숫자 + 불꽃 + 소리
//   src: 피해를 준 무기 id (통계용) / (fx, fy): 공격이 온 자리. 그 반대쪽으로 적이 밀린다 / power: 밀림 세기 배율
function hitEnemy(e, dmg, src, fx, fy, power) {
  if (e.hp <= 0) return false; // 이미 쓰러진 적은 다시 맞지 않는다
  const crit = Math.random() < Build.crit;
  if (crit) dmg *= CONFIG.player.crit.mul;
  e.hp -= dmg;
  e.flash = CONFIG.fx.flashTime;
  DamageLog.add(src, dmg);

  if (fx !== undefined) {
    const dx = e.x - fx;
    const dy = e.y - fy;
    const d = Math.hypot(dx, dy) || 1;
    const k = (CONFIG.fx.knockback * (power === undefined ? 1 : power)) / e.mass;
    e.kvx += (dx / d) * k;
    e.kvy += (dy / d) * k;
  }

  // 같은 적에게 연달아 들어간 피해는 숫자 하나로 합쳐서, 숫자가 화면을 덮지 않게 한다
  const n = e.num;
  if (n && !n.gone && n.max - n.life < CONFIG.fx.numberMerge) {
    n.value += dmg;
    n.text = String(Math.round(n.value));
    if (crit) { n.big = true; n.color = '#ffd23a'; }
  } else {
    e.num = Effects.number(e.x, e.y - e.radius - 14, dmg, crit ? '#ffd23a' : e.isBoss ? '#ffb43a' : '#e8dca0', crit);
  }
  if (crit) Effects.burst(e.x, e.y, 5, ['#ffd23a', '#ffffff'], 150, 0.3);
  else Effects.burst(e.x, e.y, 2, ['#ffe27a', '#ffffff'], 90, 0.25);
  Sfx.hit(crit);
  return true;
}

// 적이 죽을 때: 하얗게 흩어지고 몸 색의 파편이 터진다. 정예·보스는 크게 터지고 화면도 멈칫한다.
function killEffect(e) {
  const base = e.cfg.fx || '#c4221a';
  const big = e.isBoss || e.elite;
  const n = e.isBoss ? 80 : e.elite ? 26 : 7 + Math.round(e.radius / 3);
  Effects.corpse(e);
  Effects.burst(e.x, e.y, n, [base, base, '#ffffff', '#1a0e0a'], e.isBoss ? 340 : big ? 240 : 170, e.isBoss ? 1.0 : 0.55);
  if (e.isBoss) {
    Effects.shake(CONFIG.fx.bossDeathShake.amp, CONFIG.fx.bossDeathShake.dur);
    Effects.stop(CONFIG.fx.hitStop.boss);
    Effects.flash(e.x, e.y, e.radius * 3, 0.4);
    Effects.ring(e.x, e.y, 520, '255, 214, 100', 0.9);
    Effects.pulse([255, 214, 100], 0.9, 0.8);
  } else if (e.elite) {
    Effects.shake(5, 0.3);
    Effects.stop(CONFIG.fx.hitStop.elite);
    Effects.flash(e.x, e.y, e.radius * 2.2, 0.22);
    Effects.ring(e.x, e.y, 150, '255, 214, 100', 0.45);
  }
  Sfx.kill(big);
}
