// 패시브(지니고만 있어도 효과가 나는 능력)와, 그것이 무기·플레이어에 주는 배율을 한곳에 모은 Build.
// 무기는 자기 능력치(stats)에 Build의 배율을 곱한 값(eff)으로 싸운다.

const Build = {
  levels: {},  // 패시브 id → 레벨
  version: 0,  // 무기 능력치나 패시브가 바뀔 때마다 오른다. 무기는 이 값이 바뀌면 eff를 다시 계산한다.
  might: 1,    // 피해 배율
  haste: 1,    // 공격 간격 배율 (작을수록 빠름)
  area: 1,     // 범위 배율
  crit: 0,     // 치명타 확률

  reset() {
    this.levels = {};
    this.might = 1;
    this.haste = 1;
    this.area = 1;
    this.crit = CONFIG.player.crit.chance;
    this.version++;
  },

  level(id) {
    return this.levels[id] || 0;
  },

  has(id) {
    return this.level(id) > 0;
  },

  count() {
    return Object.keys(this.levels).length;
  },

  // 무기 능력치를 직접 고친 뒤 부른다 (레벨업, 진화, 각성)
  touch() {
    this.version++;
  },

  // 패시브 레벨을 하나 올리고 효과를 다시 계산한다
  add(id, player) {
    this.levels[id] = this.level(id) + 1;
    this.apply(player);
  },

  // 패시브 레벨 → 실제 배율과 플레이어 능력치
  apply(player) {
    const P = CONFIG.passives;
    const v = (id) => this.level(id) * P[id].per;
    this.might = 1 + v('might');
    this.haste = 1 - v('haste');
    this.area = 1 + v('area');
    this.crit = CONFIG.player.crit.chance + v('crit');

    const base = CONFIG.player;
    player.regen = v('regen');
    player.armor = v('armor');
    player.growth = v('growth');
    player.speed = base.speed * (1 + v('speed'));
    player.magnet = base.magnet * (1 + v('magnet'));
    const maxHp = base.maxHp + v('maxhp');
    if (maxHp > player.maxHp) player.hp += maxHp - player.maxHp; // 늘어난 만큼 회복도 된다
    player.maxHp = maxHp;
    this.version++;
  },
};
