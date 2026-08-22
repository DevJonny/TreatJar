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
  /**
   * Area the token actually occupies, as a fraction of the `tokenSize` square
   * it is drawn in. A coin fills most of its box; a stegosaurus, with its
   * spikes and the air between its legs, fills about a third of it.
   */
  footprint: number;
}

/** Shoelace area of a simple polygon. */
function polygonArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

const WALL = 80;
const FIXED_DELTA = 1000 / 60;
const SETTLE_STEPS = 320;
/**
 * Cell size of the initial layout, in token widths.
 *
 * Rows are deliberately closer together than a token is tall. A grid of
 * non-overlapping boxes always covers far more area than the same tokens do
 * once they have settled and interlocked, so spacing them a whole token apart
 * builds a column several times taller than the jar. Starting them slightly
 * overlapped costs one shove during the settle and keeps the pile in the jar.
 */
const LAYOUT_X = 0.95;
const LAYOUT_Y = 0.7;
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
/**
 * Sideways jitter at release, as a fraction of the *usable* width — the jar
 * less the margin a token needs to clear the walls, which is the same span the
 * scatter draws from. Applied either side of centre, so the release point lands
 * within half of this of the middle.
 */
const DROP_SPREAD = 0.28;
/** Width of the tilt band at release, in radians: half of it either way. */
const DROP_TILT = 0.5;
/**
 * Total token area at target, as a fraction of the glass. A pile of tumbled
 * shapes packs at roughly two thirds, so this is well below 1 and is not a
 * "how full does it look" number in its own right — it is calibrated against
 * the measured pile height. See computeTokenSize.
 */
const FILL_AT_TARGET = 0.63;
/** Smallest a token may be drawn, in CSS pixels: below this it is a speck. */
const MIN_TOKEN = 14;
/** Where tokens stop nesting and start bridging, as a fraction of the width. */
const PACK_KNEE = 0.36;
/** How fast the pile outgrows its own area past that knee. */
const PACK_PENALTY = 3;
/**
 * A token may be no wider than this fraction of the jar, nor this tall.
 *
 * This is not tidiness. Past roughly half the jar's width a pile stops being a
 * pile: it is three or four big shapes bridging the glass with caves under
 * them, and the fill estimate above — which assumes tokens settle into each
 * other — stops holding and starts overflowing.
 */
const MAX_TOKEN_ACROSS = 2.25;
const MAX_TOKEN_DOWN = 2.2;
/**
 * A jar shorter than this many tokens is a dish, so the fitted height stops
 * here and a very small target simply looks generous rather than full. It
 * matches MAX_TOKEN_DOWN on purpose: a floor below that cap would shrink the
 * token that set the height, which would then ask for a shorter jar again.
 */
const MIN_CAVITY_TOKENS = 2.2;

/**
 * Mean footprint of a theme's tokens. Derived from the same hulls the physics
 * bodies are built from, and memoised because it never changes for a theme.
 */
const footprints = new Map<ThemeId, number>();

export function themeFootprint(themeId: ThemeId): number {
  const cached = footprints.get(themeId);
  if (cached !== undefined) return cached;
  const defs = theme(themeId).tokens;
  const total = defs.reduce((sum, def) => {
    const points = def.vertices.map((v) => ({ ...v })) as unknown as Matter.Vertex[];
    const hull = Vertices.hull(points) as unknown as Vec2[];
    return sum + (polygonArea(hull) * def.scale * def.scale) / 10000;
  }, 0);
  const mean = total / Math.max(defs.length, 1);
  footprints.set(themeId, mean);
  return mean;
}

/**
 * Footprint corrected for how badly big tokens pack.
 *
 * Small tokens nest into each other and the pile is close to the sum of their
 * areas. Big ones bridge: three dinosaurs across the glass leave a cave under
 * them, and the pile stands taller than its area says it should. Past
 * `PACK_KNEE` of the jar's width, each token is therefore treated as taking up
 * more room than it really does — without this a ten-token jar overflows,
 * which is the one outcome that must never happen.
 */
function packedFootprint(footprint: number, tokenSize: number, width: number): number {
  const relative = tokenSize / width;
  return footprint * (1 + PACK_PENALTY * Math.max(0, relative - PACK_KNEE));
}

/**
 * @see JarWorld.computeTokenSize — the rule, without needing a world.
 *
 * Iterated because the packing correction depends on the size it is choosing.
 */
export function tokenSizeFor(width: number, height: number, capacity: number, footprint: number): number {
  const cap = Math.max(capacity, 1);
  const max = Math.min(width / MAX_TOKEN_ACROSS, height / MAX_TOKEN_DOWN);
  let size = max;
  for (let i = 0; i < 3; i++) {
    const packed = packedFootprint(footprint, size, width);
    size = Math.min(max, Math.sqrt((width * height * FILL_AT_TARGET) / (cap * packed)));
  }
  return Math.max(MIN_TOKEN, size);
}

/**
 * How tall the glass should be for this target — the other half of "a jar at
 * its target looks full".
 *
 * Tokens can only get so big before a pile of them is a few large shapes with
 * caves between them, so past a certain point a small target cannot fill a
 * tall jar however big its tokens are drawn. The answer is to stop making the
 * tokens bigger and make the jar shorter instead: five treats go in a small
 * jar and fill it, a hundred go in a tall one. The jar is drawn to this height
 * and stood on the bottom of the space it is given.
 */
export function fitCavity(
  themeId: ThemeId,
  capacity: number,
  width: number,
  maxHeight: number,
): { tokenSize: number; height: number } {
  const footprint = themeFootprint(themeId);
  const cap = Math.max(capacity, 1);
  let tokenSize = Math.min(width / MAX_TOKEN_ACROSS, maxHeight / MAX_TOKEN_DOWN);
  let height = maxHeight;

  // Height and token size each depend on the other — a shorter jar caps the
  // token, and a smaller token wants a shorter jar — so they are solved
  // together. Three passes is far more than this needs to settle.
  for (let i = 0; i < 3; i++) {
    // Invert the sizing rule: this is the height whose glass `cap` tokens of
    // the current size would fill.
    const packed = packedFootprint(footprint, tokenSize, width);
    const wanted = (cap * packed * tokenSize * tokenSize) / (width * FILL_AT_TARGET);
    height = Math.min(maxHeight, Math.max(wanted, tokenSize * MIN_CAVITY_TOKENS));
    tokenSize = tokenSizeFor(width, height, cap, footprint);
  }
  return { tokenSize, height };
}

export class JarWorld {
  private engine: Matter.Engine;
  private opts: JarWorldOptions;
  private prepared = new Map<string, PreparedType>();
  private bodies = new Map<string, Matter.Body>();
  /** The list the pile was built from, so it can be rebuilt at a new size. */
  private tokens: PileToken[] = [];
  private walls: Matter.Body[] = [];
  private tokenSize = 32;
  /** Mean share of its own square that a token of this theme covers. */
  private footprint = 0.3;
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
      // The hull is authored in a 100x100 box and then drawn at `scale`, so its
      // share of the token's square is its area over 10,000, scaled twice.
      const footprint = (polygonArea(hull) * def.scale * def.scale) / 10000;
      this.prepared.set(def.id, { def, hull, centre: { x: centre.x, y: centre.y }, footprint });
    }
    const types = [...this.prepared.values()];
    this.footprint = types.reduce((sum, t) => sum + t.footprint, 0) / Math.max(types.length, 1);
  }

  /**
   * Token size is set so that **a jar at its target looks full**. That is the
   * whole reward: a child who can see the pile is nearly at the top does not
   * need to read the progress bar. A ten-token jar therefore gets big tokens
   * and a hundred-token jar small ones.
   *
   * The sum works forwards from the pile rather than from the box: `capacity`
   * tokens, each covering `footprint` of its own square, must add up to
   * `FILL_AT_TARGET` of the jar. `footprint` is measured from the theme's own
   * hulls, so a jar of coins and a jar of stegosauruses fill to the same
   * height even though a stegosaurus is mostly spikes and air.
   *
   * The clamps matter as much as the formula. Below about ten tokens no size
   * can fill a jar — three tokens would each have to be a third of the glass —
   * so `MAX_TOKEN` gives up gracefully rather than drawing something absurd,
   * and a small target simply looks generous instead of full.
   */
  private computeTokenSize(): void {
    const { width, height, capacity } = this.opts;
    this.tokenSize = tokenSizeFor(width, height, capacity, this.footprint);
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
      // A lid above the mouth: without it a lively collision, or a shake,
      // can launch a token off-screen for good.
      //
      // It must stay above everything the world ever spawns. A lid BELOW a
      // spawn point is worse than no lid at all — tokens land on top of it and
      // never reach the jar, and nothing in the UI shows it, because the count
      // and the progress bar are both still right. Only the pile is short.
      Bodies.rectangle(width / 2, -this.lidHeight(), width + WALL * 2, WALL, opts),
    ];
    Composite.add(this.engine.world, this.walls);
  }

  /**
   * Distance above the jar mouth to the underside of the lid. Generous on
   * purpose: a shake throws the whole pile upward, and a low ceiling turns
   * that into a compression rather than a tumble.
   */
  private lidHeight(): number {
    const clearance = this.opts.height * 0.6 + this.tokenSize * 4;
    return Math.max(clearance, this.layoutReach() + this.tokenSize * 3) + WALL / 2;
  }

  /**
   * Where the initial pile is laid out: a loose grid filling the jar from the
   * floor up, which the settle then collapses into a heap.
   *
   * Tokens are NOT rained in from above. They were sized so that a full jar is
   * a full jar, which makes a column of them taller than the glass itself —
   * and a column that tall arches and jams on the way in, leaving tokens
   * stranded above the glass where nothing can be seen of them.
   */
  private layout(): { cols: number; cellW: number; cellH: number } {
    const cols = Math.max(1, Math.round(this.opts.width / (this.tokenSize * LAYOUT_X)));
    return {
      cols,
      cellW: this.opts.width / cols,
      cellH: this.tokenSize * LAYOUT_Y,
    };
  }

  /** Highest point the initial layout reaches, as a distance above the mouth. */
  private layoutReach(): number {
    const { cols, cellH } = this.layout();
    // capacity is the most tokens a round can hold, by construction, so this
    // bounds the layout without needing the list that walls are built before.
    const rows = Math.ceil(Math.max(this.opts.capacity, 1) / cols);
    return Math.max(0, rows * cellH - this.opts.height);
  }

  /**
   * @param drop true for a token the grown-up just added, which falls in
   * through the mouth. False places the token in the starting layout instead:
   * it is standing in for a token that went in during some earlier session,
   * and the pile it belongs to is settled headlessly before anyone sees it.
   * @param index position in the jar's token list, which decides its cell in
   * that layout. Only used when `drop` is false.
   */
  private makeBody(token: PileToken, index: number, drop: boolean): Matter.Body | null {
    const prep = this.prepared.get(token.tokenTypeId);
    if (!prep) return null;

    const rng = mulberry32(token.seed);
    const s = (this.tokenSize * prep.def.scale) / 100;
    const verts = prep.hull.map((v) => ({ x: v.x * s, y: v.y * s }));

    const { cols, cellW, cellH } = this.layout();
    const col = index % cols;
    const row = Math.floor(index / cols);
    const jitter = (rng() - 0.5) * cellW * 0.3;
    const x = drop
      ? this.opts.width / 2 + (rng() - 0.5) * this.opts.width * DROP_SPREAD
      : Math.min(this.opts.width - cellW / 2, Math.max(cellW / 2, (col + 0.5) * cellW + jitter));
    const y = drop
      ? -this.tokenSize * (DROP_HEIGHT + rng() * 0.3)
      : this.opts.height - (row + 0.5) * cellH;

    const body = Bodies.fromVertices(x, y, [verts as unknown as Matter.Vector[]], {
      restitution: 0.18,
      friction: 0.45,
      frictionAir: 0.012,
      density: 0.0016,
      sleepThreshold: 40,
    });
    // A dropped token is released almost upright and turns lazily as it falls;
    // a scattered one starts anywhere within a half-turn, because it is standing
    // in for a token dropped in some earlier session that has long since settled.
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
    tokens.forEach((t, i) => {
      if (this.bodies.has(t.id)) return;
      const body = this.makeBody(t, i, opts.animateNew === true);
      if (!body) return;
      this.bodies.set(t.id, body);
      fresh.push(body);
    });
    if (fresh.length > 0) Composite.add(this.engine.world, fresh);
    this.tokens = [...tokens];
  }

  /**
   * Throw every body away and build the pile again from the token list.
   *
   * Token size is derived from the jar's size and target, so both of those
   * changing mid-round would otherwise leave a pile drawn at the old scale.
   * Rebuilding is cheap and safe precisely because positions are never
   * persisted: a token is a seed, and the pile is a pure function of the list.
   */
  private rebuild(): void {
    for (const body of this.bodies.values()) Composite.remove(this.engine.world, body);
    this.bodies.clear();
    const list = this.tokens;
    this.tokens = [];
    this.setTokens(list);
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
    if (width === this.opts.width && height === this.opts.height) return;
    this.opts.width = width;
    this.opts.height = height;
    this.refit();
  }

  setCapacity(capacity: number): void {
    if (capacity === this.opts.capacity) return;
    this.opts.capacity = capacity;
    this.refit();
  }

  /**
   * Re-theme the jar in place.
   *
   * Token shapes, colours and footprints all come from the theme, and none of
   * them can be swapped on a body that already exists — so the pile is thrown
   * away and built again from its seeds. Tokens whose type does not exist in
   * the new theme simply do not come back, which is the same thing `progress`
   * does with them: an old dinosaur is worth nothing in a money jar, and it
   * would be worse to show one that no longer counts.
   */
  setTheme(themeId: ThemeId): void {
    if (themeId === this.opts.themeId) return;
    this.opts.themeId = themeId;
    this.prepared.clear();
    this.paths.clear();
    this.prepareTypes();
    this.computeTokenSize();
    this.buildWalls();
    this.rebuild();
  }

  /**
   * Re-derive everything that depends on the jar's size or target. Bodies are
   * rebuilt only when the token size actually moved, so a resize that rounds to
   * the same size leaves a settled pile alone.
   */
  private refit(): void {
    const before = this.tokenSize;
    this.computeTokenSize();
    // The lid is positioned relative to the jar and to token size, so it moves too.
    this.buildWalls();
    if (Math.abs(before - this.tokenSize) > 0.5) this.rebuild();
  }

  /**
   * Paint every token at its current position, in the world's own coordinates.
   *
   * Clearing, clipping and placing the world within the jar belong to the
   * caller: the world knows where its tokens are, not where on the page it is
   * being drawn.
   */
  draw(ctx: CanvasRenderingContext2D): void {
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

  /** How big one token is drawn, in CSS pixels. Derived from the target. */
  get tokenPixels(): number {
    return this.tokenSize;
  }

  /** Test seam: where every token ended up, in jar coordinates. */
  positions(): { id: string; x: number; y: number }[] {
    return [...this.bodies].map(([id, b]) => ({ id, x: b.position.x, y: b.position.y }));
  }

  get bounds(): { width: number; height: number } {
    return { width: this.opts.width, height: this.opts.height };
  }
}
