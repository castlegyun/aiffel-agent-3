// 레벨업 카드와 상자 보상. 매번 지금 상태에서 고를 수 있는 카드를 만들어 3장을 뽑는다.
// 카드 = { id, name, icon(아이콘 이름), kind, levelText, lines, evolve, weight, apply() },  ctx = { player, weapons }
//   kind: 'new' 새 무기 / 'evolve' 진화 / 'passive' 패시브 / 'up' 무기 강화 / 'heal' 회복

const Upgrades = {
  // 지금 고를 수 있는 모든 카드
  candidates(ctx) {
    const cards = [];
    const C = CONFIG.cardStack;

    for (const w of ctx.weapons) {
      if (w.evolved) continue; // 진화까지 마친 무기는 더 올릴 것이 없다
      if (w.level < w.maxLevel) {
        // Lv3이 되는 강화라면 각성 보너스 문구를 카드에 보여준다
        const toLv3 = w.level + 1 === CONFIG.awaken.minLevel;
        cards.push({
          id: w.id + '-up', name: `${w.name} 강화`, icon: w.icon, kind: 'up',
          levelText: toLv3 ? `Lv ${w.level} → ${w.level + 1}  ✦ 각성` : `Lv ${w.level} → ${w.level + 1}`,
          lines: toLv3 ? w.upgradeLines().concat(w.lv3Lines()) : w.upgradeLines(),
          weight: this.weightOf(w.id) * C.upgradeWeapon * Math.pow(C.stackDecay, w.level - 1),
          apply: () => {
            w.levelUp();
            if (w.level === CONFIG.awaken.minLevel) Awaken.skillAwaken(w, ctx.player); // 한 스킬이 Lv3이 되면 각성
          },
        });
      } else if (w.canEvolve) {
        cards.push({
          id: w.id + '-evolve', name: `${w.name} 진화`, icon: w.icon, kind: 'evolve',
          levelText: '★ 진화', lines: w.evolveLines(), evolve: true, weight: 1,
          apply: () => {
            w.evolve();
            Effects.pulse([255, 214, 100], 0.8, 0.6);
          },
        });
      }
      // 최대 레벨인데 짝 패시브가 없으면 카드가 없다: 패시브 카드 쪽에 "진화 재료"라고 알려 준다
    }

    if (ctx.weapons.length < CONFIG.build.weaponSlots) {
      for (const Type of WEAPON_TYPES) {
        const probe = new Type(); // 문구용 임시 객체
        if (ctx.weapons.some((w) => w.id === probe.id)) continue;
        const need = CONFIG.passives[probe.cfg.evolve.needs];
        cards.push({
          id: probe.id + '-new', name: probe.name, icon: probe.icon, kind: 'new',
          levelText: '새 무기', lines: probe.introLines().concat([`진화 재료: ${need.name}`]),
          weight: this.weightOf(probe.id) * C.newWeapon,
          apply: () => {
            const nw = new Type();
            ctx.weapons.push(nw);
            Awaken.applyTo(nw); // 스킬 공명이 이미 발동했다면 새 무기도 같은 강화를 받는다
          },
        });
      }
    }

    for (const id in CONFIG.passives) {
      const P = CONFIG.passives[id];
      const lv = Build.level(id);
      if (lv >= CONFIG.passiveMax) continue;
      if (lv === 0 && Build.count() >= CONFIG.build.passiveSlots) continue; // 칸이 다 찼으면 새 패시브는 못 얻는다
      const lines = [P.text(P.per * (lv + 1))];
      // 이 패시브가 있어야 진화하는 무기를 들고 있으면 알려 준다
      const pair = ctx.weapons.find((w) => !w.evolved && w.cfg.evolve.needs === id);
      if (pair) lines.push(`진화 재료: ${pair.name}`);
      cards.push({
        id: id + '-passive', name: P.name, icon: P.icon, kind: 'passive',
        levelText: lv ? `Lv ${lv} → ${lv + 1}` : '새 패시브', lines,
        // 최대 레벨 무기가 기다리는 진화 재료는 훨씬 잘 나온다
        weight: (lv ? C.upgradePassive * Math.pow(C.stackDecay, lv) : C.newPassive) * (pair && pair.maxed && lv === 0 ? 4 : 1),
        apply: () => Build.add(id, ctx.player),
      });
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
      id: 'heal', name: '체력 회복', icon: 'heal', kind: 'heal', levelText: '',
      lines: [`체력 ${fmt1(p.hp)} → ${fmt1(to)}`],
      apply: () => { p.hp = to; },
    };
  },

  // 가중치 비례로 하나 뽑아 목록에서 꺼낸다: 가중치가 작은 카드는 덜 나온다
  draw(list) {
    let total = 0;
    for (const c of list) total += c.weight;
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < list.length - 1; idx++) {
      r -= list[idx].weight;
      if (r <= 0) break;
    }
    return list.splice(idx, 1)[0];
  },

  // 진화 카드는 조건이 되면 반드시 먼저, 나머지는 가중치대로 무작위로 최대 3장
  roll(ctx) {
    const all = this.candidates(ctx);
    const picked = all.filter((c) => c.evolve).slice(0, 3);
    const rest = all.filter((c) => !c.evolve);
    while (picked.length < 3 && rest.length) picked.push(this.draw(rest));
    if (picked.length < 3) picked.push(this.healCard(ctx));
    return picked;
  },

  // 상자 보상 하나: 진화할 수 있으면 진화, 아니면 이미 가진 것의 강화, 그것도 없으면 새것이나 회복
  chest(ctx) {
    const all = this.candidates(ctx);
    const evolves = all.filter((c) => c.evolve);
    if (evolves.length) return evolves[(Math.random() * evolves.length) | 0];
    const ups = all.filter((c) => c.kind === 'up' || (c.kind === 'passive' && c.levelText !== '새 패시브'));
    if (ups.length) return this.draw(ups);
    if (all.length) return this.draw(all);
    return this.healCard(ctx);
  },
};
