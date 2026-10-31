const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let width = 0;
let height = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  Background.resize(width, height);
}
window.addEventListener('resize', resize);
Background.init(ctx);
resize();

// ---- 입력 (WASD / 방향키) ----
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code.startsWith('Arrow')) e.preventDefault();
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
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  document.body.classList.toggle('touch', isTouch);

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

  // 키보드가 없는 기기용 일시정지 버튼
  document.getElementById('btn-pause-touch').addEventListener('click', () => pauseGame());
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
const camera = { x: 0, y: 0 };
const enemies = [];
let gameTime = 0; // 시작 후 지난 시간(초)
const sepVec = { x: 0, y: 0 };
let projectiles = [];
let weapons = [new BoltWeapon()];
let stats = { kills: 0, killsByType: {} };
let gems = [];
const enemyProjectiles = [];
let boss = null;          // 지금 살아 있는 보스
let bossSpawned = false;
let bossWarned = false;   // 보스 등장 경고를 이미 시작했는지
let warnAlarmTimer = 0;
let bossDefeated = false; // 보스를 쓰러뜨렸는가 (승리 연출 중)
let winDelay = 0;         // 보스 격파 후 결과 화면까지 남은 시간
let minuteMark = 0;       // 지금까지 알린 "몇 분 경과" (1분마다 적과 음악이 빨라진다)
let killsThisFrame = 0;

// 적 AI가 바깥 세계(탄, 소환, 안내 문구)에 손대는 창구
const world = {
  speedMul: 1, // 시간에 따른 적 이동 속도 배율 (updateEnemies가 매 프레임 갱신)
  shoot(x, y, dx, dy, speed, damage) {
    if (enemyProjectiles.length < 400) enemyProjectiles.push(new EnemyProjectile(x, y, dx, dy, speed, damage));
    Sfx.enemyShoot();
  },
  spawnEnemy(type, x, y) {
    enemies.push(new Enemy(type, x, y, Spawner.hpMul(gameTime)));
  },
  announce(text) {
    UI.announce(text);
  },
};
let pendingLevelUps = 0; // 아직 고르지 않은 레벨업 횟수
// 'menu' | 'playing' | 'levelup' | 'paused' | 'gameover' | 'victory'
let state = 'menu';
function setState(next) {
  state = next;
  UI.setState(next); // 상태에 맞는 화면(오버레이)만 보이게 한다
  Music.onState(next, !!boss, bossWarned && !bossSpawned); // 상태에 맞는 배경음악
}

// 적과 닿으면 접촉 피해. 무적 시간 중에는 player.takeDamage가 무시한다.
function updatePlayerHit() {
  AI.forNearby(player.x, player.y, (e) => {
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const r = e.radius + player.radius;
    if (dx * dx + dy * dy < r * r) player.takeDamage(e.damage);
  });
}

function dropGem(x, y, value) {
  if (gems.length >= CONFIG.gem.max) {
    // 너무 많으면 새로 만들지 않고 아무 보석에 값을 합친다
    gems[Math.floor(Math.random() * gems.length)].value += value;
    return;
  }
  gems.push(new Gem(x, y, value));
}

// 아이템을 주웠을 때의 효과
const itemHooks = {
  // 체력 2.5칸 회복 (한 칸 = hpBar.segmentHp)
  potion() {
    const heal = CONFIG.items.potion.healCells * CONFIG.player.hpBar.segmentHp;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + heal);
    UI.announce(`체력 +${Math.round(player.hp - before)}`, 'good');
    Sfx.potion();
  },
  // 맵의 모든 경험치 구슬이 빠르게 플레이어에게 날아온다
  magnet() {
    for (const g of gems) {
      g.pulled = true;
      g.speed = Math.max(g.speed, CONFIG.items.magnet.pullSpeed);
    }
    UI.announce('경험치 구슬 흡수!', 'good');
    Sfx.magnet();
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

// 레벨업 카드를 띄우고 게임을 멈춘다
function openLevelUp() {
  setState('levelup');
  Sfx.levelUp();
  const ctx2 = { player, weapons };
  const options = Upgrades.roll(ctx2);
  UI.showLevelUp(options, (i) => {
    Sfx.select();
    options[i].apply();
    Awaken.check(player, weapons, enemies); // 3종 이상이 Lv3 이상이면 스킬 공명 발동
    pendingLevelUps--;
    UI.hideLevelUp();
    if (pendingLevelUps > 0) openLevelUp(); // 한 번에 여러 레벨이 올랐으면 이어서
    else setState('playing');
  });
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
    bossSeen: bossSpawned,
    byBoss: !!stats.killsByType.boss, // 보스를 쓰러뜨려서 클리어했는가
    weapons: weapons.map((w) => ({ name: w.name, icon: w.icon, level: w.level, evolved: w.evolved })),
    isNewRecord,
    best: isNewRecord ? rec : best,
  };
}

function endGame() {
  setState('gameover');
  Sfx.lose();
  UI.showResult(buildResult(false));
}

// 보스를 쓰러뜨렸다: 남은 시간과 관계없이 클리어. 폭발 연출을 볼 시간을 준 뒤 결과 화면을 띄운다.
function onBossDefeated(deadBoss) {
  bossDefeated = true;
  winDelay = 2.4;
  player.invuln = 1e9;        // 연출 중에는 맞지 않는다
  enemyProjectiles.length = 0;
  for (const o of enemies) {  // 남은 적도 함께 쓰러진다
    if (o !== deadBoss && o.hp > 0) o.hp = 0;
  }
  UI.announce(`${CONFIG.boss.name} 격파!`, 'awaken');
  Sfx.awaken(1);
}

function winGame() {
  setState('victory');
  Sfx.win();
  UI.showResult(buildResult(true));
}

// 1분이 지날 때마다: 적이 한 단계 빨라지고(Spawner.speedMul) 음악 박자도 빨라진다. 안내 문구와 소리로 알린다.
function updateMinuteMark() {
  const m = Math.floor(gameTime / 60);
  if (m <= minuteMark) return;
  minuteMark = m;
  const C = CONFIG.minute;
  Music.setTempo(Math.min(C.maxTempo, 1 + m * C.tempoStep));
  UI.announce(`⏱ ${m}분 경과! 적이 더 빨라진다`);
  UI.minuteFlash();
  Sfx.minute();
  Effects.shake(4.5, 0.45);
}

// 보스 등장 전 경고: 붉은 화면 맥동 + 카운트다운 + 사이렌. 등장이 가까울수록 더 빠르고 강해진다.
function updateBossWarning(dt) {
  const left = CONFIG.boss.time - gameTime;
  if (bossSpawned || left > CONFIG.boss.warnTime) return;
  if (!bossWarned) {
    bossWarned = true;
    UI.announce(`⚠ ${CONFIG.boss.warnTime}초 뒤 ${CONFIG.boss.name} 등장!`);
    Sfx.warnStart();
    Music.setMood('tense');
    warnAlarmTimer = 1.6;
  }
  const k = 1 - left / CONFIG.boss.warnTime; // 0 -> 1
  UI.setWarning(left, k);
  warnAlarmTimer -= dt;
  if (warnAlarmTimer <= 0) {
    warnAlarmTimer = left > 10 ? 2.4 : 1.2; // 마지막 10초는 사이렌이 두 배로 잦아진다
    Sfx.alarm();
    Effects.shake(1 + 2.5 * k, 0.18);
  }
}

// 보스는 정해진 시간에 화면 밖에서 등장한다
function spawnBoss() {
  bossSpawned = true;
  UI.endWarning();
  Music.setMood('boss');
  const p = Spawner.randomPoint(player, width, height);
  boss = new Enemy('boss', p.x, p.y);
  enemies.push(boss);
  UI.announce(CONFIG.boss.name + ' 등장!');
  UI.bossPop();
  Sfx.bossSpawn();
  Effects.shake(CONFIG.fx.bossSpawnShake.amp, CONFIG.fx.bossSpawnShake.dur);
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
  weapons = [new BoltWeapon()];
  stats = { kills: 0, killsByType: {} };
  enemies.length = 0; // world가 같은 배열을 계속 쓰므로 새로 만들지 않고 비운다
  projectiles = [];
  enemyProjectiles.length = 0;
  gems = [];
  Items.reset();
  Awaken.reset();
  Effects.reset();
  boss = null;
  bossSpawned = false;
  bossWarned = false;
  warnAlarmTimer = 0;
  bossDefeated = false;
  winDelay = 0;
  minuteMark = 0;
  world.speedMul = 1;
  Music.setTempo(1);
  UI.endWarning();
  killsThisFrame = 0;
  Director.reset();
  UI.hideBoss();
  UI.hideAnnounce();
  UI.resetTimer();
  pendingLevelUps = 0;
  UI.hideLevelUp();
  gameTime = 0;
  Spawner.timer = 0;
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
  if (state === 'playing') setState('paused');
}

function resumeGame() {
  if (state === 'paused') setState('playing');
}


// 불꽃탄이 맞은 자리에서 터져 주변 적에게 폭발 피해를 준다
function explode(p, hitTarget) {
  if (!p.splash) return;
  Effects.ring(p.x, p.y, p.splash * 1.2, '255, 150, 50', 0.32);
  Effects.burst(p.x, p.y, 9, ['#ff7a1a', '#ffb43a', '#fff4c8'], 150, 0.4);
  for (const o of enemies) {
    if (o === hitTarget || o.hp <= 0) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < p.splash + o.radius) hitEnemy(o, p.damage * p.splashMul);
  }
}

// 탄과 적의 원-원 충돌. 맞으면 피해를 주고 탄은 사라진다.
function updateProjectiles(dt) {
  for (const p of projectiles) {
    p.update(dt);
    if (p.dead) continue;
    AI.forNearby(p.x, p.y, (e) => {
      if (p.dead || e.hp <= 0) return;
      if (p.hit && p.hit.has(e)) return; // 관통 탄은 같은 적을 한 번만 맞힌다
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const r = e.radius + p.radius;
      if (dx * dx + dy * dy < r * r) {
        hitEnemy(e, p.damage);
        if (p.pierce > 0) {
          p.pierce--;
          p.hit.add(e);
        } else {
          p.dead = true;
          explode(p, e);
        }
      }
    });
  }
  removeDead(projectiles, (p) => p.dead);
}

// 체력이 0 이하가 된 적을 치우고 처치 수를 센다
function removeDeadEnemies() {
  removeDead(enemies, (e) => {
    if (e.hp > 0) return false;
    stats.kills++;
    stats.killsByType[e.type] = (stats.killsByType[e.type] || 0) + 1;
    killsThisFrame++;
    killEffect(e);
    dropGem(e.x, e.y, e.xp);
    if (e === boss) {
      boss = null;
      Music.setMood('play'); // 보스를 쓰러뜨리면 다시 평소 음악
      onBossDefeated(e);
    }
    return true;
  });
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
  // 디렉터 배율 x (보스가 있으면 일반 스폰을 줄인다)
  world.speedMul += (Spawner.speedMul(gameTime) - world.speedMul) * Math.min(1, dt * 3); // 1분 단위 목표를 향해 부드럽게
  const rate = Director.mult * (boss ? CONFIG.spawn.bossSpawnMul : 1);
  if (!bossDefeated) Spawner.update(dt, gameTime, player, enemies, width, height, rate); // 보스 격파 뒤에는 더 나오지 않는다
  AI.rebuild(enemies);

  const farLimit = Spawner.spawnDistance(width, height) * CONFIG.spawn.despawnFactor;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    AI.separation(e, sepVec);
    e.update(dt, player, sepVec, world);
    // 플레이어에게서 너무 멀리 떨어진 적은 치운다 (보스는 제외)
    if (!e.isBoss && Math.hypot(e.x - player.x, e.y - player.y) > farLimit) {
      enemies[i] = enemies[enemies.length - 1];
      enemies.pop();
    }
  }
}

function update(dt) {
  if (state !== 'playing') return; // 카드 선택·게임오버·승리 중에는 화면을 그대로 멈춘다
  gameTime += dt;
  player.update(dt, readInput());
  updateMinuteMark();
  updateBossWarning(dt);
  if (!bossSpawned && gameTime >= CONFIG.boss.time) spawnBoss();
  updateEnemies(dt);
  for (const w of weapons) w.update(dt, player, enemies, projectiles);
  updateProjectiles(dt);
  updateEnemyProjectiles(dt);
  killsThisFrame = 0;
  removeDeadEnemies();
  if (bossDefeated) {
    winDelay -= dt;
    if (winDelay <= 0) {
      winGame();
      return;
    }
  }
  Director.update(dt, player, killsThisFrame);
  updateGems(dt);
  Effects.update(dt);
  Items.update(dt, player, itemHooks);
  updatePlayerHit();
  if (player.hp <= 0) endGame();
  else if (gameTime >= CONFIG.game.duration) winGame();
  else if (pendingLevelUps > 0 && !bossDefeated) openLevelUp();
  // 카메라가 플레이어를 화면 중앙에 두고 따라간다
  camera.x = player.x - width / 2;
  camera.y = player.y - height / 2;
}

// 보스 머리 위의 빨간 이름표. 등장 직후 3초 동안은 크게 확대됐다가 줄어들며 깜빡인다.
function drawBossName(ctx, b) {
  const S = Sprites[b.cfg.sprite];
  const top = b.y + b.radius * 0.9 - S.h * b.scale; // 스프라이트 머리 끝
  const intro = Math.max(0, 1 - b.age / 3);          // 1 -> 0 (등장 연출 정도)
  const size = 24 + 20 * intro * intro;              // 등장 때 크게
  const pulse = intro > 0 ? 0.65 + 0.35 * Math.sin(b.age * 14) : 1; // 등장 때 깜빡임
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${size}px "Segoe UI", "Malgun Gothic", sans-serif`;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = Math.min(1, b.age / 0.25) * pulse; // 처음 0.25초 동안 서서히 나타난다
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1a0000';
  ctx.shadowColor = 'rgba(255, 30, 20, 0.95)';
  ctx.shadowBlur = 16 + 18 * intro;
  ctx.strokeText(b.cfg.name, b.x, top - 22);
  ctx.fillStyle = b.phase === 2 ? '#ff4a2a' : '#ff1f1f'; // 분노하면 더 밝은 붉은색
  ctx.fillText(b.cfg.name, b.x, top - 22);
  ctx.restore();
}

const shakeVec = { x: 0, y: 0 };

function draw() {
  // 화면 흔들림: 카메라를 매 프레임 조금씩 어긋나게 한다 (게임이 멈춰 있을 때는 흔들지 않는다)
  if (state === 'playing') Effects.shakeOffset(shakeVec);
  else { shakeVec.x = 0; shakeVec.y = 0; }
  const view = { x: camera.x + shakeVec.x, y: camera.y + shakeVec.y };

  Background.drawFloor(ctx, view, width, height);

  ctx.save();
  ctx.translate(-view.x, -view.y);

  Awaken.drawAura(ctx, player); // 스킬 공명 오라
  for (const w of weapons) w.drawUnder(ctx, player); // 바닥에 깔리는 무기 이펙트
  for (const e of enemies) e.drawGround(ctx); // 돌진 예고선
  for (const g of gems) g.draw(ctx);
  Items.draw(ctx);

  // y가 작은(위쪽) 것부터 그려서 아래쪽 캐릭터가 앞에 보이게 한다
  enemies.sort((a, b) => a.y - b.y);
  let playerDrawn = false;
  for (const e of enemies) {
    if (!playerDrawn && e.y > player.y) {
      player.draw(ctx);
      playerDrawn = true;
    }
    e.draw(ctx);
  }
  if (!playerDrawn) player.draw(ctx);
  for (const w of weapons) w.drawOver(ctx, player);   // 회전 구슬 등
  for (const p of projectiles) p.draw(ctx);
  for (const p of enemyProjectiles) p.draw(ctx);
  if (boss && boss.hp > 0) drawBossName(ctx, boss);
  Effects.draw(ctx); // 파티클과 데미지 숫자는 맨 위에
  player.drawHpBar(ctx);
  ctx.restore();

  Background.drawVignette(ctx, width, height);
  Items.drawIndicators(ctx, camera, width, height); // 화면 밖 아이템 방향 표시
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
