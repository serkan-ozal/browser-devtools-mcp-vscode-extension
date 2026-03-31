import Phaser from 'phaser';
import type { HudContext } from '../HudContext';
import type { CharId } from '../HudContext';
import {
  ASSET_THOR_ELECTRIC,
  ASSET_THOR_JUMPING,
  ASSET_THOR_THROW,
  ASSET_THOR_FLYING,
  ASSET_GREYMAN_SMOKE,
  ASSET_GREYMAN_UP_FLY,
  ASSET_GREYMAN_CROSS_FLY,
  ASSET_BATMAN_BATMOBILE,
  ASSET_BATMAN_THROW_ROPE,
  ASSET_BATMAN_PROJECTOR,
} from '../gameAssets';
import {
  HERO_FW,
  HERO_FH,
  HERO_SCALE,
  BAT_HERO_SCALE,
  HERO_LABEL_OFFSET_Y,
  MC_HOME_X,
  MC_HOME_Y,
  BAT_HOME_X,
  BAT_HOME_Y,
  WALK_SPEED,
  THOR_ELECTRIC_KEY,
  THOR_JUMPING_KEY,
  THOR_THROW_KEY,
  THOR_FLYING_KEY,
  THOR_FLY_FW,
  THOR_FLY_FH,
  THOR_ANIM_ELECTRIC,
  THOR_ANIM_JUMPING,
  THOR_ANIM_FLY,
  THOR_LANDING_SPOTS,
  GREY_SMOKE_KEY,
  GREY_UP_FLY_KEY,
  GREY_CROSS_FLY_KEY,
  GREY_ANIM_SMOKE,
  GREY_ANIM_UP_FLY,
  GREY_ANIM_TAKEOFF,
  GREY_ANIM_LAND,
  GREY_ANIM_CROSS_FLY,
  GREY_LANDING_SPOTS,
  BAT_BATMOBILE_KEY,
  BAT_THROW_ROPE_KEY,
  BAT_PROJECTOR_KEY,
  BAT_ANIM_BATMOBILE,
  BAT_ANIM_THROW_ROPE,
  BAT_ANIM_PROJECTOR,
  BAT_LANDING_SPOTS,
} from '../scene-constants';

/** Tier-based hero character (Thor, GreyIronMan, or Batman). */
export class HeroCharacter {
  sprite: Phaser.GameObjects.Sprite | null = null;
  label: Phaser.GameObjects.Text | null = null;
  navigating = false;
  tween: Phaser.Tweens.Tween | null = null;
  /** Index of the next Thor landing spot (cycles 0→1→2→0…). */
  private thorLandingIdx = 0;
  /** Index of the next GreyIronMan landing spot. */
  private greyLandingIdx = 0;
  /** Index of the next Batman landing spot. */
  private batLandingIdx = 0;

  constructor(
    private scene: Phaser.Scene,
    private ctx: HudContext,
  ) {}

  preload(): void {
    this.scene.load.spritesheet(THOR_ELECTRIC_KEY,  ASSET_THOR_ELECTRIC,  { frameWidth: HERO_FW,    frameHeight: HERO_FH    });
    this.scene.load.spritesheet(THOR_JUMPING_KEY,   ASSET_THOR_JUMPING,   { frameWidth: HERO_FW,    frameHeight: HERO_FH    });
    this.scene.load.spritesheet(THOR_THROW_KEY,     ASSET_THOR_THROW,     { frameWidth: HERO_FW,    frameHeight: HERO_FH    });
    this.scene.load.spritesheet(THOR_FLYING_KEY,    ASSET_THOR_FLYING,    { frameWidth: THOR_FLY_FW, frameHeight: THOR_FLY_FH });
    this.scene.load.spritesheet(GREY_SMOKE_KEY,     ASSET_GREYMAN_SMOKE,     { frameWidth: HERO_FW, frameHeight: HERO_FH });
    this.scene.load.spritesheet(GREY_UP_FLY_KEY,    ASSET_GREYMAN_UP_FLY,    { frameWidth: HERO_FW, frameHeight: HERO_FH });
    this.scene.load.spritesheet(GREY_CROSS_FLY_KEY, ASSET_GREYMAN_CROSS_FLY, { frameWidth: HERO_FW, frameHeight: HERO_FH });
    this.scene.load.spritesheet(BAT_BATMOBILE_KEY,  ASSET_BATMAN_BATMOBILE,  { frameWidth: HERO_FW, frameHeight: HERO_FH });
    this.scene.load.spritesheet(BAT_THROW_ROPE_KEY, ASSET_BATMAN_THROW_ROPE, { frameWidth: HERO_FW, frameHeight: HERO_FH });
    this.scene.load.spritesheet(BAT_PROJECTOR_KEY,  ASSET_BATMAN_PROJECTOR,  { frameWidth: HERO_FW, frameHeight: HERO_FH });
  }

  createAnimations(): void {
    if (!this.scene.anims.exists(THOR_ANIM_ELECTRIC)) {
      this.scene.anims.create({ key: THOR_ANIM_ELECTRIC, frames: this.scene.anims.generateFrameNumbers(THOR_ELECTRIC_KEY, { start: 0, end: 15 }), frameRate: 12, repeat: -1 });
    }
    if (!this.scene.anims.exists(THOR_ANIM_JUMPING)) {
      this.scene.anims.create({ key: THOR_ANIM_JUMPING,  frames: this.scene.anims.generateFrameNumbers(THOR_JUMPING_KEY,  { start: 0, end: 15 }), frameRate: 12, repeat: 0  });
    }
    if (!this.scene.anims.exists(THOR_ANIM_FLY)) {
      this.scene.anims.create({ key: THOR_ANIM_FLY,      frames: this.scene.anims.generateFrameNumbers(THOR_FLYING_KEY,   { start: 0, end: 15 }), frameRate: 14, repeat: -1 });
    }
    if (!this.scene.anims.exists('thor_anim_throw')) {
      this.scene.anims.create({ key: 'thor_anim_throw',  frames: this.scene.anims.generateFrameNumbers(THOR_THROW_KEY,    { start: 0, end: 15 }), frameRate: 12, repeat: 0  });
    }
    if (!this.scene.anims.exists(GREY_ANIM_SMOKE)) {
      this.scene.anims.create({ key: GREY_ANIM_SMOKE,     frames: this.scene.anims.generateFrameNumbers(GREY_SMOKE_KEY,     { start: 0, end: 15 }), frameRate: 10, repeat: -1 });
    }
    if (!this.scene.anims.exists(GREY_ANIM_UP_FLY)) {
      this.scene.anims.create({ key: GREY_ANIM_UP_FLY,  frames: this.scene.anims.generateFrameNumbers(GREY_UP_FLY_KEY, { start: 0, end: 15 }), frameRate: 12, repeat: 0 });
    }
    if (!this.scene.anims.exists(GREY_ANIM_TAKEOFF)) {
      this.scene.anims.create({ key: GREY_ANIM_TAKEOFF, frames: this.scene.anims.generateFrameNumbers(GREY_UP_FLY_KEY, { start: 0, end: 7  }), frameRate: 10, repeat: 0 });
    }
    if (!this.scene.anims.exists(GREY_ANIM_LAND)) {
      this.scene.anims.create({ key: GREY_ANIM_LAND,    frames: this.scene.anims.generateFrameNumbers(GREY_UP_FLY_KEY, { start: 8, end: 15 }), frameRate: 10, repeat: 0 });
    }
    if (!this.scene.anims.exists(GREY_ANIM_CROSS_FLY)) {
      this.scene.anims.create({ key: GREY_ANIM_CROSS_FLY, frames: this.scene.anims.generateFrameNumbers(GREY_CROSS_FLY_KEY, { start: 0, end: 15 }), frameRate: 12, repeat: -1 });
    }
    if (!this.scene.anims.exists(BAT_ANIM_BATMOBILE)) {
      this.scene.anims.create({ key: BAT_ANIM_BATMOBILE,  frames: this.scene.anims.generateFrameNumbers(BAT_BATMOBILE_KEY,  { start: 0, end: 15 }), frameRate: 10, repeat: 0  });
    }
    if (!this.scene.anims.exists(BAT_ANIM_THROW_ROPE)) {
      this.scene.anims.create({ key: BAT_ANIM_THROW_ROPE, frames: this.scene.anims.generateFrameNumbers(BAT_THROW_ROPE_KEY, { start: 0, end: 15 }), frameRate: 12, repeat: 0  });
    }
    if (!this.scene.anims.exists(BAT_ANIM_PROJECTOR)) {
      this.scene.anims.create({ key: BAT_ANIM_PROJECTOR,  frames: this.scene.anims.generateFrameNumbers(BAT_PROJECTOR_KEY,  { start: 0, end: 15 }), frameRate: 6, repeat: -1 });
    }
  }

  /** Spawn the hero sprite for the currently selected character. */
  spawn(hideContainer: () => void): void {
    this.destroy();
    const char = this.ctx.getSelectedCharacter();
    if (char === 'mc') return;

    const idleKey = char === 'thor' ? THOR_ELECTRIC_KEY
                  : char === 'grey' ? GREY_SMOKE_KEY
                  : BAT_BATMOBILE_KEY;

    const homeX = char === 'batman' ? BAT_HOME_X : MC_HOME_X;
    const homeY = char === 'batman' ? BAT_HOME_Y : MC_HOME_Y;

    const sprite = this.scene.add.sprite(homeX, homeY, idleKey, 0);
    sprite.setScale(char === 'batman' ? BAT_HERO_SCALE : HERO_SCALE);
    sprite.setDepth(50);

    const label = this.scene.add.text(homeX, homeY + HERO_LABEL_OFFSET_Y, this.getName(), {
      fontSize: '11px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    });
    label.setOrigin(0.5, 1);
    label.setDepth(51);

    hideContainer();

    this.sprite = sprite;
    this.label  = label;

    this.idleAnim();
  }

  /** Destroy all hero game objects. */
  destroy(): void {
    if (this.tween)  { this.tween.stop();     this.tween  = null; }
    if (this.sprite) { this.sprite.destroy(); this.sprite = null; }
    if (this.label)  { this.label.destroy();  this.label  = null; }
    this.navigating = false;
    this.thorLandingIdx = 0;
    this.greyLandingIdx = 0;
    this.batLandingIdx = 0;
  }

  /** Map a tool name to a short action label shown above the hero. */
  private getLabelForTool(toolName?: string): string {
    if (!toolName) return 'Page Changing';
    if (toolName.startsWith('navigation_go-to') || toolName === 'browser_navigate') return 'Page Changing';
    if (toolName === 'navigation_go-back'  || toolName === 'browser_go_back')     return 'Going Back...';
    if (toolName === 'navigation_go-forward' || toolName === 'browser_go_forward') return 'Going Fwd...';
    if (toolName === 'navigation_reload'   || toolName === 'browser_reload')       return 'Reloading...';
    if (toolName.startsWith('navigation_'))   return 'Page Changing';
    if (toolName === 'browser_new_tab')       return 'New Tab...';
    if (toolName === 'browser_close_tab')     return 'Closing Tab...';
    if (toolName === 'browser_switch_tab')    return 'Switching Tab...';
    if (toolName === 'browser_press_key')     return 'Key Press...';
    if (toolName === 'browser_handle_dialog') return 'Dialog...';
    if (toolName === 'browser_wait_for')      return 'Waiting...';
    if (toolName === 'browser_drag')          return 'Dragging...';
    if (toolName === 'browser_hover')         return 'Hovering...';
    if (toolName === 'browser_fill'   ||
        toolName === 'browser_type'   ||
        toolName === 'browser_scroll' ||
        toolName === 'browser_select_option' ||
        toolName === 'execute')               return 'Page Changing';
    if (toolName.startsWith('interaction_'))  return 'Page Changing';
    return 'Page Changing';
  }

  /** Start the hero navigation sequence for the active character. */
  startNavigation(toolName?: string): void {
    if (!this.sprite) return;
    this.navigating = true;
    if (this.label) this.label.setText(this.getLabelForTool(toolName));
    this.playNavSequence();
  }

  private playNavSequence(): void {
    if (!this.sprite || !this.navigating) return;
    const char = this.ctx.getSelectedCharacter();

    if (char === 'thor') {
      // Thor: fly to next landing spot → jump-land animation → stay there
      const target = THOR_LANDING_SPOTS[this.thorLandingIdx % THOR_LANDING_SPOTS.length];
      this.thorLandingIdx = (this.thorLandingIdx + 1) % THOR_LANDING_SPOTS.length;

      this.sprite.play(THOR_ANIM_FLY, true);
      this.sprite.setFlipX(target.x < this.sprite.x);
      if (this.tween) { this.tween.stop(); this.tween = null; }

      const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, target.x, target.y);
      const flyDur = Math.max(500, (dist / (WALK_SPEED * 2)) * 1000);

      this.tween = this.scene.tweens.add({
        targets: this.sprite,
        x: target.x,
        y: target.y,
        duration: flyDur,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          if (this.label && this.sprite) {
            this.label.setPosition(this.sprite.x, this.sprite.y + HERO_LABEL_OFFSET_Y);
          }
        },
        onComplete: () => {
          this.tween = null;
          if (!this.sprite) return;
          // Land: play jump animation once, then switch to electric idle
          this.sprite.setFlipX(false);
          this.sprite.play(THOR_ANIM_JUMPING, true);
          this.sprite.once('animationcomplete', () => {
            if (this.sprite) this.sprite.play(THOR_ANIM_ELECTRIC, true);
          });
        },
      });
    } else if (char === 'grey') {
      // GreyIronMan: takeoff (up_fly 0-7) → cross-fly to spot → land (up_fly 8-15) → smoke idle
      const target = GREY_LANDING_SPOTS[this.greyLandingIdx % GREY_LANDING_SPOTS.length];
      this.greyLandingIdx = (this.greyLandingIdx + 1) % GREY_LANDING_SPOTS.length;

      if (this.tween) { this.tween.stop(); this.tween = null; }
      this.sprite.off('animationcomplete');
      this.sprite.setFlipX(target.x < this.sprite.x);
      this.sprite.play(GREY_ANIM_TAKEOFF, true);

      this.sprite.once('animationcomplete', () => {
        if (!this.navigating || !this.sprite) return;
        this.sprite.play(GREY_ANIM_CROSS_FLY, true);

        const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, target.x, target.y);
        const flyDur = Math.max(700, (dist / (WALK_SPEED * 2)) * 1000);

        this.tween = this.scene.tweens.add({
          targets: this.sprite,
          x: target.x,
          y: target.y,
          duration: flyDur,
          ease: 'Sine.easeInOut',
          onUpdate: () => {
            if (this.label && this.sprite) {
              this.label.setPosition(this.sprite.x, this.sprite.y + HERO_LABEL_OFFSET_Y);
            }
          },
          onComplete: () => {
            this.tween = null;
            if (!this.navigating || !this.sprite) return;
            this.sprite.setFlipX(false);
            this.sprite.play(GREY_ANIM_LAND, true);
            this.sprite.once('animationcomplete', () => {
              if (!this.sprite) return;
              this.sprite.play(GREY_ANIM_SMOKE, true);
            });
          },
        });
      });
    } else if (char === 'batman') {
      // Batman: throw rope (current pos, aimed at target) → fly to landing spot
      //         → projector (once) → batmobile (once) → freeze
      const target = BAT_LANDING_SPOTS[this.batLandingIdx % BAT_LANDING_SPOTS.length];
      this.batLandingIdx = (this.batLandingIdx + 1) % BAT_LANDING_SPOTS.length;

      if (this.tween) { this.tween.stop(); this.tween = null; }
      this.sprite.off('animationcomplete');
      this.sprite.setFlipX(target.x < this.sprite.x);
      this.sprite.play(BAT_ANIM_THROW_ROPE, true);

      this.sprite.once('animationcomplete', () => {
        if (!this.navigating || !this.sprite) return;
        const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, target.x, target.y);
        this.tween = this.scene.tweens.add({
          targets: this.sprite,
          x: target.x,
          y: target.y,
          duration: Math.max(500, (dist / (WALK_SPEED * 2)) * 1000),
          ease: 'Sine.easeOut',
          onUpdate: () => {
            if (this.label && this.sprite) {
              this.label.setPosition(this.sprite.x, this.sprite.y + HERO_LABEL_OFFSET_Y);
            }
          },
          onComplete: () => {
            this.tween = null;
            if (!this.navigating || !this.sprite) return;
            this.sprite.setFlipX(false);
            // Arrived: projector once
            this.sprite.play({ key: BAT_ANIM_PROJECTOR, repeat: 0 }, true);
            this.sprite.once('animationcomplete', () => {
              if (!this.sprite) return;
              // batmobile once then freeze on last frame
              this.sprite.play(BAT_ANIM_BATMOBILE, true);
              this.sprite.once('animationcomplete', () => {
                if (this.sprite) this.sprite.setFrame(15);
              });
            });
          },
        });
      });
    }
  }

  /** Stop the current action and return to idle. */
  stopAction(): void {
    if (!this.sprite) return;
    this.navigating = false;
    if (this.tween) { this.tween.stop(); this.tween = null; }
    this.sprite.off('animationcomplete');
    if (this.label) this.label.setText(this.getName());

    const char = this.ctx.getSelectedCharacter();
    if (char === 'thor') {
      // Thor stays wherever he landed — just settle into electric idle
      this.sprite.play(THOR_ANIM_ELECTRIC, true);
    } else if (char === 'grey') {
      // GreyIronMan stays wherever she landed — just settle into smoke idle
      this.sprite.play(GREY_ANIM_SMOKE, true);
    } else if (char === 'batman') {
      // Batman: drive batmobile home, then freeze on last frame
      this.sprite.play(BAT_ANIM_BATMOBILE, true);
      this.tween = this.scene.tweens.add({
        targets: this.sprite,
        x: BAT_HOME_X,
        y: BAT_HOME_Y,
        duration: 900,
        ease: 'Sine.easeOut',
        onUpdate: () => {
          if (this.label && this.sprite) {
            this.label.setPosition(this.sprite.x, this.sprite.y + HERO_LABEL_OFFSET_Y);
          }
        },
        onComplete: () => {
          this.tween = null;
          if (this.sprite) this.sprite.setFrame(15);
        },
      });
    } else {
      this.idleAnim();
    }
  }

  /** Play the character-appropriate idle animation. */
  idleAnim(): void {
    if (!this.sprite) return;
    const char = this.ctx.getSelectedCharacter();
    if (char === 'thor') {
      this.sprite.play(THOR_ANIM_ELECTRIC, true);
    } else if (char === 'grey') {
      this.sprite.play(GREY_ANIM_SMOKE, true);
    } else if (char === 'batman') {
      this.sprite.play(BAT_ANIM_BATMOBILE, true);
      this.sprite.once('animationcomplete', () => {
        if (this.sprite) this.sprite.setFrame(15);
      });
    }
  }

  /** Human-readable name for the active character. */
  getName(): string {
    const char = this.ctx.getSelectedCharacter() as CharId;
    if (char === 'thor')   return 'Thor';
    if (char === 'grey')   return 'GreyIronMan';
    if (char === 'batman') return 'Batman';
    return '';
  }

  getSprite(): Phaser.GameObjects.Sprite | null { return this.sprite; }
  getLabel(): Phaser.GameObjects.Text | null { return this.label; }
}
