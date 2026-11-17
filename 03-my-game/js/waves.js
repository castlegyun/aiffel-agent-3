// 적이 언제, 무엇이, 얼마나 나오는지 정한다.
//   - 분 단위 웨이브 표(CONFIG.waves): 그 분의 등장 속도·체력·속도 배율·적 구성
//   - 사건(CONFIG.events): 포위, 가로지르는 떼, 벽, 정예 등장
// 적을 만드는 일은 전부 Spawner.make() 한 곳을 거친다.

const Spawner = {
  timer: 0,
  eventIndex: 0,
  cur: { rate: 1, hp: 1, speed: 1, mix: null }, // 지금 시간의 웨이브 값

  reset() {
    this.timer = 0;
    this.eventIndex = 0;
    this.wave(0);
  },

  // 지난 시간(초)에 해당하는 웨이브 값. 분과 분 사이는 부드럽게 이어지게 섞는다.
  wave(time) {
    const W = CONFIG.waves;
    const m = Math.min(W.length - 1, Math.floor(time / 60));
    const a = W[m];
    const b = W[Math.min(W.length - 1, m + 1)];
    const f = Math.min(1, time / 60 - m);
    this.cur.rate = a.rate + (b.rate - a.rate) * f;
    this.cur.hp = a.hp + (b.hp - a.hp) * f;
    this.cur.speed = a.speed + (b.speed - a.speed) * f;
    this.cur.mix = a.mix;
    return this.cur;
  },

  // 비중대로 적 종류 하나를 뽑는다
  pickType(mix) {
    let total = 0;
    for (const type in mix) total += mix[type];
    let r = Math.random() * total;
    for (const type in mix) {
      r -= mix[type];
      if (r <= 0) return type;
    }
    return 'normal';
  },

  // 화면 밖 원의 반지름
  spawnDistance(viewW, viewH) {
    return Math.hypot(viewW, viewH) / 2 + CONFIG.spawn.margin;
  },

  // 화면 밖 원 위의 지점 (각도를 주지 않으면 무작위)
  point(player, viewW, viewH, angle) {
    const a = angle === undefined ? Math.random() * Math.PI * 2 : angle;
    const dist = this.spawnDistance(viewW, viewH);
    return { x: player.x + Math.cos(a) * dist, y: player.y + Math.sin(a) * dist };
  },

  // 적 하나를 만들어 enemies에 넣는다. force: 수 상한을 넘겨도 만든다(보스 소환, 사건)
  make(enemies, type, x, y, opt = {}) {
    if (!opt.force && enemies.length >= CONFIG.spawn.maxEnemies) return null;
    opt.hpMul = this.cur.hp;
    const e = new Enemy(type, x, y, opt);
    enemies.push(e);
    return e;
  },

  // rateMul: 디렉터 배율 x 보스 중 감쇠
  update(dt, time, player, enemies, viewW, viewH, rateMul) {
    const S = CONFIG.spawn;
    const W = this.wave(time);
    this.runEvents(time, player, enemies, viewW, viewH);

    // 일정 간격으로 한 무리씩, 한쪽 방향에서 뭉쳐서 나온다
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer += S.packEvery;
    const want = W.rate * rateMul * S.packEvery;
    const count = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
    const base = Math.random() * Math.PI * 2;
    const dist = this.spawnDistance(viewW, viewH);
    for (let i = 0; i < count; i++) {
      const type = this.pickType(W.mix);
      if (CONFIG.enemies[type].behavior === 'turret') {
        // 포탑은 움직이지 못하므로 화면 안쪽 가장자리에서 솟아오른다
        const a = Math.random() * Math.PI * 2;
        const d = Math.min(viewW, viewH) * (0.3 + Math.random() * 0.15);
        this.make(enemies, type, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d, { rise: true });
        continue;
      }
      const a = base + (Math.random() - 0.5) * S.packSpread;
      const d = dist + Math.random() * 60;
      this.make(enemies, type, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d);
    }
  },

  // 시간이 된 사건을 차례로 일으킨다
  runEvents(time, player, enemies, viewW, viewH) {
    const E = CONFIG.events;
    while (this.eventIndex < E.length && time >= E[this.eventIndex].t) {
      this[E[this.eventIndex].kind](E[this.eventIndex], player, enemies, viewW, viewH);
      this.eventIndex++;
    }
  },

  // 포위: 사방에 둥글게 나타나 조여 온다
  ring(ev, player, enemies, viewW, viewH) {
    const dist = this.spawnDistance(viewW, viewH) * 0.92;
    for (let i = 0; i < ev.count; i++) {
      const a = (i / ev.count) * Math.PI * 2;
      this.make(enemies, ev.type, player.x + Math.cos(a) * dist, player.y + Math.sin(a) * dist, { force: true });
    }
    UI.announce('포위당했다!');
    Sfx.event();
  },

  // 떼: 한쪽에서 여러 줄로 나타나 화면을 가로질러 날아간다
  stream(ev, player, enemies, viewW, viewH) {
    const a = Math.random() * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const dist = this.spawnDistance(viewW, viewH);
    const rows = 7;
    for (let i = 0; i < ev.count; i++) {
      const side = ((i % rows) - (rows - 1) / 2) * 34 + (Math.random() - 0.5) * 12;
      const back = Math.floor(i / rows) * 46 + Math.random() * 20;
      const e = this.make(enemies, ev.type, player.x + ux * (dist + back) - uy * side, player.y + uy * (dist + back) + ux * side, { force: true });
      e.dir.x = -ux; // 플레이어 쪽으로 곧장 날아가 반대편으로 빠져나간다
      e.dir.y = -uy;
    }
    UI.announce(`${CONFIG.enemies[ev.type].name} 떼가 몰려온다!`);
    Sfx.event();
  },

  // 벽: 한쪽에서 옆으로 줄지어 밀고 온다
  wall(ev, player, enemies, viewW, viewH) {
    const a = Math.random() * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const dist = this.spawnDistance(viewW, viewH);
    const gap = CONFIG.enemies[ev.type].radius * 2 + 8;
    for (let i = 0; i < ev.count; i++) {
      const side = (i - (ev.count - 1) / 2) * gap;
      this.make(enemies, ev.type, player.x + ux * dist - uy * side, player.y + uy * dist + ux * side, { force: true });
    }
    UI.announce(`${CONFIG.enemies[ev.type].name} 벽이 밀려온다!`);
    Sfx.event();
  },

  // 정예: 금빛 테두리의 강한 적. 잡으면 상자를 떨어뜨린다.
  elite(ev, player, enemies, viewW, viewH) {
    const p = this.point(player, viewW, viewH);
    this.make(enemies, ev.type, p.x, p.y, { force: true, elite: true });
    UI.announce(`정예 ${CONFIG.enemies[ev.type].name} 등장!`);
    Sfx.elite();
  },

  // 너무 멀어진 적은 지우지 않고 플레이어 반대편(진행 방향 앞쪽 포함)의 화면 밖으로 다시 데려온다
  recycle(e, player, viewW, viewH) {
    const p = this.point(player, viewW, viewH);
    e.x = p.x;
    e.y = p.y;
    e.kvx = 0;
    e.kvy = 0;
  },
};
