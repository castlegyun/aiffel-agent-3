// 배경음악: 파일 없이 Web Audio로 합성하는 다크 판타지 BGM.
// 디 마이너(D minor)의 4마디 코드 진행(Dm - Bb - Gm - A)을 계속 반복하면서, 상황에 따라 층을 바꾼다.
//   menu  : 잔잔한 패드 + 낮은 드론 + 드문드문 울리는 종소리
//   play  : 패드 + 베이스 + 짧은 아르페지오 + 가벼운 북
//   tense : 보스 경고 구간. 더 빠르고 매 박자 북이 울린다
//   boss  : 보스전. 가장 빠르고 8분음표 베이스, 스네어, 몰아치는 아르페지오

const Music = {
  ctx: null,
  bus: null,        // 음악 전체 음량 (배경음악 음량 x 상황별 낮춤)
  send: null,       // 울림(딜레이)으로 보내는 통로
  noiseBuf: null,
  mood: 'off',
  duck: 1,          // 일시정지/카드 선택 중에는 음악을 낮춘다
  timer: null,
  nextTime: 0,      // 다음 음을 예약할 시각
  tempo: 1,         // 박자 배율: 1분이 지날 때마다 조금씩 빨라진다
  step: 0,          // 한 마디(8분음표 8칸) 안의 위치
  bar: 0,

  MOODS: {
    menu:  { bpm: 58,  pad: 0.055, bass: 'none',    arp: 'bells', drums: 0 },
    play:  { bpm: 84,  pad: 0.05,  bass: 'quarter', arp: 'pluck', drums: 1 },
    tense: { bpm: 100, pad: 0.055, bass: 'quarter', arp: 'pluck', drums: 2 },
    boss:  { bpm: 118, pad: 0.06,  bass: 'eighth',  arp: 'drive', drums: 3 },
  },

  // 코드별: bass 근음, pad 화음, arp 아르페지오에 쓸 음들 (MIDI 번호)
  CHORDS: [
    { root: 38, pad: [50, 53, 57], arp: [62, 65, 69, 72, 74, 77] }, // Dm
    { root: 34, pad: [46, 50, 53], arp: [58, 62, 65, 70, 74, 77] }, // Bb
    { root: 43, pad: [55, 58, 62], arp: [62, 67, 70, 74, 79, 82] }, // Gm
    { root: 45, pad: [52, 57, 61], arp: [61, 64, 69, 73, 76, 81] }, // A (긴장을 만드는 으뜸화음 앞의 딸림화음)
  ],

  hz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  },

  // autostart=false면 타이머를 돌리지 않는다 (테스트용으로 schedule()을 직접 부를 때)
  init(ctx, destination, autostart = true) {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(destination);

    // 울림: 짧은 딜레이를 되먹임시키되 되돌아오는 소리는 어둡게 깎는다
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.34;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.36;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 1800;
    this.send = ctx.createGain();
    this.send.gain.value = 1;
    this.send.connect(delay);
    delay.connect(dark);
    dark.connect(feedback);
    feedback.connect(delay);
    dark.connect(this.bus);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.applyBus();
    if (autostart && !this.timer) this.timer = setInterval(() => this.tick(), 40);
  },

  applyBus() {
    if (!this.ctx) return;
    const v = this.mood === 'off' ? 0 : CONFIG.music.volume * this.duck;
    this.bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25);
  },

  setMood(m) {
    if (m === this.mood) return;
    const was = this.mood;
    this.mood = m;
    this.applyBus();
    if (this.ctx && m !== 'off' && was !== 'off') {
      this.step = 0; // 분위기가 바뀌면 새 마디부터 시작한다
      this.nextTime = this.ctx.currentTime + 0.05;
    }
  },

  // 박자 배율을 바꾼다 (다음 음부터 바로 반영)
  setTempo(t) {
    this.tempo = t;
  },

  setDuck(v) {
    this.duck = v;
    this.applyBus();
  },

  // 게임 상태에 맞춰 음악을 정한다
  onState(state, bossAlive, warning) {
    if (state === 'menu') { this.setMood('menu'); this.setDuck(1); }
    else if (state === 'playing') { this.setMood(bossAlive ? 'boss' : warning ? 'tense' : 'play'); this.setDuck(1); }
    else if (state === 'paused') this.setDuck(0.3);
    else if (state === 'levelup') this.setDuck(0.55);
    else this.setMood('off'); // 게임오버/승리: 음악을 끄고 효과음 팡파레만
  },

  // ---- 예약: 아주 조금 앞선 시각까지의 음들을 미리 걸어 둔다 ----
  tick() {
    if (!this.ctx || this.mood === 'off') {
      this.nextTime = 0;
      return;
    }
    const now = this.ctx.currentTime;
    // 처음이거나(탭이 멈췄다 돌아오는 등) 너무 뒤처졌으면 지금부터 다시 시작
    if (!this.nextTime || this.nextTime < now - 0.1) {
      this.nextTime = now + 0.06;
      this.step = 0;
    }
    this.schedule(now + 0.35);
  },

  schedule(until) {
    while (this.nextTime < until) {
      const M = this.MOODS[this.mood];
      this.playStep(this.nextTime, M);
      this.nextTime += 60 / (M.bpm * this.tempo) / 2; // 8분음표 길이
      if (++this.step === 8) {
        this.step = 0;
        this.bar++;
      }
    }
  },

  playStep(t, M) {
    const chord = this.CHORDS[this.bar % 4];
    const s = this.step;
    const eighth = 60 / (M.bpm * this.tempo) / 2;

    if (s === 0) {
      this.pad(t, chord.pad, eighth * 8, M.pad);
      if (M.arp === 'bells') this.drone(t, this.hz(chord.root), eighth * 8, 0.07);
    }

    // 베이스
    if (M.bass === 'quarter' && s % 2 === 0) {
      this.bass(t, this.hz(chord.root + (s === 6 ? 7 : 0)), eighth * 1.8, 0.14);
    } else if (M.bass === 'eighth') {
      const jump = [0, 0, 12, 0, 0, 7, 12, 0][s];
      this.bass(t, this.hz(chord.root + jump), eighth * 0.9, 0.15);
    }

    // 선율 (아르페지오)
    if (M.arp === 'pluck') {
      if (s !== 3 && s !== 7) {
        const pat = [0, 2, 4, 2, 5, 4, 2, 3];
        this.pluck(t, this.hz(chord.arp[pat[(s + this.bar) % 8] % chord.arp.length]), 0.03, 'triangle');
      }
    } else if (M.arp === 'drive') {
      const pat = [0, 1, 2, 3, 4, 3, 2, 1];
      this.pluck(t, this.hz(chord.arp[pat[s]]), 0.034, 'sawtooth');
    } else if (M.arp === 'bells') {
      if (s === 0 || s === 4 || (s === 6 && Math.random() < 0.5)) {
        this.bell(t, this.hz(chord.arp[Math.floor(Math.random() * chord.arp.length)] + 12), 0.045);
      }
    }

    // 북
    const d = M.drums;
    if (d >= 1) {
      const kick = d === 1 ? s === 0 || s === 4 : s % 2 === 0;
      if (kick) this.kick(t, d === 3 ? 0.32 : 0.26);
      if (d >= 3 && (s === 2 || s === 6)) this.snare(t, 0.16);
      if (d === 1 ? s % 2 === 1 : true) this.hat(t, d === 3 ? 0.05 : 0.035);
    }
  },

  // ---- 악기들 ----
  noiseSource(t, dur, type, freq, q, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  },

  // 느리게 차오르고 길게 이어지는 패드: 살짝 어긋난 톱니파 두 개를 어두운 필터에 통과시킨다
  pad(t, notes, dur, vol) {
    for (const n of notes) {
      for (const det of [-7, 7]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = this.hz(n);
        osc.detune.value = det;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 620;
        f.Q.value = 0.6;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol / 3, t + 0.9);
        g.gain.setValueAtTime(vol / 3, t + dur - 0.1);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
        osc.connect(f);
        f.connect(g);
        g.connect(this.bus);
        osc.start(t);
        osc.stop(t + dur + 0.9);
      }
    }
  },

  drone(t, freq, dur, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 1);
    g.gain.setValueAtTime(vol, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    osc.connect(g);
    g.connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.7);
  },

  bass(t, freq, dur, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f);
    f.connect(g);
    g.connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  // 짧게 튕기는 소리: 필터가 열렸다 닫히며 "똑" 하는 느낌을 낸다. 일부는 울림으로도 보낸다.
  pluck(t, freq, vol, type) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(800, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(f);
    f.connect(g);
    g.connect(this.bus);
    g.connect(this.send);
    osc.start(t);
    osc.stop(t + 0.32);
  },

  // 종소리: 정수배가 아닌 배음을 섞어 금속성 울림을 만든다
  bell(t, freq, vol) {
    for (const [mul, v] of [[1, 1], [2.01, 0.45], [3.52, 0.22]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mul;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      osc.connect(g);
      g.connect(this.bus);
      g.connect(this.send);
      osc.start(t);
      osc.stop(t + 1.85);
    }
  },

  kick(t, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(g);
    g.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.26);
  },

  snare(t, vol) {
    this.noiseSource(t, 0.14, 'bandpass', 1900, 0.8, vol);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(g);
    g.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.12);
  },

  hat(t, vol) {
    this.noiseSource(t, 0.045, 'highpass', 7500, 0.7, vol);
  },
};
