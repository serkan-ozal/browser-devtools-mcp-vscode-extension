import Phaser from 'phaser';
import type { HudContext } from '../HudContext';
import {
  ASSET_PAINTER_WALK,
  ASSET_PAINTER_PAINT,
} from '../gameAssets';
import {
  PAINTER_WALK_KEY,
  PAINTER_PAINT_KEY,
  PAINTER_WALK_FRAME_W,
  PAINTER_WALK_FRAME_H,
  PAINTER_PAINT_FRAME_W,
  PAINTER_PAINT_FRAME_H,
  PAINTER_ANIM_WALK,
  PAINTER_ANIM_PAINT,
  PAINTER_SCALE,
  PAINTER_START_X,
  PAINTER_START_Y,
  PAINTER_TARGET_X,
  PAINTER_TARGET_Y,
} from '../scene-constants';

/** Painter character — used for screenshot tools. */
export class PainterCharacter {
  sprite: Phaser.GameObjects.Sprite | null = null;
  label: Phaser.GameObjects.Text | null = null;
  tween: Phaser.Tweens.Tween | null = null;
  atTarget = false;
  actionStartTs = 0;

  constructor(
    private scene: Phaser.Scene,
    private ctx: HudContext,
  ) {}

  preload(): void {
    this.scene.load.spritesheet(PAINTER_WALK_KEY,  ASSET_PAINTER_WALK,  { frameWidth: PAINTER_WALK_FRAME_W,  frameHeight: PAINTER_WALK_FRAME_H  });
    this.scene.load.spritesheet(PAINTER_PAINT_KEY, ASSET_PAINTER_PAINT, { frameWidth: PAINTER_PAINT_FRAME_W, frameHeight: PAINTER_PAINT_FRAME_H });
  }

  createAnimations(): void {
    if (!this.scene.anims.exists(PAINTER_ANIM_WALK)) {
      this.scene.anims.create({ key: PAINTER_ANIM_WALK,  frames: this.scene.anims.generateFrameNumbers(PAINTER_WALK_KEY,  { start: 0, end: 5  }), frameRate: 8,  repeat: -1 });
    }
    if (!this.scene.anims.exists(PAINTER_ANIM_PAINT)) {
      this.scene.anims.create({ key: PAINTER_ANIM_PAINT, frames: this.scene.anims.generateFrameNumbers(PAINTER_PAINT_KEY, { start: 0, end: 15 }), frameRate: 10, repeat: -1 });
    }
  }

  /** Lazily create the painter sprite at the start position. */
  private ensureCreated(): void {
    if (this.sprite) return;

    const sprite = this.scene.add.sprite(PAINTER_START_X, PAINTER_START_Y, PAINTER_WALK_KEY, 0);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(PAINTER_SCALE);
    sprite.setDepth(12);
    // Hold on frame 0 until a tool arrives
    sprite.anims.stop();
    sprite.setTexture(PAINTER_WALK_KEY, 0);

    const label = this.scene.add.text(PAINTER_START_X, PAINTER_START_Y - PAINTER_WALK_FRAME_H * PAINTER_SCALE - 6, '', {
      fontSize: '11px',
      color: '#ecf0f1',
      backgroundColor: '#2c3e50',
      padding: { x: 6, y: 2 },
      align: 'center',
    });
    label.setOrigin(0.5, 1);
    label.setDepth(13);
    label.setVisible(false);

    this.sprite = sprite;
    this.label = label;
    this.atTarget = false;
  }

  /** Start the screenshot animation.
   * First call — walks from start to target then paints.
   * Subsequent calls — already at target, jumps straight to paint.
   */
  startScreenshot(_toolName: string): void {
    if (this.ctx.isRunFinished()) return;
    this.ensureCreated();
    if (!this.sprite || !this.label) return;

    const sprite = this.sprite;
    const label  = this.label;

    label.setText('Taking Screenshot...');
    label.setVisible(true);

    const beginPainting = () => {
      sprite.play(PAINTER_ANIM_PAINT, true);
      label.setPosition(sprite.x, sprite.y - PAINTER_WALK_FRAME_H * PAINTER_SCALE - 6);
    };

    if (this.atTarget) {
      beginPainting();
    } else {
      sprite.play(PAINTER_ANIM_WALK, true);

      if (this.tween) { this.tween.stop(); this.tween = null; }
      this.tween = this.scene.tweens.add({
        targets: sprite,
        x: PAINTER_TARGET_X,
        y: PAINTER_TARGET_Y,
        duration: 1000,
        ease: 'Linear',
        onUpdate: () => {
          label.setPosition(sprite.x, sprite.y - PAINTER_WALK_FRAME_H * PAINTER_SCALE - 6);
        },
        onComplete: () => {
          this.tween = null;
          this.atTarget = true;
          beginPainting();
        },
      });
    }
  }

  /** Stop screenshot — freeze on last paint frame and hide label. */
  stopScreenshot(): void {
    if (!this.sprite) return;
    this.sprite.anims.stop();
    if (this.label) this.label.setVisible(false);
  }

  /** Reset to start position in walk-frame-0 state. */
  reset(): void {
    this.ctx.cancelStopTimer('painterStopTimer');
    if (this.tween) { this.tween.stop(); this.tween = null; }
    this.atTarget = false;
    if (this.sprite) {
      this.sprite.setPosition(PAINTER_START_X, PAINTER_START_Y);
      this.sprite.anims.stop();
      this.sprite.setTexture(PAINTER_WALK_KEY, 0);
    }
    if (this.label) this.label.setVisible(false);
  }

  getActionStartTs(): number { return this.actionStartTs; }
}
