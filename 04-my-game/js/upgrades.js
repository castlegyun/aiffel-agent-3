// 레벨업 카드. 매번 지금 상태에서 고를 수 있는 카드를 만들어 3장을 뽑는다.
// 카드 = { id, name, icon, kind, levelText, lines, evolve, apply(ctx) },  ctx = { player, weapons }

const fmt = (n) => String(Math.round(n * 100) / 100);

// 이동속도/최대체력/자석 같은 플레이어 강화 카드
function playerUpgrade(id, name, icon, field, change) {
  return (ctx) => {
    const done = ctx.player.upgradeLevels[id] || 0;
    if (done >= CONFIG.upgrades.limit) return null;
    const cur = field.get(ctx.player);
    return {
      id, name, icon,
      levelText: `Lv ${done} → ${done + 1}`,
      lines: [`${field.label} ${fmt(cur)} → ${fmt(change(cur))}`],
      apply: () => {
        field.set(ctx.player, change(cur));
        ctx.player.upgradeLevels[id] = done + 1;
      },
    };
  };
}

const PLAYER_CARDS = [
  playerUpgrade('speed', '이동 속도', '➤', {
    label: '이동 속도',
    get: (p) => p.speed,
    set: (p, v) => { p.speed = v; },
  }, (v) => v * (1 + CONFIG.upgrades.speedPct)),
  playerUpgrade('maxhp', '최대 체력', '♥', {
    label: '최대 체력',
    get: (p) => p.maxHp,
    set: (p, v) => { p.hp += v - p.maxHp; p.maxHp = v; },
  }, (v) => v + CONFIG.upgrades.maxHpAdd),
  playerUpgrade('magnet', '자석 범위', '◎', {
    label: '자석 범위',
    get: (p) => p.magnet,
    set: (p, v) => { p.magnet = v; },
  }, (v) => v * (1 + CONFIG.upgrades.magnetPct)),
];

const Upgrades = {
  // 지금 고를 수 있는 모든 카드
  candidates(ctx) {
    const cards = [];

    for (const w of ctx.weapons) {
      if (w.canEvolve) {
        cards.push({
          id: w.id + '-evolve', name: `${w.name} 진화`, icon: w.icon, kind: 'evolve',
          levelText: '★ 진화', lines: w.evolveLines(), evolve: true,
          weight: this.weightOf(w.id),
          apply: () => w.evolve(),
        });
      } else if (!w.evolved) {
        // Lv3이 되는 강화라면 각성 보너스 문구를 카드에 보여준다
        const toLv3 = w.level + 1 === 3;
        cards.push({
          id: w.id + '-up', name: `${w.name} 강화`, icon: w.icon,
          levelText: toLv3 ? `Lv ${w.level} → ${w.level + 1}  ✦ 각성` : `Lv ${w.level} → ${w.level + 1}`,
          lines: toLv3 ? w.upgradeLines().concat(w.lv3Lines()) : w.upgradeLines(),
          weight: this.weightOf(w.id) * CONFIG.cardStack.upgradeWeight * Math.pow(CONFIG.cardStack.stackDecay, w.level - 1),
          apply: () => {
            w.levelUp();
            if (w.level === 3) Awaken.skillAwaken(w, ctx.player); // 한 스킬이 Lv3이 되면 각성
          },
        });
      }
    }

    for (const Type of WEAPON_TYPES) {
      const probe = new Type(); // 문구용 임시 객체
      if (ctx.weapons.some((w) => w.id === probe.id)) continue;
      cards.push({
        id: probe.id + '-new', name: probe.name, icon: probe.icon, kind: 'new',
        levelText: '새 무기', lines: probe.introLines(),
        weight: this.weightOf(probe.id),
        apply: () => {
          const nw = new Type();
          ctx.weapons.push(nw);
          Awaken.applyTo(nw); // 스킬 공명이 이미 발동했다면 새 무기도 같은 강화를 받는다
        },
      });
    }

    for (const make of PLAYER_CARDS) {
      const card = make(ctx);
      if (card) cards.push(card);
    }
    return cards;
  },

  // 이 스킬 카드가 나올 상대 확률 (config.cardWeights, 없으면 1)
  weightOf(id) {
    const w = CONFIG.cardWeights[id];
    return w === undefined ? 1 : w;
  },

  // 고를 카드가 3장이 안 될 때 채우는 회복 카드
  healCard(ctx) {
    const p = ctx.player;
    const to = Math.min(p.maxHp, p.hp + CONFIG.upgrades.healAmount);
    return {
      id: 'heal', name: '체력 회복', icon: '✚', levelText: '',
      lines: [`체력 ${fmt(p.hp)} → ${fmt(to)}`],
      apply: () => { p.hp = to; },
    };
  },

  // 진화 카드는 항상 먼저, 나머지는 무작위로 채워 최대 3장
  // 진화 카드는 (확률 가중치가 낮은 스킬이 아니면) 항상 먼저, 나머지는 가중치대로 무작위로 최대 3장
  roll(ctx) {
    const all = this.candidates(ctx);
    // 진화 카드: 가중치 x1.5 확률로 등장 (가중치가 1 이상이면 항상)
    const evolves = all.filter((c) => c.evolve && Math.random() < Math.min(1, c.weight * 1.5));
    const rest = all.filter((c) => !c.evolve);
    const picked = evolves.slice(0, 3);
    while (picked.length < 3 && rest.length) {
      // 가중치 비례 뽑기(비복원): 가중치가 작은 카드는 덜 나온다
      let total = 0;
      for (const c of rest) total += c.weight === undefined ? 1 : c.weight;
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < rest.length - 1; idx++) {
        r -= rest[idx].weight === undefined ? 1 : rest[idx].weight;
        if (r <= 0) break;
      }
      picked.push(rest.splice(idx, 1)[0]);
    }
    if (picked.length < 3) picked.push(this.healCard(ctx));
    return picked;
  },
};
