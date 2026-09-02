export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  shape: "square" | "spark" | "ring";
  rotation: number;
  spin: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

/** Lightweight pooled particle + floating-text system for juice. */
export class ParticleSystem {
  particles: Particle[] = [];
  texts: FloatingText[] = [];

  burst(
    x: number,
    y: number,
    color: string,
    count: number,
    opts: Partial<Pick<Particle, "gravity" | "size" | "shape">> = {},
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1,
        maxLife: 0.5 + Math.random() * 0.6,
        size: (opts.size ?? 4) * (0.5 + Math.random()),
        color,
        gravity: opts.gravity ?? 0.18,
        shape: opts.shape ?? "square",
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.4,
      });
    }
  }

  /** Horizontal spray used when a row clears. */
  rowSpray(x0: number, x1: number, y: number, color: string, density: number): void {
    const n = Math.max(6, Math.floor((x1 - x0) / density));
    for (let i = 0; i < n; i++) {
      const px = x0 + Math.random() * (x1 - x0);
      this.particles.push({
        x: px,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 2,
        vy: -2 - Math.random() * 4,
        life: 1,
        maxLife: 0.6 + Math.random() * 0.5,
        size: 3 + Math.random() * 5,
        color,
        gravity: 0.22,
        shape: Math.random() > 0.5 ? "square" : "spark",
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.5,
      });
    }
  }

  ring(x: number, y: number, color: string): void {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 1,
      maxLife: 0.5,
      size: 6,
      color,
      gravity: 0,
      shape: "ring",
      rotation: 0,
      spin: 0,
    });
  }

  text(x: number, y: number, text: string, color: string, size = 22): void {
    this.texts.push({ x, y, vy: -0.6, life: 1, maxLife: 1.1, text, color, size });
  }

  update(dt: number): void {
    const s = dt / 16.67;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p) continue;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vy += p.gravity * s;
      p.rotation += p.spin * s;
      p.life -= dt / 1000 / p.maxLife;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      if (!t) continue;
      t.y += t.vy * s;
      t.life -= dt / 1000 / t.maxLife;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.life));
      ctx.globalAlpha = a;
      if (p.shape === "ring") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        const r = (1 - p.life) * 40 + 6;
        ctx.globalAlpha = a * 0.8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === "spark") {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 4, p.size, p.size / 2);
      } else {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
    ctx.shadowBlur = 0;
    for (const t of this.texts) {
      const a = Math.max(0, Math.min(1, t.life));
      ctx.globalAlpha = a;
      ctx.font = `900 ${t.size}px Orbitron, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 12;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  clear(): void {
    this.particles.length = 0;
    this.texts.length = 0;
  }
}
