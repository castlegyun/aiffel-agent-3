// 스킬 공명(각성): 액티브 스킬 3종이 각각 Lv3 이상이 되면 모든 스킬이 한 단계 더 강해진다.
// 4종이 모두 Lv3 이상이면 대공명(2단계). 발동할 때 충격파와 섬광이 터지고, 이후 발밑에 금빛 오라가 남는다.

const Awaken = {
  tier: 0,

  reset() {
    this.tier = 0;
    UI.setAwaken(0);
  },

  // 각성 조건을 채운 스킬 수 (진화한 스킬도 포함)
  readyCount(weapons) {
    return weapons.filter((w) => w.level >= CONFIG.awaken.minLevel || w.evolved).length;
  },

  // 카드를 고른 뒤마다 호출한다. 새 단계에 도달했으면 발동.
  check(player, weapons, enemies) {
    const n = this.readyCount(weapons);
    let target = 0;
    CONFIG.awaken.needed.forEach((need, i) => { if (n >= need) target = i + 1; });
    while (this.tier < target) {
      this.tier++;
      this.trigger(this.tier, player, weapons, enemies);
    }
  },

  // 스킬 하나가 Lv3이 되는 순간: 그 스킬만 강해지고 작은 각성 연출이 터진다
  skillAwaken(weapon, player) {
    weapon.stats.aw = Math.max(weapon.stats.aw || 0, 1); // 금빛 이펙트가 붙는다
    weapon.lv3Boost();
    const gold = '255, 214, 100';
    Effects.ring(player.x, player.y, 130, gold, 0.45);
    Effects.ring(player.x, player.y, 190, '255, 255, 255', 0.6);
    Effects.burst(player.x, player.y - 10, 36, ['#ffd664', '#ffffff', '#ffb43a'], 280, 0.8);
    Effects.shake(3.5, 0.3);
    UI.announce(`✦ ${weapon.name} 각성!`, 'skill');
    Sfx.skillAwaken();
  },

  // 각성 이후에 새로 얻은 무기도 같은 강화를 받게 한다
  applyTo(weapon) {
    for (let t = 1; t <= this.tier; t++) weapon.awaken(t);
  },

  trigger(tier, player, weapons, enemies) {
    const A = CONFIG.awaken;
    const R = A.wave.radius[tier - 1];

    for (const w of weapons) w.awaken(tier);

    // 충격파: 화면 가까이의 적을 때리고 밀어낸다 (보스는 덜 밀린다)
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) continue;
      hitEnemy(e, A.wave.damage[tier - 1]);
      const push = A.wave.push[tier - 1] * (1 - (d / R) * 0.5) * (e.isBoss ? 0.15 : 1);
      e.x += (dx / d) * push;
      e.y += (dy / d) * push;
    }

    // 연출: 겹겹이 퍼지는 금빛 고리, 파편, 섬광, 흔들림, 안내 문구, 소리
    const gold = '255, 214, 100';
    Effects.ring(player.x, player.y, R * 0.55, gold, 0.5);
    Effects.ring(player.x, player.y, R * 0.8, '255, 255, 255', 0.7);
    Effects.ring(player.x, player.y, R, gold, 0.95);
    Effects.burst(player.x, player.y - 10, 70 + tier * 30, ['#ffd664', '#ffffff', '#ffb43a', '#fff4c8'], 380, 0.95);
    Effects.shake(7 + tier * 2, 0.6);
    UI.awakenFlash();
    UI.announce(tier === 1 ? '✦ 스킬 공명! 모든 스킬이 각성한다' : '✦✦ 대공명! 스킬이 극한으로 각성한다', 'awaken');
    UI.setAwaken(tier);
    Sfx.awaken(tier);
  },

  // 발밑에 남는 금빛 오라: 천천히 도는 빛 조각과 맥동하는 고리
  drawAura(ctx, player) {
    if (!this.tier) return;
    const t = performance.now() / 1000;
    const x = player.x;
    const y = player.y + player.radius * 0.6;
    const pulse = 0.75 + Math.sin(t * 3) * 0.25;
    ctx.globalCompositeOperation = 'lighter';

    const r = 40 + this.tier * 8;
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(255, 214, 100, 0)');
    g.addColorStop(0.8, `rgba(255, 214, 100, ${0.16 * pulse})`);
    g.addColorStop(1, `rgba(255, 230, 150, ${0.4 * pulse})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 도는 빛 조각 (단계가 오르면 개수와 바깥 고리가 늘어난다)
    const rings = this.tier;
    for (let k = 0; k < rings; k++) {
      const count = 6 + k * 4;
      const rad = r + k * 16;
      const dir = k % 2 ? -1 : 1;
      for (let i = 0; i < count; i++) {
        const a = t * 1.5 * dir + (i * Math.PI * 2) / count;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad * 0.55; // 바닥에 누운 타원
        ctx.fillStyle = `rgba(255, 236, 170, ${0.75 * pulse})`;
        ctx.beginPath();
        ctx.moveTo(px, py - 4);
        ctx.lineTo(px + 2.5, py);
        ctx.lineTo(px, py + 4);
        ctx.lineTo(px - 2.5, py);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};
