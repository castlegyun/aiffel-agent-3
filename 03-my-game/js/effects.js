// 타격감 이펙트: 데미지 숫자, 파티클, 고리, 섬광, 화면 흔들림. 그리고 모든 공격이 지나가는 hitEnemy().
// 위치와 속도는 세계 좌표로 계산하고, 그릴 때만 그림판의 정수 픽셀로 옮긴다.

const Effects = {
  numbers: [],
  particles: [],
  rings: [],
  flashes: [],
  shakeAmp: 0,
  shakeTime: 0,
  shakeMax: 0.001,

  reset() {
    this.numbers.length = 0;
    this.particles.length = 0;
    this.rings.length = 0;
    this.flashes.length = 0;
    this.shakeTime = 0;
  },

  // ---- 화면 흔들림: 세기가 시간에 따라 줄어든다 ----
  shake(amp, dur) {
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

  // ---- 데미지 숫자 ----
  number(x, y, value, color, big) {
    if (this.numbers.length >= CONFIG.fx.maxNumbers) return;
    this.numbers.push({
      x: x + (Math.random() * 14 - 7),
      y,
      text: String(Math.max(1, Math.round(value))),
      color: color || '#e8dca0',
      big: !!big,
      life: CONFIG.fx.numberLife,
      max: CONFIG.fx.numberLife,
    });
  },

  // ---- 확산 고리: 폭발·충격 지점에서 퍼져 나가는 빛의 테두리 ----
  // color는 'r, g, b' 문자열
  ring(x, y, radius, color, life = 0.3) {
    if (this.rings.length >= 50) return;
    this.rings.push({ x, y, r: radius, color: `rgb(${color})`, life, max: life });
  },

  // ---- 섬광: 폭발 한가운데에서 잠깐 번쩍이고 줄어드는 불덩이 ----
  flash(x, y, radius, life = 0.16) {
    if (this.flashes.length >= 40) return;
    this.flashes.push({ x, y, r: radius, life, max: life });
  },

  // ---- 파티클 ----
  // 사방으로 튀는 작은 조각들. colors 중 무작위, speed는 평균 속도.
  burst(x, y, count, colors, speed, life) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= CONFIG.fx.maxParticles) return;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.9);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.2, // 살짝 위로 튄다
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: Math.random() < 0.35 ? 2 : 1, // 도트 픽셀
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  },

  update(dt) {
    if (this.shakeTime > 0) this.shakeTime -= dt;
    for (const n of this.numbers) {
      n.life -= dt;
      n.y -= 42 * dt;
    }
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 380 * dt; // 중력
      p.vx *= Math.max(0, 1 - 3 * dt); // 공기 저항
    }
    for (const g of this.rings) g.life -= dt;
    for (const f of this.flashes) f.life -= dt;
    removeDead(this.rings, (g) => g.life <= 0);
    removeDead(this.flashes, (f) => f.life <= 0);
    removeDead(this.numbers, (n) => n.life <= 0);
    removeDead(this.particles, (p) => p.life <= 0);
  },

  // 폭발이 주변 바닥을 잠깐 밝힌다 (어둠 레이어를 덮기 전에 부른다)
  addLights() {
    for (const f of this.flashes) Render.light(f.x, f.y, f.r * 2.4);
  },

  draw(g) {
    g.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const t = 1 - f.life / f.max; // 0 -> 1
      const bx = Render.X(f.x);
      const by = Render.Y(f.y);
      const r = f.r * 0.5;
      // 흰색 → 노랑 → 주황으로 식으면서 줄어든다
      if (t < 0.35) Render.disc(bx, by, Math.round(r), '#fff4c8');
      else if (t < 0.7) Render.disc(bx, by, Math.round(r * 0.8), '#ffb43a');
      else Render.disc(bx, by, Math.round(r * 0.55), '#c4521a');
    }
    for (const q of this.rings) {
      const t = 1 - q.life / q.max; // 0 -> 1
      const r = Math.round(q.r * (0.35 + 0.65 * Math.sqrt(t)) * 0.5);
      g.globalAlpha = Math.ceil((1 - t) * 4) / 4; // 네 단계로 끊어서 흐려진다
      Render.ring(Render.X(q.x), Render.Y(q.y), r, q.color, t < 0.5 ? 2 : 1);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    for (const p of this.particles) {
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
};

// 모든 공격은 이 함수를 거쳐 적에게 피해를 준다: 체력 감소 + 하얀 깜빡임 + 숫자 + 불꽃 + 소리
function hitEnemy(e, dmg) {
  e.hp -= dmg;
  e.flash = CONFIG.fx.flashTime;
  Effects.number(e.x, e.y - e.radius - 14, dmg, e.isBoss ? '#ffb43a' : '#e8dca0', e.isBoss);
  Effects.burst(e.x, e.y, 2, ['#ffe27a', '#ffffff'], 90, 0.25);
  Sfx.hit();
}

// 적이 죽을 때: 몸 색의 파편이 터진다. 보스는 크게 터지고 화면도 흔들린다.
function killEffect(e) {
  const base = e.cfg.fx || '#c4221a';
  const n = e.isBoss ? 60 : 8 + Math.round(e.radius / 2);
  Effects.burst(e.x, e.y, n, [base, base, '#ffffff', '#1a0e0a'], e.isBoss ? 320 : 170, e.isBoss ? 1.0 : 0.55);
  if (e.isBoss) Effects.shake(CONFIG.fx.bossDeathShake.amp, CONFIG.fx.bossDeathShake.dur);
  Sfx.kill(e.isBoss);
}
