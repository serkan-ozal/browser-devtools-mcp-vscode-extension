import Phaser from 'phaser';
import type { HudContext } from '../HudContext';
import {
  ASSET_RANGER_WALK,
  ASSET_RANGER_THROW,
  ASSET_BUG_BREATH,
  ASSET_BUG_HIT,
  ASSET_BUG_DEATH,
} from '../gameAssets';
import {
  RANGER_WALK_KEY,
  RANGER_THROW_KEY,
  RANGER_WALK_FRAME_W,
  RANGER_WALK_FRAME_H,
  RANGER_THROW_FRAME_W,
  RANGER_THROW_FRAME_H,
  RANGER_SCALE,
  RANGER_START_X,
  RANGER_START_Y,
  RANGER_TARGET_X,
  RANGER_TARGET_Y,
  BUG_BREATH_KEY,
  BUG_HIT_KEY,
  BUG_DEATH_KEY,
  BUG_ALIVE_FRAME_W,
  BUG_ALIVE_FRAME_H,
  BUG_DEATH_FRAME_W,
  BUG_DEATH_FRAME_H,
  BUG_ANIM_BREATH,
  BUG_ANIM_HIT,
  BUG_ANIM_DEATH,
  BUG_SCALE,
  BUG_SPAWN_X,
  BUG_SPAWN_Y,
} from '../scene-constants';

/** Ranger + Bug characters — used for debug tools. */
export class RangerBugCharacter {
  rangerContainer: Phaser.GameObjects.Container | null = null;
  rangerSprite: Phaser.GameObjects.Sprite | null = null;
  rangerTween: Phaser.Tweens.Tween | null = null;
  rangerShootTimer: Phaser.Time.TimerEvent | null = null;
  rangerLabel: Phaser.GameObjects.Text | null = null;

  bugAliveSprite: Phaser.GameObjects.Sprite | null = null;
  bugDeadSprite: Phaser.GameObjects.Sprite | null = null;
  bugDeathLabel: Phaser.GameObjects.Text | null = null;

  actionStartTs = 0;

  constructor(
    private scene: Phaser.Scene,
    private ctx: HudContext,
  ) {}

  preload(): void {
    this.scene.load.spritesheet(RANGER_WALK_KEY,  ASSET_RANGER_WALK,  { frameWidth: RANGER_WALK_FRAME_W,  frameHeight: RANGER_WALK_FRAME_H  });
    this.scene.load.spritesheet(RANGER_THROW_KEY, ASSET_RANGER_THROW, { frameWidth: RANGER_THROW_FRAME_W, frameHeight: RANGER_THROW_FRAME_H });
    this.scene.load.spritesheet(BUG_BREATH_KEY, ASSET_BUG_BREATH, { frameWidth: BUG_ALIVE_FRAME_W, frameHeight: BUG_ALIVE_FRAME_H });
    this.scene.load.spritesheet(BUG_HIT_KEY,    ASSET_BUG_HIT,    { frameWidth: BUG_ALIVE_FRAME_W, frameHeight: BUG_ALIVE_FRAME_H });
    this.scene.load.spritesheet(BUG_DEATH_KEY,  ASSET_BUG_DEATH,  { frameWidth: BUG_DEATH_FRAME_W, frameHeight: BUG_DEATH_FRAME_H });
  }

  createAnimations(): void {
    // Ranger
    if (!this.scene.anims.exists(RANGER_WALK_KEY)) {
      this.scene.anims.create({ key: RANGER_WALK_KEY, frames: this.scene.anims.generateFrameNumbers(RANGER_WALK_KEY, { start: 0, end: 3  }), frameRate: 8,  repeat: -1 });
    }
    if (!this.scene.anims.exists(RANGER_THROW_KEY)) {
      this.scene.anims.create({ key: RANGER_THROW_KEY, frames: this.scene.anims.generateFrameNumbers(RANGER_THROW_KEY, { start: 0, end: 15 }), frameRate: 10, repeat: 0  });
    }
    // Bug
    if (!this.scene.anims.exists(BUG_ANIM_BREATH)) {
      this.scene.anims.create({ key: BUG_ANIM_BREATH, frames: this.scene.anims.generateFrameNumbers(BUG_BREATH_KEY, { start: 0, end: 3 }), frameRate: 5, repeat: -1 });
    }
    if (!this.scene.anims.exists(BUG_ANIM_HIT)) {
      this.scene.anims.create({ key: BUG_ANIM_HIT, frames: this.scene.anims.generateFrameNumbers(BUG_HIT_KEY, { start: 0, end: 5 }), frameRate: 10, repeat: 0 });
    }
    if (!this.scene.anims.exists(BUG_ANIM_DEATH)) {
      this.scene.anims.create({ key: BUG_ANIM_DEATH, frames: this.scene.anims.generateFrameNumbers(BUG_DEATH_KEY, { start: 0, end: 3 }), frameRate: 6, repeat: 0 });
    }
  }

  private createRanger(): void {
    const sprite = this.scene.add.sprite(0, 0, RANGER_WALK_KEY, 0);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(RANGER_SCALE);
    sprite.play(RANGER_WALK_KEY, true);

    const container = this.scene.add.container(RANGER_START_X, RANGER_START_Y, [sprite]);
    container.setDepth(10);

    const label = this.scene.add.text(RANGER_START_X, RANGER_START_Y - RANGER_WALK_FRAME_H * RANGER_SCALE - 6, '', {
      fontSize: '11px',
      color: '#ecf0f1',
      backgroundColor: '#2c3e50',
      padding: { x: 6, y: 2 },
      align: 'center',
    });
    label.setOrigin(0.5, 1);
    label.setDepth(11);
    label.setVisible(false);

    this.rangerContainer = container;
    this.rangerSprite = sprite;
    this.rangerLabel = label;
    this.rangerTween = null;
  }

  private createBug(): void {
    const x = BUG_SPAWN_X;
    const y = BUG_SPAWN_Y;

    // Alive sprite (breath + hit animations — 92×92 frame)
    const alive = this.scene.add.sprite(x, y, BUG_BREATH_KEY, 0);
    alive.setOrigin(0.5, 1);
    alive.setScale(BUG_SCALE);
    alive.setDepth(14);
    alive.play(BUG_ANIM_BREATH, true);

    // Dead sprite (death animation — 128×128 frame), initially hidden.
    // scale 1.0: alive (92px×1.2=110) vs death (128px×1.0=128) keeps similar visual height;
    // +44 offset aligns the bottom edge.
    const dead = this.scene.add.sprite(x, y + 44, BUG_DEATH_KEY, 0);
    dead.setOrigin(0.5, 1);
    dead.setScale(1.0);
    dead.setDepth(14);
    dead.setVisible(false);

    const deathLabel = this.scene.add.text(x, y - BUG_ALIVE_FRAME_H * BUG_SCALE + 90, "I'm done!", {
      fontSize: '11px',
      color: '#ecf0f1',
      backgroundColor: '#2c3e50',
      padding: { x: 6, y: 2 },
      align: 'center',
    });
    deathLabel.setOrigin(0.5, 1);
    deathLabel.setDepth(15);
    deathLabel.setVisible(false);

    this.bugAliveSprite = alive;
    this.bugDeadSprite  = dead;
    this.bugDeathLabel  = deathLabel;
  }

  /** Hold ranger at idle frame 0. */
  rangerIdle(): void {
    if (!this.rangerSprite) return;
    this.rangerSprite.anims.stop();
    this.rangerSprite.setTexture(RANGER_WALK_KEY, 0);
  }

  /** Fire a single arrow — play throw animation and show bug hit reaction. */
  private rangerFireArrow(): void {
    if (!this.rangerSprite) return;
    if (!this.rangerShootTimer) return; // timer was stopped, no more arrows

    this.rangerSprite.play(RANGER_THROW_KEY, true);
    if (this.bugAliveSprite) this.bugAliveSprite.play(BUG_ANIM_HIT, true);
  }

  /** Start the debug animation: walk to target, then fire arrows on repeat. */
  startRangerDebug(toolName?: string): void {
    if (this.ctx.isRunFinished()) return;
    // Lazy-create ranger and bug on first debug tool call
    if (!this.rangerContainer) this.createRanger();
    if (!this.bugAliveSprite)  this.createBug();
    if (!this.rangerContainer || !this.rangerSprite) return;

    this.stopShootTimer();

    const container = this.rangerContainer;
    const sprite    = this.rangerSprite;

    if (this.rangerLabel) {
      this.rangerLabel.setText(toolName ?? 'debug tool');
      this.rangerLabel.setVisible(true);
    }

    // Return to idle after each throw animation completes (between shots).
    sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + RANGER_THROW_KEY);
    sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + RANGER_THROW_KEY, () => {
      this.rangerIdle();
    });

    const beginShooting = () => {
      this.rangerFireArrow();
      // Throw animation: 20 frames × 10fps = 2000ms; repeat every 2200ms
      // (allows ~200ms idle gap between throws)
      this.rangerShootTimer = this.scene.time.addEvent({
        delay: 2200,
        callback: this.rangerFireArrow,
        callbackScope: this,
        loop: true,
      });
    };

    const atTarget =
      Math.abs(container.x - RANGER_TARGET_X) < 4 &&
      Math.abs(container.y - RANGER_TARGET_Y) < 4;

    const syncLabel = () => {
      if (this.rangerLabel) {
        this.rangerLabel.setPosition(
          container.x,
          container.y - RANGER_WALK_FRAME_H * RANGER_SCALE - 6,
        );
      }
    };

    if (atTarget) {
      syncLabel();
      beginShooting();
    } else {
      container.setPosition(RANGER_START_X, RANGER_START_Y);
      sprite.setFlipX(false);
      sprite.play(RANGER_WALK_KEY, true);
      syncLabel();

      this.rangerTween = this.scene.tweens.add({
        targets: container,
        x: RANGER_TARGET_X,
        y: RANGER_TARGET_Y,
        duration: 1200,
        ease: 'Linear',
        onUpdate: () => syncLabel(),
        onComplete: () => {
          this.rangerTween = null;
          syncLabel();
          beginShooting();
        },
      });
    }
  }

  /** Stop the shoot timer and return ranger to idle. */
  stopShootTimer(): void {
    if (this.rangerShootTimer) {
      this.rangerShootTimer.remove(false);
      this.rangerShootTimer = null;
    }
    // If not currently in a throw animation, go idle immediately.
    if (this.rangerSprite && !this.rangerSprite.anims.isPlaying) {
      this.rangerIdle();
    }
    if (this.rangerLabel) this.rangerLabel.setVisible(false);
  }

  /** Reset both ranger and bug to initial positions/states. */
  reset(): void {
    this.ctx.cancelStopTimer('rangerStopTimer');
    this.stopShootTimer();
    if (this.rangerTween) { this.rangerTween.stop(); this.rangerTween = null; }
    if (this.rangerContainer) this.rangerContainer.setPosition(RANGER_START_X, RANGER_START_Y);
    if (this.rangerSprite) { this.rangerSprite.setFlipX(false); this.rangerIdle(); }
    if (this.bugAliveSprite) { this.bugAliveSprite.setVisible(true); this.bugAliveSprite.play(BUG_ANIM_BREATH, true); }
    if (this.bugDeadSprite)  this.bugDeadSprite.setVisible(false);
    if (this.bugDeathLabel)  this.bugDeathLabel.setVisible(false);
  }

  getActionStartTs(): number { return this.actionStartTs; }
}
