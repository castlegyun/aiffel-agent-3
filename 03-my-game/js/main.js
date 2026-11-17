// 게임 루프, 상태 관리, 입력. 다른 파일의 부품들을 한 판의 흐름으로 엮는다.

const canvas = document.getElementById('game');
Render.init(canvas);

// 화면에 보이는 세계의 크기(세계 좌표). 스폰 거리·카메라가 이 값을 쓴다.
let width = 0;
let height = 0;

function resize() {
  Render.resize();
  width = Render.viewW;
  height = Render.viewH;
}
window.addEventListener('resize', resize);
resize();
Background.init();

// ---- 입력 (WASD / 방향키 이동, Space 점멸) ----
const keys = {};
let wantDash = false; // 점멸 키를 눌렀다 (다음 update에서 한 번 쓴다)
window.addEventListener('keydown', (e) => {
  if (!e.repeat && (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) wantDash = true;
  keys[e.code] = true;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---- 터치: 화면을 누른 자리에 가상 조이스틱이 생기고, 끌면 그 방향으로 움직인다 ----
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const JOY_RADIUS = 56; // 손잡이가 움직일 수 있는 최대 거리(px)
const JOY_DEAD = 8;    // 이 거리보다 적게 끌면 가만히 있는 것으로 본다

(function setupTouch() {
  const base = document.getElementById('joy');
  const knob = document.getElementById('joy-knob');
  // 손가락으로 처음 누른 순간부터 터치 화면으로 본다 (터치가 되는 노트북에서 키보드 안내가 사라지지 않게)
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') document.body.classList.add('touch');
  });
  if (!window.matchMedia('(hover: hover)').matches) document.body.classList.add('touch');

  const reset = () => { joy.id = null; joy.x = 0; joy.y = 0; base.classList.add('hidden'); };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || joy.id !== null) return; // 마우스는 키보드로 대신, 손가락은 하나만
    joy.id = e.pointerId;
    joy.ox = e.clientX;
    joy.oy = e.clientY;
    joy.x = 0;
    joy.y = 0;
    try {
      canvas.setPointerCapture(e.pointerId); // 손가락이 캔버스 밖으로 나가도 계속 받는다
    } catch (err) {
      // 캡처를 못 해도 조이스틱은 동작한다
    }
    base.style.left = joy.ox + 'px';
    base.style.top = joy.oy + 'px';
    knob.style.transform = 'translate(-50%, -50%)';
    base.classList.remove('hidden');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    const dx = e.clientX - joy.ox;
    const dy = e.clientY - joy.oy;
    const d = Math.hypot(dx, dy);
    const k = Math.min(d, JOY_RADIUS);
    joy.x = d > JOY_DEAD ? dx / d : 0;
    joy.y = d > JOY_DEAD ? dy / d : 0;
    knob.style.transform = `translate(calc(-50% + ${d ? (dx / d) * k : 0}px), calc(-50% + ${d ? (dy / d) * k : 0}px))`;
  });

  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, (e) => { if (e.pointerId === joy.id) reset(); });
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // 길게 눌러도 메뉴가 뜨지 않게

  // 키보드가 없는 기기용 버튼. 누른 뒤 포커스를 풀어야 Space가 버튼을 다시 누르지 않는다.
  document.getElementById('btn-pause-touch').addEventListener('click', (e) => { e.currentTarget.blur(); pauseGame(); });
  document.getElementById('btn-dash-touch').addEventListener('pointerdown', (e) => { e.preventDefault(); wantDash = true; });
})();

function readInput() {
  if (joy.id !== null && (joy.x || joy.y)) return { x: joy.x, y: joy.y };
  return {
    x: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
    y: (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0),
  };
}

// ---- 게임 상태 ----
let player = new Player();
const enemies = [];
let gameTime = 0; // 시작 후 지난 시간(초)
const sepVec = { x: 0, y: 0 };
let projectiles = [];
let weapons = [new BoltWeapon()];
let stats = { kills: 0, killsByType: {} };
let gems = [];
const enemyProjectiles = [];
let killsThisFrame = 0;
let act = 0;              // 지금 몇 막인가 (0, 1, 2)

// 보스: 시간 순서대로 하나씩 등장한다. 살아 있는 보스는 언제나 하나뿐이다.
const BOSS_PLAN = Object.keys(CONFIG.bosses).sort((a, b) => CONFIG.bosses[a].time - CONFIG.bosses[b].time);
let boss = null;          // 지금 살아 있는 보스
let bossIndex = 0;        // 다음에 나올 보스가 BOSS_PLAN의 몇 번째인가
let bossWarned = false;   // 다음 보스의 등장 경고를 이미 시작했는지
let warnAlarmTimer = 0;
let bossesSeen = 0;
let bossDefeated = false; // 최종 보스를 쓰러뜨렸는가 (승리 연출 중)
let winDelay = 0;         // 최종 보스 격파 후 결과 화면까지 남은 시간

// 게임을 멈추고 띄우는 창들의 대기열: 레벨업 카드와 상자
let pendingLevelUps = 0;  // 아직 고르지 않은 레벨업 횟수
const pendingChests = []; // 아직 열지 않은 상자들 (각각 보상 수)

// 적 AI가 바깥 세계(탄, 소환, 안내 문구)에 손대는 창구
const world = {
  speedMul: 1, // 지금 시간대의 적 이동 속도 배율 (웨이브 표)
  // strong: 보스의 탄막. 탄이 많아도 무늬에 구멍이 나지 않게 상한을 더 넉넉히 준다.
  shoot(x, y, dx, dy, speed, damage, strong) {
    if (enemyProjectiles.length < (strong ? 560 : 400)) enemyProjectiles.push(new EnemyProjectile(x, y, dx, dy, speed, damage));
    Sfx.enemyShoot();
  },
  spawnEnemy(type, x, y, opt = {}) {
    opt.force = true;
    Spawner.make(enemies, type, x, y, opt);
  },
  announce(text) {
    UI.announce(text);
  },
};

// 'menu' | 'playing' | 'levelup' | 'chest' | 'paused' | 'gameover' | 'victory'
let state = 'menu';
function setState(next) {
  state = next;
  UI.setState(next); // 상태에 맞는 화면(오버레이)만 보이게 한다
  Music.onState(next, !!boss, bossWarned); // 상태에 맞는 배경음악
}

// 적과 닿으면 접촉 피해. 무적 시간 중에는 player.takeDamage가 무시한다.
function updatePlayerHit() {
  const list = AI.near(player.x, player.y);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.hp <= 0 || e.spawnT > 0) continue; // 솟아오르는 중인 적은 아직 해치지 않는다
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const r = e.radius + player.radius;
    if (dx * dx + dy * dy < r * r) player.takeDamage(e.damage);
  }
}

function dropGem(x, y, value) {
  if (gems.length >= CONFIG.gem.max) {
    // 너무 많으면 새로 만들지 않고 가장 가까운 보석에 값을 합친다 (합쳐진 보석은 윗 등급 색으로 바뀐다)
    let best = gems[0];
    let bd = Infinity;
    for (const g of gems) {
      const d = (g.x - x) ** 2 + (g.y - y) ** 2;
      if (d < bd) { bd = d; best = g; }
    }
    best.value += value;
    return;
  }
  gems.push(new Gem(x, y, value));
}

// 아이템을 주웠을 때의 효과
const itemHooks = {
  // 체력 2.5칸 회복 (한 칸 = hpBar.segmentHp)
  potion() {
    const healed = player.heal(CONFIG.items.potion.healCells * CONFIG.player.hpBar.segmentHp);
    Effects.burst(player.x, player.y - 10, 14, ['#ff5a44', '#ff8a70', '#ffffff'], 120, 0.6, -0.4);
    UI.announce(healed >= 1 ? `체력 +${Math.round(healed)}` : '체력이 가득하다', 'good');
    Sfx.potion();
  },
  // 맵의 모든 경험치 구슬이 빠르게 플레이어에게 날아온다
  magnet() {
    for (const g of gems) {
      g.pulled = true;
      g.speed = Math.max(g.speed, CONFIG.items.magnet.pullSpeed);
    }
    Effects.ring(player.x, player.y, 500, '120, 180, 255', 0.5);
    UI.announce('경험치 구슬 흡수!', 'good');
    Sfx.magnet();
  },
  // 화면 안의 모든 적에게 큰 피해
  bomb() {
    const dmg = CONFIG.items.bomb.damage;
    for (const e of enemies) {
      if (e.hp <= 0 || !Render.onScreen(Render.X(e.x), Render.Y(e.y), 20)) continue;
      hitEnemy(e, e.isBoss ? dmg * 0.5 : dmg, 'bomb', player.x, player.y, 1.5);
    }
    enemyProjectiles.length = 0; // 날아오던 탄도 함께 사라진다
    Effects.flash(player.x, player.y, 260, 0.35);
    Effects.ring(player.x, player.y, 900, '255, 180, 60', 0.6);
    Effects.pulse([255, 244, 200], 1, 0.5);
    Effects.shake(9, 0.5);
    UI.announce('폭탄! 화면의 적을 쓸어버렸다', 'good');
    Sfx.blast();
    Sfx.meteor();
  },
  // 상자: 게임을 멈추고 보상 창을 띄운다
  chest(count) {
    pendingChests.push(count);
  },
};

function updateGems(dt) {
  for (let i = gems.length - 1; i >= 0; i--) {
    if (!gems[i].update(dt, player)) continue;
    pendingLevelUps += player.gainXp(gems[i].value);
    Sfx.gem();
    gems[i] = gems[gems.length - 1];
    gems.pop();
  }
}

// 카드를 고른(받은) 뒤 공통으로 할 일: 적용 → 스킬 공명 확인
function applyCard(card) {
  card.apply();
  Awaken.check(player, weapons, enemies); // 조건을 채웠으면 스킬 공명 발동
}

// 창을 닫은 뒤: 대기 중인 상자·레벨업이 있으면 이어서 띄우고, 없으면 게임으로 돌아간다
function nextModal() {
  if (pendingChests.length) openChest(pendingChests.shift());
  else if (pendingLevelUps > 0) openLevelUp();
  else setState('playing');
}

// 레벨업 카드를 띄우고 게임을 멈춘다
function openLevelUp() {
  setState('levelup');
  Sfx.levelUp();
  const options = Upgrades.roll({ player, weapons });
  UI.showLevelUp(options, (i) => {
    Sfx.select();
    applyCard(options[i]);
    pendingLevelUps--;
    UI.hideLevelUp();
    nextModal();
  });
}

// 상자를 연다: 보상을 차례로 정해 바로 적용하고, 무엇을 받았는지 보여 준다
function openChest(count) {
  setState('chest');
  Sfx.chest();
  const rewards = [];
  for (let i = 0; i < count; i++) {
    const card = Upgrades.chest({ player, weapons });
    applyCard(card);
    rewards.push(card);
  }
  UI.showChest(rewards, nextModal);
}

// 결과 화면에 보여줄 정보를 모으고, 최고 기록이면 저장한다
function buildResult(won) {
  const rec = { time: Math.min(gameTime, CONFIG.game.duration), kills: stats.kills, won };
  const best = Records.load();
  const isNewRecord = Records.isBetter(rec, best);
  if (isNewRecord) Records.save(rec);
  return {
    won,
    time: rec.time,
    kills: stats.kills,
    byType: stats.killsByType,
    level: player.level,
    act,
    bossesSeen,
    bossesKilled: BOSS_PLAN.filter((k) => stats.killsByType[k]).length,
    byBoss: bossDefeated, // 최종 보스를 쓰러뜨려서 클리어했는가
    isNewRecord,
    best: isNewRecord ? rec : best,
  };
}

function endGame() {
  setState('gameover');
  Sfx.lose();
  UI.showResult(buildResult(false), weapons);
}

function winGame() {
  setState('victory');
  Sfx.win();
  UI.showResult(buildResult(true), weapons);
}

// 보스를 쓰러뜨렸다. 중간 보스면 상자를 떨어뜨리고, 최종 보스면 남은 시간과 관계없이 클리어한다.
function onBossDefeated(dead) {
  Items.dropChest(dead.x, dead.y, CONFIG.chest.boss);
  enemyProjectiles.length = 0;
  Hazards.reset();
  UI.announce(`${dead.cfg.name} 격파!`, 'awaken');
  Sfx.awaken(1);
  if (!dead.cfg.final) return;
  // 폭발 연출을 볼 시간을 준 뒤 결과 화면을 띄운다
  bossDefeated = true;
  winDelay = 2.6;
  player.invuln = 1e9;        // 연출 중에는 맞지 않는다
  for (const o of enemies) {  // 남은 적도 함께 쓰러진다
    if (o !== dead && o.hp > 0) o.hp = 0;
  }
}

// 막이 바뀌면: 바닥과 음악이 바뀌고 안내 문구가 뜬다
const ACT_NAMES = ['1막 · 버려진 던전', '2막 · 용암 지대', '3막 · 심연'];
function updateAct() {
  const A = CONFIG.game.acts;
  let now = 0;
  for (let i = 0; i < A.length; i++) if (gameTime >= A[i]) now = i;
  if (now === act) return;
  act = now;
  Background.setAct(act);
  Music.setAct(act);
  UI.setAct(ACT_NAMES[act]);
  UI.announce(ACT_NAMES[act], 'awaken');
  Effects.pulse([255, 244, 200], 0.8, 0.8);
  Effects.shake(4.5, 0.45);
  Sfx.act();
}

// 보스 일정: 등장 전 경고(붉은 가장자리 + 카운트다운 + 사이렌) → 등장
function updateBosses(dt) {
  if (bossIndex >= BOSS_PLAN.length) return;
  const key = BOSS_PLAN[bossIndex];
  const B = CONFIG.bosses[key];
  const left = B.time - gameTime;
  if (left > B.warnTime) return;

  if (!bossWarned) {
    bossWarned = true;
    // 앞선 보스를 아직 못 잡았으면 상자 없이 물러난다 (보스는 항상 하나)
    if (boss) {
      Effects.burst(boss.x, boss.y, 40, ['#8a7a68', '#ffffff', boss.cfg.fx], 260, 0.7, 0);
      UI.announce(`${boss.cfg.name}이(가) 물러났다`);
      boss.dead = true;
      boss = null;
    }
    UI.announce(`⚠ ${Math.ceil(left)}초 뒤 ${B.name} 등장!`);
    Sfx.warnStart();
    Music.setMood('tense');
    warnAlarmTimer = 1.6;
  }

  if (left > 0) {
    const k = 1 - left / B.warnTime; // 0 -> 1: 등장이 가까울수록 더 빠르고 강해진다
    Effects.warn = k;
    UI.setWarning(left, B.name);
    warnAlarmTimer -= dt;
    if (warnAlarmTimer <= 0) {
      warnAlarmTimer = left > 8 ? 2.4 : 1.2; // 마지막 8초는 사이렌이 두 배로 잦아진다
      Sfx.alarm();
      Effects.shake(1 + 2.5 * k, 0.18);
    }
    return;
  }

  // 등장: 화면 밖에서 걸어 들어온다
  bossIndex++;
  bossWarned = false;
  bossesSeen++;
  Effects.warn = 0;
  UI.endWarning();
  Music.setMood('boss');
  const p = Spawner.point(player, width, height);
  boss = new Enemy(key, p.x, p.y);
  enemies.push(boss);
  UI.announce(B.name + ' 등장!');
  Effects.pulse([196, 34, 26], 1, 1.0);
  Effects.shake(CONFIG.fx.bossSpawnShake.amp, CONFIG.fx.bossSpawnShake.dur);
  Sfx.bossSpawn();
}

// 적 탄과 플레이어의 충돌
function updateEnemyProjectiles(dt) {
  for (const p of enemyProjectiles) {
    p.update(dt);
    if (p.dead) continue;
    const dx = p.x - player.x;
    const dy = p.y - player.y;
    const r = p.radius + player.radius * 0.8;
    if (dx * dx + dy * dy < r * r) {
      player.takeDamage(p.damage);
      p.dead = true;
    }
  }
  removeDead(enemyProjectiles, (p) => p.dead);
}

// 한 판을 처음 상태로 되돌린다 (화면 전환은 startGame / toMenu가 맡는다)
function resetWorld() {
  player = new Player();
  Build.reset();
  weapons = [new BoltWeapon()];
  stats = { kills: 0, killsByType: {} };
  enemies.length = 0; // world가 같은 배열을 계속 쓰므로 새로 만들지 않고 비운다
  projectiles = [];
  enemyProjectiles.length = 0;
  gems = [];
  Items.reset();
  Hazards.reset();
  Awaken.reset();
  Effects.reset();
  DamageLog.reset();
  Director.reset();
  Spawner.reset();
  boss = null;
  bossIndex = 0;
  bossWarned = false;
  warnAlarmTimer = 0;
  bossesSeen = 0;
  bossDefeated = false;
  winDelay = 0;
  act = 0;
  world.speedMul = 1;
  Background.setAct(0);
  Music.setAct(0);
  UI.setAct(ACT_NAMES[0]);
  UI.endWarning();
  UI.hideAnnounce();
  UI.hideLevelUp();
  killsThisFrame = 0;
  pendingLevelUps = 0;
  pendingChests.length = 0;
  wantDash = false;
  gameTime = 0;
}

function startGame() {
  resetWorld();
  setState('playing');
}

function toMenu() {
  resetWorld();
  setState('menu');
}

function pauseGame() {
  if (state !== 'playing') return;
  UI.renderPause(player, weapons, gameTime);
  setState('paused');
}

function resumeGame() {
  if (state === 'paused') setState('playing');
}

// 불꽃탄이 맞은 자리에서 터져 주변 적에게 폭발 피해를 준다
function explode(p, hitTarget) {
  if (!p.splash) return;
  Effects.ring(p.x, p.y, p.splash * 2.2, '255, 150, 50', 0.32);
  Effects.flash(p.x, p.y, p.splash * 0.7);
  Effects.burst(p.x, p.y, 7, ['#ff7a1a', '#ffb43a', '#fff4c8'], 150, 0.4);
  // 폭발이 격자 한 칸보다 작으면 주변 칸만, 크면 전체를 훑는다
  const list = p.splash < 40 ? AI.near(p.x, p.y) : enemies;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o === hitTarget || o.hp <= 0) continue;
    const r = p.splash + o.radius;
    if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 < r * r) hitEnemy(o, p.damage * p.splashMul, 'bolt', p.x, p.y, 0.6);
  }
}

// 탄과 적의 원-원 충돌. 맞으면 피해를 주고 탄은 사라진다(관통탄은 계속 날아간다).
function updateProjectiles(dt) {
  for (const p of projectiles) {
    p.update(dt);
    if (p.dead) continue;
    const list = AI.near(p.x, p.y);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.hp <= 0) continue;
      if (p.hit && p.hit.has(e)) continue; // 관통 탄은 같은 적을 한 번만 맞힌다
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const r = e.radius + p.radius;
      if (dx * dx + dy * dy >= r * r) continue;
      hitEnemy(e, p.damage, 'bolt', p.x - p.vx, p.y - p.vy);
      if (p.pierce > 0) {
        p.pierce--;
        p.hit.add(e);
      } else {
        p.dead = true;
        explode(p, e); // 여기서 AI.near를 다시 쓰므로 이 목록은 더 보지 않고 나간다
        break;
      }
    }
  }
  removeDead(projectiles, (p) => p.dead);
}

// 체력이 0 이하가 된 적을 치우고 처치 수를 센다. (스스로 사라진 적은 조용히 치운다)
function removeDeadEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.hp > 0 && !e.dead) continue;
    enemies[i] = enemies[enemies.length - 1];
    enemies.pop();
    if (e.hp > 0) continue; // 박쥐가 화면을 다 지나갔거나, 자폭병이 스스로 터졌다

    stats.kills++;
    stats.killsByType[e.type] = (stats.killsByType[e.type] || 0) + 1;
    killsThisFrame++;
    killEffect(e);
    dropGem(e.x, e.y, e.xp);
    if (e === boss) {
      boss = null;
      Music.setMood('play'); // 보스를 쓰러뜨리면 다시 평소 음악
      onBossDefeated(e);
    } else if (!bossDefeated) {
      if (e.elite) {
        Items.dropChest(e.x, e.y, CONFIG.chest.elite);
        if (e.affix === 'burst') {
          // 폭발 특성의 정예는 쓰러지며 탄을 사방으로 뿌린다
          for (let k = 0; k < 12; k++) world.shoot(e.x, e.y, Math.cos((k * Math.PI) / 6), Math.sin((k * Math.PI) / 6), 150, 8);
        }
      }
      const split = e.cfg.split;
      if (split) {
        // 슬라임은 작은 슬라임 둘로 갈라진다
        for (let k = 0; k < split.count; k++) {
          const a = Math.random() * Math.PI * 2;
          const child = Spawner.make(enemies, split.type, e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10, { force: true });
          child.kvx = Math.cos(a) * 160;
          child.kvy = Math.sin(a) * 160;
        }
      }
    }
  }
}

// 순서가 상관없는 배열에서 조건에 맞는 항목을 빠르게 제거(swap-remove)
function removeDead(list, isDead) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (isDead(list[i])) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

function updateEnemies(dt) {
  // 스폰량 = 웨이브 표 x 디렉터 배율 x (보스가 있으면 줄인다). 최종 보스 격파 뒤에는 더 나오지 않는다.
  const rate = Director.mult * (boss ? CONFIG.spawn.bossSpawnMul : 1);
  if (!bossDefeated) Spawner.update(dt, gameTime, player, enemies, width, height, rate);
  world.speedMul = Spawner.cur.speed;
  AI.rebuild(enemies);

  const far = Spawner.spawnDistance(width, height) * CONFIG.spawn.recycleFactor;
  const far2 = far * far;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    AI.separation(e, sepVec);
    e.update(dt, player, sepVec, world);
    // 너무 멀어진 적: 포탑은 치우고, 나머지는 플레이어 가까운 화면 밖으로 다시 데려온다 (보스·박쥐 떼는 그대로)
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    if (dx * dx + dy * dy > far2 && !e.isBoss && e.cfg.behavior !== 'fly') {
      if (e.baseSpeed === 0) e.dead = true;
      else Spawner.recycle(e, player, width, height);
    }
  }
}

function update(dt) {
  if (state !== 'playing') return; // 카드 선택·게임오버·승리 중에는 화면을 그대로 멈춘다
  // 히트스톱: 큰 타격의 순간에는 아주 잠깐 모든 것이 멈춘다
  if (Effects.freeze > 0) {
    Effects.freeze -= dt;
    return;
  }
  gameTime += dt;
  player.update(dt, readInput());
  if (wantDash) {
    wantDash = false;
    player.dash();
  }
  updateAct();
  updateBosses(dt);
  updateEnemies(dt);
  for (const w of weapons) w.update(dt, player, enemies, projectiles);
  updateProjectiles(dt);
  updateEnemyProjectiles(dt);
  Hazards.update(dt, player);
  killsThisFrame = 0;
  removeDeadEnemies();
  if (bossDefeated) {
    winDelay -= dt;
    if (winDelay <= 0) {
      winGame();
      return;
    }
  }
  Director.update(dt, player, killsThisFrame, Spawner.cur.rate);
  updateGems(dt);
  Effects.update(dt);
  Items.update(dt, player, itemHooks);
  updatePlayerHit();
  if (player.hp <= 0) endGame();
  else if (gameTime >= CONFIG.game.duration) winGame();
  else if (!bossDefeated && (pendingChests.length || pendingLevelUps > 0)) nextModal();
}

const shakeVec = { x: 0, y: 0 };
const drawList = []; // 이번 프레임에 화면에 보이는 적 (y 순서로 정렬해서 그린다)

function draw() {
  // 화면 흔들림: 카메라를 매 프레임 조금씩 어긋나게 한다 (게임이 멈춰 있을 때는 흔들지 않는다)
  if (state === 'playing') Effects.shakeOffset(shakeVec);
  else { shakeVec.x = 0; shakeVec.y = 0; }
  const U = CONFIG.view.unit;
  Render.begin(player.x, player.y, Math.round(shakeVec.x / U), Math.round(shakeVec.y / U));
  const g = Render.g;

  // ---- 바닥과 바닥에 깔리는 것 ----
  Background.drawFloor(g);
  Background.drawDecor(g);
  for (const w of weapons) w.drawUnder(g, player); // 유성 예고, 불타는 바닥
  Hazards.drawGround(g);                            // 보스 공격 예고
  for (const e of enemies) e.drawGround(g);         // 돌진 예고선, 자폭 범위
  for (const gem of gems) gem.draw();
  Items.draw();

  // ---- 캐릭터: 화면 안의 적만 골라, y가 작은(위쪽) 것부터 그려서 아래쪽 캐릭터가 앞에 보이게 한다 ----
  drawList.length = 0;
  for (const e of enemies) {
    if (Render.onScreen(Render.X(e.x), Render.Y(e.y), e.sprite.h)) drawList.push(e);
  }
  drawList.sort((a, b) => a.y - b.y);
  let playerDrawn = false;
  for (const e of drawList) {
    if (!playerDrawn && e.y > player.y) {
      player.draw(g);
      playerDrawn = true;
    }
    e.draw(g);
  }
  if (!playerDrawn) player.draw(g);
  Effects.drawActors(g); // 죽은 적의 실루엣, 점멸 잔상

  // ---- 조명: 빛나는 것 주변만 밝고 나머지는 어둡다 ----
  const L = CONFIG.light;
  Render.light(player.x, player.y - 10, L.player);
  for (const p of projectiles) Render.light(p.x, p.y, L.bolt);
  for (const p of enemyProjectiles) Render.light(p.x, p.y, L.enemyShot);
  for (const w of weapons) w.addLights(player);
  Hazards.addLights();
  Effects.addLights();
  Render.drawDarkness();

  // ---- 스스로 빛나는 것: 어둠 위에 그린다 ----
  g.globalCompositeOperation = 'lighter';
  Render.glow(Render.X(player.x), Render.Y(player.y - 10), L.player * 0.3, L.warm); // 횃불빛
  Background.drawDecorGlow();
  Awaken.drawAura(g, player);
  Items.drawGlow();
  for (const w of weapons) w.drawGlow(g, player);
  for (const p of projectiles) p.drawGlow();
  for (const p of enemyProjectiles) p.drawGlow();
  g.globalCompositeOperation = 'source-over';
  for (const w of weapons) w.draw(g, player);
  for (const p of projectiles) p.draw();
  for (const p of enemyProjectiles) p.draw();
  Hazards.draw(g);
  Effects.draw(g); // 파티클과 데미지 숫자는 맨 위에
  player.drawHpBar();
  Items.drawIndicators(); // 화면 밖 아이템 방향 표시
  Effects.drawScreen();   // 화면 가장자리 섬광

  Render.present();
}

// ---- 게임 루프 ----
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, CONFIG.maxDelta);
  last = now;
  update(dt);
  UI.updateHud(player, gameTime, boss, stats.kills, weapons);
  UI.updateSound();
  draw();
  requestAnimationFrame(loop);
}
Sfx.init();
UI.init({
  getState: () => state,
  onStart: startGame,
  onRestart: startGame,
  onMenu: toMenu,
  onPause: pauseGame,
  onResume: resumeGame,
});
setState('menu');

// 다른 탭으로 가면 자동으로 일시정지한다 (돌아왔을 때 갑자기 맞는 일이 없게)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

requestAnimationFrame(loop);
