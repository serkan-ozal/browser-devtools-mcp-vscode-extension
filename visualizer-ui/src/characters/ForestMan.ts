import Phaser from 'phaser';
import type { HudContext } from '../HudContext';
import {
  ASSET_FOREST_MAN_IDLE,
  ASSET_FOREST_MAN_WALKING,
  ASSET_FOREST_MAN_CHOP,
} from '../gameAssets';
import {
  FM_IDLE_KEY,
  FM_WALK_KEY,
  FM_CHOP_KEY,
  FM_BASE_FW,
  FM_BASE_FH,
  FM_CHOP_FW,
  FM_CHOP_FH,
  FM_SCALE,
  FM_ANIM_IDLE,
  FM_ANIM_WALK,
  FM_ANIM_CHOP,
  FM_HOME_X,
  FM_HOME_Y,
  FM_LABEL_OFFSET_Y,
} from '../scene-constants';

/** ForestMan character — used for interaction/click tools. */
export class ForestManCharacter {
  fmBaseSprite: Phaser.GameObjects.Sprite | null = null;
  fmChopSprite: Phaser.GameObjects.Sprite | null = null;
  fmLabel: Phaser.GameObjects.Text | null = null;
  fmChopping = false;
  actionStartTs = 0;

  constructor(
    private scene: Phaser.Scene,
    private ctx: HudContext,
  ) {}

  preload(): void {
    this.scene.load.spritesheet(FM_IDLE_KEY, ASSET_FOREST_MAN_IDLE,    { frameWidth: FM_BASE_FW, frameHeight: FM_BASE_FH });
    this.scene.load.spritesheet(FM_WALK_KEY, ASSET_FOREST_MAN_WALKING, { frameWidth: FM_BASE_FW, frameHeight: FM_BASE_FH });
    this.scene.load.spritesheet(FM_CHOP_KEY, ASSET_FOREST_MAN_CHOP,    { frameWidth: FM_CHOP_FW, frameHeight: FM_CHOP_FH });
  }

  createAnimations(): void {
    if (!this.scene.anims.exists(FM_ANIM_IDLE)) {
      this.scene.anims.create({ key: FM_ANIM_IDLE, frames: this.scene.anims.generateFrameNumbers(FM_IDLE_KEY, { start: 0, end: 3  }), frameRate: 6,  repeat: -1 });
    }
    if (!this.scene.anims.exists(FM_ANIM_WALK)) {
      this.scene.anims.create({ key: FM_ANIM_WALK, frames: this.scene.anims.generateFrameNumbers(FM_WALK_KEY, { start: 0, end: 5  }), frameRate: 10, repeat: -1 });
    }
    if (!this.scene.anims.exists(FM_ANIM_CHOP)) {
      this.scene.anims.create({ key: FM_ANIM_CHOP, frames: this.scene.anims.generateFrameNumbers(FM_CHOP_KEY, { start: 0, end: 15 }), frameRate: 12, repeat: -1 });
    }
  }

  /** Place ForestMan at the home position in idle state. */
  create(): void {
    // Base sprite (idle + walk, 48×48)
    const base = this.scene.add.sprite(FM_HOME_X, FM_HOME_Y, FM_IDLE_KEY, 0);
    base.setOrigin(0.5, 1);
    base.setScale(FM_SCALE);
    base.play(FM_ANIM_IDLE, true);
    base.setDepth(10);

    // Chop sprite (64×64) — centered on same foot point, hidden by default
    const chop = this.scene.add.sprite(FM_HOME_X, FM_HOME_Y, FM_CHOP_KEY, 0);
    chop.setOrigin(0.5, 1);
    chop.setScale(FM_SCALE);
    chop.setVisible(false);
    chop.setDepth(10);

    const label = this.scene.add.text(FM_HOME_X, FM_HOME_Y + FM_LABEL_OFFSET_Y * FM_SCALE, '', {
      fontSize: '11px',
      fontFamily: '"Courier New", Courier, monospace',
      color: '#ecf0f1',
      backgroundColor: '#2c3e50',
      padding: { x: 6, y: 2 },
      align: 'center',
    });
    label.setOrigin(0.5, 1);
    label.setVisible(false);
    label.setDepth(11);

    this.fmBaseSprite = base;
    this.fmChopSprite = chop;
    this.fmLabel = label;
  }

  /** Start the chopping animation for an interaction/click tool. */
  startChop(_toolName?: string): void {
    if (!this.fmBaseSprite || !this.fmChopSprite) return;
    this.fmChopping = true;
    this.fmBaseSprite.setVisible(false);
    this.fmChopSprite.setVisible(true);
    this.fmChopSprite.play(FM_ANIM_CHOP, true);
    if (this.fmLabel) {
      this.fmLabel.setText('Clicked!');
      this.fmLabel.setVisible(true);
    }
  }

  /** Stop chopping — return to idle animation and hide label. */
  stopChop(): void {
    if (!this.fmBaseSprite || !this.fmChopSprite) return;
    this.fmChopping = false;
    this.fmChopSprite.setVisible(false);
    this.fmBaseSprite.setVisible(true);
    this.fmBaseSprite.play(FM_ANIM_IDLE, true);
    if (this.fmLabel) this.fmLabel.setVisible(false);
  }

  /** Reset to initial state (called on run_started). */
  reset(): void {
    this.ctx.cancelStopTimer('fmStopTimer');
    this.stopChop();
  }

  getActionStartTs(): number { return this.actionStartTs; }
}
