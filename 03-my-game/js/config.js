// 밸런스 수치와 색상 모음. 숫자는 여기서만 고친다.
// 거리·속도는 세계 좌표다 (그림판 1픽셀 = 세계 좌표 2).
const CONFIG = {
  // 게임 루프
  maxDelta: 0.05, // 프레임 간격 상한(초): 탭 전환 후 순간이동 방지

  // 픽셀 화면: 세계를 작은 그림판에 그린 뒤 정수 배로 확대한다 (js/render.js)
  view: {
    unit: 2,            // 그림판 1픽셀 = 세계 좌표 2
    targetArea: 230400, // 그림판 넓이 목표(픽셀 수). 640x360 = 1080p에서 도트 1칸이 화면 3px
    minCssPx: 2,        // 창이 작아도 도트 1칸은 화면 2px 아래로 내려가지 않는다
  },

  // 조명: 화면 전체를 어둡게 덮고, 빛나는 것 주변만 밝힌다. 반지름은 세계 좌표.
  light: {
    color: '6, 3, 10', // 어둠의 색
    ambient: 0.44,     // 빛이 닿지 않는 곳의 어두움 (0 = 조명 없음)
    warm: '#2c1707',   // 플레이어 둘레에 더해지는 따뜻한 횃불빛
    player: 460,
    bolt: 76,
    enemyShot: 44,
    gem: 30,
    item: 70,
    brazier: 210,
  },

  // 플레이어
  player: {
    radius: 14,
    speed: 185,
    maxHp: 100,
    invuln: 0.7,     // 피격 후 무적 시간(초)
    magnet: 84,      // 보석이 끌려오기 시작하는 거리
    // 머리 위 체력바: 칸 하나 = segmentHp. 최대 체력이 늘면 칸 수도 늘어난다. (크기는 도트 픽셀)
    hpBar: { width: 24, height: 3, segmentHp: 20, offset: 3 },
    stepTime: 0.11,  // 걷기 프레임 전환 간격(초)
    // 점멸(Space): 가는 방향으로 순간이동하고 잠깐 무적이 된다
    dash: { distance: 170, cooldown: 2.6, invuln: 0.4 },
    crit: { chance: 0.05, mul: 2 }, // 기본 치명타 확률과 배율
  },

  // 한 판에 들 수 있는 무기·패시브 칸 수
  build: { weaponSlots: 6, passiveSlots: 6 },

  // ---- 무기 8종 ----
  // stats: 시작 능력치 / area: '범위' 패시브가 키워 주는 능력치
  // perLevel: 강화할 때마다 (add 더하기, mul 곱하기, at: 이 레벨이 되면 +1)
  // lv3: Lv3 각성 보너스 / awaken: 스킬 공명 단계마다 (t1: 1단계에서만)
  // evolve: 진화. needs = 짝이 되는 패시브(가지고 있어야 진화 카드가 나온다)
  weapons: {
    bolt: {
      name: '불꽃탄', icon: 'bolt', maxLevel: 5,
      stats: { damage: 12, cooldown: 0.62, count: 1, spread: 0.15, splash: 34, splashMul: 0.5, speed: 420, radius: 6, range: 420 },
      area: ['splash', 'radius'],
      perLevel: { add: { damage: 2, splash: 4 }, mul: { cooldown: 0.92 }, at: { count: [2, 3, 4, 5] } },
      lv3: { mul: { splash: 1.4, radius: 1.2 }, set: { splashMul: 0.8 }, text: '폭발 범위 x1.4, 폭발 피해 80%' },
      awaken: { mul: { splash: 1.25, radius: 1.15 } },
      evolve: { needs: 'might', name: '관통 화염탄', mul: { damage: 1.6 }, set: { speed: 650, radius: 9, range: 560, pierce: 99, beam: 1, splash: 0 }, text: ['모든 적을 뚫고 지나간다'] },
      intro: ['가까운 적에게 불덩이 발사', '맞은 자리에서 폭발'],
    },
    orbs: {
      name: '회전 구슬', icon: 'orbs', maxLevel: 5,
      stats: { damage: 10, count: 2, orbitRadius: 70, speed: 2.8, hitRadius: 9, hitInterval: 0.42 },
      area: ['hitRadius', 'orbitRadius'],
      perLevel: { add: { damage: 3 }, at: { count: [3, 5] } },
      lv3: { mul: { hitRadius: 1.25, orbitRadius: 1.15, hitInterval: 0.8 }, text: '구슬 x1.25, 궤도 확대, 타격 간격 단축' },
      awaken: { mul: { hitRadius: 1.1 }, t1: { add: { count: 1 } } },
      evolve: { needs: 'area', name: '구슬 군단', mul: { count: 2, orbitRadius: 1.4, damage: 1.3 }, text: ['구슬 2배, 궤도 확장'] },
      intro: ['구슬이 주위를 돌며 공격'],
    },
    laser: {
      name: '레이저', icon: 'laser', maxLevel: 5,
      stats: { damage: 22, cooldown: 1.6, length: 560, width: 22, beams: 1, spread: 0.3 },
      area: ['width'],
      perLevel: { add: { damage: 6, width: 3 }, mul: { cooldown: 0.92 }, at: { beams: [3] } },
      lv3: { text: '금빛 광선 (능력치 변화 없음)' },
      awaken: { mul: { width: 1.2, length: 1.08 } },
      evolve: { needs: 'haste', name: '폭풍 레이저', set: { beams: 4 }, mul: { damage: 1.25, length: 1.15 }, text: ['광선 4줄기를 부채꼴로 발사'] },
      intro: ['직선 위의 적을 전부 관통'],
    },
    lightning: {
      name: '연쇄 번개', icon: 'lightning', maxLevel: 5,
      stats: { damage: 14, cooldown: 1.35, range: 380, jumpRange: 120, chains: 3, falloff: 0.85, strikes: 1 },
      area: ['jumpRange'],
      perLevel: { add: { damage: 4, jumpRange: 10 }, mul: { cooldown: 0.94 }, at: { chains: [2, 4] } },
      lv3: { add: { chains: 2 }, mul: { jumpRange: 1.25 }, set: { falloff: 0.93 }, text: '+2마리, 확산 x1.25, 피해 감소 완화' },
      awaken: { mul: { jumpRange: 1.15 }, t1: { add: { chains: 1 } } },
      evolve: { needs: 'crit', name: '천둥 폭풍', set: { strikes: 2 }, add: { chains: 3 }, mul: { jumpRange: 1.3, damage: 1.25 }, text: ['번개 2줄기가 동시에 떨어진다'] },
      intro: ['맞은 적에서 주변 적으로 번개가 튄다'],
    },
    frost: {
      name: '서리 파동', icon: 'frost', maxLevel: 5,
      stats: { damage: 14, cooldown: 3.2, radius: 120, slow: 0.5, slowTime: 1.6 },
      area: ['radius'],
      perLevel: { add: { damage: 5, radius: 12 }, mul: { cooldown: 0.93 } },
      lv3: { mul: { radius: 1.2 }, set: { slow: 0.35, slowTime: 2.2 }, text: '범위 x1.2, 더 강하고 긴 둔화' },
      awaken: { mul: { radius: 1.12 } },
      evolve: { needs: 'armor', name: '절대영도', mul: { damage: 1.5, radius: 1.3 }, set: { freeze: 1.1 }, text: ['맞은 적을 잠깐 얼린다'] },
      intro: ['주변에 얼음 파동을 터뜨린다', '맞은 적이 느려진다'],
    },
    meteor: {
      name: '유성', icon: 'meteor', maxLevel: 5,
      stats: { damage: 46, cooldown: 3.4, radius: 62, range: 360, count: 1, delay: 0.7, burn: 0, burnTime: 2.5 },
      area: ['radius'],
      perLevel: { add: { damage: 12, radius: 5 }, mul: { cooldown: 0.93 }, at: { count: [4] } },
      lv3: { set: { burn: 0.3 }, text: '떨어진 자리가 불타며 계속 피해' },
      awaken: { mul: { radius: 1.15 } },
      evolve: { needs: 'maxhp', name: '유성우', add: { count: 2 }, mul: { damage: 1.3 }, text: ['유성 2개가 더 떨어진다'] },
      intro: ['적이 몰린 곳에 유성이 떨어진다', '바닥에 예고가 뜬 뒤 큰 폭발'],
    },
    scythe: {
      name: '귀환 낫', icon: 'scythe', maxLevel: 5,
      stats: { damage: 18, cooldown: 2.2, count: 1, speed: 460, range: 300, radius: 16, hitInterval: 0.3 },
      area: ['radius'],
      perLevel: { add: { damage: 5, range: 20 }, mul: { cooldown: 0.93 }, at: { count: [3, 5] } },
      lv3: { mul: { radius: 1.3, speed: 1.15 }, text: '낫이 커지고 빨라진다' },
      awaken: { mul: { radius: 1.15 } },
      evolve: { needs: 'speed', name: '사신의 낫', add: { count: 1 }, mul: { damage: 1.4, radius: 1.4 }, text: ['낫이 커지고 하나 더 늘어난다'] },
      intro: ['날아갔다가 돌아오며 적을 관통'],
    },
    wisp: {
      name: '영혼 불', icon: 'wisp', maxLevel: 5,
      stats: { damage: 13, cooldown: 1.9, count: 2, speed: 270, life: 3, radius: 5, splash: 26, splashMul: 0.6, turn: 7 },
      area: ['splash'],
      perLevel: { add: { damage: 3 }, mul: { cooldown: 0.94 }, at: { count: [2, 4] } },
      lv3: { add: { count: 1 }, mul: { speed: 1.2 }, text: '+1개, 더 빨리 쫓아간다' },
      awaken: { t1: { add: { count: 1 } } },
      evolve: { needs: 'magnet', name: '혼령 군단', mul: { count: 2, damage: 1.2 }, text: ['영혼 불이 두 배로 늘어난다'] },
      intro: ['스스로 적을 쫓아가는 유도탄'],
    },
  },

  // 능력치 이름 (카드에 "피해 12 → 14"처럼 보여 줄 때 쓴다)
  statLabels: {
    damage: '피해', cooldown: '간격(초)', count: '개수', splash: '폭발 범위', radius: '크기',
    range: '사거리', orbitRadius: '궤도', hitRadius: '구슬 크기', width: '두께', length: '길이',
    beams: '광선 수', jumpRange: '확산 거리', chains: '추가 대상', strikes: '번개 수', speed: '속도',
  },

  // ---- 패시브 10종 (최대 Lv5). per = 레벨마다 오르는 양 ----
  passives: {
    might:  { name: '위력',     icon: 'might',  per: 0.10, text: (v) => `모든 피해 +${Math.round(v * 100)}%` },
    haste:  { name: '신속',     icon: 'haste',  per: 0.06, text: (v) => `공격 간격 -${Math.round(v * 100)}%` },
    area:   { name: '범위',     icon: 'area',   per: 0.09, text: (v) => `공격 범위 +${Math.round(v * 100)}%` },
    crit:   { name: '치명',     icon: 'crit',   per: 0.07, text: (v) => `치명타 확률 +${Math.round(v * 100)}%` },
    regen:  { name: '재생',     icon: 'regen',  per: 0.6,  text: (v) => `초당 체력 +${v.toFixed(1)}` },
    armor:  { name: '방어',     icon: 'armor',  per: 0.08, text: (v) => `받는 피해 -${Math.round(v * 100)}%` },
    growth: { name: '성장',     icon: 'growth', per: 0.10, text: (v) => `경험치 +${Math.round(v * 100)}%` },
    speed:  { name: '이동 속도', icon: 'speed',  per: 0.07, text: (v) => `이동 속도 +${Math.round(v * 100)}%` },
    maxhp:  { name: '최대 체력', icon: 'maxhp',  per: 20,   text: (v) => `최대 체력 +${v}` },
    magnet: { name: '자석',     icon: 'magnet', per: 0.30, text: (v) => `보석 끌어당기는 거리 +${Math.round(v * 100)}%` },
  },
  passiveMax: 5,

  // 한 판의 흐름: 10분 3막
  game: {
    duration: 600, // 이 시간(초)을 버티면 승리
    acts: [0, 180, 360], // 각 막이 시작하는 시간. 막마다 바닥과 음악이 바뀐다
  },

  // ---- 적 ----
  // behavior: chase 추적 / ranged 거리 유지 + 사격 / charge 돌진 / fly 직선 비행 / bomber 자폭
  //           ghost 겹쳐서 통과 / necro 소환 / turret 고정 포탑
  // mass: 넉백에 버티는 정도(클수록 덜 밀린다)
  enemies: {
    normal:  { name: '해골', fx: '#e8e0c8', sprite: 'skeleton', hp: 20, speed: 70, radius: 12, damage: 10, xp: 1 },
    fast:    { name: '임프', fx: '#c468e0', sprite: 'imp', hp: 9, speed: 118, radius: 9, damage: 6, xp: 1, mass: 0.7 },
    tough:   { name: '중갑병', fx: '#9aa2b2', sprite: 'brute', hp: 70, speed: 46, radius: 17, damage: 18, xp: 4, mass: 3 },
    ranged: {
      name: '광신도', fx: '#5a4494', sprite: 'mage', behavior: 'ranged', hp: 16, speed: 60, radius: 11, damage: 8, xp: 2,
      keepDist: 200, shootInterval: 2.4, shootRange: 340, bulletSpeed: 170, bulletDamage: 8,
    },
    charger: {
      name: '지옥 사냥개', fx: '#a04a28', sprite: 'hound', behavior: 'charge', hp: 34, speed: 85, radius: 14, damage: 15, xp: 3,
      chargeRange: 260, windup: 0.6, dashTime: 0.5, dashSpeed: 400, rest: 1.1,
    },
    bat: { name: '박쥐', fx: '#5c4474', sprite: 'bat', behavior: 'fly', hp: 8, speed: 210, radius: 8, damage: 7, xp: 1, life: 7, mass: 0.6 },
    bomber: {
      name: '자폭병', fx: '#4a4a5c', sprite: 'bomber', behavior: 'bomber', hp: 26, speed: 96, radius: 12, damage: 6, xp: 3,
      fuseRange: 74, fuse: 0.8, blastRadius: 84, blastDamage: 24,
    },
    slime:    { name: '슬라임', fx: '#3fae4a', sprite: 'slime', hp: 48, speed: 58, radius: 15, damage: 12, xp: 3, mass: 1.6, split: { type: 'slimelet', count: 2 } },
    slimelet: { name: '작은 슬라임', fx: '#7fe07a', sprite: 'slimelet', hp: 14, speed: 98, radius: 9, damage: 6, xp: 1, mass: 0.7 },
    ghost:    { name: '유령', fx: '#c8e8f0', sprite: 'ghost', behavior: 'ghost', hp: 24, speed: 84, radius: 12, damage: 11, xp: 3, noSep: true, alpha: 0.72 },
    necro: {
      name: '강령술사', fx: '#2f5c44', sprite: 'necro', behavior: 'necro', hp: 62, speed: 52, radius: 12, damage: 10, xp: 7,
      keepDist: 250, summonInterval: 5.5, summonWindup: 0.9, summonCount: 2, summonType: 'normal',
    },
    eye: {
      name: '감시자의 눈', fx: '#a8485a', sprite: 'eye', behavior: 'turret', hp: 58, speed: 0, radius: 13, damage: 10, xp: 7, mass: 99,
      shootInterval: 3.0, aim: 0.8, bullets: 3, spread: 0.26, bulletSpeed: 190, bulletDamage: 9, range: 430,
    },
  },

  // 정예: 금빛 테두리, 훨씬 단단하고, 잡으면 상자를 떨어뜨린다
  elite: { hpMul: 9, damageMul: 1.4, xpMul: 10, massMul: 3, affixes: ['swift', 'tank', 'burst'] },

  // ---- 분 단위 웨이브 표 ----
  // rate: 초당 등장 수 / hp·speed: 적 체력·이동 속도 배율 / mix: 적 종류별 비중
  waves: [
    { rate: 0.75, hp: 1.0,  speed: 1.0,  mix: { normal: 10 } },
    { rate: 1.4, hp: 1.1, speed: 1.04, mix: { normal: 10, fast: 5 } },
    { rate: 2.1, hp: 1.3, speed: 1.08, mix: { normal: 8, fast: 5, tough: 2, ranged: 2 } },
    { rate: 2.7, hp: 1.55,  speed: 1.12, mix: { normal: 6, fast: 5, tough: 3, ranged: 3, charger: 3, slime: 3 } },
    { rate: 3.5, hp: 1.85,  speed: 1.16, mix: { normal: 4, fast: 5, tough: 4, ranged: 3, charger: 4, slime: 4, bomber: 3 } },
    { rate: 4.4, hp: 2.3,  speed: 1.2,  mix: { normal: 3, tough: 4, ranged: 3, charger: 4, slime: 4, bomber: 4, ghost: 4 } },
    { rate: 5.1, hp: 2.8,  speed: 1.24, mix: { normal: 5, ghost: 5, bomber: 4, necro: 1.5, charger: 4, tough: 4, eye: 1 } },
    { rate: 6.1, hp: 3.4,  speed: 1.28, mix: { normal: 4, ghost: 5, necro: 2, eye: 1.5, bomber: 5, charger: 5, tough: 5, slime: 4 } },
    { rate: 7.1, hp: 4.1,  speed: 1.32, mix: { fast: 5, ghost: 6, necro: 2.5, eye: 2, bomber: 5, charger: 6, tough: 6, slime: 5 } },
    { rate: 7.9, hp: 4.8,  speed: 1.36, mix: { normal: 4, fast: 6, ghost: 6, necro: 2.5, eye: 2, bomber: 6, charger: 6, tough: 6, slime: 5 } },
  ],

  // ---- 정해진 시간에 일어나는 사건 ----
  // ring 포위(사방에서 조여 온다) / stream 떼(한쪽에서 가로질러 날아간다) / wall 벽(한쪽에서 줄지어 온다) / elite 정예 등장
  events: [
    { t: 45,  kind: 'stream', type: 'bat', count: 14 },
    { t: 78,  kind: 'ring', type: 'normal', count: 16 },
    { t: 112, kind: 'elite', type: 'tough' },
    { t: 142, kind: 'stream', type: 'bat', count: 20 },
    { t: 222, kind: 'ring', type: 'fast', count: 22 },
    { t: 252, kind: 'elite', type: 'charger' },
    { t: 285, kind: 'wall', type: 'tough', count: 11 },
    { t: 318, kind: 'stream', type: 'bat', count: 26 },
    { t: 330, kind: 'elite', type: 'ranged' },
    { t: 402, kind: 'ring', type: 'ghost', count: 22 },
    { t: 432, kind: 'elite', type: 'necro' },
    { t: 462, kind: 'wall', type: 'slime', count: 12 },
    { t: 478, kind: 'stream', type: 'bat', count: 30 },
    { t: 500, kind: 'elite', type: 'bomber' },
    { t: 512, kind: 'ring', type: 'bomber', count: 14 },
    { t: 575, kind: 'ring', type: 'ghost', count: 26 },
  ],

  // ---- 보스 3종 ----
  // sequence: 반복하는 행동 순서 / phases: 체력이 이 비율 아래로 내려가면 다음 페이즈(더 빠르고 탄이 많아진다)
  // 중간 보스는 다음 보스의 경고가 시작될 때까지 못 잡으면 상자 없이 물러난다.
  bosses: {
    knight: {
      name: '해골 기사단장', fx: '#8a92a6', sprites: ['knight', 'knight2'], behavior: 'boss',
      time: 180, warnTime: 15, hp: 4400, speed: 66, radius: 34, damage: 20, xp: 60, mass: 14,
      sequence: ['chase', 'charge', 'slam', 'chase', 'charge', 'summon'],
      chaseTime: 2.6, phases: [0.5],
      charge: { windup: 0.9, dashTime: 0.7, dashSpeed: 520 },
      slam: { windup: 0.9, rings: 2, gap: 0.45, speed: 230, max: 430, damage: 16 },
      summon: { windup: 0.8, count: 5, types: ['normal', 'fast'] },
    },
    lich: {
      name: '심연의 리치', fx: '#8a5ce0', sprites: ['lich', 'lich2'], behavior: 'boss', float: true,
      time: 360, warnTime: 15, hp: 15000, speed: 50, radius: 30, damage: 18, xp: 120, mass: 14,
      sequence: ['chase', 'spiral', 'teleport', 'zones', 'summon', 'teleport', 'barrage'],
      chaseTime: 2.2, phases: [0.5],
      spiral: { duration: 3.2, interval: 0.1, arms: 2, turn: 0.34, bulletSpeed: 150, damage: 10 },
      teleport: { windup: 0.7, dist: 300 },
      zones: { count: 5, gap: 0.35, delay: 1.0, radius: 72, damage: 22 },
      summon: { windup: 0.8, count: 6, types: ['ghost', 'normal'] },
      barrage: { duration: 2.0, interval: 0.6, bullets: 14, bulletSpeed: 160, damage: 10 },
    },
    demon: {
      name: 'BOSS 해창', fx: '#c4221a', sprites: ['demon', 'demon2', 'demon3'], behavior: 'boss', final: true,
      time: 540, warnTime: 20, hp: 38000, speed: 56, radius: 48, damage: 26, xp: 300, mass: 30,
      sequence: ['chase', 'charge', 'barrage', 'beam', 'chase', 'summon', 'zones', 'spiral'],
      chaseTime: 2.6, phases: [0.66, 0.33],
      charge: { windup: 1.0, dashTime: 0.8, dashSpeed: 560 },
      barrage: { duration: 2.4, interval: 0.55, bullets: 14, bulletSpeed: 170, damage: 10 },
      beam: { windup: 1.2, duration: 2.4, sweep: 1.5, length: 760, width: 28, damage: 22 },
      summon: { windup: 0.8, count: 6, types: ['charger', 'fast', 'bomber'] },
      zones: { count: 6, gap: 0.3, delay: 1.0, radius: 78, damage: 24 },
      spiral: { duration: 3.0, interval: 0.09, arms: 3, turn: 0.3, bulletSpeed: 160, damage: 10 },
    },
  },
  // 페이즈가 오를 때마다: 이동 속도·탄 수·소환 수가 늘고 행동 간격이 줄어든다
  bossRage: { speed: 0.2, interval: 0.15, bullets: 4, summon: 2, chase: 0.18 },

  // AI 디렉터: 플레이어 상태를 보고 스폰량을 min~max배로 조절한다
  director: {
    tau: 8,           // 처치 속도를 평균내는 시간(초)
    min: 0.7,
    max: 1.3,
    smooth: 0.6,      // 배율이 목표값을 따라가는 속도(1/초)
  },

  // 타격감 이펙트
  fx: {
    flashTime: 0.09,        // 맞았을 때 하얗게 번쩍이는 시간(초)
    numberLife: 0.7,        // 데미지 숫자가 떠 있는 시간(초)
    numberMerge: 0.22,      // 같은 적에게 이 시간 안에 또 들어간 피해는 한 숫자로 합친다
    maxNumbers: 90,
    maxParticles: 700,
    knockback: 150,         // 맞은 적이 밀려나는 기본 속도
    hitStop: { hurt: 0.07, elite: 0.06, boss: 0.22 }, // 화면이 잠깐 멈추는 시간(초)
    hurtShake: { amp: 7, dur: 0.28 },       // 플레이어가 맞았을 때 화면 흔들림
    bossDeathShake: { amp: 12, dur: 0.9 },
    bossSpawnShake: { amp: 6, dur: 1.2 },
  },

  // 카드 선택지에 나올 상대 확률 (기본 1). 레이저와 번개는 강해서 조금 낮췄다.
  cardWeights: { laser: 0.5, lightning: 0.6 },

  // 카드 종류별 기본 확률. 이미 가진 것의 강화는 레벨이 오를수록 stackDecay씩 곱해 조금씩 드물어진다.
  cardStack: { newWeapon: 1.0, newPassive: 0.75, upgradeWeapon: 0.9, upgradePassive: 0.6, stackDecay: 0.94 },

  // 스킬 공명(각성): needed종의 액티브 스킬이 각각 minLevel 이상이 되면 단계가 오른다 (3종 = 1단계, 5종 = 2단계)
  awaken: {
    minLevel: 3,
    needed: [3, 5],
    damageMul: [1.2, 1.12],     // 단계별 모든 스킬 피해 배율
    cooldownMul: [0.9, 0.93],   // 단계별 발사/타격 간격 배율 (작을수록 빠름)
    wave: {                     // 발동 순간의 충격파
      radius: [480, 640],
      damage: [70, 140],
      push: [420, 560],         // 밀려나는 속도
    },
  },

  // 효과음 / 배경음악 음량. 일시정지 화면의 설정에서 바꿀 수 있다.
  sfx: { volume: 0.9 },
  music: { volume: 1.2, tempoStep: 0.1 }, // 막이 바뀔 때마다 박자가 tempoStep씩 빨라진다

  // 바닥에 생기는 아이템 (플레이어 주변 minDist~maxDist 무작위 위치, 먼저 것은 안 주워도 사라지고 새로 생긴다)
  items: {
    radius: 18,  // 줍는 범위
    potion: { interval: 55, healCells: 2.5, minDist: 200, maxDist: 420 }, // 체력 2.5칸 = 2.5 x hpBar.segmentHp 회복
    magnet: { interval: 80, pullSpeed: 900, minDist: 200, maxDist: 420 }, // 맵의 모든 경험치 구슬을 끌어당김
    bomb:   { interval: 100, damage: 400, minDist: 200, maxDist: 420 },    // 화면 안의 모든 적에게 큰 피해
  },

  // 상자: 정예와 보스가 떨어뜨린다. 진화할 수 있으면 진화, 아니면 강화를 준다.
  chest: { elite: 1, boss: 3 }, // 상자 하나에 들어 있는 보상 수

  // 경험치: 다음 레벨까지 필요한 양 = base + (레벨-1) * growth + (레벨-1)² * curve
  xp: { base: 5, growth: 4, curve: 0.35 },

  // 경험치 보석. 값이 클수록 윗 등급의 색과 크기로 바뀐다.
  gem: {
    radius: 6,
    pullSpeed: 260,  // 끌려오기 시작할 때의 속도
    pullAccel: 900,  // 끌려오는 동안 붙는 가속도
    max: 350,        // 이 수를 넘으면 새 보석은 가까운 보석에 합쳐진다
    tiers: [1, 4, 12, 40], // 초록 / 파랑 / 빨강 / 금빛이 되는 값
  },

  // 고를 카드가 모자랄 때 나오는 회복 카드
  upgrades: { healAmount: 30 },

  // 스폰: 화면 밖 원 위에서 무리 지어 생겨난다
  spawn: {
    packEvery: 1.1,     // 한 무리가 나오는 간격(초)
    packSpread: 0.5,    // 한 무리가 퍼지는 각도(라디안)
    bossSpawnMul: 0.55, // 보스가 있는 동안 일반 스폰 비율
    maxEnemies: 480,
    margin: 80,         // 화면 가장자리 바깥 여유
    recycleFactor: 1.5, // 스폰 거리의 몇 배보다 멀어지면 플레이어 반대편으로 다시 데려올지
    spawnIn: 0.35,      // 등장할 때 솟아오르는 시간(초)
  },

  // 군집 이동: 가까운 적끼리 서로 밀어낸다
  separation: {
    cell: 48,       // 공간 분할 격자 크기
    strength: 1.2,  // 밀어내는 세기(이동속도 대비)
  },

  // 던전 바닥 타일. 막마다 색이 바뀐다 (1막 던전 / 2막 용암 지대 / 3막 심연)
  floor: {
    tileSize: 512,     // 반복되는 패턴 한 장의 크기
    slabSize: 64,      // 돌판 하나의 크기
    seed: 20240601,    // 같은 값이면 항상 같은 무늬
    acts: [
      { mortar: '#0d0807', slabs: ['#1c1411', '#201814', '#241a15', '#2a1d17'], highlight: '#3a2a20', shade: '#140e0b', speck: '#30221a', crack: '#070403' },
      { mortar: '#100504', slabs: ['#241110', '#2a1412', '#301613', '#381a14'], highlight: '#5a2a1c', shade: '#180908', speck: '#44201a', crack: '#c4521a' },
      { mortar: '#06050c', slabs: ['#15121f', '#191625', '#1d1a2c', '#221d33'], highlight: '#3a3258', shade: '#0c0a14', speck: '#2c2644', crack: '#5a3aa0' },
    ],
    decorCell: 300,    // 장식을 놓을지 정하는 칸의 크기
    decorChance: 0.38, // 칸마다 장식이 놓일 확률
  },
};
