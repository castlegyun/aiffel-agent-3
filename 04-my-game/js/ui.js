// HTML/CSS로 만든 HUD와 화면들(시작 / 일시정지 / 레벨업 카드 / 결과) + 최고 기록 저장.

function formatTime(sec) {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ---- 최고 기록: localStorage에 저장 (막혀 있어도 게임은 돌아가게 try/catch) ----
const Records = {
  KEY: 'abyss-survivor.best',

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  save(rec) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(rec));
    } catch (e) {
      // 저장이 막혀 있어도 게임은 계속된다
    }
  },

  // a가 b보다 좋은 기록인가:
  //   클리어한 기록이 항상 위, 둘 다 클리어면 빨리 깬 쪽, 둘 다 못 깼으면 오래 버틴 쪽 (같으면 많이 잡은 쪽)
  isBetter(a, b) {
    if (!b) return true;
    if (!!a.won !== !!b.won) return !!a.won;
    if (Math.abs(a.time - b.time) > 0.01) return a.won ? a.time < b.time : a.time > b.time;
    return a.kills > b.kills;
  },

  text(rec) {
    if (!rec) return '';
    return rec.won
      ? `최고 기록  클리어 ${formatTime(rec.time)}  ·  처치 ${rec.kills}`
      : `최고 기록  ${formatTime(rec.time)} 생존  ·  처치 ${rec.kills}`;
  },
};

const UI = {
  init(h) {
    const $ = (id) => document.getElementById(id);
    this.body = document.body;
    this.timer = $('timer');
    this.timerText = $('timer-text');
    this.flash = $('flash');
    this.hurt = $('hurt');
    this.warn = $('warn');
    this.awakenFlashEl = $('awaken-flash');
    this.awakenBadge = $('awaken-badge');
    this.warnLabel = $('warn-label');
    this.announceEl = $('announce');
    this.bossHud = $('boss-hud');
    this.bossName = $('boss-name');
    this.bossFill = $('boss-fill');
    this.levelLabel = $('level-label');
    this.xpFill = $('xp-fill');
    this.killsText = $('kills-text');
    this.slots = $('slots');
    this.slotsKey = '';
    this.menu = $('menu');
    this.menuBest = $('menu-best');
    this.menuSound = $('menu-sound');
    this.soundBtn = $('btn-sound');
    this.soundMsg = null;
    this.paused = $('paused');
    this.levelUp = $('levelup');
    this.cards = $('cards');
    this.choices = []; // 지금 떠 있는 카드들의 선택 콜백
    this.result = $('result');

    // 버튼은 누른 뒤 포커스를 풀어서, 이후 Enter/Space가 버튼을 또 누르지 않게 한다
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.currentTarget.blur(); fn(); });
    click('btn-start', h.onStart);
    click('btn-resume', h.onResume);
    click('btn-pause-restart', h.onRestart);
    click('btn-pause-menu', h.onMenu);
    click('btn-retry', h.onRestart);
    click('btn-result-menu', h.onMenu);

    // 브라우저는 첫 입력 뒤에야 소리를 허용한다
    const unlock = () => Sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // 소리 버튼: 처음 누르는 클릭은 소리를 "켜는" 역할만 하고, 그다음부터 켜기/끄기를 토글한다
    this.soundBtn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (!Sfx.ctx) { Sfx.unlock(); return; }
      if (performance.now() - Sfx.createdAt < 600) return; // 방금 같은 클릭으로 엔진이 켜졌다
      this.announce(Sfx.toggleMute() ? '소리 꺼짐' : '소리 켜짐', 'good');
    });

    window.addEventListener('keydown', (e) => {
      const st = h.getState();
      const press = (fn) => { e.preventDefault(); fn(); };
      if (e.code === 'KeyM') {
        this.announce(Sfx.toggleMute() ? '소리 꺼짐' : '소리 켜짐', 'good');
      } else if (e.code === 'Escape') {
        if (st === 'playing') press(h.onPause);
        else if (st === 'paused') press(h.onResume);
      } else if (st === 'menu' && (e.code === 'Enter' || e.code === 'Space')) {
        press(h.onStart);
      } else if (st === 'paused' && e.code === 'Enter') {
        press(h.onResume);
      } else if ((st === 'paused' || st === 'gameover' || st === 'victory') && e.code === 'KeyR') {
        press(h.onRestart);
      } else if ((st === 'gameover' || st === 'victory') && e.code === 'Enter') {
        press(h.onRestart);
      } else if (st === 'levelup') {
        const i = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
        if (i !== undefined && this.choices[i]) press(this.choices[i]);
      }
    });
  },

  // 게임 상태에 맞는 화면만 보여준다
  setState(state) {
    this.body.dataset.state = state;
    this.menu.classList.toggle('hidden', state !== 'menu');
    this.paused.classList.toggle('hidden', state !== 'paused');
    this.levelUp.classList.toggle('hidden', state !== 'levelup');
    this.result.classList.toggle('hidden', state !== 'gameover' && state !== 'victory');
    if (state === 'menu') this.showMenuBest();
  },

  showMenuBest() {
    const best = Records.load();
    this.menuBest.textContent = best ? Records.text(best) : '아직 기록이 없습니다';
  },

  // ---- HUD (매 프레임) ----
  updateHud(player, time, boss, kills, weapons) {
    // 남은 시간: 4:00에서 0:00으로 줄어든다. 올림해서 시작할 때 04:00, 끝날 때 00:00이 된다.
    const remaining = Math.max(0, CONFIG.game.duration - time);
    this.timerText.textContent = formatTime(Math.ceil(remaining));
    this.timerText.classList.toggle('urgent', remaining <= 30); // 마지막 30초는 붉게 깜빡임

    this.levelLabel.textContent = 'Lv ' + player.level;
    this.xpFill.style.width = Math.min(100, (player.xp / player.xpToNext) * 100) + '%';
    this.killsText.textContent = kills;
    this.updateSlots(weapons);

    if (boss) {
      this.bossHud.classList.remove('hidden');
      this.bossName.textContent = boss.cfg.name;
      this.bossFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
      this.bossFill.classList.toggle('rage', boss.phase === 2);
    } else {
      this.hideBoss();
    }
  },

  // 무기 슬롯 3칸. 무기 구성이 바뀔 때만 다시 만든다.
  updateSlots(weapons) {
    const key = weapons.map((w) => `${w.id}:${w.level}:${w.evolved}`).join('|');
    if (key === this.slotsKey) return;
    this.slotsKey = key;
    this.slots.textContent = '';
    for (let i = 0; i < 4; i++) {
      const w = weapons[i];
      const el = document.createElement('div');
      el.className = 'slot' + (w ? (w.evolved ? ' evolved' : w.level >= 3 ? ' lv3' : '') : ' empty');
      if (w) {
        el.textContent = w.icon;
        el.title = w.name;
        const lv = document.createElement('span');
        lv.className = 'slot-lv';
        lv.textContent = w.evolved ? '★' : w.level;
        el.appendChild(lv);
      }
      this.slots.appendChild(el);
    }
  },

  // ---- 보스 / 안내 / 타이머 연출 ----
  hideBoss() {
    this.bossHud.classList.add('hidden');
  },

  // 화면 중앙 위쪽에 잠깐 떴다 사라지는 안내 문구
  // kind: 'good'이면 초록색(아이템 획득 등), 없으면 붉은색(경고)
  announce(text, kind) {
    this.announceEl.textContent = text;
    this.announceEl.classList.toggle('good', kind === 'good');
    this.announceEl.classList.toggle('awaken', kind === 'awaken');
    this.announceEl.classList.toggle('skill', kind === 'skill');
    this.restartAnim(this.announceEl, 'show');
  },

  hideAnnounce() {
    this.announceEl.classList.remove('show');
  },

  // 보스 등장 연출: 타이머가 붉게 물들며 커졌다가 자리 잡고, 화면 가장자리에 붉은 섬광이 지나간다
  bossPop() {
    this.restartAnim(this.timer, 'boss-pop');
    this.restartAnim(this.flash, 'show');
  },

  // 보스 등장 경고: k(0~1)가 커질수록 붉은 테두리가 더 빠르고 진하게 맥동한다
  setWarning(left, k) {
    this.warn.classList.add('on');
    this.warn.style.setProperty('--warn', k.toFixed(2));
    this.warn.style.setProperty('--dur', (1.5 - 0.9 * k).toFixed(2) + 's');
    this.warnLabel.classList.remove('hidden');
    this.warnLabel.textContent = `⚠ ${CONFIG.boss.name} 출현까지 ${formatTime(Math.max(0, Math.ceil(left)))}`;
  },

  endWarning() {
    this.warn.classList.remove('on');
    this.warnLabel.classList.add('hidden');
  },

  // 소리 상태를 눈에 보이게: 꺼짐(빗금) / 아직 시작 전(깜빡임) / 정상
  updateSound() {
    const muted = Sfx.muted;
    const ready = !!Sfx.ctx && Sfx.ctx.state === 'running';
    this.soundBtn.classList.toggle('off', muted);
    this.soundBtn.classList.toggle('idle', !muted && !ready);
    const msg = muted
      ? '소리가 꺼져 있습니다 · M 키 또는 왼쪽 위 ♪ 버튼으로 켜세요'
      : !ready ? '소리를 켜려면 화면을 한 번 클릭하세요' : '';
    if (msg !== this.soundMsg) {
      this.soundMsg = msg;
      this.menuSound.textContent = msg;
    }
  },

  // 스킬 공명 발동: 금빛 섬광
  awakenFlash() {
    this.restartAnim(this.awakenFlashEl, 'show');
  },

  // 공명 단계 표시 (0이면 숨김)
  setAwaken(tier) {
    this.awakenBadge.classList.toggle('hidden', !tier);
    this.awakenBadge.textContent = tier === 1 ? '✦ 공명' : '✦✦ 대공명';
  },

  // 1분 경과: 화면 가장자리가 붉게 번쩍인다 (보스 등장 때와 같은 섬광)
  minuteFlash() {
    this.restartAnim(this.flash, 'show');
  },

  // 피격 시 붉은 비네팅
  hurtFlash() {
    this.restartAnim(this.hurt, 'show');
  },

  restartAnim(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // 애니메이션을 처음부터 다시 시작
    el.classList.add(cls);
  },

  resetTimer() {
    this.timer.classList.remove('boss-pop');
    this.timerText.classList.remove('urgent');
    this.flash.classList.remove('show');
  },

  // ---- 레벨업 카드 ----
  // infos: 카드 객체 배열({name, icon, kind, levelText, lines}), onPick(i): i번째 카드를 골랐을 때
  showLevelUp(infos, onPick) {
    this.cards.textContent = '';
    this.choices = infos.map((info, i) => {
      const pick = () => onPick(i);
      const card = document.createElement('button');
      card.className = 'card' + (info.kind ? ' ' + info.kind : ''); // new / evolve
      const add = (cls, text) => {
        const el = document.createElement('div');
        el.className = cls;
        el.textContent = text;
        card.appendChild(el);
      };
      add('card-key', String(i + 1));
      add('card-icon', info.icon);
      add('card-name', info.name);
      if (info.levelText) add('card-level', info.levelText);
      for (const line of info.lines) add('card-line', line);
      card.addEventListener('click', (e) => { e.currentTarget.blur(); pick(); });
      this.cards.appendChild(card);
      return pick;
    });
  },

  hideLevelUp() {
    this.choices = [];
  },

  // ---- 결과 화면 (게임오버 / 승리) ----
  // r: { won, time, kills, byType, level, weapons, record(이번 판), isNewRecord, best }
  showResult(r) {
    const $ = (id) => document.getElementById(id);
    this.result.classList.toggle('win', r.won);
    $('result-title').textContent = r.won ? 'VICTORY' : 'GAME OVER';

    const rec = $('result-record');
    rec.classList.toggle('new', r.isNewRecord);
    rec.textContent = r.isNewRecord ? '★ 새로운 최고 기록!' : Records.text(r.best);

    const row = (label, value, cls) => {
      const el = document.createElement('div');
      el.className = cls || 'result-row';
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('b');
      v.textContent = value;
      el.append(l, v);
      return el;
    };
    const fill = (id, rows) => {
      const box = $(id);
      box.textContent = '';
      for (const el of rows) box.appendChild(el);
    };

    fill('result-rows', [
      row('생존 시간', formatTime(r.time)),
      row('처치 수', r.kills),
      row('도달 레벨', 'Lv ' + r.level),
      row('보스', r.byType.boss ? '처치함' : r.bossSeen ? '맞서 싸움' : '만나지 못함'),
      ...(r.won ? [row('클리어', r.byBoss ? '보스 격파' : '4분 생존')] : []),
    ]);

    const names = Object.assign({}, ...Object.entries(CONFIG.enemies).map(([k, v]) => ({ [k]: v.name })), { boss: CONFIG.boss.name });
    const kills = Object.entries(r.byType).sort((a, b) => b[1] - a[1]);
    fill('result-kills', kills.length
      ? kills.map(([type, n]) => row(names[type] || type, '× ' + n, 'result-item'))
      : [row('—', '', 'result-item')]);

    fill('result-weapons', r.weapons.map((w) =>
      row(`${w.icon} ${w.name}`, w.evolved ? '★ 진화' : 'Lv ' + w.level, 'result-item' + (w.evolved ? ' evolved' : ''))));
  },
};
