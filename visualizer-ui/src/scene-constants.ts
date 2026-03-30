// All shared game constants extracted from HudScene.ts.
// Import from this module to avoid circular dependencies between character modules.

export type ToolCatalogId = 'web_search' | 'content' | 'navigation' | 'interaction';

export type Pt = { x: number; y: number };
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type ParsedFinding = {
  severity: Severity;
  title: string;
  bodyLines: string[];
};

// ── World dimensions ──────────────────────────────────────────────────────────
export const WORLD_WIDTH  = 800;
export const WORLD_HEIGHT = 600;

// ── Agent spawn & movement ────────────────────────────────────────────────────
export const SPAWN_X        = 10;
export const SPAWN_Y        = 150;
export const WALK_SPEED     = 75;

export const DEFAULT_ZONE_X = 400;
export const DEFAULT_ZONE_Y = 400;

// ── Background / static images ────────────────────────────────────────────────
export const BG_KEY      = 'bg_beginning_fields';
export const PARSOMEN_KEY = 'parsomen';

// ── Main Character (MC) spritesheets ─────────────────────────────────────────
// main-char-sit-wait.png:          640×80  → 8 frames at 80×80
// main-char-walk.png:              480×80  → 6 frames at 80×80
// main-char-flying-navigation.png: 512×128 → 4 frames at 128×128
export const MC_SIT_KEY    = 'mc_sit_wait';
export const MC_WALK_KEY   = 'mc_walk';
export const MC_FLY_KEY    = 'mc_fly';
export const MC_SIT_FW     = 80;
export const MC_SIT_FH     = 80;
export const MC_WALK_FW    = 80;
export const MC_WALK_FH    = 80;
export const MC_FLY_FW     = 128;
export const MC_FLY_FH     = 128;
export const MC_SCALE      = 1.0;
export const MC_ANIM_SIT   = 'mc_anim_sit';
export const MC_ANIM_WALK  = 'mc_anim_walk';
export const MC_ANIM_FLY   = 'mc_anim_fly';
/** Idle/waiting home position for the main character. */
export const MC_HOME_X     = 350;
export const MC_HOME_Y     = 280;
/** Y offset for the head label above the container origin (feet). */
export const MC_LABEL_OFFSET_Y = -88;

// ── ForestMan (interaction_click tools) ──────────────────────────────────────
// forestmain-idle.png:     192×48  → 4 frames of 48×48
// forestman-walking.png:   288×48  → 6 frames of 48×48
// forestman-chopping.png:  1024×64 → 16 frames of 64×64
export const FM_IDLE_KEY  = 'fm_idle';
export const FM_WALK_KEY  = 'fm_walk';
export const FM_CHOP_KEY  = 'fm_chop';
export const FM_BASE_FW   = 48;
export const FM_BASE_FH   = 48;
export const FM_CHOP_FW   = 64;
export const FM_CHOP_FH   = 64;
export const FM_SCALE     = 1.6;
export const FM_ANIM_IDLE = 'fm_anim_idle';
export const FM_ANIM_WALK = 'fm_anim_walk';
export const FM_ANIM_CHOP = 'fm_anim_chop';
/** ForestMan resting position (forested area, bottom-left region). */
export const FM_HOME_X    = 401;
export const FM_HOME_Y    = 487;
export const FM_LABEL_OFFSET_Y = -52;

// ── Hero Tier Characters ──────────────────────────────────────────────────────
// All hero spritesheets: 1024×64 → 16 frames at 64×64
export const HERO_FW    = 64;
export const HERO_FH    = 64;
export const HERO_SCALE = 2.0;
export const HERO_LABEL_OFFSET_Y = -80;

// Batman home position (independent from MC_HOME)
export const BAT_HOME_X = 350;
export const BAT_HOME_Y = 280;
// Batman rope swing target position
export const BAT_ROPE_TARGET_X = 600;
export const BAT_ROPE_TARGET_Y = 180;

// Tier unlock thresholds (cumulative tools used)
export const HERO_TIER_THRESHOLDS = [0, 100, 250, 500] as const;

// Thor — Tier 1
export const THOR_ELECTRIC_KEY  = 'thor_electric';
export const THOR_JUMPING_KEY   = 'thor_jumping';
export const THOR_THROW_KEY     = 'thor_throw';
export const THOR_FLYING_KEY    = 'thor_flying';
export const THOR_FLY_FW        = 48;   // thor-flying.png: 768×48 → 16 frames of 48×48
export const THOR_FLY_FH        = 48;
export const THOR_ANIM_ELECTRIC = 'thor_anim_electric';
export const THOR_ANIM_JUMPING  = 'thor_anim_jumping';
export const THOR_ANIM_FLY      = 'thor_anim_fly';

/** 3 landing spots Thor cycles through on each navigation (stays there, never returns home). */
export const THOR_LANDING_SPOTS: Pt[] = [
  { x: 590, y: 195 },  // Spot A – upper centre-right
  { x: 670, y: 345 },  // Spot B – right side
  { x: 220, y: 400 },  // Spot C – left side
];

// GreyIronMan — Tier 2
export const GREY_SMOKE_KEY      = 'grey_smoke';
export const GREY_UP_FLY_KEY     = 'grey_up_fly';
export const GREY_CROSS_FLY_KEY  = 'grey_cross_fly';
export const GREY_ANIM_SMOKE     = 'grey_anim_smoke';
export const GREY_ANIM_UP_FLY    = 'grey_anim_up_fly';
export const GREY_ANIM_CROSS_FLY = 'grey_anim_cross_fly';

// Batman — Tier 3
export const BAT_BATMOBILE_KEY   = 'bat_batmobile';
export const BAT_THROW_ROPE_KEY  = 'bat_throw_rope';
export const BAT_PROJECTOR_KEY   = 'bat_projector';
export const BAT_ANIM_BATMOBILE  = 'bat_anim_batmobile';
export const BAT_ANIM_THROW_ROPE = 'bat_anim_throw_rope';
export const BAT_ANIM_PROJECTOR  = 'bat_anim_projector';

// ── Locked preview panels — bottom horizontal row ─────────────────────────────
export const LOCK_Y          = 548;   // vertical center for all 4 panels
export const LOCK_X_MC       = 160;   // MC (always unlocked)
export const LOCK_X_THOR     = 320;
export const LOCK_X_GREY     = 480;
export const LOCK_X_BATMAN   = 640;
export const LOCK_PANEL_W    = 95;
export const LOCK_PANEL_H    = 72;

// ── Soldier / Roaming Explorer NPC ───────────────────────────────────────────
// 100×100 px per frame, single-row sheets
export const SOLDIER_IDLE_KEY   = 'soldier_idle';
export const SOLDIER_WALK_KEY   = 'soldier_walk';
export const SOLDIER_ATTACK_KEY = 'soldier_attack';
export const SOLDIER_FRAME_W    = 100;
export const SOLDIER_FRAME_H    = 100;
export const SOLDIER_SCALE      = 0.65;

// ── Ranger (debug tools archer) ───────────────────────────────────────────────
// ranger-walking.png:       192×48 → 4 frames of 48×48
// ranger-throw-arrow.png:   320×256 → 5 cols × 4 rows of 64×64 (20 frames)
export const RANGER_WALK_KEY        = 'ranger_walk';
export const RANGER_THROW_KEY       = 'ranger_throw';
export const RANGER_WALK_FRAME_W    = 48;
export const RANGER_WALK_FRAME_H    = 48;
export const RANGER_THROW_FRAME_W   = 64;
export const RANGER_THROW_FRAME_H   = 64;
export const RANGER_SCALE           = 1.6;
// Ranger spawn and target positions
export const RANGER_START_X  = 460;
export const RANGER_START_Y  = 120;
export const RANGER_TARGET_X = 430;
export const RANGER_TARGET_Y = 190;
// Bug spawn position (ranger's target)
export const BUG_SPAWN_X = 490;
export const BUG_SPAWN_Y = 190;

// ── Painter (screenshot tools) ────────────────────────────────────────────────
// painter-walk.png:  288×48 → 6 frames of 48×48
// painter-paint.png: 1024×64 → 16 frames of 64×64
export const PAINTER_WALK_KEY       = 'painter_walk';
export const PAINTER_PAINT_KEY      = 'painter_paint';
export const PAINTER_WALK_FRAME_W   = 48;
export const PAINTER_WALK_FRAME_H   = 48;
export const PAINTER_PAINT_FRAME_W  = 64;
export const PAINTER_PAINT_FRAME_H  = 64;
export const PAINTER_ANIM_WALK      = 'painter_anim_walk';
export const PAINTER_ANIM_PAINT     = 'painter_anim_paint';
export const PAINTER_SCALE          = 1.5;
// Spawn and target positions
export const PAINTER_START_X        = 740;
export const PAINTER_START_Y        = 500;
export const PAINTER_TARGET_X       = 500;
export const PAINTER_TARGET_Y       = 500;

// ── Explorer (snapshot/a11y tools) ───────────────────────────────────────────
// explorer-walk.png:    288×48  → 6 frames of 48×48
// explorer-reading.png: 1024×64 → 16 frames of 64×64
// explorer-idle.png:    192×48  → 4 frames of 48×48
export const EXPLORER_WALK_KEY    = 'explorer_walk';
export const EXPLORER_READING_KEY = 'explorer_reading';
export const EXPLORER_IDLE_KEY    = 'explorer_idle';
export const EXPLORER_ANIM_WALK    = 'explorer_anim_walk';
export const EXPLORER_ANIM_READING = 'explorer_anim_reading';
export const EXPLORER_ANIM_IDLE    = 'explorer_anim_idle';
export const EXPLORER_WALK_FRAME_W    = 48;
export const EXPLORER_WALK_FRAME_H    = 48;
export const EXPLORER_READING_FRAME_W = 64;
export const EXPLORER_READING_FRAME_H = 64;
export const EXPLORER_IDLE_FRAME_W    = 48;
export const EXPLORER_IDLE_FRAME_H    = 48;
export const EXPLORER_SCALE           = 1.7;
// Target reading position (right-center of map)
export const EXPLORER_TARGET_X    = 680;
export const EXPLORER_TARGET_Y    = 540;
// Possible spawn points — one is chosen randomly per snapshot tool call
export const EXPLORER_SPAWN_POINTS: Pt[] = [
  { x: 690,  y: 175 },
  { x: 780, y: 200 },
  { x: 400, y: 560 },
  { x: 30,  y: 500 },
];

// ── Bug enemy (ranger's target) ───────────────────────────────────────────────
// bug-breath.png:            368×92  → 4 frames of 92×92
// bug-taking-arrow-punch.png:552×92  → 6 frames of 92×92
// bug-death.png:             512×128 → 4 frames of 128×128
export const BUG_BREATH_KEY      = 'bug_breath';
export const BUG_HIT_KEY         = 'bug_hit';
export const BUG_DEATH_KEY       = 'bug_death';
export const BUG_ALIVE_FRAME_W   = 92;
export const BUG_ALIVE_FRAME_H   = 92;
export const BUG_DEATH_FRAME_W   = 128;
export const BUG_DEATH_FRAME_H   = 128;
export const BUG_ANIM_BREATH     = 'bug_anim_breath';
export const BUG_ANIM_HIT        = 'bug_anim_hit';
export const BUG_ANIM_DEATH      = 'bug_anim_death';
export const BUG_SCALE           = 1.2;

// ── Text / pagination ──────────────────────────────────────────────────────────
export const MIN_ACTION_VISIBLE_MS        = 900;
export const NOTEBOOK_MAX_CHARS_PER_LINE  = 58;
export const NOTEBOOK_MAX_LINES_PER_PAGE  = 15;

// ── Wizard (content tool agent) ──────────────────────────────────────────────
// 320×256 sheet = 5 cols × 4 rows, 64×64 frames
export const WIZARD_SHEET_KEY  = 'wizard_sheet';
export const WIZARD_FRAME_W    = 64;
export const WIZARD_FRAME_H    = 64;
export const WIZARD_SCALE      = 1.0;
export const WIZARD_IDLE_ANIM  = 'wizard_idle';
export const WIZARD_WALK_ANIM  = 'wizard_walk';
export const WIZARD_CAST_ANIM  = 'wizard_cast';

// ── Campfire ──────────────────────────────────────────────────────────────────
export const CAMPFIRE_SHEET_KEY = 'campfire';
export const CAMPFIRE_FRAME_W   = 32;
export const CAMPFIRE_FRAME_H   = 32;

// ── Flowers ───────────────────────────────────────────────────────────────────
export const FLOWERS_RED_KEY   = 'flowers_red';
export const FLOWERS_WHITE_KEY = 'flowers_white';
export const FLOWER_FRAME_W    = 32;
export const FLOWER_FRAME_H    = 32;

// ── Tool zone map labels (currently empty — titles/subtitles disabled) ────────
export const TOOL_STORIES: Record<string, { title: string; subtitle: string }> = {};

// Final zone positions (destination of each tool-category path)
export const TOOL_ZONES: Record<ToolCatalogId, { x: number; y: number }> = {
  web_search:  { x: 170, y: 450 },
  content:     { x: 230, y: 500 },
  navigation:  { x: 340, y: 370 },
  interaction: { x: 630, y: 450 },
};

/** Main character navigation waypoints (navigation tools). */
export const HERO_NAVIGATION_WAYPOINTS: Pt[] = [
  { x: 320, y: 200 },
  { x: 630, y: 320 },
  { x: 730, y: 170 },
];

/** Main character click waypoints (interaction tools). */
export const HERO_CLICK_WAYPOINTS: Pt[] = [
  { x: 625, y: 210 },
  { x: 420, y: 470 },
  { x: 730, y: 170 },
];

// Zone paths for content wizard and other fallback agents
export const ZONE_PATHS: Record<ToolCatalogId, Pt[]> = {
  web_search: [{ x: 170, y: 450 }],
  content: [
    { x: 210, y: 470 },
    { x: 230, y: 500 },
  ],
  navigation:  HERO_NAVIGATION_WAYPOINTS,
  interaction: HERO_CLICK_WAYPOINTS,
};

export const CONTENT_AGENT_ID       = 'content-wizard';
export const CONTENT_WIZARD_HOME    = { x: 190, y: 320 };
export const CONTENT_TABLE_ENTRY: Pt = { x: 210, y: 330 };
export const CONTENT_TOOL_SEATS: Record<string, Pt> = {
  'content_get-as-html': { x: 225, y: 365 },
  'content_get-as-text': { x: 260, y: 390 },
  'content_save-as-pdf': { x: 225, y: 430 },
};

// Roaming Explorer NPC patrol route — loops around the full map
export const EXPLORER_PATROL: Pt[] = [
  { x: 150, y: 160 },
  { x: 320, y: 140 },
  { x: 530, y: 130 },
  { x: 680, y: 200 },
  { x: 650, y: 380 },
  { x: 450, y: 460 },
  { x: 250, y: 480 },
  { x: 110, y: 380 },
  { x: 120, y: 250 },
];
