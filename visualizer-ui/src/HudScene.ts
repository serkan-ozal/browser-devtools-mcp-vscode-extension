import Phaser from 'phaser';
import type { AgentEvent } from './events';
import { eventQueue } from './eventQueue';
import type { AgentState, QueuedAction } from './agentState';
import {
  ASSET_BG,
  ASSET_SOLDIER_IDLE,
  ASSET_SOLDIER_WALK,
  ASSET_SOLDIER_ATTACK,
  ASSET_WIZARD,
  ASSET_PARSOMEN,
  ASSET_CAMPFIRE,
  ASSET_FLOWERS_RED,
  ASSET_FLOWERS_WHITE,
} from './gameAssets';
import {
  type ToolCatalog,
  DEFAULT_ZONES,
  getCatalogIdForTool,
  getZonePosition,
  loadToolCatalog,
} from './catalog';
import type { HudContext, CharId, TimerKey } from './HudContext';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SPAWN_X,
  SPAWN_Y,
  WALK_SPEED,
  DEFAULT_ZONE_X,
  DEFAULT_ZONE_Y,
  BG_KEY,
  PARSOMEN_KEY,
  MC_SIT_KEY,
  MC_WALK_KEY,
  MC_ANIM_SIT,
  MC_ANIM_WALK,
  MC_ANIM_FLY,
  MC_SCALE,
  MC_HOME_X,
  MC_HOME_Y,
  WIZARD_SHEET_KEY,
  WIZARD_FRAME_W,
  WIZARD_FRAME_H,
  WIZARD_SCALE,
  WIZARD_IDLE_ANIM,
  WIZARD_WALK_ANIM,
  WIZARD_CAST_ANIM,
  SOLDIER_IDLE_KEY,
  SOLDIER_WALK_KEY,
  SOLDIER_ATTACK_KEY,
  SOLDIER_FRAME_W,
  SOLDIER_FRAME_H,
  SOLDIER_SCALE,
  CAMPFIRE_SHEET_KEY,
  CAMPFIRE_FRAME_W,
  CAMPFIRE_FRAME_H,
  FLOWERS_RED_KEY,
  FLOWERS_WHITE_KEY,
  FLOWER_FRAME_W,
  FLOWER_FRAME_H,
  HERO_NAVIGATION_WAYPOINTS,
  HERO_CLICK_WAYPOINTS,
  ZONE_PATHS,
  TOOL_STORIES,
  TOOL_ZONES,
  CONTENT_AGENT_ID,
  CONTENT_WIZARD_HOME,
  CONTENT_TABLE_ENTRY,
  CONTENT_TOOL_SEATS,
  HERO_TIER_THRESHOLDS,
  MIN_ACTION_VISIBLE_MS,
  NOTEBOOK_MAX_CHARS_PER_LINE,
  NOTEBOOK_MAX_LINES_PER_PAGE,
  BUG_ANIM_BREATH,
  BUG_ANIM_DEATH,
  PAINTER_WALK_KEY,
  PAINTER_START_X,
  PAINTER_START_Y,
  EXPLORER_ANIM_IDLE,
  EXPLORER_SPAWN_POINTS,
  RANGER_START_X,
  RANGER_START_Y,
  type Pt,
  type Severity,
  type ParsedFinding,
  type ToolCatalogId,
} from './scene-constants';
import { ForestManCharacter } from './characters/ForestMan';
import { ExplorerCharacter } from './characters/Explorer';
import { PainterCharacter } from './characters/Painter';
import { RangerBugCharacter } from './characters/RangerBug';
import { MainCharacter } from './characters/MainCharacter';
import { HeroCharacter } from './characters/HeroCharacter';
import { ParchmentPanel } from './ui/ParchmentPanel';
import { LockedPreviews } from './ui/LockedPreviews';

export class HudScene extends Phaser.Scene implements HudContext {

  private connected = false;

  private catalog: ToolCatalog | null = null;
  private zones = DEFAULT_ZONES;
  private agents = new Map<string, AgentState>();
  private fireflies: Array<{ g: Phaser.GameObjects.Graphics; ox: number; oy: number; phase: number }> = [];

  /** Run finished state */
  private runFinished = false;
  private activeRunId: string | null = null;
  private overlayPages: string[] = [];
  private overlayMetaLines: string[] = [];
  private overlayTitle = '[ MCP RUN RESULT ]';
  private overlayPageIndex = 0;
  private overlayGroup: Phaser.GameObjects.GameObject[] = [];

  /** Banner shown after run completes while disconnected. */
  private waitingBanner: Phaser.GameObjects.Text | null = null;

  /** Total tool usage count (from WS hello) — drives hero unlock tiers. */
  private totalToolsUsed = 0;
  /** 0 = default MC, 1 = Thor, 2 = GreyIronMan, 3 = Batman — max unlocked tier. */
  private heroTier = 0;
  /** Manually selected active character. Defaults to 'mc', auto-switches on first unlock. */
  private selectedCharacter: CharId = 'mc';

  private static readonly CHAR_STORAGE_KEY = 'browser-devtools-mcp:selectedChar';

  private saveCharSelection(char: CharId): void {
    try { localStorage.setItem(HudScene.CHAR_STORAGE_KEY, char); } catch { /* ignore */ }
  }

  private loadCharSelection(): CharId | null {
    try {
      const v = localStorage.getItem(HudScene.CHAR_STORAGE_KEY);
      if (v === 'mc' || v === 'thor' || v === 'grey' || v === 'batman') return v as CharId;
    } catch { /* ignore */ }
    return null;
  }
  /** Small HUD label showing total tools used (bottom-right). */
  private toolCountText: Phaser.GameObjects.Text | null = null;

  /** Whether the agent-response parchment is currently visible. */
  private parchRespVisible = false;

  /** Minimum character action display time. */
  private readonly MIN_ACTION_DISPLAY_MS = 4000;
  private mcStopTimer:       ReturnType<typeof setTimeout> | null = null;
  private painterStopTimer:  ReturnType<typeof setTimeout> | null = null;
  private explorerStopTimer: ReturnType<typeof setTimeout> | null = null;
  private rangerStopTimer:   ReturnType<typeof setTimeout> | null = null;
  private fmStopTimer:       ReturnType<typeof setTimeout> | null = null;
  /** True when the last click tool was interaction_click/browser_click — routes stop to MC/hero. */
  private lastClickWasNav = false;

  /** True while a nav/click tool that drives the hero is still active (started but not yet stopped). */
  private heroNavActive = false;
  /** Tool name of the currently active hero navigation, if any. */
  private heroNavToolName: string | undefined = undefined;

  // ── Character modules ─────────────────────────────────────────────────────
  private forestMan!: ForestManCharacter;
  private explorer!: ExplorerCharacter;
  private painter!: PainterCharacter;
  private rangerBug!: RangerBugCharacter;
  private mainChar!: MainCharacter;
  private heroChar!: HeroCharacter;

  // ── UI modules ────────────────────────────────────────────────────────────
  private parchmentPanel!: ParchmentPanel;
  private lockedPreviews!: LockedPreviews;

  constructor() {
    super({ key: 'HudScene' });
  }

  // ── HudContext interface implementation ───────────────────────────────────

  isRunFinished(): boolean { return this.runFinished; }
  getSelectedCharacter(): CharId { return this.selectedCharacter; }
  getHeroTier(): number { return this.heroTier; }
  isParchRespVisible(): boolean { return this.parchRespVisible; }

  scheduleStop(key: TimerKey, startTs: number, fn: () => void): void {
    if (this[key] !== null) { clearTimeout(this[key]!); this[key] = null; }
    const elapsed = Date.now() - startTs;
    const delay   = Math.max(0, this.MIN_ACTION_DISPLAY_MS - elapsed);
    if (delay === 0) { fn(); return; }
    this[key] = setTimeout(() => { this[key] = null; fn(); }, delay);
  }

  cancelStopTimer(key: TimerKey): void {
    if (this[key] !== null) { clearTimeout(this[key]!); this[key] = null; }
  }

  // ── Phaser lifecycle ──────────────────────────────────────────────────────

  preload(): void {
    // Initialize modules here so they exist before their preload() methods are called.
    // (Phaser calls preload() before create(), so we cannot initialize in create().)
    this.forestMan   = new ForestManCharacter(this, this);
    this.explorer    = new ExplorerCharacter(this, this);
    this.painter     = new PainterCharacter(this, this);
    this.rangerBug   = new RangerBugCharacter(this, this);
    this.mainChar    = new MainCharacter(
      this, this,
      (toolName) => this.heroChar.startNavigation(toolName),
      ()         => this.heroChar.stopAction(),
    );
    this.heroChar    = new HeroCharacter(this, this);
    this.parchmentPanel = new ParchmentPanel(
      this,
      this,
      () => { this.parchRespVisible = true;  this.lockedPreviews.refresh(); },
      () => { this.parchRespVisible = false; this.lockedPreviews.refresh(); },
    );
    this.lockedPreviews = new LockedPreviews(this, this, (char) => this.selectCharacter(char));

    this.load.image(BG_KEY, ASSET_BG);
    this.load.image(PARSOMEN_KEY, ASSET_PARSOMEN);

    this.load.spritesheet(WIZARD_SHEET_KEY, ASSET_WIZARD, { frameWidth: WIZARD_FRAME_W, frameHeight: WIZARD_FRAME_H });
    this.load.spritesheet(SOLDIER_IDLE_KEY,   ASSET_SOLDIER_IDLE,   { frameWidth: SOLDIER_FRAME_W, frameHeight: SOLDIER_FRAME_H });
    this.load.spritesheet(SOLDIER_WALK_KEY,   ASSET_SOLDIER_WALK,   { frameWidth: SOLDIER_FRAME_W, frameHeight: SOLDIER_FRAME_H });
    this.load.spritesheet(SOLDIER_ATTACK_KEY, ASSET_SOLDIER_ATTACK, { frameWidth: SOLDIER_FRAME_W, frameHeight: SOLDIER_FRAME_H });
    this.load.spritesheet(CAMPFIRE_SHEET_KEY, ASSET_CAMPFIRE, { frameWidth: CAMPFIRE_FRAME_W, frameHeight: CAMPFIRE_FRAME_H });
    this.load.spritesheet(FLOWERS_RED_KEY,   ASSET_FLOWERS_RED,   { frameWidth: FLOWER_FRAME_W, frameHeight: FLOWER_FRAME_H });
    this.load.spritesheet(FLOWERS_WHITE_KEY, ASSET_FLOWERS_WHITE, { frameWidth: FLOWER_FRAME_W, frameHeight: FLOWER_FRAME_H });

    // Delegate to character modules
    this.forestMan.preload();
    this.explorer.preload();
    this.painter.preload();
    this.rangerBug.preload();
    this.mainChar.preload();
    this.heroChar.preload();
  }

  private createHeroAnims(): void {
    if (!this.anims.exists(WIZARD_IDLE_ANIM)) {
      this.anims.create({ key: WIZARD_IDLE_ANIM, frames: this.anims.generateFrameNumbers(WIZARD_SHEET_KEY, { start: 0, end: 4 }), frameRate: 6, repeat: -1 });
    }
    if (!this.anims.exists(WIZARD_WALK_ANIM)) {
      this.anims.create({ key: WIZARD_WALK_ANIM, frames: this.anims.generateFrameNumbers(WIZARD_SHEET_KEY, { start: 5, end: 9 }), frameRate: 10, repeat: -1 });
    }
    if (!this.anims.exists(WIZARD_CAST_ANIM)) {
      this.anims.create({ key: WIZARD_CAST_ANIM, frames: this.anims.generateFrameNumbers(WIZARD_SHEET_KEY, { start: 10, end: 14 }), frameRate: 10, repeat: -1 });
    }
    if (!this.anims.exists('soldier_idle')) {
      this.anims.create({ key: 'soldier_idle',   frames: this.anims.generateFrameNumbers(SOLDIER_IDLE_KEY,   { start: 0, end: 5 }), frameRate: 6,  repeat: -1 });
    }
    if (!this.anims.exists('soldier_walk')) {
      this.anims.create({ key: 'soldier_walk',   frames: this.anims.generateFrameNumbers(SOLDIER_WALK_KEY,   { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    }
    if (!this.anims.exists('soldier_attack')) {
      this.anims.create({ key: 'soldier_attack', frames: this.anims.generateFrameNumbers(SOLDIER_ATTACK_KEY, { start: 0, end: 5 }), frameRate: 10, repeat: -1 });
    }

    // Delegate animation registration to character modules
    this.forestMan.createAnimations();
    this.explorer.createAnimations();
    this.painter.createAnimations();
    this.rangerBug.createAnimations();
    this.mainChar.createAnimations();
    this.heroChar.createAnimations();
  }

  async create(): Promise<void> {
    // Title label
    this.add
      .text(WORLD_WIDTH / 2, 16, 'TOOLS OF EMPIRE', {
        fontSize: '24px',
        color: '#474747',
      })
      .setOrigin(0.5, 0)
      .setDepth(200);

    this.createHeroAnims();
    this.createBackground();
    this.createToolZones();
    this.createMapDecorations();
    this.createCampfire();
    this.createFlowers();

    this.catalog = await loadToolCatalog();

    // Create characters that are always present
    this.mainChar.create();
    this.forestMan.create();
    this.lockedPreviews.create();

    // If hello message arrived before create() resolved, apply hero tier now
    if (this.heroTier > 0) {
      this.heroChar.spawn(() => {
        const container = this.mainChar.getContainer();
        if (container) container.setVisible(false);
      });
    }

    // Arrow key character selection
    this.input.keyboard?.on('keydown-LEFT',  () => { this.lockedPreviews.cycle(-1); });
    this.input.keyboard?.on('keydown-RIGHT', () => { this.lockedPreviews.cycle(+1); });

    // Total tools used HUD label (bottom-right)
    this.toolCountText = this.add.text(WORLD_WIDTH - 8, WORLD_HEIGHT - 10, 'tools: 0', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#aaaaaa',
    });
    this.toolCountText.setOrigin(1, 1);
    this.toolCountText.setDepth(200);
  }

  update(): void {
    if (this.runFinished) {
      const item = eventQueue.shift();
      if (item) this.handleEvent(item.event as AgentEvent);
      return;
    }

    this.updateFireflies(this.time.now);
    const item = eventQueue.shift();
    if (item) {
      this.handleEvent(item.event as AgentEvent);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Called once on WS hello — sets total tool count and resolves hero tier.
   *  Pass autoSelect=false to unlock panels without switching away from MC.
   *  savedChar comes from the server-side stats.json. */
  setTotalToolsUsed(count: number, autoSelect = true, savedChar?: string): void {
    this.totalToolsUsed = count;
    if (this.toolCountText) this.toolCountText.setText(`tools: ${count}`);
    const newTier = count >= HERO_TIER_THRESHOLDS[3] ? 3
                  : count >= HERO_TIER_THRESHOLDS[2] ? 2
                  : count >= HERO_TIER_THRESHOLDS[1] ? 1
                  : 0;
    const tierChanged = newTier !== this.heroTier;
    this.heroTier = newTier;

    if (tierChanged) {
      if (newTier > 0) {
        if (autoSelect) {
          // Required tier for the currently selected character
          const currentCharTier = this.selectedCharacter === 'mc'   ? 0
                                : this.selectedCharacter === 'thor'  ? 1
                                : this.selectedCharacter === 'grey'  ? 2
                                : 3;
          // Only auto-select when no valid hero is already chosen by the user
          const shouldAutoSelect = currentCharTier === 0 || currentCharTier > newTier;
          if (shouldAutoSelect) {
            // Prefer server-side saved char, fall back to localStorage, then default
            const serverSaved = (savedChar === 'thor' || savedChar === 'grey' || savedChar === 'batman') ? savedChar as CharId : null;
            const localSaved  = this.loadCharSelection();
            const saved       = serverSaved ?? localSaved;
            const savedTier   = saved === 'thor' ? 1 : saved === 'grey' ? 2 : saved === 'batman' ? 3 : 0;
            const charToSelect = (saved && saved !== 'mc' && savedTier <= newTier)
              ? saved
              : (newTier === 1 ? 'thor' : newTier === 2 ? 'grey' : 'batman');

            this.selectedCharacter = charToSelect;
            this.heroChar.spawn(() => {
              const container = this.mainChar.getContainer();
              if (container) container.setVisible(false);
            });
          } else if (!this.heroChar.getSprite()) {
            // Hero was selected but sprite is missing (e.g. after extension restart) — re-spawn
            this.heroChar.spawn(() => {
              const container = this.mainChar.getContainer();
              if (container) container.setVisible(false);
            });
          }
        }
      } else {
        this.selectedCharacter = 'mc';
        this.heroChar.destroy();
        const container = this.mainChar.getContainer();
        if (container) container.setVisible(true);
      }
      this.lockedPreviews.refresh();
    }
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    if (!connected && this.runFinished) {
      this.showWaitingBanner();
    } else if (connected) {
      this.hideWaitingBanner();
    }
  }

  // ── Background & decorations ──────────────────────────────────────────────

  /** Scale the background image to fill the 800×600 canvas. */
  private createBackground(): void {
    const bg = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, BG_KEY);
    bg.setOrigin(0.5, 0.5);
    bg.setDepth(-5);

    const tex    = this.textures.get(BG_KEY);
    const source = tex.getSourceImage() as HTMLImageElement;
    const w      = source?.width ?? WORLD_WIDTH;
    const h      = source?.height ?? WORLD_HEIGHT;
    const scale  = Math.max(WORLD_WIDTH / w, WORLD_HEIGHT / h);
    bg.setScale(scale);
  }

  /** Render zone labels for each MCP tool category. */
  private createToolZones(): void {
    (Object.keys(TOOL_STORIES) as ToolCatalogId[]).forEach((catalogId) => {
      const story = TOOL_STORIES[catalogId];
      const zone  = TOOL_ZONES[catalogId] ?? getZonePosition(this.zones, catalogId, DEFAULT_ZONE_X, DEFAULT_ZONE_Y);

      const marker = this.add.graphics();
      marker.setDepth(-1);
      marker.fillStyle(0x000000, 0.25);
      marker.fillCircle(zone.x, zone.y, 26);

      this.add
        .text(zone.x, zone.y + 22, `${story.title}\n${story.subtitle}`, {
          fontSize: '13px',
          color: '#ecf0f1',
          align: 'center',
        })
        .setOrigin(0.5, 0)
        .setDepth(0);
    });
  }

  /** Create softly animated fireflies across the map. */
  private createMapDecorations(): void {
    const fireflyCount = 10;
    for (let i = 0; i < fireflyCount; i++) {
      const g  = this.add.graphics();
      g.setDepth(0);
      const ox = Phaser.Math.Between(50, WORLD_WIDTH - 50);
      const oy = Phaser.Math.Between(80, WORLD_HEIGHT - 80);
      this.fireflies.push({ g, ox, oy, phase: Math.random() * Math.PI * 2 });
    }
  }

  /** Animated campfire sprite positioned over the map's fire pit. */
  private createCampfire(): void {
    if (!this.anims.exists('campfire_burn')) {
      this.anims.create({
        key: 'campfire_burn',
        frames: this.anims.generateFrameNumbers(CAMPFIRE_SHEET_KEY, { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    // Coordinates aligned to the campfire object in the TMX tilemap
    const campfireX = 340;
    const campfireY = 520;
    const fire = this.add.sprite(campfireX, campfireY, CAMPFIRE_SHEET_KEY, 0);
    fire.setOrigin(0.5, 1);
    fire.setScale(1.3);
    fire.setDepth(1);
    fire.play('campfire_burn');
  }

  /** Animated red and white flower sprites scattered around the map. */
  private createFlowers(): void {
    if (!this.anims.exists('flowers_red_loop')) {
      this.anims.create({
        key: 'flowers_red_loop',
        frames: this.anims.generateFrameNumbers(FLOWERS_RED_KEY, { frames: [0, 6, 12, 18, 24, 30, 36, 42] }),
        frameRate: 8,
        repeat: -1,
      });
    }
    if (!this.anims.exists('flowers_white_loop')) {
      this.anims.create({
        key: 'flowers_white_loop',
        frames: this.anims.generateFrameNumbers(FLOWERS_WHITE_KEY, { frames: [0, 6, 12, 18, 24, 30, 36, 42] }),
        frameRate: 10,
        repeat: -1,
      });
    }

    const redPositions = [
      { x: 210, y: 80  },
      { x: 520, y: 135 },
    ];
    const whitePositions = [
      { x: 390, y: 140 },
    ];

    redPositions.forEach((pos) => {
      const s = this.add.sprite(pos.x, pos.y, FLOWERS_RED_KEY, 0);
      s.setOrigin(0.5, 1);
      s.setScale(1.2);
      s.setDepth(0);
      s.play('flowers_red_loop');
    });

    whitePositions.forEach((pos) => {
      const s = this.add.sprite(pos.x, pos.y, FLOWERS_WHITE_KEY, 0);
      s.setOrigin(0.5, 1);
      s.setScale(1.2);
      s.setDepth(0);
      s.play('flowers_white_loop');
    });
  }

  private updateFireflies(time: number): void {
    const radius = 2;
    for (const ff of this.fireflies) {
      const x     = ff.ox + Math.sin(time * 0.001 + ff.phase) * 40;
      const y     = ff.oy + Math.cos(time * 0.0008 + ff.phase * 1.1) * 30;
      const alpha = 0.4 + Math.sin(time * 0.003 + ff.phase * 2) * 0.35;
      ff.g.clear();
      ff.g.fillStyle(0xf1c40f, alpha);
      ff.g.fillCircle(x, y, radius);
    }
  }

  // ── Waiting banner ────────────────────────────────────────────────────────

  private showWaitingBanner(): void {
    if (this.waitingBanner) return;
    this.waitingBanner = this.add.text(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT - 24,
      '⏳ Waiting for next run…',
      {
        fontSize: '13px',
        fontFamily: '"Courier New", Courier, monospace',
        color: '#c8a96e',
        backgroundColor: '#0a0a0a',
        padding: { x: 12, y: 4 },
      }
    );
    this.waitingBanner.setOrigin(0.5, 1);
    this.waitingBanner.setDepth(60);
  }

  private hideWaitingBanner(): void {
    if (this.waitingBanner) {
      this.waitingBanner.destroy();
      this.waitingBanner = null;
    }
  }

  // ── Agent management ──────────────────────────────────────────────────────

  /** Spawn a new MCP agent into the scene. */
  private spawnAgent(agentId: string): void {
    if (this.agents.has(agentId)) return;

    if (agentId === CONTENT_AGENT_ID) {
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.26);
      shadow.fillEllipse(0, 4, 30, 10);

      const wizardSprite = this.add.sprite(0, 0, WIZARD_SHEET_KEY, 0);
      wizardSprite.setOrigin(0.5, 1);
      wizardSprite.setScale(WIZARD_SCALE);
      wizardSprite.play(WIZARD_IDLE_ANIM);

      const container = this.add.container(CONTENT_WIZARD_HOME.x, CONTENT_WIZARD_HOME.y, [shadow, wizardSprite]);
      container.setDepth(10);

      const headLabel = this.add.text(0, -74, 'Content Tool', {
        fontSize: '11px',
        color: '#e6f7ff',
        backgroundColor: '#1d3557',
        padding: { x: 6, y: 2 },
        align: 'center',
      });
      headLabel.setOrigin(0.5, 1);
      container.add(headLabel);

      const state: AgentState = {
        container,
        heroSprite: wizardSprite,
        headLabel,
        walkTween: null,
        actionTween: null,
        finishTimer: null,
        actionStartedAtMs: 0,
        pendingFinishes: 0,
        currentToolName: undefined,
        animationQueue: [],
        state: 'idle',
      };
      this.agents.set(agentId, state);
      return;
    }

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.30);
    shadow.fillEllipse(0, 4, 36, 12);

    const heroSprite = this.add.sprite(0, 0, MC_SIT_KEY, 0);
    heroSprite.setOrigin(0.5, 1);
    heroSprite.setScale(MC_SCALE);
    heroSprite.play(MC_ANIM_SIT);

    const headLabel = this.add.text(0, -74, '', {
      fontSize: '11px',
      color: '#ecf0f1',
      backgroundColor: '#2c3e50',
      padding: { x: 6, y: 2 },
      align: 'center',
    });
    headLabel.setOrigin(0.5, 1);
    const container = this.add.container(SPAWN_X, SPAWN_Y, [shadow, heroSprite, headLabel]);
    container.setDepth(10);

    const state: AgentState = {
      container,
      heroSprite,
      headLabel,
      walkTween: null,
      actionTween: null,
      finishTimer: null,
      actionStartedAtMs: 0,
      pendingFinishes: 0,
      currentToolName: undefined,
      animationQueue: [],
      state: 'idle',
    };
    this.agents.set(agentId, state);
  }

  /**
   * Walk an agent along a list of waypoints at constant speed.
   * Duration per segment is calculated from distance.
   */
  private walkPath(agentId: string, waypoints: Pt[], onDone: () => void): void {
    const agent = this.agents.get(agentId);
    if (!agent || waypoints.length === 0) { onDone(); return; }

    if (agent.headLabel) agent.headLabel.setText('Walking');

    const step = (idx: number): void => {
      if (idx >= waypoints.length) { onDone(); return; }
      const wp   = waypoints[idx];
      const dist = Phaser.Math.Distance.Between(agent.container.x, agent.container.y, wp.x, wp.y);
      const dur  = Math.max(200, (dist / WALK_SPEED) * 1000);
      agent.heroSprite.setFlipX(wp.x < agent.container.x);

      agent.walkTween = this.tweens.add({
        targets: agent.container,
        x: wp.x,
        y: wp.y,
        duration: dur,
        ease: 'Linear',
        onComplete: () => {
          agent.walkTween = null;
          step(idx + 1);
        },
      });
    };
    step(0);
  }

  // ── Per-agent animation queue ─────────────────────────────────────────────

  /**
   * Drain the per-agent animation queue:
   * tool_started → walk to zone, play action animation;
   * tool_finished → return to idle.
   */
  private processQueue(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent || agent.state !== 'idle') return;

    const item = agent.animationQueue.shift();
    if (!item) return;
    agent.currentToolName = item.toolName;

    agent.state = 'walking';
    if (agent.walkTween) { agent.walkTween.stop(); agent.walkTween = null; }

    const isContentWizard = agentId === CONTENT_AGENT_ID;
    agent.heroSprite.play(isContentWizard ? WIZARD_WALK_ANIM : MC_ANIM_WALK, true);

    const path = isContentWizard
      ? this.getContentPathForTool(item.toolName)
      : item.catalogId === 'navigation'
        ? HERO_NAVIGATION_WAYPOINTS
        : item.catalogId === 'interaction'
          ? HERO_CLICK_WAYPOINTS
          : (ZONE_PATHS[item.catalogId as ToolCatalogId] ?? [item.zone]);
    this.walkPath(agentId, path, () => {
      agent.state = 'acting';
      this.startActionAnimation(agentId);
    });
  }

  private startActionAnimation(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    if (agentId === CONTENT_AGENT_ID) {
      if (agent.headLabel) agent.headLabel.setText(this.getContentHeadText(agent.currentToolName ?? ''));
      agent.heroSprite.play(WIZARD_CAST_ANIM, true);
    } else {
      const toolName  = agent.currentToolName ?? '';
      const isNavTool = toolName.startsWith('navigation_');
      const isClick   = toolName.startsWith('interaction_');
      if (agent.headLabel) {
        if (isNavTool) agent.headLabel.setText('Navigating');
        else if (isClick) agent.headLabel.setText('Clicked');
        else agent.headLabel.setText('');
      }
      agent.heroSprite.play(MC_ANIM_FLY, true);
    }
    agent.actionStartedAtMs = Date.now();
    if (agent.pendingFinishes > 0) {
      agent.pendingFinishes -= 1;
      this.requestStopAction(agentId);
    }
  }

  private stopActionAnimation(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    if (agent.actionTween)  { agent.actionTween.stop();       agent.actionTween  = null; }
    if (agent.finishTimer)  { agent.finishTimer.remove(false); agent.finishTimer  = null; }

    if (agentId === CONTENT_AGENT_ID) {
      agent.heroSprite.play(WIZARD_IDLE_ANIM, true);
      if (agent.headLabel) agent.headLabel.setText('Content Tool');
      // Reset to home so the wizard walks out again on next call
      agent.container.setPosition(CONTENT_WIZARD_HOME.x, CONTENT_WIZARD_HOME.y);
    } else {
      agent.heroSprite.play(MC_ANIM_SIT, true);
      if (agent.headLabel) agent.headLabel.setText('');
    }
    agent.heroSprite.setFlipX(false);
    agent.actionStartedAtMs = 0;
    agent.currentToolName   = undefined;
    agent.state             = 'idle';
    this.processQueue(agentId);
  }

  private requestStopAction(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    if (agent.state !== 'acting') {
      agent.pendingFinishes += 1;
      return;
    }

    const elapsed = Date.now() - agent.actionStartedAtMs;
    const waitMs  = Math.max(0, MIN_ACTION_VISIBLE_MS - elapsed);

    if (waitMs === 0) {
      this.stopActionAnimation(agentId);
      return;
    }

    if (agent.finishTimer) return;
    agent.finishTimer = this.time.delayedCall(waitMs, () => {
      agent.finishTimer = null;
      this.stopActionAnimation(agentId);
    });
  }

  private resetAgent(agentId: string, agent: AgentState): void {
    if (agent.walkTween)   { agent.walkTween.stop();          agent.walkTween   = null; }
    if (agent.actionTween) { agent.actionTween.stop();        agent.actionTween = null; }
    if (agent.finishTimer) { agent.finishTimer.remove(false); agent.finishTimer = null; }
    agent.pendingFinishes  = 0;
    agent.currentToolName  = undefined;
    agent.animationQueue   = [];
    agent.state            = 'idle';
    agent.actionStartedAtMs = 0;
    if (agentId === CONTENT_AGENT_ID) {
      agent.container.setPosition(CONTENT_WIZARD_HOME.x, CONTENT_WIZARD_HOME.y);
      agent.heroSprite.play(WIZARD_IDLE_ANIM, true);
      if (agent.headLabel) agent.headLabel.setText('Content Tool');
    } else {
      agent.container.setPosition(SPAWN_X, SPAWN_Y);
      agent.heroSprite.play(MC_ANIM_SIT, true);
      if (agent.headLabel) agent.headLabel.setText('');
    }
    agent.heroSprite.setFlipX(false);
  }

  // ── Run result overlay ────────────────────────────────────────────────────

  /** Freeze all animations and show the parchment run-result overlay. */
  private showRunResultOverlay(result: unknown, overrideTitle?: string): void {
    this.runFinished = true;

    if (this.mainChar['tween']) { (this.mainChar['tween'] as Phaser.Tweens.Tween).stop(); (this.mainChar as unknown as Record<string, unknown>)['tween'] = null; }

    this.tweens.pauseAll();
    this.anims.pauseAll();
    this.agents.forEach((agent) => { if (agent.heroSprite) agent.heroSprite.anims.pause(); });

    this.clearOverlay();

    const { title, metaLines, pages } = this.buildNotebookResult(result);
    this.overlayTitle      = overrideTitle ?? title;
    this.overlayMetaLines  = metaLines;
    this.overlayPages      = pages;
    this.overlayPageIndex  = 0;

    this.renderOverlayPage();
  }

  private renderOverlayPage(): void {
    const previousObjects = this.overlayGroup.slice();
    this.overlayGroup     = [];

    const D           = 52;
    const displayText = this.overlayPages[this.overlayPageIndex] ?? 'Run complete.';
    const theme       = this.getOverlayTheme(displayText);

    // Dark backdrop
    const bg = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x0d0a06, 0.88);
    bg.setDepth(D);
    this.overlayGroup.push(bg);

    // Parchment scroll image
    const PARCH_W = 560;
    const PARCH_H = 500;
    const PARCH_X = WORLD_WIDTH  / 2;
    const PARCH_Y = WORLD_HEIGHT / 2 + 5;

    const parchment = this.add.image(PARCH_X, PARCH_Y, PARSOMEN_KEY);
    parchment.setDisplaySize(PARCH_W, PARCH_H);
    parchment.setDepth(D + 1);
    this.overlayGroup.push(parchment);

    // Writable area bounds (rollers ~15% top/bottom; side margins ~10% each)
    const WA_LEFT  = PARCH_X - PARCH_W * 0.38;
    const WA_WIDTH = PARCH_W * 0.76;
    const WA_TOP   = PARCH_Y - PARCH_H * 0.33;
    const WA_BOT   = PARCH_Y + PARCH_H * 0.34;

    // Title
    const titleObj = this.add.text(PARCH_X, WA_TOP + 14, this.overlayTitle, {
      fontSize: '13px',
      fontFamily: '"Courier New", Courier, monospace',
      color: '#3d1f00',
      fontStyle: 'bold',
    });
    titleObj.setOrigin(0.5, 0);
    titleObj.setDepth(D + 3);
    this.overlayGroup.push(titleObj);

    // Status badge
    const badgeBg = this.add.rectangle(PARCH_X, WA_TOP + 40, 120, 18, theme.badgeColor, 0.85);
    badgeBg.setDepth(D + 3);
    this.overlayGroup.push(badgeBg);

    const badgeTxt = this.add.text(PARCH_X, WA_TOP + 40, theme.badgeText, {
      fontSize: '9px',
      fontFamily: '"Courier New", Courier, monospace',
      color: '#fff8ee',
      fontStyle: 'bold',
    });
    badgeTxt.setOrigin(0.5, 0.5);
    badgeTxt.setDepth(D + 4);
    this.overlayGroup.push(badgeTxt);

    // Meta info (small, right-aligned)
    const metaTxt = this.add.text(WA_LEFT + WA_WIDTH - 4, WA_TOP + 32, this.overlayMetaLines.join('  '), {
      fontSize: '9px',
      fontFamily: '"Courier New", Courier, monospace',
      color: '#7a5025',
      align: 'right',
    });
    metaTxt.setOrigin(1, 0);
    metaTxt.setDepth(D + 3);
    this.overlayGroup.push(metaTxt);

    // Decorative divider
    const divGfx = this.add.graphics();
    divGfx.lineStyle(1, 0x9b7a3a, 0.6);
    divGfx.beginPath();
    divGfx.moveTo(WA_LEFT + 12,              WA_TOP + 56);
    divGfx.lineTo(WA_LEFT + WA_WIDTH - 12,  WA_TOP + 56);
    divGfx.strokePath();
    divGfx.setDepth(D + 3);
    this.overlayGroup.push(divGfx);

    // Content text
    const contentTopY = WA_TOP + 64;
    const contentBotY = WA_BOT - 34;
    const contentH    = contentBotY - contentTopY;

    const contentBg = this.add.rectangle(
      WA_LEFT + WA_WIDTH / 2,
      contentTopY + contentH / 2,
      WA_WIDTH - 4,
      contentH,
      0xf8e8c0,
      0.28,
    );
    contentBg.setDepth(D + 2);
    this.overlayGroup.push(contentBg);

    const content = this.add.text(WA_LEFT + 8, contentTopY, displayText, {
      fontSize: '11px',
      fontFamily: '"Courier New", Courier, monospace',
      color: '#2c1a08',
      align: 'left',
      lineSpacing: 6,
      wordWrap: { width: WA_WIDTH - 16 },
    });
    content.setOrigin(0, 0);
    content.setDepth(D + 3);
    this.overlayGroup.push(content);

    // Page label
    const bottomBarY = WA_BOT - 18;

    const pageLabel = this.add.text(
      WA_LEFT + 4, bottomBarY,
      `Page ${this.overlayPageIndex + 1} / ${Math.max(this.overlayPages.length, 1)}`,
      { fontSize: '10px', fontFamily: '"Courier New", Courier, monospace', color: '#6b4f21' },
    );
    pageLabel.setOrigin(0, 0.5);
    pageLabel.setDepth(D + 4);
    this.overlayGroup.push(pageLabel);

    // Prev / Next buttons
    if (this.overlayPages.length > 1) {
      this.overlayGroup.push(...this.createOverlayButtonObjects(
        PARCH_X + 40, bottomBarY,
        '< Prev', this.overlayPageIndex > 0, () => this.flipOverlayPage(-1),
      ));
      this.overlayGroup.push(...this.createOverlayButtonObjects(
        PARCH_X + 120, bottomBarY,
        'Next >', this.overlayPageIndex < this.overlayPages.length - 1, () => this.flipOverlayPage(1),
      ));
    }

    // Done stamp
    const stamp = this.add.text(WA_LEFT + WA_WIDTH - 8, bottomBarY, '✓ DONE', {
      fontSize: '13px',
      fontFamily: '"Courier New", Courier, monospace',
      color: theme.stampColor,
      fontStyle: 'bold',
    });
    stamp.setOrigin(1, 0.5);
    stamp.setAngle(-10);
    stamp.setDepth(D + 4);
    this.overlayGroup.push(stamp);

    this.destroyOverlayObjects(previousObjects);
  }

  private flipOverlayPage(direction: -1 | 1): void {
    const nextIndex = this.overlayPageIndex + direction;
    if (nextIndex < 0 || nextIndex >= this.overlayPages.length) return;
    this.overlayPageIndex = nextIndex;
    this.renderOverlayPage();
  }

  private getOverlayTheme(displayText: string): {
    badgeText: string;
    badgeColor: number;
    stampColor: string;
  } {
    const upper = displayText.toUpperCase();
    if (this.overlayTitle.includes('FLOW VERIFICATION') && this.overlayPageIndex === 0) {
      if (upper.includes('FAIL')) {
        return { badgeText: 'FAIL', badgeColor: 0x9f2d22, stampColor: '#8f241a' };
      }
      if (upper.includes('WITH ISSUES') || upper.includes('ISSUES')) {
        return { badgeText: 'PASS WITH ISSUES', badgeColor: 0xc77d16, stampColor: '#9d6a12' };
      }
      return { badgeText: 'PASS', badgeColor: 0x2e7d32, stampColor: '#2e7d32' };
    }
    if (upper.includes('[CRITICAL]')) {
      return { badgeText: 'CRITICAL', badgeColor: 0xb3261e, stampColor: '#962017' };
    }
    if (upper.includes('[HIGH]')) {
      return { badgeText: 'HIGH', badgeColor: 0xc96a13, stampColor: '#a75910' };
    }
    if (upper.includes('[MEDIUM]')) {
      return { badgeText: 'MEDIUM', badgeColor: 0xa77b12, stampColor: '#8c650f' };
    }
    if (upper.includes('[LOW]')) {
      return { badgeText: 'LOW', badgeColor: 0x486c8a, stampColor: '#3d5c76' };
    }
    return { badgeText: 'RESULT', badgeColor: 0x8b6914, stampColor: '#1a7a3c' };
  }

  private createOverlayButtonObjects(x: number, y: number, label: string, enabled: boolean, onClick: () => void): Phaser.GameObjects.GameObject[] {
    const bg = this.add.rectangle(x, y, 64, 24, enabled ? 0x8b6914 : 0xc4b28a, 1);
    bg.setDepth(57);
    const text = this.add.text(x, y, label, {
      fontSize: '10px',
      fontFamily: '"Courier New", Courier, monospace',
      color: enabled ? '#fff7e6' : '#8c7a56',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(58);

    if (!enabled) return [bg, text];
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    return [bg, text];
  }

  private destroyOverlayObjects(objects: Phaser.GameObjects.GameObject[]): void {
    for (const obj of objects) {
      if (obj && typeof (obj as Phaser.GameObjects.GameObject & { destroy?: () => void }).destroy === 'function') {
        (obj as Phaser.GameObjects.GameObject & { destroy: () => void }).destroy();
      }
    }
  }

  private buildNotebookResult(result: unknown): {
    title: string;
    metaLines: string[];
    pages: string[];
  } {
    const rawText      = this.stringifyNotebookResult(result);
    const parsedReport = this.tryParseQaReport(rawText);
    const pages        = parsedReport
      ? this.buildQaPages(parsedReport.findings, parsedReport.statusLine, parsedReport.summaryLine)
      : this.paginateNotebookText(rawText);
    const lineCount  = rawText.split('\n').length;
    const metaLines  = [
      `Type: ${parsedReport ? 'qa_report' : this.describeResultType(result)}`,
      `Lines: ${lineCount}`,
      `Chars: ${rawText.length}`,
      `Pages: ${pages.length}`,
    ];
    return {
      title: parsedReport ? '[ FLOW VERIFICATION REPORT ]' : '[ MCP RUN RESULT ]',
      metaLines,
      pages,
    };
  }

  private stringifyNotebookResult(result: unknown): string {
    if (typeof result === 'string') {
      return result.trim() || 'Run complete.';
    }
    if (result == null) {
      return 'Run complete.';
    }
    if (typeof result === 'object') {
      const candidate = result as {
        content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
        payload?: unknown;
      };
      const contentText = Array.isArray(candidate.content)
        ? candidate.content
          .map((item) => {
            if (typeof item?.text === 'string' && item.text.trim()) {
              return item.text.trim();
            }
            if (item?.type === 'image') {
              return '[image output]';
            }
            return null;
          })
          .filter((item): item is string => item != null)
          .join('\n\n')
        : '';
      if (contentText) {
        return contentText;
      }
      return JSON.stringify(result, null, 2) ?? 'Run complete.';
    }
    return String(result);
  }

  private describeResultType(result: unknown): string {
    if (Array.isArray(result)) return 'array';
    if (result === null) return 'null';
    return typeof result;
  }

  private paginateNotebookText(text: string): string[] {
    const wrappedLines = text
      .split('\n')
      .flatMap((line) => this.wrapNotebookLine(line, NOTEBOOK_MAX_CHARS_PER_LINE));
    const pages: string[] = [];
    for (let i = 0; i < wrappedLines.length; i += NOTEBOOK_MAX_LINES_PER_PAGE) {
      pages.push(wrappedLines.slice(i, i + NOTEBOOK_MAX_LINES_PER_PAGE).join('\n'));
    }
    return pages.length > 0 ? pages : ['Run complete.'];
  }

  private wrapNotebookLine(line: string, maxChars: number): string[] {
    if (line.length <= maxChars) return [line];
    const parts: string[] = [];
    let remaining = line;
    while (remaining.length > maxChars) {
      const slice   = remaining.slice(0, maxChars + 1);
      const breakAt = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\t'));
      const idx     = breakAt > Math.floor(maxChars * 0.5) ? breakAt : maxChars;
      parts.push(remaining.slice(0, idx).trimEnd());
      remaining = remaining.slice(idx).trimStart();
    }
    parts.push(remaining);
    return parts;
  }

  private tryParseQaReport(text: string): {
    statusLine: string | null;
    summaryLine: string | null;
    findings: ParsedFinding[];
  } | null {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return null;
    const hasSeverityWords    = /\bCritical\b|\bHigh\b|\bMedium\b|\bLow\b/i.test(normalized);
    const hasVerificationTitle = /verification/i.test(normalized);
    if (!hasSeverityWords && !hasVerificationTitle) return null;

    const lines      = normalized.split('\n').map((line) => line.trimEnd());
    const statusLine  = lines.find((line) => /\bPASS\b|\bFAIL\b|\bissues\b/i.test(line)) ?? null;
    const summaryLine = lines.find((line) => /core flow|end-to-end|works/i.test(line)) ?? null;

    const findings: ParsedFinding[] = [];
    const severityMap: Record<string, Severity> = {
      critical: 'critical',
      high:     'high',
      medium:   'medium',
      low:      'low',
    };

    let currentSeverity: Severity | null = null;
    let currentFinding: ParsedFinding | null = null;

    const pushCurrentFinding = (): void => {
      if (currentFinding) {
        currentFinding.bodyLines = currentFinding.bodyLines.filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''));
        findings.push(currentFinding);
        currentFinding = null;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line === '---') {
        if (currentFinding && currentFinding.bodyLines[currentFinding.bodyLines.length - 1] !== '') {
          currentFinding.bodyLines.push('');
        }
        continue;
      }

      const severityHeader = line.toLowerCase();
      if (severityHeader in severityMap) {
        pushCurrentFinding();
        currentSeverity = severityMap[severityHeader];
        continue;
      }

      const findingMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (findingMatch && currentSeverity) {
        pushCurrentFinding();
        currentFinding = {
          severity: currentSeverity,
          title:    findingMatch[2].trim(),
          bodyLines: [],
        };
        continue;
      }

      if (currentFinding) {
        currentFinding.bodyLines.push(line.startsWith('- ') ? `Observed: ${line.slice(2).trim()}` : line);
      }
    }
    pushCurrentFinding();

    return findings.length > 0 ? { statusLine, summaryLine, findings } : null;
  }

  private buildQaPages(findings: ParsedFinding[], statusLine: string | null, summaryLine: string | null): string[] {
    const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low'];
    const counts = severityOrder.map((severity) =>
      `${severity[0].toUpperCase() + severity.slice(1)}: ${findings.filter((item) => item.severity === severity).length}`
    );
    const pages: string[] = [];

    const summaryLines = [
      statusLine ?? 'Verification report',
      summaryLine ?? 'Structured findings detected',
      '',
      `Findings: ${findings.length}`,
      ...counts,
    ];
    pages.push(this.paginateNotebookText(summaryLines.join('\n'))[0] ?? 'Verification report');

    const findingsPerPage = 2;
    for (let i = 0; i < findings.length; i += findingsPerPage) {
      const chunk    = findings.slice(i, i + findingsPerPage);
      const pageText = chunk
        .map((finding, idx) => {
          const absoluteIndex = i + idx + 1;
          const sectionLines  = [
            `[${finding.severity.toUpperCase()}] ${absoluteIndex}. ${finding.title}`,
            ...finding.bodyLines,
          ];
          return sectionLines.join('\n');
        })
        .join('\n\n');
      pages.push(...this.paginateNotebookText(pageText));
    }

    return pages.length > 0 ? pages : this.paginateNotebookText('Verification report');
  }

  private clearOverlay(): void {
    for (const obj of this.overlayGroup) {
      if (obj && typeof (obj as Phaser.GameObjects.GameObject & { destroy?: () => void }).destroy === 'function') {
        (obj as Phaser.GameObjects.GameObject & { destroy: () => void }).destroy();
      }
    }
    this.overlayGroup = [];
  }

  private resetOverlayState(): void {
    this.clearOverlay();
    this.overlayPages      = [];
    this.overlayMetaLines  = [];
    this.overlayTitle      = '[ MCP RUN RESULT ]';
    this.overlayPageIndex  = 0;
  }

  // ── Agent response parchment ──────────────────────────────────────────────

  /**
   * Show the agent response parchment.
   * Sends all characters back to their starting positions before displaying.
   */
  private showAgentResponse(responseText: string): void {
    // Return all characters to starting positions
    this.cancelStopTimer('mcStopTimer');
    this.mainChar.stopAction();

    this.cancelStopTimer('fmStopTimer');
    this.forestMan.stopChop();

    // Reset ranger + bug
    this.rangerBug.reset();

    // Reset painter
    this.painter.reset();

    // Reset explorer
    this.cancelStopTimer('explorerStopTimer');
    const spawn = EXPLORER_SPAWN_POINTS[0];
    this.explorer.reset(spawn);

    // Return content wizard to home
    this.requestStopAction(CONTENT_AGENT_ID);

    // Show parchment
    this.parchmentPanel.show(responseText);
  }

  private clearParchmentResp(): void {
    this.parchmentPanel.cancelAndClear();
  }

  /** Schedule the agent response parchment to appear after an 8-second delay. */
  private scheduleAgentResponse(responseText: string): void {
    this.parchmentPanel.scheduleShow(responseText);
  }

  // ── Character selection ───────────────────────────────────────────────────

  /** Switch the active playing character (only works for unlocked chars). */
  private selectCharacter(char: CharId): void {
    const requiredTier = char === 'mc' ? 0 : char === 'thor' ? 1 : char === 'grey' ? 2 : 3;
    if (requiredTier > this.heroTier) return;
    if (this.selectedCharacter === char) return;

    this.selectedCharacter = char;
    this.saveCharSelection(char);
    try {
      const send = (window as unknown as Record<string, unknown>)['sendCharToServer'] as ((c: string) => void) | undefined;
      send?.(char);
    } catch { /* ignore */ }

    if (char === 'mc') {
      this.heroChar.destroy();
      const container = this.mainChar.getContainer();
      if (container) container.setVisible(true);
    } else {
      const container = this.mainChar.getContainer();
      if (container) container.setVisible(false);
      this.heroChar.spawn(() => {
        const c = this.mainChar.getContainer();
        if (c) c.setVisible(false);
      });
      // If a nav/click tool is still running, resume the hero animation immediately.
      if (this.heroNavActive) {
        this.heroChar.startNavigation(this.heroNavToolName);
      }
    }

    this.lockedPreviews.refresh();
  }

  // ── Visual state reset ────────────────────────────────────────────────────

  private resetRunVisualState(runId: string | null): void {
    this.heroNavActive = false;
    this.heroNavToolName = undefined;
    this.resetOverlayState();
    this.clearParchmentResp();
    this.tweens.resumeAll();
    this.anims.resumeAll();
    this.agents.forEach((agent, agentId) => this.resetAgent(agentId, agent));

    this.cancelStopTimer('mcStopTimer');
    this.cancelStopTimer('painterStopTimer');
    this.cancelStopTimer('explorerStopTimer');
    this.cancelStopTimer('rangerStopTimer');
    this.cancelStopTimer('fmStopTimer');

    this.forestMan.reset();
    this.rangerBug.reset();
    this.painter.reset();

    const spawn = EXPLORER_SPAWN_POINTS[0];
    this.explorer.reset(spawn);

    // Instantly return main/hero character to home
    if (this.selectedCharacter !== 'mc') {
      const heroSprite = this.heroChar.getSprite();
      const heroLabel  = this.heroChar.getLabel();
      this.heroChar['navigating'] = false;
      const heroTween = this.heroChar['tween'] as Phaser.Tweens.Tween | null;
      if (heroTween) { heroTween.stop(); (this.heroChar as unknown as Record<string, unknown>)['tween'] = null; }
      if (heroSprite) {
        heroSprite.off('animationcomplete');
        heroSprite.setPosition(MC_HOME_X, MC_HOME_Y);
        this.heroChar.idleAnim();
      }
      if (heroLabel) heroLabel.setText(this.heroChar.getName());
    } else {
      this.mainChar.reset();
    }

    for (let i = eventQueue.length - 1; i >= 0; i--) {
      const queued = eventQueue[i]?.event as { runId?: unknown } | undefined;
      if (queued?.runId && queued.runId !== runId) {
        eventQueue.splice(i, 1);
      }
    }
  }

  // ── Tool routing helpers ──────────────────────────────────────────────────

  private isMainHeroNavigationTool(toolName: string): boolean {
    // All interaction_* except interaction_click (which goes to ForestMan)
    if (toolName.startsWith('interaction_') && toolName !== 'interaction_click') return true;
    return toolName.startsWith('navigation_') ||
           toolName === 'browser_navigate' ||
           toolName === 'browser_go_back' ||
           toolName === 'browser_go_forward' ||
           toolName === 'browser_reload' ||
           toolName === 'browser_new_tab' ||
           toolName === 'browser_close_tab' ||
           toolName === 'browser_switch_tab' ||
           toolName === 'browser_press_key' ||
           toolName === 'browser_handle_dialog' ||
           toolName === 'browser_wait_for' ||
           toolName === 'browser_drag' ||
           toolName === 'browser_hover' ||
           toolName === 'browser_select_option' ||
           toolName === 'browser_fill' ||
           toolName === 'browser_type' ||
           toolName === 'browser_scroll' ||
           toolName === 'execute';
  }

  private isMainHeroClickTool(toolName: string): boolean {
    return toolName === 'interaction_click' ||
           toolName === 'browser_click';
  }

  /** Returns true when a tool output contains embedded ARIA/snapshot data. */
  private outputContainsSnapshot(output: string): boolean {
    if (!output) return false;
    // ARIA tree markers produced by a11y_take-aria-snapshot
    return output.includes('[ref=') ||
           output.includes('aria-snapshot') ||
           output.includes('- Page URL:') ||
           output.includes('- heading') ||
           output.includes('- button') ||
           output.includes('- link ');
  }

  /** Returns true when a click tool output suggests the click triggered a page navigation. */
  private clickCausedNavigation(output: string): boolean {
    if (!output) return false;
    const lower = output.toLowerCase();
    // Common patterns in Playwright / Browser DevTools MCP navigation output
    return lower.includes('page url:') ||
           lower.includes('navigated to') ||
           lower.includes('navigation') ||
           lower.includes('url changed') ||
           /https?:\/\//.test(output);
  }

  private getContentHeadText(toolName: string): string {
    if (toolName.startsWith('content_get-as-html')) return 'Getting Html';
    if (toolName.startsWith('content_save-as-pdf')) return 'Saving Pdf';
    if (toolName.startsWith('content_get-as-text')) return 'Getting Text';
    return 'Content Tool';
  }

  private getContentPathForTool(toolName: string): Pt[] {
    const seat =
      CONTENT_TOOL_SEATS[toolName] ??
      (toolName.startsWith('content_get-as-html')
        ? CONTENT_TOOL_SEATS['content_get-as-html']
        : toolName.startsWith('content_get-as-text')
          ? CONTENT_TOOL_SEATS['content_get-as-text']
          : toolName.startsWith('content_save-as-pdf')
            ? CONTENT_TOOL_SEATS['content_save-as-pdf']
            : CONTENT_TOOL_SEATS['content_get-as-text']);
    return [CONTENT_TABLE_ENTRY, seat];
  }

  // ── Main event router ─────────────────────────────────────────────────────

  /** Translate MCP events into scene animations. */
  private handleEvent(ev: AgentEvent): void {
    const agentId = (ev as { agentId?: string }).agentId ?? 'agent-1';

    if (ev.type === 'run_started') {
      this.hideWaitingBanner();
      this.parchmentPanel.cancelAndClear();
      this.activeRunId  = ev.runId ?? null;
      this.runFinished  = false;
      this.resetRunVisualState(this.activeRunId);
      return;
    }

    if (ev.type === 'agent_response') {
      const responseText = (ev as { responseText?: unknown }).responseText;
      if (typeof responseText === 'string' && responseText.trim()) {
        this.scheduleAgentResponse(responseText);
      }
      return;
    }

    if (ev.type === 'run_done') {
      // Overlay is no longer shown — agent_response parchment is sufficient.
      if (this.activeRunId && ev.runId === this.activeRunId) {
        this.activeRunId = null;
      }
      return;
    }

    if (ev.type === 'agent_spawned') {
      this.spawnAgent(agentId);
      return;
    }

    if (ev.type === 'tool_started') {
      const toolName = (ev as { toolName?: string }).toolName as string | undefined;
      if (!toolName) return;

      // Handle missed run_started or tools arriving after a finished run
      if (!this.activeRunId || this.runFinished) {
        const newRunId = (ev as { runId?: string }).runId ?? null;
        this.activeRunId  = newRunId;
        this.runFinished  = false;
        this.resetRunVisualState(newRunId);
      }

      const isContentTool    = toolName.startsWith('content_') || toolName.startsWith('o11y_');
      const isDebugTool      = toolName.startsWith('debug_');
      const isScreenshotTool = toolName === 'content_take-screenshot' ||
                               toolName === 'browser_take_screenshot' ||
                               toolName === 'browser_screenshot';
      const isSnapshotTool   = (toolName.startsWith('a11y_') && toolName.includes('snapshot')) ||
                               toolName === 'browser_snapshot' ||
                               toolName === 'browser_highlight' ||
                               toolName === 'browser_get_bounding_box';
      const isClickTool      = this.isMainHeroClickTool(toolName);
      const isNavTool        = this.isMainHeroNavigationTool(toolName);

      // Screenshot tool → Painter
      if (isScreenshotTool) {
        this.cancelStopTimer('painterStopTimer');
        this.painter.actionStartTs = Date.now();
        this.painter.startScreenshot(toolName);
        return;
      }

      // Snapshot/a11y tool → Explorer
      if (isSnapshotTool) {
        this.cancelStopTimer('explorerStopTimer');
        this.explorer.actionStartTs = Date.now();
        this.explorer.startSnapshot(toolName);
        return;
      }

      // interaction_click / browser_click → ForestMan
      if (isClickTool) {
        this.cancelStopTimer('fmStopTimer');
        this.forestMan.actionStartTs = Date.now();
        this.forestMan.startChop(toolName);
        return;
      }

      // Navigation tool → MC / hero navigation
      if (isNavTool) {
        this.heroNavActive = true;
        this.heroNavToolName = toolName;
        this.cancelStopTimer('mcStopTimer');
        this.mainChar.actionStartTs = Date.now();
        this.mainChar.startNavigation(toolName);
        return;
      }

      // Debug tools → Ranger
      if (!isContentTool) {
        if (isDebugTool) {
          this.cancelStopTimer('rangerStopTimer');
          this.rangerBug.actionStartTs = Date.now();
          if (this.rangerBug.bugAliveSprite) { this.rangerBug.bugAliveSprite.setVisible(true); this.rangerBug.bugAliveSprite.play(BUG_ANIM_BREATH, true); }
          if (this.rangerBug.bugDeadSprite)  { this.rangerBug.bugDeadSprite.setVisible(false); }
          if (this.rangerBug.bugDeathLabel)  { this.rangerBug.bugDeathLabel.setVisible(false); }
          this.rangerBug.startRangerDebug(toolName);
        }
        return;
      }

      // Content / o11y tools → content wizard agent
      const targetAgentId = CONTENT_AGENT_ID;
      if (!this.agents.has(targetAgentId)) this.spawnAgent(targetAgentId);
      const agent = this.agents.get(targetAgentId);
      if (!agent) return;

      const catalogId   = 'content';
      const zoneOverride = TOOL_ZONES[catalogId];
      const zone         = zoneOverride ?? getZonePosition(this.zones, catalogId, DEFAULT_ZONE_X, DEFAULT_ZONE_Y);

      const queued: QueuedAction = { toolName, catalogId, zone };
      agent.animationQueue.push(queued);
      this.processQueue(targetAgentId);
      return;
    }

    if (ev.type === 'tool_finished') {
      const toolName         = (ev as { toolName?: string }).toolName as string | undefined;
      const isContentTool    = !!toolName && (toolName.startsWith('content_') || toolName.startsWith('o11y_'));
      const isNavTool        = !!toolName && this.isMainHeroNavigationTool(toolName);
      const isClickTool      = !!toolName && this.isMainHeroClickTool(toolName);
      const isDebugTool      = !!toolName && toolName.startsWith('debug_');
      const isScreenshotTool = toolName === 'content_take-screenshot' ||
                               toolName === 'browser_take_screenshot' ||
                               toolName === 'browser_screenshot';
      const isSnapshotTool   = (!!toolName && toolName.startsWith('a11y_') && toolName.includes('snapshot')) ||
                               toolName === 'browser_snapshot' ||
                               toolName === 'browser_highlight' ||
                               toolName === 'browser_get_bounding_box';

      if (isScreenshotTool) {
        this.scheduleStop('painterStopTimer', this.painter.actionStartTs, () => this.painter.stopScreenshot());
      } else if (isSnapshotTool) {
        this.scheduleStop('explorerStopTimer', this.explorer.actionStartTs, () => this.explorer.stopSnapshot());
      } else if (isClickTool) {
        // Always stop ForestMan after a click
        this.scheduleStop('fmStopTimer', this.forestMan.actionStartTs, () => this.forestMan.stopChop());
        // Additionally, if the click caused a page navigation, also trigger hero navigation
        const output = String((ev as { output?: unknown }).output ?? '');
        if (this.clickCausedNavigation(output)) {
          this.heroNavActive = true;
          this.heroNavToolName = toolName;
          this.cancelStopTimer('mcStopTimer');
          this.mainChar.actionStartTs = Date.now();
          this.mainChar.startNavigation(toolName);
          this.scheduleStop('mcStopTimer', Date.now(), () => {
            this.heroNavActive = false;
            this.heroNavToolName = undefined;
            this.mainChar.stopAction();
          });
        }
      } else if (isNavTool) {
        this.scheduleStop('mcStopTimer', this.mainChar.actionStartTs, () => {
          this.heroNavActive = false;
          this.heroNavToolName = undefined;
          this.mainChar.stopAction();
        });
        // If nav/execute output contains embedded ARIA snapshot data, also trigger Explorer
        const navOutput = String((ev as { output?: unknown }).output ?? '');
        if (this.outputContainsSnapshot(navOutput)) {
          this.cancelStopTimer('explorerStopTimer');
          this.explorer.actionStartTs = Date.now();
          this.explorer.startSnapshot(toolName ?? 'a11y_take-aria-snapshot');
          this.scheduleStop('explorerStopTimer', this.explorer.actionStartTs, () => this.explorer.stopSnapshot());
        }
      } else {
        if (isContentTool) {
          this.requestStopAction(CONTENT_AGENT_ID);
        }
        if (isDebugTool) {
          this.scheduleStop('rangerStopTimer', this.rangerBug.actionStartTs, () => {
            this.rangerBug.stopShootTimer();
            if (this.rangerBug.bugAliveSprite) { this.rangerBug.bugAliveSprite.setVisible(false); }
            if (this.rangerBug.bugDeadSprite)  { this.rangerBug.bugDeadSprite.setVisible(true); this.rangerBug.bugDeadSprite.play(BUG_ANIM_DEATH, true); }
            if (this.rangerBug.bugDeathLabel)  { this.rangerBug.bugDeathLabel.setVisible(true); }
          });
        }
      }
    }
  }
}
