class Roulette {
  constructor(reelEl) {
    this.reel = reelEl;
    this.spinning = false;
    this.ITEM_H = 100;
  }

  spin(pool, target, onDone) {
    if (this.spinning) return;
    this.spinning = true;

    const paddingCount = 22;
    const items = [];
    for (let i = 0; i < paddingCount; i++) {
      items.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    items.push(target);

    /* displayName이 있으면 사용 (광역시 구 → "부산 중구" 등) */
    this.reel.innerHTML = items
      .map(d => `<div class="reel-item">${d.displayName || d.name}</div>`)
      .join('');

    const targetY = (items.length - 1) * this.ITEM_H;
    this.reel.style.transform = 'translateY(0)';

    const duration = 3200;
    let start = null;
    const easeOutQuart = t => 1 - Math.pow(1 - t, 4);

    const frame = (ts) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(progress);
      this.reel.style.transform = `translateY(-${eased * targetY}px)`;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        this.spinning = false;
        this._flashWin();
        setTimeout(() => onDone(target), 300);
      }
    };

    requestAnimationFrame(frame);
  }

  _flashWin() {
    this.reel.querySelectorAll('.reel-item').forEach(el => el.classList.remove('win'));
    const items = this.reel.querySelectorAll('.reel-item');
    const last = items[items.length - 1];
    if (last) {
      last.classList.add('win');
      last.style.color = 'var(--accent2)';
      last.style.textShadow = '0 0 20px var(--accent)';
    }
  }

  reset() {
    this.reel.innerHTML = '<div class="reel-item placeholder">어디든 갈 수 있어!</div>';
    this.reel.style.transform = 'translateY(0)';
    this.spinning = false;
  }
}

/* ===== Particle System ===== */
class ParticleSystem {
  constructor(canvas, season) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.season = season;
    this.particles = [];
    this.raf = null;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._init();
    this._loop();
  }

  setSeason(season) {
    this.season = season;
    this.particles = [];
    this._init();
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _init() {
    const count = window.innerWidth < 600 ? 40 : 70;
    for (let i = 0; i < count; i++) {
      this.particles.push(this._create(true));
    }
  }

  _create(randomY = false) {
    const s = this.season;
    const x = Math.random() * this.canvas.width;
    const y = randomY ? Math.random() * this.canvas.height : -20;
    const size = Math.random() * 6 + 3;

    const base = {
      x, y, size,
      vx: (Math.random() - 0.5) * 0.6,
      vy: Math.random() * 1.2 + 0.4,
      alpha: Math.random() * 0.5 + 0.3,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 3,
      swing: Math.random() * 0.02,
      swingOffset: Math.random() * Math.PI * 2,
    };

    if (s === 'spring') {
      return { ...base, color: `hsl(${Math.random() * 30 + 330}, 80%, 80%)`, shape: 'petal' };
    } else if (s === 'summer') {
      return { ...base, size: size * 0.7, vy: -(Math.random() * 1.5 + 0.5),
               color: `hsla(${Math.random() * 30 + 190}, 90%, 70%, 0.6)`, shape: 'circle' };
    } else if (s === 'fall') {
      return { ...base, color: `hsl(${Math.random() * 40 + 10}, 85%, 55%)`, shape: 'leaf' };
    } else {
      return { ...base, size: Math.random() * 4 + 1, vy: Math.random() * 1.5 + 0.5,
               color: `rgba(200, 225, 255, 0.8)`, shape: 'circle' };
    }
  }

  _draw(p) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.fillStyle = p.color;

    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'petal') {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size / 2, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'leaf') {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * 0.4, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _update(p, t) {
    p.x += p.vx + Math.sin(t * p.swing + p.swingOffset) * 0.5;
    p.y += p.vy;
    p.rotation += p.rotSpeed;

    const h = this.canvas.height;
    const w = this.canvas.width;

    if (this.season === 'summer') {
      if (p.y < -20) { Object.assign(p, this._create(false)); p.y = h + 10; }
    } else {
      if (p.y > h + 20) { Object.assign(p, this._create(false)); }
    }
    if (p.x < -20) p.x = w + 20;
    if (p.x > w + 20) p.x = -20;
  }

  _loop() {
    let t = 0;
    const tick = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      t += 0.016;
      this.particles.forEach(p => {
        this._update(p, t);
        this._draw(p);
      });
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
