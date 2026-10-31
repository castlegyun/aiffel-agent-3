// 타격감 이펙트: 데미지 숫자, 파티클, 화면 흔들림. 그리고 모든 공격이 지나가는 hitEnemy().

const Effects = {
  numbers: [],
  particles: [],
  rings: [],
  shakeAmp: 0,
  shakeTime: 0,
  shakeMax: 0.001,

  reset() {
    this.numbers.length = 0;
    this.particles.length = 0;
    this.rings.length = 0;
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
      size: big ? 20 : 14,
      life: CONFIG.fx.numberLife,
      max: CONFIG.fx.numberLife,
    });
  },

  // ---- 확산 고리: 폭발·충격 지점에서 퍼져 나가는 빛의 테두리 ----
  // color는 'r, g, b' 문자열
  ring(x, y, radius, color, life = 0.3) {
    if (this.rings.length >= 50) return;
    this.rings.push({ x, y, r: radius, color, life, max: life });
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
        size: 3 + Math.floor(Math.random() * 3),
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
    removeDead(this.rings, (g) => g.life <= 0);
    removeDead(this.numbers, (n) => n.life <= 0);
    removeDead(this.particles, (p) => p.life <= 0);
  },

  draw(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.rings) {
      const t = 1 - g.life / g.max; // 0 -> 1
      const r = g.r * (0.35 + 0.65 * Math.sqrt(t));
      ctx.strokeStyle = `rgba(${g.color}, ${(1 - t) * 0.9})`;
      ctx.lineWidth = 1 + 4 * (1 - t);
      ctx.beginPath();
      ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(${g.color}, ${(1 - t) * 0.12})`;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const n of this.numbers) {
      const k = n.life / n.max;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `bold ${n.size}px "Segoe UI", "Malgun Gothic", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  },
};

// 모든 공격은 이 함수를 거쳐 적에게 피해를 준다: 체력 감소 + 하얀 깜빡임 + 숫자 + 불꽃 + 소리
function hitEnemy(e, dmg) {
  e.hp -= dmg;
  e.flash = CONFIG.fx.flashTime;
  Effects.number(e.x, e.y - e.radius - 6, dmg, e.isBoss ? '#ffb43a' : '#e8dca0', e.isBoss);
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
