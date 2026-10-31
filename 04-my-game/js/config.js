// 밸런스 수치와 색상 모음. 숫자는 여기서만 고친다.
const CONFIG = {
  // 게임 루프
  maxDelta: 0.05, // 프레임 간격 상한(초): 탭 전환 후 순간이동 방지

  // 플레이어
  player: {
    radius: 14,
    speed: 200,
    maxHp: 100,
    invuln: 0.8,     // 피격 후 무적 시간(초)
    magnet: 90,      // 보석이 끌려오기 시작하는 거리(px)
    // 머리 위 체력바: 칸 하나 = segmentHp. 최대 체력이 늘면 칸 수도 늘어난다.
    hpBar: { width: 48, height: 7, segmentHp: 20, gap: 1, offset: 5 },
    scale: 2,        // 도트 확대 배율
    stepTime: 0.14,  // 걷기 프레임 전환 간격(초)
  },

  // 무기 3종
  weapons: {
    bolt: {
      damage: 12,
      cooldown: 0.62, // 발사 간격(초)
      count: 1,        // 한 번에 쏘는 탄 수 (레벨업마다 +1, Lv5에 5발)
      spread: 0.15,    // 탄이 여럿일 때 벌어지는 각도(라디안)
      splash: 34,      // 맞은 자리에서 터지는 폭발 반경(px). 주변 적에게 폭발 피해
      splashMul: 0.5,  // 폭발 피해 = 탄 피해 x 이 값
      speed: 420,
      radius: 6,
      range: 480,    // 이 거리 안의 적만 노리고, 탄도 이만큼 날아가면 사라진다
      maxLevel: 5,
      // 레벨업마다: 발사 수 +1(탄이 많아진 만큼 한 발의 피해 증가는 줄였다), 간격 x0.92, 폭발 +4
      perLevel: { damage: 2, cooldownMul: 0.92, splash: 4, countAtLevels: [2, 3, 4, 5] },
      // Lv3 달성 시 각성: 폭발이 훨씬 크고 강해지고 탄이 커진다
      lv3: { splashMul: 1.4, splashDamage: 0.8, radiusMul: 1.2 },
      // 진화(관통 화염탄): 모든 적을 뚫고 지나간다
      evolve: { damageMul: 1.6, speed: 650, radius: 9, range: 640 },
    },
    // 회전 구슬: 플레이어 주위를 돌며 닿은 적에게 피해
    orbs: {
      damage: 10,
      count: 2,
      orbitRadius: 70,
      speed: 2.8,        // 회전 속도(라디안/초)
      hitRadius: 9,
      hitInterval: 0.42, // 같은 적을 다시 때리기까지(초)
      maxLevel: 5,
      perLevel: { damage: 3, countAtLevels: [3, 5] }, // 이 레벨이 되면 구슬 +1
      // Lv3 달성 시 각성: 구슬이 커지고 궤도가 넓어지고 더 자주 때린다
      lv3: { hitRadiusMul: 1.25, orbitMul: 1.15, intervalMul: 0.8 },
      evolve: { countMul: 2, radiusMul: 1.4, damageMul: 1.3 },
    },
    // 연쇄 번개: 가장 가까운 적을 내려치면, 맞은 적에서 주변 적으로 번개가 튀며 이어진다
    lightning: {
      damage: 16,
      cooldown: 1.3,   // 발사 간격(초)
      range: 420,      // 첫 대상을 찾는 거리(px)
      jumpRange: 130,  // 확산 거리: 이 거리 안의 다음 적으로 번개가 튄다
      chains: 3,       // 첫 대상 말고 더 튀는 횟수 (= 최대 4마리)
      falloff: 0.88,   // 한 번 튈 때마다 피해가 이 비율로 줄어든다
      strikes: 1,      // 한 번에 내려치는 번개 수
      maxLevel: 5,
      perLevel: { damage: 5, cooldownMul: 0.93, jumpRange: 12, chainAtLevels: [2, 4] }, // Lv2, Lv4에 대상 +1
      // Lv3 달성 시 각성: 두 마리 더 튀고, 더 멀리, 피해가 덜 줄어든다
      lv3: { chainsAdd: 2, jumpMul: 1.25, falloff: 0.93 },
      // 진화: 번개 2줄기가 동시에 떨어지고, 더 멀리 더 많이 튄다
      evolve: { strikes: 2, chainsAdd: 3, jumpMul: 1.3, damageMul: 1.25 },
    },
    // 레이저: 가장 가까운 적 방향으로 긴 광선을 쏴서 직선 위의 모든 적을 관통한다
    laser: {
      damage: 22,
      cooldown: 1.6,   // 발사 간격(초)
      length: 640,     // 광선 길이(px). 이 거리 안의 적을 조준한다
      width: 22,       // 광선 두께(px)
      beams: 1,        // 한 번에 쏘는 광선 수
      spread: 0.3,     // 광선이 여럿일 때 벌어지는 각도(라디안)
      maxLevel: 5,
      perLevel: { damage: 6, cooldownMul: 0.92, width: 3, beamsAtLevels: [3] }, // Lv3에 광선 +1
      // 진화: 광선 4줄기를 부채꼴로 동시에 쏜다
      evolve: { beams: 4, damageMul: 1.25, lengthMul: 1.15 },
    },
  },

  // 한 판의 흐름
  game: { duration: 240 }, // 이 시간(초)을 버티면 승리

  // 적 5종. behavior: AI 행동 (chase 추적 / ranged 거리 유지 + 사격 / charge 돌진)
  // from: 이 시간(초) 이후부터 등장, weight: 등장 비중
  enemies: {
    normal: { name: '해골', fx: '#d8d0b8', sprite: 'skeleton', hp: 20, speed: 70,  radius: 12, damage: 10, xp: 1, scale: 2, weight: 10, from: 0 },
    fast:   { name: '임프', fx: '#b45ad0', sprite: 'imp',      hp: 8,  speed: 130, radius: 9,  damage: 6,  xp: 1, scale: 2, weight: 5,  from: 15 },
    tough:  { name: '중갑병', fx: '#8a909c', sprite: 'brute',    hp: 60, speed: 45,  radius: 17, damage: 18, xp: 3, scale: 2, weight: 3,  from: 40 },
    // 원거리형: 거리를 유지하며 탄을 쏜다
    ranged: {
      name: '광신도', fx: '#5e4590', sprite: 'mage', behavior: 'ranged', hp: 14, speed: 60, radius: 11, damage: 8, xp: 2, scale: 2, weight: 4, from: 50,
      keepDist: 230, shootInterval: 2.2, shootRange: 460, bulletSpeed: 190, bulletDamage: 7,
    },
    // 돌진형: 접근 → 멈춤 + 예고선 → 직선 돌진 → 쉬는 시간
    charger: {
      name: '지옥 사냥개', fx: '#9a4a2a', sprite: 'hound', behavior: 'charge', hp: 30, speed: 85, radius: 14, damage: 15, xp: 2, scale: 2, weight: 4, from: 80,
      chargeRange: 280, windup: 0.6, dashTime: 0.5, dashSpeed: 430, rest: 1.1,
    },
  },

  // 보스(BOSS 해창): 추적 → 돌진 → 탄막 → 소환 순서로 반복하는 상태머신. 체력 절반 이하면 2페이즈.
  boss: {
    name: 'BOSS 해창',
    fx: '#c4221a',
    sprite: 'boss', sprite2: 'boss2', behavior: 'boss',
    time: 200,           // 3분 20초에 등장
    warnTime: 30,        // 등장 이 시간(초) 전부터 경고 연출(붉은 화면, 사이렌, 카운트다운)
    hp: 8800, speed: 55, radius: 68, damage: 25, xp: 25, scale: 7, // 크기: 스프라이트 7배(약 140x154px), 충돌 반지름 68
    sequence: ['chase', 'charge', 'barrage', 'chase', 'summon'],
    chaseTime: 3,
    charge: { windup: 1.0, dashTime: 0.8, dashSpeed: 560 },
    barrage: { duration: 2.4, interval: 0.55, bullets: 14, bulletSpeed: 170, damage: 9 },
    summon: { windup: 0.8, count: 6, types: ['normal', 'fast'] },
    phase2: { hpRatio: 0.5, speedMul: 1.3, intervalMul: 0.7, bulletsAdd: 6, summonAdd: 4, chaseMul: 0.7 },
  },

  // AI 디렉터: 플레이어 상태를 보고 스폰량을 min~max배로 조절한다
  director: {
    tau: 8,           // 처치 속도를 평균내는 시간(초)
    refKillRate: 1.5, // 이 정도 처치 속도(마리/초)를 "보통"으로 본다
    min: 0.7,
    max: 1.3,
    smooth: 0.6,      // 배율이 목표값을 따라가는 속도(1/초)
  },

  // 타격감 이펙트
  fx: {
    flashTime: 0.09,        // 맞았을 때 하얗게 번쩍이는 시간(초)
    numberLife: 0.7,        // 데미지 숫자가 떠 있는 시간(초)
    maxNumbers: 90,
    maxParticles: 500,
    hurtShake: { amp: 7, dur: 0.28 },       // 플레이어가 맞았을 때 화면 흔들림
    bossDeathShake: { amp: 12, dur: 0.9 },
    bossSpawnShake: { amp: 6, dur: 1.2 },
  },

  // 카드 선택지에 나올 상대 확률 (기본 1). 레이저와 번개는 너무 강해서 낮췄다.
  // 진화 카드는 이 값 x1.5 확률로 나온다(최대 100%).
  cardWeights: { laser: 0.2, lightning: 0.3 },

  // 이미 가진 스킬의 '강화' 카드가 너무 자주 나오지 않게: 기본 확률에 upgradeWeight를 곱하고,
  // 그 스킬의 레벨이 오를수록 stackDecay씩 곱해 점점 드물어진다 (새 무기·능력치 카드는 영향 없음)
  cardStack: { upgradeWeight: 0.45, stackDecay: 0.85 },

  // 스킬 공명(각성): needed종의 액티브 스킬이 각각 minLevel 이상이 되면 단계가 오른다 (3종 = 1단계, 4종 = 2단계)
  awaken: {
    minLevel: 3,
    needed: [3, 4],
    damageMul: [1.25, 1.15],    // 단계별 모든 스킬 피해 배율
    cooldownMul: [0.88, 0.92],  // 단계별 발사/타격 간격 배율 (작을수록 빠름)
    wave: {                     // 발동 순간의 충격파
      radius: [480, 640],
      damage: [70, 110],
      push: [110, 150],         // 밀려나는 거리(px)
    },
  },

  // 1분마다 오르는 긴장감: 배경음악 박자가 이만큼씩 빨라진다 (상한 maxTempo)
  minute: { tempoStep: 0.12, maxTempo: 1.45 },

  // 효과음 / 배경음악
  sfx: { volume: 0.9 }, // 전체 음량 (0~1)
  music: { volume: 1.2 }, // 배경음악 음량 (전체 음량에 곱해진다)

  // 바닥에 생기는 아이템 (플레이어 주변 minDist~maxDist 무작위 위치, 먼저 것은 안 주워도 사라지고 새로 생긴다)
  items: {
    radius: 18,  // 줍는 범위
    potion: { interval: 50, healCells: 2.5, minDist: 220, maxDist: 480 }, // 체력 2.5칸 = 2.5 x hpBar.segmentHp 회복
    magnet: { interval: 90, pullSpeed: 900, minDist: 220, maxDist: 480 }, // 맵의 모든 경험치 구슬을 끌어당김
  },

  // 경험치: 다음 레벨까지 필요한 양 = base + (현재 레벨 - 1) * growth
  xp: { base: 6, growth: 6 },

  // 경험치 보석
  gem: {
    radius: 6,
    pullSpeed: 260,  // 끌려오기 시작할 때의 속도(px/s)
    pullAccel: 900,  // 끌려오는 동안 붙는 가속도
    max: 400,        // 이 수를 넘으면 새 보석은 기존 보석에 합쳐진다
  },

  // 레벨업 강화 (카드)
  upgrades: {
    limit: 5,           // 이동속도/최대체력/자석은 최대 이 횟수까지
    speedPct: 0.1,      // 이동 속도 +10%
    maxHpAdd: 20,       // 최대 체력 +20 (그만큼 회복도 됨)
    magnetPct: 0.3,     // 자석 범위 +30%
    healAmount: 30,     // 고를 카드가 모자랄 때 나오는 회복 카드
  },

  // 스폰: 화면 밖 원 위에서 생겨난다. 시간이 갈수록 간격이 줄어든다.
  spawn: {
    baseInterval: 1.2,  // 시작 간격(초)
    minInterval: 0.14,  // 최소 간격(초)
    rampPerSec: 0.0065, // 1초마다 줄어드는 간격
    hpRampPerSec: 0.009, // 1초마다 늘어나는 적 체력 배율 (200초면 약 2.2배)
    speedStepPerMinute: 0.25, // 1분이 지날 때마다 적 이동 속도 배율이 이만큼 오른다 (1분 x1.25, 2분 x1.50, 3분 x1.75)
    speedMulMax: 2.0,    // 속도 배율 상한: 너무 빨라 피할 수 없게 되는 걸 막는다
    bossSpawnMul: 0.6,  // 보스가 있는 동안 일반 스폰 비율
    maxEnemies: 320,
    margin: 80,         // 화면 가장자리 바깥 여유(px)
    despawnFactor: 2,   // 스폰 거리의 몇 배보다 멀어지면 제거할지
  },

  // 군집 이동: 가까운 적끼리 서로 밀어낸다
  separation: {
    cell: 48,       // 공간 분할 격자 크기(px)
    strength: 1.2,  // 밀어내는 세기(이동속도 대비)
  },

  // 던전 바닥 타일 (다크 판타지)
  floor: {
    tileSize: 256,     // 반복되는 패턴 한 장의 크기(px)
    slabSize: 64,      // 돌판 하나의 크기(px)
    mortar: '#0d0807', // 줄눈
    slabColors: ['#1c1411', '#201814', '#241a15', '#2a1d17'],
    highlight: 'rgba(120, 85, 60, 0.22)', // 돌판 모서리 하이라이트
    crack: 'rgba(5, 3, 2, 0.7)',
    seed: 20240601,    // 같은 값이면 항상 같은 무늬
  },

  // 가장자리 비네팅
  vignette: {
    inner: 0.35,       // 이 비율(화면 대각선 기준)까지는 투명
    color: '0, 0, 0',
    alpha: 0.85,       // 가장자리 최대 어두움
  },
};
