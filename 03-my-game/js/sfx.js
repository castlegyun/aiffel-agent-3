// 효과음: 파일 없이 Web Audio로 코드에서 직접 합성한다.
// (이름을 Audio로 하면 브라우저 내장 Audio와 겹치므로 Sfx)
// 브라우저 정책상 소리는 사용자의 첫 입력(키/클릭) 뒤에야 켤 수 있어서 unlock()을 그때 부른다.

// 사용자가 바꿀 수 있는 설정 (일시정지 화면). 브라우저에 저장해 두고 다음에도 쓴다.
const Settings = {
  KEY: 'abyss-survivor.settings',
  sfx: 1,        // 효과음 음량 (0~1)
  music: 1,      // 배경음악 음량 (0~1)
  shake: true,   // 화면 흔들림
  numbers: true, // 데미지 숫자

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || '{}');
      for (const k of ['sfx', 'music', 'shake', 'numbers']) if (typeof raw[k] === typeof this[k]) this[k] = raw[k];
    } catch (e) {
      // 저장소가 막혀 있으면 기본값으로 동작
    }
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({ sfx: this.sfx, music: this.music, shake: this.shake, numbers: this.numbers }));
    } catch (e) {
      // 저장 실패는 무시
    }
    Sfx.applyVolume();
    Music.applyBus();
  },
};
Settings.load();

const Sfx = {
  KEY: 'abyss-survivor.muted.v2', // 예전 키의 음소거 값은 무시한다 (표시 없이 저장돼 소리가 영영 꺼져 있던 문제)
  createdAt: 0,                  // 오디오 엔진을 만든 시각 (같은 클릭이 버튼 토글로 이어지는 걸 막는 데 쓴다)
  ctx: null,
  master: null,
  bus: null,      // 효과음만 지나가는 통로 (효과음 음량 설정)
  voices: 0,      // 지금 울리고 있는 소리 수 (너무 많으면 새 소리를 건너뛴다)
  noiseBuf: null,
  muted: false,
  last: {},       // 소리별 마지막 재생 시각 (너무 자주 울리지 않게)
  gemCombo: 0,
  gemTime: 0,

  init() {
    try {
      this.muted = localStorage.getItem(this.KEY) === '1';
    } catch (e) {
      // 저장소가 막혀 있어도 소리는 켜진 채로 동작
    }
  },

  // 첫 입력 때 호출: 오디오 엔진을 만들고 깨운다
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.createdAt = performance.now();
      // 소리가 겹쳐도 깨지지 않게 컴프레서를 거친다
      const comp = this.ctx.createDynamicsCompressor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : CONFIG.sfx.volume;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.bus = this.ctx.createGain();
      this.bus.gain.value = Settings.sfx;
      this.bus.connect(this.master);
      Music.init(this.ctx, this.master); // 배경음악도 같은 마스터 음량(음소거)을 따른다

      // 2초짜리 흰 소음: 타격·폭발·바람 소리의 재료 (이어 붙여 재생해서 긴 소리도 끊기지 않는다)
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : CONFIG.sfx.volume;
    try {
      localStorage.setItem(this.KEY, this.muted ? '1' : '0');
    } catch (e) {
      // 저장 실패는 무시
    }
    return this.muted;
  },

  applyVolume() {
    if (this.bus) this.bus.gain.value = Settings.sfx;
  },

  // 소리를 낼 수 있는 상태인가. 동시에 울리는 소리가 너무 많으면 새 소리는 건너뛴다.
  ready() {
    return !!this.ctx && !this.muted && this.voices < 48;
  },

  // 소리 하나가 끝나면 세던 수를 줄인다
  track(node) {
    this.voices++;
    node.onended = () => { this.voices--; };
  },

  // ms 안에 같은 소리가 또 요청되면 무시한다
  gap(name, ms) {
    const now = performance.now();
    if (now - (this.last[name] || 0) < ms) return false;
    this.last[name] = now;
    return true;
  },

  // 음 하나: 시작 주파수에서 to까지 미끄러지며 울리고 사라진다
  tone(freq, dur, o = {}) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.bus);
    this.track(osc);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  // 소음 한 번: 필터로 소리 성격(날카로움/둔탁함)을 정한다
  noise(dur, o = {}) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = o.filter || 'bandpass';
    filter.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    filter.Q.value = o.q || 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.loop = true;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.bus);
    this.track(src);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  },

  // ---- 게임 소리들 ----
  shoot() {
    if (!this.gap('shoot', 60)) return;
    this.tone(620, 0.09, { type: 'square', to: 240, vol: 0.035 });
  },

  // 돌진 시작: 바람을 가르는 소리 + 낮게 으르렁거리는 소리. vol은 거리에 따른 크기(0~1), heavy는 보스.
  dash(vol, heavy) {
    if (!this.gap('dash', heavy ? 0 : 70)) return;
    const d = heavy ? 1.6 : 1;
    this.noise(0.3 * d, { freq: 350, to: 3200, q: 0.9, vol: 0.14 * vol * d });
    this.tone(heavy ? 70 : 120, 0.3 * d, { type: 'sawtooth', to: heavy ? 150 : 260, vol: 0.09 * vol * d });
    this.tone(heavy ? 55 : 90, 0.25 * d, { type: 'square', to: heavy ? 40 : 60, vol: 0.05 * vol * d, delay: 0.08 });
  },

  // 보스 경고: 두 음이 번갈아 울리는 사이렌
  alarm() {
    if (!this.gap('alarm', 300)) return;
    this.tone(760, 0.2, { type: 'square', to: 700, vol: 0.075 });
    this.tone(520, 0.22, { type: 'square', to: 480, vol: 0.075, delay: 0.22 });
    this.tone(60, 0.4, { type: 'sine', to: 45, vol: 0.14 });
  },

  // 경고 시작: 낮은 울림과 첫 사이렌
  warnStart() {
    this.tone(70, 1.2, { type: 'sawtooth', to: 38, vol: 0.2, attack: 0.05 });
    this.noise(1.0, { filter: 'lowpass', freq: 500, to: 80, vol: 0.14 });
    [0, 0.45, 0.9].forEach((d) => {
      this.tone(760, 0.2, { type: 'square', to: 700, vol: 0.08, delay: d });
      this.tone(520, 0.22, { type: 'square', to: 480, vol: 0.08, delay: d + 0.22 });
    });
  },

  // 번개: 날카로운 지직 소리 + 낮은 천둥
  thunder() {
    if (!this.gap('thunder', 100)) return;
    this.noise(0.14, { freq: 4200, to: 800, q: 0.7, vol: 0.13 });
    this.tone(1900, 0.12, { type: 'sawtooth', to: 220, vol: 0.05 });
    this.tone(85, 0.4, { type: 'sine', to: 48, vol: 0.1, delay: 0.04 });
  },

  // 스킬 공명: 차오르는 화음 + 낮은 폭발. 2단계는 음이 더 많다.
  awaken(tier) {
    const notes = tier === 1 ? [392, 523, 659, 784] : [392, 523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      this.tone(f, 0.5, { type: 'triangle', vol: 0.11, delay: i * 0.07 });
      this.tone(f * 2, 0.35, { type: 'sine', vol: 0.04, delay: i * 0.07 });
    });
    this.tone(70, 0.9, { type: 'sawtooth', to: 40, vol: 0.2 });
    this.noise(0.8, { freq: 600, to: 4000, q: 0.6, vol: 0.12 });
  },

  // 스킬 하나가 Lv3이 될 때: 짧게 차오르는 3음
  skillAwaken() {
    [523, 784, 1047].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', vol: 0.11, delay: i * 0.07 }));
    this.noise(0.3, { freq: 2500, to: 6000, q: 0.8, vol: 0.06 });
  },

  // 막이 바뀌었다: 시계 초침 같은 두 번의 틱과, 박자를 재촉하는 상승음
  act() {
    this.tone(880, 0.05, { type: 'square', vol: 0.07 });
    this.tone(660, 0.05, { type: 'square', vol: 0.07, delay: 0.18 });
    this.tone(180, 0.45, { type: 'sawtooth', to: 360, vol: 0.09, delay: 0.3 });
    this.noise(0.4, { freq: 500, to: 2800, q: 0.7, vol: 0.06, delay: 0.3 });
  },

  laser() {
    if (!this.gap('laser', 120)) return;
    this.tone(1500, 0.22, { type: 'sawtooth', to: 260, vol: 0.06 });
    this.noise(0.18, { freq: 3500, to: 900, q: 0.8, vol: 0.05 });
  },

  enemyShoot() {
    if (!this.gap('eshoot', 80)) return;
    this.tone(520, 0.12, { type: 'sine', to: 300, vol: 0.04 });
  },

  // crit: 치명타는 높고 맑은 소리가 한 겹 더 울린다
  hit(crit) {
    if (crit && this.gap('crit', 60)) {
      this.tone(1560, 0.09, { type: 'square', to: 2200, vol: 0.05 });
      this.noise(0.07, { freq: 5200, q: 1.4, vol: 0.07 });
    }
    if (!this.gap('hit', 35)) return;
    const j = 0.85 + Math.random() * 0.3; // 매번 조금씩 다른 음높이
    this.noise(0.05, { freq: 1500 * j, q: 1.2, vol: 0.07 });
    this.tone(210 * j, 0.06, { type: 'triangle', to: 110, vol: 0.06 });
  },

  kill(big) {
    if (!this.gap('kill', big ? 0 : 45)) return;
    this.tone(big ? 160 : 320, big ? 0.5 : 0.13, { type: 'triangle', to: big ? 40 : 70, vol: big ? 0.2 : 0.1 });
    this.noise(big ? 0.45 : 0.09, { freq: 900, to: 200, q: 0.8, vol: big ? 0.2 : 0.08 });
  },

  hurt() {
    this.tone(150, 0.28, { type: 'sawtooth', to: 55, vol: 0.18 });
    this.noise(0.22, { filter: 'lowpass', freq: 900, to: 150, vol: 0.2 });
  },

  // 구슬을 연달아 주우면 음이 점점 올라간다
  gem() {
    if (!this.gap('gem', 25)) return;
    const now = performance.now();
    this.gemCombo = now - this.gemTime < 350 ? Math.min(this.gemCombo + 1, 12) : 0;
    this.gemTime = now;
    const f = 760 * Math.pow(2, this.gemCombo / 12);
    this.tone(f, 0.07, { type: 'sine', to: f * 1.5, vol: 0.06 });
  },

  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, 0.22, { type: 'triangle', vol: 0.11, delay: i * 0.09 }));
  },

  select() {
    this.tone(660, 0.06, { type: 'square', to: 880, vol: 0.05 });
  },

  potion() {
    this.tone(300, 0.12, { to: 620, vol: 0.12 });
    this.tone(360, 0.12, { to: 760, vol: 0.1, delay: 0.1 });
  },

  magnet() {
    this.tone(180, 0.55, { type: 'sine', to: 1500, vol: 0.14, attack: 0.05 });
    this.tone(184, 0.55, { type: 'triangle', to: 1520, vol: 0.06, attack: 0.05 });
  },

  // 포효: 어긋난 톱니파 두 개를 "으르렁(진폭 떨림)" 시키고, 입 모양처럼 필터 중심을 움직여 "으아아아" 소리를 낸다.
  // 목소리 높이는 올랐다가 길게 떨어지고, 거친 숨소리(소음)와 가슴을 울리는 저음이 받친다.
  // pitch는 목소리 높이 배율, len은 길이(초)
  roar(len = 2.2, vol = 0.34, pitch = 1) {
    if (!this.ready()) return;
    const c = this.ctx;
    const t = c.currentTime;

    const out = c.createGain(); // 전체 크기: 빠르게 커졌다가 중간까지 유지, 끝에서 사라진다
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.14);
    out.gain.setValueAtTime(vol, t + len * 0.5);
    out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    out.connect(this.bus);

    // 입 모양(포먼트): 닫힌 소리 -> 크게 벌린 "아" -> 다시 낮게
    const mouth = c.createBiquadFilter();
    mouth.type = 'bandpass';
    mouth.Q.value = 2.2;
    mouth.frequency.setValueAtTime(380, t);
    mouth.frequency.exponentialRampToValueAtTime(950, t + len * 0.3);
    mouth.frequency.exponentialRampToValueAtTime(340, t + len);
    mouth.connect(out);

    // 으르렁: 진폭을 빠르게 떨어 목구멍이 떨리는 느낌
    const growl = c.createGain();
    growl.gain.value = 0.7;
    const lfo = c.createOscillator();
    lfo.frequency.value = 27;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = 0.45;
    lfo.connect(lfoDepth);
    lfoDepth.connect(growl.gain);
    growl.connect(mouth);
    lfo.start(t);
    lfo.stop(t + len + 0.1);

    for (const det of [-11, 11]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(72 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(175 * pitch, t + len * 0.25); // 치솟고
      o.frequency.exponentialRampToValueAtTime(52 * pitch, t + len);          // 길게 떨어진다
      o.connect(growl);
      o.start(t);
      o.stop(t + len + 0.1);
    }

    // 거친 숨소리
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const breath = c.createBiquadFilter();
    breath.type = 'bandpass';
    breath.Q.value = 0.9;
    breath.frequency.setValueAtTime(900, t);
    breath.frequency.exponentialRampToValueAtTime(2200, t + len * 0.3);
    breath.frequency.exponentialRampToValueAtTime(600, t + len);
    const breathGain = c.createGain();
    breathGain.gain.value = 0.55;
    src.connect(breath);
    breath.connect(breathGain);
    breathGain.connect(out);
    src.start(t);
    src.stop(t + len + 0.1);

    // 가슴을 울리는 저음
    this.tone(46 * pitch, len * 0.8, { type: 'sine', to: 34, vol: vol * 0.9, attack: 0.12 });
  },

  bossSpawn() {
    this.roar(2.4, 0.36, 1);
    this.noise(1.4, { filter: 'lowpass', freq: 420, to: 80, vol: 0.14 }); // 땅이 울리는 소리
  },

  bossRage() {
    this.roar(1.5, 0.3, 1.25); // 분노: 더 높고 짧은 포효
  },

  // ---- 새 무기·적·아이템 소리 ----
  // 점멸: 공기가 빨려 들어갔다 터지는 소리
  blink() {
    this.noise(0.16, { freq: 900, to: 5200, q: 0.9, vol: 0.12 });
    this.tone(420, 0.14, { type: 'sine', to: 1400, vol: 0.09 });
  },

  // 서리 파동: 유리가 깨지는 듯한 높은 소리와 차가운 바람
  frost() {
    if (!this.gap('frost', 120)) return;
    this.noise(0.4, { filter: 'highpass', freq: 3200, to: 900, q: 0.7, vol: 0.1 });
    [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.22, { type: 'sine', to: f * 0.7, vol: 0.045, delay: i * 0.03 }));
  },

  // 유성이 떨어지는 휘파람 소리
  meteorFall() {
    if (!this.gap('mfall', 120)) return;
    this.tone(1400, 0.35, { type: 'sine', to: 260, vol: 0.05 });
  },

  // 유성 충돌: 낮고 큰 폭발
  meteor() {
    if (!this.gap('meteor', 90)) return;
    this.tone(110, 0.5, { type: 'sine', to: 34, vol: 0.24 });
    this.noise(0.45, { filter: 'lowpass', freq: 1400, to: 120, vol: 0.2 });
  },

  // 낫: 바람을 가르는 소리
  scythe() {
    if (!this.gap('scythe', 100)) return;
    this.noise(0.22, { freq: 1200, to: 4200, q: 1.6, vol: 0.09 });
  },

  // 영혼 불: 속삭이는 듯한 떨리는 소리
  wisp() {
    if (!this.gap('wisp', 110)) return;
    this.tone(880, 0.2, { type: 'sine', to: 1320, vol: 0.04 });
    this.tone(660, 0.24, { type: 'triangle', to: 990, vol: 0.03, delay: 0.03 });
  },

  // 자폭병·폭탄이 터진다
  blast() {
    if (!this.gap('blast', 70)) return;
    this.tone(140, 0.32, { type: 'sawtooth', to: 40, vol: 0.16 });
    this.noise(0.3, { filter: 'lowpass', freq: 2000, to: 150, vol: 0.18 });
  },

  // 보스가 땅을 내려찍는다
  slam() {
    this.tone(90, 0.6, { type: 'sine', to: 30, vol: 0.28 });
    this.noise(0.5, { filter: 'lowpass', freq: 900, to: 90, vol: 0.2 });
  },

  // 리치의 순간이동
  teleport() {
    this.tone(1200, 0.25, { type: 'sine', to: 180, vol: 0.08 });
    this.noise(0.25, { freq: 4000, to: 600, q: 0.8, vol: 0.07 });
  },

  // 보스의 광선
  beam() {
    this.tone(180, 1.2, { type: 'sawtooth', to: 90, vol: 0.14, attack: 0.1 });
    this.noise(1.2, { freq: 1800, to: 500, q: 0.6, vol: 0.1 });
  },

  // 정예 등장: 낮은 뿔피리
  elite() {
    this.tone(196, 0.5, { type: 'sawtooth', to: 147, vol: 0.12, attack: 0.04 });
    this.tone(294, 0.5, { type: 'triangle', to: 220, vol: 0.08, attack: 0.04, delay: 0.05 });
  },

  // 사건(포위·떼·벽) 알림
  event() {
    this.tone(440, 0.12, { type: 'square', vol: 0.06 });
    this.tone(330, 0.2, { type: 'square', vol: 0.06, delay: 0.13 });
  },

  // 상자가 열린다: 반짝이며 올라가는 음
  chest() {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.09, delay: i * 0.06 }));
    this.noise(0.5, { filter: 'highpass', freq: 5000, q: 0.7, vol: 0.05, delay: 0.2 });
  },

  // 상자 보상이 하나씩 드러난다
  reward() {
    this.tone(988, 0.12, { type: 'square', to: 1319, vol: 0.06 });
  },

  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone(f, 0.45, { type: 'triangle', vol: 0.12, delay: i * 0.13 }));
  },

  lose() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone(f, 0.5, { type: 'sawtooth', to: f * 0.8, vol: 0.1, delay: i * 0.22 }));
  },
};
