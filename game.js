const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const titleScreen = document.getElementById('titleScreen');
const hud = document.getElementById('hud');
const actionMenu = document.getElementById('actionMenu');
const subMenu = document.getElementById('subMenu');
const stateLine = document.getElementById('stateLine');
const dialogue = document.getElementById('dialogue');
const pauseOverlay = document.getElementById('pauseOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const playerHpLabel = document.getElementById('playerHp');
const bossHpLabel = document.getElementById('bossHp');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const battleBox = { x: 140, y: 110, w: 680, h: 360 };

const difficultySettings = {
  easy: { label: 'Easy', damage: 0.82, projectile: 0.8, cadence: 1.18 },
  hard: { label: 'Hard', damage: 1, projectile: 1, cadence: 1 },
  painful: { label: 'Painful', damage: 1.24, projectile: 1.22, cadence: 0.84 },
};

const soulOrder = ['red', 'green', 'blue', 'yellow', 'purple'];
const keys = {};
const particles = [];
const projectiles = [];
const beams = [];
const textBits = [];

const state = {
  screen: 'title',
  difficulty: 'hard',
  muted: false,
  paused: false,
  gameOver: false,
  modeIndex: 0,
  lastTime: 0,
  attackTimer: 0,
  dialogueTimer: 0,
  log: 'The Showman is ready.',
  player: {
    x: WIDTH / 2,
    y: HEIGHT - 134,
    radius: 12,
    hp: 20,
    maxHp: 20,
    soul: 'red',
    invuln: 0,
    lane: 1,
    jumpVel: 0,
    onGround: true,
    shield: 0,
    shootCooldown: 0,
    pointerDragging: false,
  },
  boss: {
    x: WIDTH / 2,
    y: 148,
    radius: 42,
    hp: 40,
    maxHp: 40,
    phase: 'calm',
    vulnerable: false,
    vulnerableTimer: 0,
    applause: 0,
    memory: { praised: 0, mocked: 0, warned: 0 },
    faceTimer: 0,
  },
  attackPattern: 0,
  pendingAction: null,
  acts: [],
  items: { tea: 2 },
  beat: 0,
};

let audioCtx = null;
let musicGain = null;
let musicNodes = [];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function setStateLine(message) {
  stateLine.textContent = message;
  state.log = message;
}

function playTone(freq, duration = 0.08, volume = 0.05, type = 'sine', when = 0) {
  if (!audioCtx || state.muted) return;
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = freq;
  gainNode.gain.value = volume;
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  const start = audioCtx.currentTime + when;
  oscillator.start(start);
  oscillator.stop(start + duration);
  gainNode.gain.setValueAtTime(volume, start);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.05;
    musicGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function toneSequence(seq) {
  if (state.muted || !audioCtx) return;
  seq.forEach((note, index) => {
    playTone(note, 0.12, 0.04, 'square', index * 0.08);
  });
}

function startMusicLoop() {
  if (!audioCtx || state.muted) return;
  if (musicNodes.length) return;

  const notes = [196, 196, 246.94, 246.94, 293.66, 293.66, 246.94, 220];
  const beat = () => {
    if (state.screen !== 'battle' || state.paused || state.gameOver) return;
    const note = notes[Math.floor(Math.random() * notes.length)];
    playTone(note, 0.12, 0.03, 'triangle');
    playTone(note / 2, 0.14, 0.025, 'sine', 0.04);
  };

  const interval = setInterval(beat, 420);
  musicNodes.push(interval);
}

function stopMusicLoop() {
  musicNodes.forEach(clearInterval);
  musicNodes = [];
}

function toggleMute() {
  state.muted = !state.muted;
  const btn = document.getElementById('muteBtn');
  btn.textContent = state.muted ? 'Unmute' : 'Mute';
  if (state.muted) {
    stopMusicLoop();
  } else if (state.screen === 'battle') {
    startMusicLoop();
  }
}

function setDifficulty(level) {
  state.difficulty = level;
  document.querySelectorAll('.difficulty-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.difficulty === level);
  });
  if (state.screen === 'title') {
    setStateLine(`Difficulty: ${difficultySettings[level].label}`);
  }
}

function setMode(mode) {
  const index = soulOrder.indexOf(mode);
  if (index >= 0) {
    state.modeIndex = index;
    state.player.soul = mode;
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    if (state.screen === 'battle') {
      setStateLine(`${mode.toUpperCase()} soul engaged.`);
    }
  }
}

function queueDialogue(text, duration = 2600) {
  dialogue.textContent = text;
  dialogue.classList.remove('hidden');
  state.dialogueTimer = duration;
}

function hideDialogue() {
  dialogue.classList.add('hidden');
}

function resetBattle() {
  state.gameOver = false;
  state.paused = false;
  state.pendingAction = null;
  state.attackPattern = 0;
  state.attackTimer = 0.8;
  state.player.x = WIDTH / 2;
  state.player.y = HEIGHT - 134;
  state.player.hp = state.player.maxHp;
  state.player.invuln = 0;
  state.player.jumpVel = 0;
  state.player.shootCooldown = 0;
  state.player.shield = 0;
  state.player.lane = 1;
  state.player.soul = soulOrder[state.modeIndex];
  state.items.tea = 2;
  state.boss.hp = state.boss.maxHp;
  state.boss.phase = 'calm';
  state.boss.vulnerable = false;
  state.boss.vulnerableTimer = 0;
  state.boss.applause = 0;
  state.boss.memory = { praised: 0, mocked: 0, warned: 0 };
  particles.length = 0;
  projectiles.length = 0;
  beams.length = 0;
  textBits.length = 0;
  setMode(state.player.soul);
  updateHud();
  queueDialogue('The Showman steps onto the stage. The curtain rises.', 2800);
}

function startGame(rehearsal = false) {
  initAudio();
  titleScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  if (rehearsal) {
    state.difficulty = 'easy';
    setDifficulty('easy');
    state.player.maxHp = 28;
  } else {
    state.player.maxHp = 20;
    setDifficulty(state.difficulty);
  }
  state.screen = 'battle';
  state.log = 'Battle started.';
  stateLine.textContent = 'Battle started.';
  resetBattle();
  startMusicLoop();
}

function updateHud() {
  playerHpLabel.textContent = `${Math.max(0, Math.ceil(state.player.hp))} / ${state.player.maxHp}`;
  bossHpLabel.textContent = `${Math.max(0, Math.ceil(state.boss.hp))} / ${state.boss.maxHp}`;
}

function spawnParticles(x, y, color, amount = 12) {
  for (let i = 0; i < amount; i++) {
    particles.push({
      x,
      y,
      vx: rand(-1.5, 1.5),
      vy: rand(-1.8, 1.8),
      life: rand(0.4, 0.8),
      color,
      size: rand(2, 5),
    });
  }
}

function addFloatText(x, y, text, color = '#fff') {
  textBits.push({ x, y, text, color, life: 0.9, drift: rand(-15, 15) });
}

function damagePlayer(amount) {
  if (state.player.invuln > 0 || state.gameOver || state.screen !== 'battle') return;
  const actual = amount * difficultySettings[state.difficulty].damage;
  state.player.hp -= actual;
  state.player.invuln = 0.7;
  setStateLine(`You took ${actual.toFixed(1)} damage.`);
  spawnParticles(state.player.x, state.player.y, '#ff7d7d', 18);
  playTone(130, 0.12, 0.06, 'sawtooth');
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    gameOverOverlay.classList.remove('hidden');
    setStateLine('The stage goes dark.');
    queueDialogue('The Showman bows. The curtain falls. Press R to restart.', 3500);
    playTone(110, 0.35, 0.08, 'square');
  }
  updateHud();
}

function dealBossDamage(amount) {
  state.boss.hp -= amount;
  state.boss.vulnerable = false;
  state.boss.vulnerableTimer = 0;
  spawnParticles(state.boss.x, state.boss.y, '#fef3d0', 16);
  playTone(420, 0.1, 0.05, 'triangle');
  playTone(600, 0.1, 0.04, 'triangle', 0.05);
  if (state.boss.hp <= 0) {
    state.boss.hp = 0;
    state.screen = 'ending';
    state.gameOver = true;
    queueDialogue('The Showman is struck down. The audience cheers. The final bow is yours.', 6000);
    setStateLine('Victory.');
    playTone(880, 0.3, 0.05, 'triangle');
    playTone(660, 0.28, 0.05, 'triangle', 0.12);
  }
  updateHud();
}

function openActionMenu(actionName) {
  subMenu.innerHTML = '';
  subMenu.classList.add('hidden');
  state.pendingAction = actionName;

  if (actionName === 'fight') {
    setStateLine('Strike while the room is open.');
    queueDialogue('The Showman sways. Time your blow.');
    return;
  }

  if (actionName === 'check') {
    const estimate = state.boss.hp <= 0 ? 0 : state.boss.hp;
    const mood = state.boss.phase === 'angry' ? 'Angry' : 'Composed';
    const info = `SHOWMAN: HP ${estimate}/40. Mood: ${mood}. He is ${state.boss.phase === 'angry' ? 'losing his temper' : 'performing with precision'}.`;
    queueDialogue(info, 2800);
    setStateLine('CHECK complete.');
    state.pendingAction = null;
    return;
  }

  if (actionName === 'item') {
    const tea = state.items.tea;
    if (tea <= 0) {
      queueDialogue('No tea left. The stage is dry.', 1800);
      state.pendingAction = null;
      return;
    }
    const btn = document.createElement('button');
    btn.textContent = `Tea (${tea})`;
    btn.addEventListener('click', () => {
      if (state.items.tea <= 0) return;
      state.items.tea -= 1;
      const heal = Math.min(12, state.player.maxHp - state.player.hp);
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
      queueDialogue(`Tea restores ${heal} HP. The throat is soothed.`, 2200);
      setStateLine('Tea consumed.');
      updateHud();
      state.pendingAction = null;
      hideDialogMenu();
    });
    subMenu.appendChild(btn);
    subMenu.classList.remove('hidden');
    return;
  }

  if (actionName === 'act') {
    const actions = [
      ['Observe', 'You look for a weak spot and see the cane shake.'],
      ['Taunt', 'You mock the Showman. His smile tightens.'],
      ['Praise', 'A compliment lands; the crowd responds.'],
      ['Threaten', 'The threat is theatrical and sharp.'],
    ];
    actions.forEach(([label, text]) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        state.boss.applause += 1;
        state.boss.memory.praised += label === 'Praise' ? 1 : 0;
        state.boss.memory.mocked += label === 'Taunt' ? 1 : 0;
        queueDialogue(text, 2200);
        setStateLine(`ACT: ${label}`);
        state.pendingAction = null;
        hideDialogMenu();
      });
      subMenu.appendChild(btn);
    });
    subMenu.classList.remove('hidden');
    return;
  }

  if (actionName === 'mercy') {
    const spareAllowed = state.boss.applause >= 3 || state.boss.hp <= 18;
    const btn = document.createElement('button');
    btn.textContent = spareAllowed ? 'Spare' : 'Offer a Hand';
    btn.addEventListener('click', () => {
      if (spareAllowed) {
        queueDialogue('The Showman hesitates. The performance changes. He lowers the cane.', 3200);
        state.boss.hp = Math.max(0, state.boss.hp - 4);
        setStateLine('Mercy offered.');
        updateHud();
      } else {
        queueDialogue('The Showman sneers. "This isn’t your ending."', 2200);
      }
      state.pendingAction = null;
      hideDialogMenu();
    });
    subMenu.appendChild(btn);
    subMenu.classList.remove('hidden');
  }
}

function hideDialogMenu() {
  state.pendingAction = null;
  subMenu.classList.add('hidden');
  subMenu.innerHTML = '';
}

function doStrike() {
  if (state.screen !== 'battle' || state.pause || state.gameOver) return;
  if (!state.boss.vulnerable) {
    queueDialogue('The Showman is still moving. You miss.', 1600);
    setStateLine('Missed strike.');
    return;
  }

  const dist = Math.hypot(state.player.x - state.boss.x, state.player.y - state.boss.y);
  if (dist <= 90) {
    const perfect = dist <= 38;
    const damage = perfect ? 5 : 2;
    dealBossDamage(damage);
    setStateLine(perfect ? 'Perfect hit!' : 'Solid hit.');
    queueDialogue(perfect ? 'A perfect hit! The Showman reels.' : 'The final flourish lands.', 1800);
    addFloatText(state.boss.x, state.boss.y - 20, perfect ? 'Perfect!' : 'Hit!', perfect ? '#ffe76a' : '#fff');
    state.boss.vulnerable = false;
  } else {
    queueDialogue('Your strike misses the cue.', 1600);
    setStateLine('Strike missed.');
  }
}

function handlePlayerAction(key) {
  if (state.screen !== 'battle' || state.gameOver) return;
  if (key === 'space') {
    if (state.pendingAction === 'fight') {
      doStrike();
      hideDialogMenu();
      state.pendingAction = null;
    } else {
      if (state.player.soul === 'yellow') {
        fireYellowShot();
      }
      if (state.player.soul === 'green' && state.player.shield <= 0) {
        state.player.shield = 0.34;
      }
    }
  }
  if (key === 'q') {
    state.modeIndex = (state.modeIndex + 1) % soulOrder.length;
    setMode(soulOrder[state.modeIndex]);
  }
  if (key === 'm') {
    setMode(soulOrder[Math.max(0, state.modeIndex - 1)]);
  }
  if (key === '1' || key === '2' || key === '3' || key === '4' || key === '5') {
    const idx = Number(key) - 1;
    if (idx >= 0 && idx < soulOrder.length) {
      setMode(soulOrder[idx]);
    }
  }
}

function fireYellowShot() {
  const p = state.player;
  if (p.shootCooldown > 0) return;
  const dirX = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
  const dirY = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0);
  const angle = Math.atan2(dirY || 0.1, dirX || 1);
  projectiles.push({
    x: p.x,
    y: p.y,
    vx: Math.cos(angle) * 5.6,
    vy: Math.sin(angle) * 5.6,
    radius: 6,
    color: '#ffe76a',
    type: 'player-shot',
    life: 2,
  });
  p.shootCooldown = 0.22;
  playTone(540, 0.08, 0.04, 'square');
}

function updatePlayer(dt) {
  const p = state.player;
  const moveLeft = keys.ArrowLeft || keys.a;
  const moveRight = keys.ArrowRight || keys.d;
  const moveUp = keys.ArrowUp || keys.w;
  const moveDown = keys.ArrowDown || keys.s;

  p.invuln = Math.max(0, p.invuln - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.shield = Math.max(0, p.shield - dt);

  const speedMap = { red: 3.2, green: 2.4, blue: 2.6, yellow: 2.8, purple: 0 };
  const speed = speedMap[p.soul] || 2.8;

  if (p.soul === 'purple') {
    const lanes = [-220, 0, 220];
    let targetX = lanes[p.lane];
    if (moveRight) p.lane = clamp(p.lane + 1, 0, 2);
    if (moveLeft) p.lane = clamp(p.lane - 1, 0, 2);
    if (moveUp) p.lane = clamp(p.lane + 1, 0, 2);
    if (moveDown) p.lane = clamp(p.lane - 1, 0, 2);
    p.x += (lanes[p.lane] - p.x) * 0.16;
    p.y = HEIGHT - 144;
  } else {
    let dx = 0;
    let dy = 0;
    if (moveLeft) dx -= 1;
    if (moveRight) dx += 1;
    if (moveUp) dy -= 1;
    if (moveDown) dy += 1;
    const length = Math.hypot(dx, dy) || 1;
    if (p.soul === 'blue') {
      p.x += (dx / length) * speed * dt * 60;
      p.y += (dy / length) * speed * dt * 60;
      if (moveUp && p.onGround) {
        p.jumpVel = -6.5;
        p.onGround = false;
      }
      p.jumpVel += 0.22;
      p.y += p.jumpVel * 3.2;
      if (p.y > HEIGHT - 120) {
        p.y = HEIGHT - 120;
        p.jumpVel = 0;
        p.onGround = true;
      }
      p.x = clamp(p.x, battleBox.x + 20, battleBox.x + battleBox.w - 20);
      p.y = clamp(p.y, battleBox.y + 20, HEIGHT - 120);
    } else {
      p.x += (dx / length) * speed * dt * 60;
      p.y += (dy / length) * speed * dt * 60;
      p.x = clamp(p.x, battleBox.x + 20, battleBox.x + battleBox.w - 20);
      p.y = clamp(p.y, battleBox.y + 20, HEIGHT - 120);
    }

    if (p.soul === 'green' && (moveLeft || moveRight || moveUp || moveDown)) {
      p.shield = 0.18;
    }
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * 60 * dt;
    p.y += p.vy * 60 * dt;
    p.life -= dt;

    if (p.type === 'cane') {
      if (p.paused) {
        p.color = '#ffffff';
        p.pausedFor += dt;
        if (p.pausedFor > 0.7) {
          p.vx *= -1;
          p.vy *= -1;
          p.paused = false;
          p.color = '#f3f3f3';
        }
      } else {
        p.color = p.angle === 1 ? '#fffcdf' : '#ffd37b';
      }
    }

    if (p.type === 'enemy' || p.type === 'shadow' || p.type === 'beam') {
      const dx = p.x - state.player.x;
      const dy = p.y - state.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < p.radius + state.player.radius) {
        damagePlayer(1.2);
        projectiles.splice(i, 1);
        continue;
      }
    }

    if (p.type === 'player-shot') {
      for (let j = projectiles.length - 1; j >= 0; j--) {
        if (j === i) continue;
        const q = projectiles[j];
        if (q.type !== 'enemy' && q.type !== 'shadow') continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < q.radius + p.radius) {
          projectiles.splice(j, 1);
          projectiles.splice(i, 1);
          spawnParticles((p.x + q.x) / 2, (p.y + q.y) / 2, '#ffe76a', 12);
          break;
        }
      }
    }

    if (p.life <= 0 || p.x < -20 || p.x > WIDTH + 20 || p.y < -20 || p.y > HEIGHT + 20) {
      projectiles.splice(i, 1);
    }
  }
}

function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const beam = beams[i];
    beam.life -= dt;
    if (beam.life <= 0) {
      beams.splice(i, 1);
      continue;
    }
    const dist = beam.direction === 'vertical'
      ? Math.abs(state.player.x - beam.x)
      : Math.abs(state.player.y - beam.y);

    if (beam.warning) {
      beam.warning -= dt;
      if (beam.warning <= 0) {
        beam.warning = 0;
        beam.active = true;
      }
    }

    if (beam.active) {
      const hit = beam.direction === 'vertical'
        ? dist < beam.width && Math.abs(state.player.y - beam.y) < 160
        : dist < beam.width && Math.abs(state.player.x - beam.x) < 160;
      if (hit) {
        damagePlayer(1.2);
      }
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * 60 * dt;
    p.y += p.vy * 60 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateTextBits(dt) {
  for (let i = textBits.length - 1; i >= 0; i--) {
    const t = textBits[i];
    t.life -= dt;
    t.y -= 0.3;
    t.x += t.drift * dt;
    if (t.life <= 0) textBits.splice(i, 1);
  }
}

function spawnBossAttack() {
  const difficulty = difficultySettings[state.difficulty];
  const phase = state.boss.phase;
  const patterns = [
    'cane',
    'beams',
    'radial',
    'shadows',
  ];
  const chosen = patterns[(state.attackPattern + (phase === 'angry' ? 1 : 0)) % patterns.length];
  state.attackPattern += 1;

  if (chosen === 'cane') {
    for (let i = 0; i < 9; i++) {
      const angle = -Math.PI / 2 + (i / 8) * Math.PI;
      const speed = 2.1 * difficulty.projectile;
      projectiles.push({
        x: state.boss.x,
        y: state.boss.y + 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 9,
        type: 'cane',
        color: '#ffd57d',
        paused: false,
        pausedFor: 0,
        life: 4.3,
        angle: i % 2 === 0 ? 1 : -1,
      });
    }
    queueDialogue('The Showman twirls his cane. The stage is tense.', 2500);
  }

  if (chosen === 'beams') {
    const beamCount = phase === 'angry' ? 5 : 3;
    for (let i = 0; i < beamCount; i++) {
      const x = rand(160, WIDTH - 160);
      const y = rand(140, 440);
      beams.push({
        x,
        y,
        width: 40,
        direction: Math.random() > 0.5 ? 'vertical' : 'horizontal',
        warning: 0.7,
        active: false,
        life: 1.8,
      });
    }
    queueDialogue('A beam cuts across the stage. Watch the light.', 2400);
  }

  if (chosen === 'radial') {
    const count = phase === 'angry' ? 18 : 12;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      projectiles.push({
        x: state.boss.x,
        y: state.boss.y,
        vx: Math.cos(angle) * (2.0 * difficulty.projectile),
        vy: Math.sin(angle) * (2.0 * difficulty.projectile),
        radius: 7,
        type: 'enemy',
        color: '#ff9f9f',
        life: 4.5,
      });
    }
    queueDialogue('The performance turns sharp and cruel.', 2000);
  }

  if (chosen === 'shadows') {
    for (let i = 0; i < (phase === 'angry' ? 4 : 3); i++) {
      const side = i % 2 === 0 ? -1 : 1;
      projectiles.push({
        x: side === -1 ? -20 : WIDTH + 20,
        y: rand(140, 420),
        vx: side * rand(2.6, 4.1) * difficulty.projectile,
        vy: (state.player.y - rand(140, 420)) * 0.02,
        radius: 10,
        type: 'shadow',
        color: '#a2a6b7',
        life: 5,
      });
    }
    queueDialogue('Three shadow actors emerge from the wings.', 2400);
  }

  if (state.boss.hp <= 20 && state.boss.phase !== 'angry') {
    state.boss.phase = 'angry';
    setStateLine('The Showman snaps. The angry phase begins.');
    queueDialogue('This was not part of the script. The fool is still standing.', 3000);
    state.boss.applause += 2;
  }
}

function updateBoss(dt) {
  const boss = state.boss;
  boss.faceTimer += dt;
  if (boss.hp <= 20) {
    boss.phase = 'angry';
  } else if (boss.hp <= 30) {
    boss.phase = 'frayed';
  }

  if (boss.vulnerable) {
    boss.vulnerableTimer -= dt;
    if (boss.vulnerableTimer <= 0) {
      boss.vulnerable = false;
    }
  }

  state.attackTimer -= dt;
  if (state.attackTimer <= 0) {
    spawnBossAttack();
    const base = 2.35 * difficultySettings[state.difficulty].cadence;
    state.attackTimer = base + Math.random() * 1.2;
    boss.vulnerable = true;
    boss.vulnerableTimer = 1.65;
  }
}

function updateBattle(dt) {
  if (state.screen !== 'battle') return;
  if (state.paused || state.gameOver) return;

  updatePlayer(dt);
  updateProjectiles(dt);
  updateBeams(dt);
  updateParticles(dt);
  updateTextBits(dt);
  updateBoss(dt);
  state.player.x = clamp(state.player.x, battleBox.x + 18, battleBox.x + battleBox.w - 18);

  if (state.boss.hp <= 0) {
    state.screen = 'ending';
    state.gameOver = true;
  }

  if (state.player.hp <= 0) {
    state.gameOver = true;
  }

  if (state.dialogueTimer > 0) {
    state.dialogueTimer -= dt * 1000;
    if (state.dialogueTimer <= 0) {
      hideDialogue();
    }
  }
}

function drawArena() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(battleBox.x, battleBox.y, battleBox.w, battleBox.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeRect(battleBox.x, battleBox.y, battleBox.w, battleBox.h);

  for (let i = 0; i < 22; i++) {
    const y = 90 + i * 22;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(battleBox.x + 16, y, battleBox.w - 32, 1);
  }

  drawBoss();
  drawPlayer();
  drawProjectiles();
  drawBeams();
  drawParticles();
  drawTextBits();
}

function drawPlayer() {
  const p = state.player;
  const modeColors = {
    red: '#ff6a6a',
    green: '#7dffb3',
    blue: '#7cc7ff',
    yellow: '#ffe76a',
    purple: '#dca3ff',
  };

  if (p.soul === 'green' && p.shield > 0) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18 + p.shield * 20, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(125,255,179,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.fillStyle = p.invuln > 0 ? '#fff6d6' : modeColors[p.soul];
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';

  if (p.soul === 'red') {
    ctx.moveTo(p.x, p.y - 12);
    ctx.lineTo(p.x + 12, p.y);
    ctx.lineTo(p.x, p.y + 12);
    ctx.lineTo(p.x - 12, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (p.soul === 'green') {
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (p.soul === 'blue') {
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(124,199,255,0.18)';
    ctx.fillRect(p.x - 2, p.y + 11, 4, 12);
  } else if (p.soul === 'yellow') {
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f5d465';
    ctx.fillRect(p.x - 2, p.y - 14, 4, 28);
  } else if (p.soul === 'purple') {
    ctx.moveTo(p.x, p.y - 11);
    ctx.lineTo(p.x + 11, p.y);
    ctx.lineTo(p.x, p.y + 11);
    ctx.lineTo(p.x - 11, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawBoss() {
  const boss = state.boss;
  const angry = boss.phase === 'angry';

  ctx.save();
  ctx.translate(boss.x, boss.y);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius + 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f3f3f3';
  ctx.fillRect(-28, -20, 56, 52);
  ctx.fillStyle = '#141414';
  ctx.fillRect(-34, -32, 68, 14);
  ctx.fillStyle = '#f3f3f3';
  ctx.fillRect(-20, 32, 16, 20);
  ctx.fillRect(4, 32, 16, 20);

  if (angry) {
    ctx.fillStyle = '#ff3f5d';
    ctx.fillRect(-14, -4, 8, 8);
    ctx.fillRect(6, -4, 8, 8);
    ctx.fillStyle = '#ffdfdf';
    ctx.fillRect(-20, 60, 10, 26);
    ctx.fillRect(10, 60, 10, 26);
  } else {
    ctx.fillStyle = '#131313';
    ctx.fillRect(-14, -4, 8, 8);
    ctx.fillRect(6, -4, 8, 8);
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(-20, 60, 10, 26);
    ctx.fillRect(10, 60, 10, 26);
  }

  ctx.fillStyle = '#d6a55f';
  ctx.fillRect(-6, -9, 12, 18);
  ctx.restore();

  if (boss.vulnerable) {
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.radius + 18, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffe76a';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    ctx.beginPath();
    ctx.fillStyle = p.color;
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    if (p.type === 'cane') {
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(p.x - 8, p.y - 3, 16, 6);
    }
  }
}

function drawBeams() {
  for (const beam of beams) {
    ctx.fillStyle = beam.warning > 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255, 180, 120, 0.4)';
    if (beam.direction === 'vertical') {
      ctx.fillRect(beam.x - 14, 110, 28, 400);
    } else {
      ctx.fillRect(120, beam.y - 14, 700, 28);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
}

function drawTextBits() {
  for (const t of textBits) {
    ctx.fillStyle = t.color;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(t.text, t.x, t.y);
  }
}

function updateTitle() {
  if (state.screen !== 'title') return;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#f2f2f2';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('Press Start to begin the stage.', 360, 520);
}

function gameLoop(timestamp) {
  const dt = Math.min(0.033, (timestamp - state.lastTime || 16.67) / 1000);
  state.lastTime = timestamp;

  if (state.screen === 'title') {
    updateTitle();
  } else if (state.screen === 'battle') {
    updateBattle(dt);
    drawArena();
  } else if (state.screen === 'ending') {
    drawArena();
  }

  requestAnimationFrame(gameLoop);
}

function bindUI() {
  document.getElementById('startBtn').addEventListener('click', () => startGame(false));
  document.getElementById('rehearsalBtn').addEventListener('click', () => startGame(true));
  document.getElementById('muteBtn').addEventListener('click', toggleMute);

  document.querySelectorAll('.difficulty-btn').forEach((btn) => {
    btn.addEventListener('click', () => setDifficulty(btn.dataset.difficulty));
  });

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  document.querySelectorAll('#actionMenu button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      openActionMenu(action);
      document.querySelectorAll('#actionMenu button').forEach((b) => {
        b.classList.toggle('active', b === btn && action !== 'fight');
      });
    });
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (state.screen !== 'battle') return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    state.player.pointerDragging = true;
    state.player.x = clamp(x, battleBox.x + 16, battleBox.x + battleBox.w - 16);
    state.player.y = clamp(y, battleBox.y + 16, HEIGHT - 120);
    if (state.pendingAction === 'fight') doStrike();
    initAudio();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!state.player.pointerDragging || state.screen !== 'battle') return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    state.player.x = clamp(x, battleBox.x + 16, battleBox.x + battleBox.w - 16);
    state.player.y = clamp(y, battleBox.y + 16, HEIGHT - 120);
  });

  canvas.addEventListener('pointerup', () => {
    state.player.pointerDragging = false;
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowleft','arrowright','arrowup','arrowdown','a','d','w','s','p',' ','q','m','1','2','3','4','5','r'].includes(key)) {
      event.preventDefault();
    }
    keys[event.key] = true;
    keys[key] = true;
    if (key === 'p') {
      state.paused = !state.paused;
      pauseOverlay.classList.toggle('hidden', !state.paused);
    }
    if (key === 'r' && (state.gameOver || state.screen === 'title')) {
      state.screen = 'battle';
      titleScreen.classList.add('hidden');
      hud.classList.remove('hidden');
      resetBattle();
      state.gameOver = false;
      gameOverOverlay.classList.add('hidden');
      initAudio();
      startMusicLoop();
    }
    if (key === ' ') {
      handlePlayerAction('space');
    }
    if (key === 'q') handlePlayerAction('q');
    if (key === 'm') handlePlayerAction('m');
    if (key === '1' || key === '2' || key === '3' || key === '4' || key === '5') {
      handlePlayerAction(key);
    }
    if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'arrowup' || key === 'arrowleft' || key === 'arrowdown' || key === 'arrowright') {
      initAudio();
    }
  });

  window.addEventListener('keyup', (event) => {
    keys[event.key] = false;
    keys[event.key.toLowerCase()] = false;
  });

  document.addEventListener('pointerdown', () => initAudio());
}

bindUI();
setDifficulty('hard');
updateHud();
requestAnimationFrame(gameLoop);
