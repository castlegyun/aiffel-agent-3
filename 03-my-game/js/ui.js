// HTML/CSS로 만든 HUD와 화면들(시작 / 일시정지 / 레벨업 카드 / 상자 / 결과) + 최고 기록 저장.

function formatTime(sec) {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ---- 최고 기록: localStorage에 저장 (막혀 있어도 게임은 돌아가게 try/catch) ----
const Records = {
  KEY: 'abyss-survivor.best.v2', // 10분 구성의 기록. 예전 4분 기록과는 따로 둔다.

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

// 요소를 만든다: el('div', 'class', '글자')
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const UI = {
  init(h) {
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.body = document.body;
    this.timer = $('timer');
    this.timerText = $('timer-text');
    this.actLabel = $('act-label');
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
    this.passiveSlots = $('passive-slots');
    this.slotsKey = '';
    this.menu = $('menu');
    this.menuBest = $('menu-best');
    this.menuSound = $('menu-sound');
    this.soundBtn = $('btn-sound');
    this.soundMsg = null;
    this.paused = $('paused');
    this.levelUp = $('levelup');
    this.cards = $('cards');
    this.chest = $('chest');
    this.choices = []; // 지금 떠 있는 카드들의 선택 콜백
    this.chestDone = null;
    this.result = $('result');
    this.shown = {};   // 마지막으로 화면에 쓴 값 (값이 바뀔 때만 HTML을 고친다)
    $('kills-icon').appendChild(Icons.img('skull'));
    $('chest-icon').appendChild(Icons.img('chest', 'icon big'));

    // 버튼은 누른 뒤 포커스를 풀어서, 이후 Enter/Space가 버튼을 또 누르지 않게 한다
    const click = (id, fn) => $(id).addEventListener('click', (e) => { e.currentTarget.blur(); fn(); });
    click('btn-start', h.onStart);
    click('btn-resume', h.onResume);
    click('btn-pause-restart', h.onRestart);
    click('btn-pause-menu', h.onMenu);
    click('btn-retry', h.onRestart);
    click('btn-result-menu', h.onMenu);
    click('btn-chest', () => this.closeChest());

    // 설정: 바꾸는 즉시 적용하고 저장한다
    const bind = (id, key, isCheck) => {
      const input = $(id);
      if (isCheck) input.checked = Settings[key];
      else input.value = Settings[key];
      input.addEventListener('input', () => {
        Settings[key] = isCheck ? input.checked : Number(input.value);
        Settings.save();
      });
    };
    bind('set-sfx', 'sfx');
    bind('set-music', 'music');
    bind('set-shake', 'shake', true);
    bind('set-numbers', 'numbers', true);

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
      if (e.target && e.target.tagName === 'INPUT') return; // 설정 슬라이더를 만지는 중
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
      } else if (st === 'chest' && (e.code === 'Enter' || e.code === 'Space')) {
        press(() => this.closeChest());
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
    this.chest.classList.toggle('hidden', state !== 'chest');
    this.result.classList.toggle('hidden', state !== 'gameover' && state !== 'victory');
    if (state === 'menu') this.showMenuBest();
  },

  showMenuBest() {
    const best = Records.load();
    this.menuBest.textContent = best ? Records.text(best) : '아직 기록이 없습니다';
  },

  // 값이 바뀌었을 때만 HTML을 고친다 (매 프레임 똑같은 값을 다시 쓰지 않는다)
  put(key, value, apply) {
    if (this.shown[key] === value) return;
    this.shown[key] = value;
    apply(value);
  },

  // ---- HUD (매 프레임) ----
  updateHud(player, time, boss, kills, weapons) {
    // 남은 시간: 10:00에서 0:00으로 줄어든다. 올림해서 시작할 때 10:00, 끝날 때 00:00이 된다.
    const remaining = Math.max(0, CONFIG.game.duration - time);
    this.put('time', formatTime(Math.ceil(remaining)), (v) => { this.timerText.textContent = v; });
    this.put('urgent', remaining <= 30, (v) => this.timerText.classList.toggle('urgent', v)); // 마지막 30초는 붉게 깜빡임
    this.put('level', player.level, (v) => { this.levelLabel.textContent = 'Lv ' + v; });
    this.put('xp', Math.round(Math.min(100, (player.xp / player.xpToNext) * 100)), (v) => { this.xpFill.style.width = v + '%'; });
    this.put('kills', kills, (v) => { this.killsText.textContent = v; });
    this.put('dash', player.dashCd <= 0, (v) => this.$('btn-dash-touch').classList.toggle('ready', v));
    this.updateSlots(weapons);

    this.put('boss', !!boss, (v) => this.bossHud.classList.toggle('hidden', !v));
    if (boss) {
      this.put('bossName', boss.cfg.name, (v) => { this.bossName.textContent = v; });
      this.put('bossHp', Math.max(0, Math.round((boss.hp / boss.maxHp) * 200) / 2), (v) => { this.bossFill.style.width = v + '%'; });
      this.put('bossRage', boss.phase, (v) => { this.bossFill.dataset.phase = v; });
    }
  },

  // 아이콘 + 레벨 숫자가 든 칸 하나
  slot(icon, level, cls, title) {
    const e = el('div', 'slot' + (cls ? ' ' + cls : ''));
    if (icon) {
      e.appendChild(Icons.img(icon));
      e.title = title;
      e.appendChild(el('span', 'slot-lv', level));
    }
    return e;
  },

  // 무기 칸과 패시브 칸. 구성이 바뀔 때만 다시 만든다.
  updateSlots(weapons) {
    const key = weapons.map((w) => `${w.id}:${w.level}:${w.evolved}`).join('|') + '#' + Object.entries(Build.levels).join('|');
    if (key === this.slotsKey) return;
    this.slotsKey = key;
    this.slots.textContent = '';
    for (let i = 0; i < CONFIG.build.weaponSlots; i++) {
      const w = weapons[i];
      this.slots.appendChild(w
        ? this.slot(w.icon, w.evolved ? '★' : w.level, w.evolved ? 'evolved' : w.level >= CONFIG.awaken.minLevel ? 'lv3' : '', w.name)
        : this.slot(null, '', 'empty'));
    }
    this.passiveSlots.textContent = '';
    const owned = Object.keys(Build.levels);
    for (let i = 0; i < CONFIG.build.passiveSlots; i++) {
      const id = owned[i];
      this.passiveSlots.appendChild(id
        ? this.slot(CONFIG.passives[id].icon, Build.levels[id], 'passive', CONFIG.passives[id].name)
        : this.slot(null, '', 'empty passive'));
    }
  },

  // ---- 보스 / 안내 연출 ----
  // 화면 중앙 위쪽에 잠깐 떴다 사라지는 안내 문구
  // kind: 'good' 초록(아이템 획득 등) / 'awaken'·'skill' 금빛 / 없으면 붉은색(경고)
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

  // 보스 등장 경고: 남은 시간을 카운트다운한다 (붉은 가장자리는 캔버스가 그린다)
  setWarning(left, name) {
    this.put('warn', Math.ceil(left), (v) => {
      this.warnLabel.classList.remove('hidden');
      this.warnLabel.textContent = `⚠ ${name} 출현까지 ${formatTime(Math.max(0, v))}`;
    });
  },

  endWarning() {
    this.shown.warn = null;
    this.warnLabel.classList.add('hidden');
  },

  setAct(name) {
    this.actLabel.textContent = name;
  },

  // 소리 상태를 눈에 보이게: 꺼짐(빗금) / 아직 시작 전(깜빡임) / 정상
  updateSound() {
    const muted = Sfx.muted;
    const ready = !!Sfx.ctx && Sfx.ctx.state === 'running';
    const msg = muted
      ? '소리가 꺼져 있습니다 · M 키 또는 왼쪽 위 ♪ 버튼으로 켜세요'
      : !ready ? '소리를 켜려면 화면을 한 번 클릭하세요' : '';
    if (msg === this.soundMsg) return;
    this.soundMsg = msg;
    this.soundBtn.classList.toggle('off', muted);
    this.soundBtn.classList.toggle('idle', !muted && !ready);
    this.menuSound.textContent = msg;
  },

  // 공명 단계 표시 (0이면 숨김)
  setAwaken(tier) {
    this.awakenBadge.classList.toggle('hidden', !tier);
    this.awakenBadge.textContent = tier === 1 ? '✦ 공명' : '✦✦ 대공명';
  },

  restartAnim(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // 애니메이션을 처음부터 다시 시작
    node.classList.add(cls);
  },

  // ---- 카드 한 장 (레벨업·상자가 같이 쓴다) ----
  card(info, key) {
    const card = el('button', 'card' + (info.kind ? ' ' + info.kind : ''));
    if (key) card.appendChild(el('div', 'card-key', key));
    const icon = el('div', 'card-icon');
    icon.appendChild(Icons.img(info.icon, 'icon big'));
    card.appendChild(icon);
    card.appendChild(el('div', 'card-name', info.name));
    if (info.levelText) card.appendChild(el('div', 'card-level', info.levelText));
    for (const line of info.lines) card.appendChild(el('div', 'card-line', line));
    return card;
  },

  // ---- 레벨업 카드 ----
  // infos: 카드 객체 배열, onPick(i): i번째 카드를 골랐을 때
  showLevelUp(infos, onPick) {
    this.cards.textContent = '';
    this.choices = infos.map((info, i) => {
      const pick = () => onPick(i);
      const card = this.card(info, String(i + 1));
      card.addEventListener('click', (e) => { e.currentTarget.blur(); pick(); });
      this.cards.appendChild(card);
      return pick;
    });
  },

  hideLevelUp() {
    this.choices = [];
  },

  // ---- 상자: 받은 보상을 하나씩 드러낸다 ----
  showChest(rewards, onDone) {
    const box = this.$('chest-rewards');
    box.textContent = '';
    this.chestDone = onDone;
    this.restartAnim(this.$('chest-icon'), 'open');
    rewards.forEach((info, i) => {
      const card = this.card(info);
      card.disabled = true;
      card.style.animationDelay = 0.35 + i * 0.3 + 's';
      box.appendChild(card);
      setTimeout(() => Sfx.reward(), 350 + i * 300);
    });
  },

  closeChest() {
    const done = this.chestDone;
    this.chestDone = null;
    if (done) done();
  },

  // ---- 무기 목록: 아이콘, 이름, 레벨, 준 피해(막대) ----
  weaponRows(box, weapons) {
    box.textContent = '';
    const list = weapons.map((w) => ({ w, dmg: DamageLog.by[w.id] || 0 }));
    const top = Math.max(1, ...list.map((x) => x.dmg));
    for (const { w, dmg } of list) {
      const row = el('div', 'wrow' + (w.evolved ? ' evolved' : ''));
      row.appendChild(Icons.img(w.icon));
      const body = el('div', 'wbody');
      const head = el('div', 'whead');
      head.appendChild(el('span', 'wname', w.name));
      head.appendChild(el('span', 'wlv', w.evolved ? '★ 진화' : 'Lv ' + w.level));
      head.appendChild(el('b', 'wdmg', Math.round(dmg).toLocaleString()));
      body.appendChild(head);
      const bar = el('div', 'wbar');
      const fill = el('div', 'wfill');
      fill.style.width = (dmg / top) * 100 + '%';
      bar.appendChild(fill);
      body.appendChild(bar);
      row.appendChild(body);
      box.appendChild(row);
    }
  },

  passiveChips(box) {
    box.textContent = '';
    for (const id in Build.levels) {
      const P = CONFIG.passives[id];
      const chip = el('div', 'chip');
      chip.appendChild(Icons.img(P.icon));
      chip.appendChild(el('span', '', `${P.name} ${Build.levels[id]}`));
      chip.title = P.text(P.per * Build.levels[id]);
      box.appendChild(chip);
    }
  },

  // ---- 일시정지 화면: 지금 빌드, 진화 조합표 ----
  renderPause(player, weapons) {
    this.weaponRows(this.$('pause-build'), weapons);
    this.passiveChips(this.$('pause-passives'));

    const box = this.$('pause-recipes');
    box.textContent = '';
    for (const id in CONFIG.weapons) {
      const W = CONFIG.weapons[id];
      const P = CONFIG.passives[W.evolve.needs];
      const mine = weapons.find((w) => w.id === id);
      // 상태: 이미 진화함 / 둘 다 가짐(최대 레벨이 되면 진화) / 아직
      const state = mine && mine.evolved ? 'done' : mine && Build.has(W.evolve.needs) ? 'ready' : '';
      const row = el('div', 'recipe ' + state);
      row.appendChild(Icons.img(W.icon));
      row.appendChild(el('span', 'plus', '+'));
      row.appendChild(Icons.img(P.icon));
      row.appendChild(el('span', 'arrow', '→'));
      row.appendChild(el('span', 'rname', W.evolve.name));
      row.title = `${W.name} Lv${W.maxLevel} + ${P.name}`;
      box.appendChild(row);
    }
  },

  // ---- 결과 화면 (게임오버 / 승리) ----
  showResult(r, weapons) {
    const $ = this.$;
    this.result.classList.toggle('win', r.won);
    $('result-title').textContent = r.won ? 'VICTORY' : 'GAME OVER';

    const rec = $('result-record');
    rec.classList.toggle('new', r.isNewRecord);
    rec.textContent = r.isNewRecord ? '★ 새로운 최고 기록!' : Records.text(r.best);

    const row = (label, value, cls) => {
      const e = el('div', cls || 'result-row');
      e.append(el('span', '', label), el('b', '', value));
      return e;
    };
    const fill = (id, rows) => {
      const box = $(id);
      box.textContent = '';
      for (const e of rows) box.appendChild(e);
    };

    fill('result-rows', [
      row('생존 시간', formatTime(r.time)),
      row('도달한 곳', `${r.act + 1}막`),
      row('처치 수', r.kills.toLocaleString()),
      row('도달 레벨', 'Lv ' + r.level),
      row('보스', `${r.bossesKilled} / ${Object.keys(CONFIG.bosses).length} 격파`),
      ...(r.won ? [row('클리어', r.byBoss ? '최종 보스 격파' : '10분 생존')] : []),
    ]);

    const names = {};
    for (const k in CONFIG.enemies) names[k] = CONFIG.enemies[k].name;
    for (const k in CONFIG.bosses) names[k] = CONFIG.bosses[k].name;
    const kills = Object.entries(r.byType).sort((a, b) => b[1] - a[1]);
    fill('result-kills', kills.length
      ? kills.map(([type, n]) => row(names[type] || type, '× ' + n, 'result-item'))
      : [row('—', '', 'result-item')]);

    this.weaponRows($('result-weapons'), weapons);
    this.passiveChips($('result-passives'));
  },
};
