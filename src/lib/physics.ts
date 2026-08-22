/**
 * The jar's physics world.
 *
 * Plain TypeScript with no Svelte imports, so it can be driven from a test or
 * a component equally. JarCanvas.svelte owns the element; this owns everything
 * inside it.
 *
 * Four things here are load-bearing:
 *
 * 1. **Body positions are never persisted.** A token stores a `seed`; the pile
 *    is re-derived from those seeds on every load. Persisting coordinates
 *    would mean a jar resized on a different screen restores its tokens
 *    outside the glass.
 *
 * 2. **On load the pile is settled headlessly, then drawn once.** Stepping the
 *    engine without rendering means the jar appears already full instead of
 *    raining twenty tokens down the screen every time the app opens.
 *
 * 3. **The render loop stops when every body is asleep.** A settled jar must
 *    cost zero frames. Without this the app quietly burns battery forever
 *    while showing a completely static picture.
 *
 * 4. **Silhouettes are drawn by us, not by matter.js.** Matter's Render module
 *    is a debug tool and can only draw wireframes.
 */

import Matter from 'matter-js';
import { theme } from './themes.ts';
import type { ThemeId, TokenTypeDef, Vec2 } from './types.ts';

const { Bodies, Body, Composite, Engine, Sleeping, Vertices } = Matter;

/** What the world needs to know about a token. Not the full Token record. */
export interface PileToken {
  id: string;
  tokenTypeId: string;
  seed: number;
}

export interface JarWorldOptions {
  width: number;
  height: number;
  themeId: ThemeId;
  /** Expected worst-case token count — decides how big each token is drawn. */
  capacity: number;
  reducedMotion?: boolean;
}

/** Deterministic PRNG so a given seed always produces the same drop. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PreparedType {
  def: TokenTypeDef;
  /** Convex hull in the 100x100 authoring space. */
  hull: Vec2[];
  /** Centroid of that hull — the offset between body origin and path origin. */
  centre: Vec2;
}

const WALL = 80;
const FIXED_DELTA = 1000 / 60;
const SETTLE_STEPS = 220;
/**
 * How far above the jar the initial scatter reaches, in token widths. Tokens
 * are spread over a band rather than stacked on one spot so the first settle
 * produces a pile instead of a tower.
 */
const SCATTER = 6;
/**
 * A token added by hand is *dropped in through the mouth*, and the three
 * constants below are what make it read that way rather than as a token
 * blinking into existence somewhere along the rim.
 *
 * `DROP_HEIGHT` is deliberately small. It is tempting to spawn a new token far
 * above the jar to make the fall longer, but everything above the glass is
 * clipped, so a high spawn only means the token is already moving fast by the
 * time it enters view. Released just out of sight and starting from rest, it
 * enters slowly and accelerates — which is what a drop looks like.
 */
const DROP_HEIGHT = 0.95;
/** Sideways jitter at release, as a fraction of the jar's width. */
const DROP_SPREAD = 0.28;
/** Radians of tilt at release. A drop wobbles; it does not cartwheel. */
const DROP_TILT = 0.5;

export class JarWorld {
  private engine: Matter.Engine;
  private opts: JarWorldOptions;
  private prepared = new Map<string, PreparedType>();
  private bodies = new Map<string, Matter.Body>();
  private walls: Matter.Body[] = [];
  private tokenSize = 32;
  /** body -> its token type, so the draw loop never searches for it. */
  private bodyTypes = new WeakMap<Matter.Body, PreparedType>();
  /**
   * Path2D is a DOM class and does not exist under Node, so silhouettes are
   * built on first draw rather than in the constructor. That keeps the whole
   * world constructible in a test, which is the only way the settle step can
   * be asserted at all.
   */
  private paths = new Map<string, Path2D>();
  private frame: number | null = null;
  private running = false;

  constructor(options: JarWorldOptions) {
    this.opts = { ...options };
    this.engine = Engine.create({ enableSleeping: true });
    this.engine.gravity.y = 1.1;
    this.prepareTypes();
    this.computeTokenSize();
    this.buildWalls();
  }

  private prepareTypes(): void {
    for (const def of theme(this.opts.themeId).tokens) {
      // Matter types `hull` as taking full Vertex records (index/body/isInternal),
      // but it only ever reads x and y. Plain points are what we have and what
      // it wants; the cast is the honest way to say so.
      const points = def.vertices.map((v) => ({ ...v })) as unknown as Matter.Vertex[];
      const hull = Vertices.hull(points) as unknown as Vec2[];
      const centre = Vertices.centre(hull as unknown as Matter.Vector[]);
      this.prepared.set(def.id, { def, hull, centre: { x: centre.x, y: centre.y } });
    }
  }

  /**
   * Tokens shrink as the target grows, so a 40-token jar fills up rather than
   * overflowing. The area fraction is deliberately below 1 — a pile packs at
   * roughly 60-70% efficiency and needs the headroom.
   */
  private computeTokenSize(): void {
    const { width, height, capacity } = this.opts;
    const perToken = (width * height * 0.5) / Math.max(capacity, 6);
    const side = Math.sqrt(perToken);
    this.tokenSize = Math.max(16, Math.min(side, width / 3.2));
  }

  private buildWalls(): void {
    for (const w of this.walls) Composite.remove(this.engine.world, w);
    const { width, height } = this.opts;
    const opts = { isStatic: true, restitution: 0.05, friction: 0.6 };
    this.walls = [
      // Walls sit outside the visible area so a fast token cannot tunnel out.
      Bodies.rectangle(width / 2, height + WALL / 2, width + WALL * 2, WALL, opts),
      Bodies.rectangle(-WALL / 2, height / 2, WALL, height * 3, opts),
      Bodies.rectangle(width + WALL / 2, height / 2, WALL, height * 3, opts),
      // A lid above the mouth: without it a lively collision can launch a token
      // off-screen for good.
      //
      // Its height is derived from the scatter band rather than fixed, because
      // a lid BELOW the spawn point is worse than no lid at all — tokens land
      // on top of it and never reach the jar. That bug is invisible in the UI
      // (the count is right, the pile is short) which is why the settle test
      // asserts tokens are inside the glass, not merely somewhere finite.
      Bodies.rectangle(width / 2, -this.lidHeight(), width + WALL * 2, WALL, opts),
    ];
    Composite.add(this.engine.world, this.walls);
  }

  /** Distance above the jar mouth to the underside of the lid. */
  private lidHeight(): number {
    return this.tokenSize * (1 + SCATTER) + this.tokenSize * 3 + WALL / 2;
  }

  /**
   * @param drop true for a token the grown-up just added, which falls in
   * through the mouth; false for the first-load scatter, which is spread wide
   * and tall so that one headless settle produces a pile, not a tower.
   */
  private makeBody(token: PileToken, drop: boolean): Matter.Body | null {
    const prep = this.prepared.get(token.tokenTypeId);
    if (!prep) return null;

    const rng = mulberry32(token.seed);
    const s = (this.tokenSize * prep.def.scale) / 100;
    const verts = prep.hull.map((v) => ({ x: v.x * s, y: v.y * s }));

    const margin = this.tokenSize * 0.7;
    const usable = Math.max(1, this.opts.width - margin * 2);
    const x = drop
      ? this.opts.width / 2 + (rng() - 0.5) * usable * DROP_SPREAD
      : margin + rng() * usable;
    const y = drop
      ? -this.tokenSize * (DROP_HEIGHT + rng() * 0.3)
      : -this.tokenSize * (1 + rng() * SCATTER);

    const body = Bodies.fromVertices(x, y, [verts as unknown as Matter.Vector[]], {
      restitution: 0.18,
      friction: 0.45,
      frictionAir: 0.012,
      density: 0.0016,
      sleepThreshold: 40,
    });
    // A dropped token is released almost upright and turns lazily as it falls;
    // a scattered one may be at any angle, because it is standing in for a
    // token that was dropped in some earlier session and has long since settled.
    Body.setAngle(body, (rng() - 0.5) * (drop ? DROP_TILT : Math.PI));
    Body.setAngularVelocity(body, (rng() - 0.5) * (drop ? 0.06 : 0.25));
    this.bodyTypes.set(body, prep);
    return body;
  }

  /**
   * Reconcile the world with the given token list.
   *
   * Tokens already present keep their bodies — and therefore their place in
   * the pile — so adding one treat does not reshuffle the other nineteen.
   */
  setTokens(tokens: readonly PileToken[], opts: { animateNew?: boolean } = {}): void {
    const wanted = new Set(tokens.map((t) => t.id));

    for (const [id, body] of this.bodies) {
      if (!wanted.has(id)) {
        Composite.remove(this.engine.world, body);
        this.bodies.delete(id);
      }
    }

    const fresh: Matter.Body[] = [];
    for (const t of tokens) {
      if (this.bodies.has(t.id)) continue;
      const body = this.makeBody(t, opts.animateNew === true);
      if (!body) continue;
      this.bodies.set(t.id, body);
      fresh.push(body);
    }
    if (fresh.length > 0) Composite.add(this.engine.world, fresh);
  }

  /** Step the engine without drawing, so the pile arrives pre-settled. */
  settle(steps = SETTLE_STEPS): void {
    for (const body of this.bodies.values()) Sleeping.set(body, false);
    for (let i = 0; i < steps; i++) Engine.update(this.engine, FIXED_DELTA);
  }

  /** Nudge everything upward — the "shake the jar" gesture. */
  shake(): void {
    const rng = mulberry32(Date.now() >>> 0);
    for (const body of this.bodies.values()) {
      Sleeping.set(body, false);
      Body.setVelocity(body, { x: (rng() - 0.5) * 9, y: -4 - rng() * 6 });
      Body.setAngularVelocity(body, (rng() - 0.5) * 0.5);
    }
  }

  /** True once nothing is moving — the cue to stop the render loop. */
  isAtRest(): boolean {
    for (const body of this.bodies.values()) {
      if (!body.isSleeping) return false;
    }
    return true;
  }

  resize(width: number, height: number): void {
    this.opts.width = width;
    this.opts.height = height;
    this.computeTokenSize();
    this.buildWalls();
  }

  setCapacity(capacity: number): void {
    if (capacity === this.opts.capacity) return;
    this.opts.capacity = capacity;
    this.computeTokenSize();
    // The lid is positioned relative to token size, so it has to move too.
    this.buildWalls();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.opts;
    ctx.clearRect(0, 0, width, height);
    for (const body of this.bodies.values()) {
      const prep = this.bodyTypes.get(body);
      if (!prep) continue;
      let path = this.paths.get(prep.def.id);
      if (!path) {
        path = new Path2D(prep.def.path);
        this.paths.set(prep.def.id, path);
      }
      const s = (this.tokenSize * prep.def.scale) / 100;
      ctx.save();
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.angle);
      ctx.scale(s, s);
      ctx.translate(-prep.centre.x, -prep.centre.y);
      ctx.fillStyle = prep.def.fill;
      ctx.fill(path);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.stroke(path);
      ctx.restore();
    }
  }

  step(): void {
    Engine.update(this.engine, FIXED_DELTA);
  }

  start(onFrame: () => void): void {
    if (this.running) return;
    this.running = true;
    const tick = (): void => {
      if (!this.running) return;
      this.step();
      onFrame();
      if (this.isAtRest()) {
        this.running = false;
        this.frame = null;
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  destroy(): void {
    this.stop();
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
    this.bodies.clear();
  }

  /** Test seam: where every token ended up, in jar coordinates. */
  positions(): { id: string; x: number; y: number }[] {
    return [...this.bodies].map(([id, b]) => ({ id, x: b.position.x, y: b.position.y }));
  }

  get bounds(): { width: number; height: number } {
    return { width: this.opts.width, height: this.opts.height };
  }
}
