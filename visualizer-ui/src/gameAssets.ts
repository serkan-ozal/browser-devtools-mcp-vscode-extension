/**
 * All game sprites/tilemaps imported as base64 data URLs via Vite's ?inline query.
 * This avoids any HTTP request at runtime, so assets load correctly
 * inside Cursor's MCP App iframe (which blocks cross-origin img-src).
 */

// Background tilemap
import bgPng from '../public/assets/browser-mcp-chars/Tiled/Tilemaps/Beginning Fields.png?inline';

// Main Character — new sprites (sit-wait, walk, fly, click)
import mcSitWaitPng from '../public/assets/browser-mcp-chars/Art/Characters/Main Character/main-char-sit-wait.png?inline';
import mcWalkPng    from '../public/assets/browser-mcp-chars/Art/Characters/Main Character/main-char-walk.png?inline';
import mcFlyPng     from '../public/assets/browser-mcp-chars/Art/Characters/Main Character/main-char-flying-navigation.png?inline';
import mcClickPng   from '../public/assets/browser-mcp-chars/Art/Characters/Main Character/main-char-click-button.png?inline';

// Soldier character — 100×100 px per frame, single-row spritesheets
import soldierIdlePng   from '../public/assets/browser-mcp-chars/Art/Characters/Characters(100x100)/Soldier/Soldier/Soldier-Idle.png?inline';
import soldierWalkPng   from '../public/assets/browser-mcp-chars/Art/Characters/Characters(100x100)/Soldier/Soldier/Soldier-Walk.png?inline';
import soldierAttackPng from '../public/assets/browser-mcp-chars/Art/Characters/Characters(100x100)/Soldier/Soldier/Soldier-Attack01.png?inline';
import wizardPng from '../public/assets/browser-mcp-chars/Art/Characters/Wizard/Wizard.png?inline';

// Ranger character for debug tools (walk + shoot)
import rangerWalkPng  from '../public/assets/browser-mcp-chars/Art/Characters/Ranger/ranger-walking.png?inline';
import rangerThrowPng from '../public/assets/browser-mcp-chars/Art/Characters/Ranger/ranger-throw-arrow.png?inline';

// Bug enemy for ranger target
import bugBreathPng from '../public/assets/browser-mcp-chars/Art/Characters/Bug/bug-breath.png?inline';
import bugHitPng    from '../public/assets/browser-mcp-chars/Art/Characters/Bug/bug-taking-arrow-punch.png?inline';
import bugDeathPng  from '../public/assets/browser-mcp-chars/Art/Characters/Bug/bug-death.png?inline';

// Explorer character for snapshot/a11y tools
import explorerWalkPng    from '../public/assets/browser-mcp-chars/Art/Characters/explorer/explorer-walk.png?inline';
import explorerReadingPng from '../public/assets/browser-mcp-chars/Art/Characters/explorer/explorer-reading.png?inline';
import explorerIdlePng    from '../public/assets/browser-mcp-chars/Art/Characters/explorer/explorer-idle.png?inline';

// Painter character for screenshot tools
import painterWalkPng  from '../public/assets/browser-mcp-chars/Art/Characters/Painter/painter-walk.png?inline';
import painterPaintPng from '../public/assets/browser-mcp-chars/Art/Characters/Painter/painter-paint.png?inline';

// ForestMan character — interaction_click tools
import forestManIdlePng    from '../public/assets/browser-mcp-chars/Art/Characters/ForestMan/forestmain-idle.png?inline';
import forestManWalkingPng from '../public/assets/browser-mcp-chars/Art/Characters/ForestMan/forestman-walking.png?inline';
import forestManChopPng    from '../public/assets/browser-mcp-chars/Art/Characters/ForestMan/forestman-chopping.png?inline';

// ── Hero Tier characters ─────────────────────────────────────────────────────
// Thor (Tier 1 — 10k tools): electric wait, flying nav, jumping landing
import thorElectricPng    from '../public/assets/browser-mcp-chars/Art/Characters/Thor/thor-electric.png?inline';
import thorJumpingPng     from '../public/assets/browser-mcp-chars/Art/Characters/Thor/thor-jumping.png?inline';
import thorThrowPng       from '../public/assets/browser-mcp-chars/Art/Characters/Thor/thor-throw-hammer.png?inline';
import thorFlyingPng      from '../public/assets/browser-mcp-chars/Art/Characters/Thor/thor-flying.png?inline';

// GreyIronMan (Tier 2 — 20k tools): smoke wait, up-fly + cross-fly nav
import greymanSmokePng    from '../public/assets/browser-mcp-chars/Art/Characters/Greyman/greyman-smoke.png?inline';
import greymanUpFlyPng    from '../public/assets/browser-mcp-chars/Art/Characters/Greyman/greyman-up-fly.png?inline';
import greymanCrossFlyPng from '../public/assets/browser-mcp-chars/Art/Characters/Greyman/greyman-cross-fly.png?inline';

// Batman (Tier 3 — 30k tools): batmobile wait (once), throw-rope + projector nav
import batmanBatmobilePng from '../public/assets/browser-mcp-chars/Art/Characters/Batman/batman-wait-batmobile.png?inline';
import batmanThrowRopePng from '../public/assets/browser-mcp-chars/Art/Characters/Batman/batman-cross-throw-rope.png?inline';
import batmanProjectorPng from '../public/assets/browser-mcp-chars/Art/Characters/Batman/batman-projector-logo.png?inline';

// Parchment scroll — result notebook background
import parsomenPng from '../public/assets/parsomen.png?inline';

// Animated props
import campfirePng     from '../public/assets/browser-mcp-chars/Art/Props/Animation/Animation_Campfire.png?inline';
import flowersRedPng   from '../public/assets/browser-mcp-chars/Art/Props/Animation/Flowers_Red.png?inline';
import flowersWhitePng from '../public/assets/browser-mcp-chars/Art/Props/Animation/Flowers_White.png?inline';

export const ASSET_BG = bgPng;
export const ASSET_MC_SIT_WAIT = mcSitWaitPng;
export const ASSET_MC_WALK     = mcWalkPng;
export const ASSET_MC_FLY      = mcFlyPng;
export const ASSET_MC_CLICK    = mcClickPng;

export const ASSET_WIZARD = wizardPng;
export const ASSET_RANGER_WALK = rangerWalkPng;
export const ASSET_RANGER_THROW = rangerThrowPng;
export const ASSET_BUG_BREATH = bugBreathPng;
export const ASSET_BUG_HIT = bugHitPng;
export const ASSET_BUG_DEATH = bugDeathPng;
export const ASSET_SOLDIER_IDLE   = soldierIdlePng;
export const ASSET_SOLDIER_WALK   = soldierWalkPng;
export const ASSET_SOLDIER_ATTACK = soldierAttackPng;
export const ASSET_EXPLORER_WALK    = explorerWalkPng;
export const ASSET_EXPLORER_READING = explorerReadingPng;
export const ASSET_EXPLORER_IDLE    = explorerIdlePng;
export const ASSET_PAINTER_WALK = painterWalkPng;
export const ASSET_PAINTER_PAINT = painterPaintPng;
export const ASSET_FOREST_MAN_IDLE    = forestManIdlePng;
export const ASSET_FOREST_MAN_WALKING = forestManWalkingPng;
export const ASSET_FOREST_MAN_CHOP    = forestManChopPng;
export const ASSET_PARSOMEN = parsomenPng;
export const ASSET_CAMPFIRE = campfirePng;
export const ASSET_FLOWERS_RED = flowersRedPng;
export const ASSET_FLOWERS_WHITE = flowersWhitePng;

// Hero tier assets
export const ASSET_THOR_ELECTRIC     = thorElectricPng;
export const ASSET_THOR_JUMPING      = thorJumpingPng;
export const ASSET_THOR_THROW        = thorThrowPng;
export const ASSET_THOR_FLYING       = thorFlyingPng;
export const ASSET_GREYMAN_SMOKE     = greymanSmokePng;
export const ASSET_GREYMAN_UP_FLY    = greymanUpFlyPng;
export const ASSET_GREYMAN_CROSS_FLY = greymanCrossFlyPng;
export const ASSET_BATMAN_BATMOBILE  = batmanBatmobilePng;
export const ASSET_BATMAN_THROW_ROPE = batmanThrowRopePng;
export const ASSET_BATMAN_PROJECTOR  = batmanProjectorPng;
