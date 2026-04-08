import Phaser from 'phaser';
import type { HudContext } from '../HudContext';
import {
  ASSET_EXPLORER_WALK,
  ASSET_EXPLORER_READING,
  ASSET_EXPLORER_IDLE,
} from '../gameAssets';
import {
  EXPLORER_WALK_KEY,
  EXPLORER_READING_KEY,
  EXPLORER_IDLE_KEY,
  EXPLORER_ANIM_WALK,
  EXPLORER_ANIM_READING,
  EXPLORER_ANIM_IDLE,
  EXPLORER_WALK_FRAME_W,
  EXPLORER_WALK_FRAME_H,
  EXPLORER_READING_FRAME_W,
  EXPLORER_READING_FRAME_H,
  EXPLORER_IDLE_FRAME_W,
  EXPLORER_IDLE_FRAME_H,
  EXPLORER_SCALE,
  EXPLORER_TARGET_X,
  EXPLORER_TARGET_Y,
  EXPLORER_SPAWN_POINTS,
} from '../scene-constants';

/** Explorer character — used for snapshot/a11y tools. */
export class ExplorerCharacter {
  sprite: Phaser.GameObjects.Sprite | null = null;
  label: Phaser.GameObjects.Text | null = null;
  tween: Phaser.Tweens.Tween | null = null;
  atTarget = false;
  spawnIdx = 0;
  actionStartTs = 0;

  constructor(
    private scene: Phaser.Scene,
    private ctx: HudContext,
  ) {}

  preload(): void {
    this.scene.load.spritesheet(EXPLORER_WALK_KEY,    ASSET_EXPLORER_WALK,    { frameWidth: EXPLORER_WALK_FRAME_W,    frameHeight: EXPLORER_WALK_FRAME_H });
    this.scene.load.spritesheet(EXPLORER_READING_KEY, ASSET_EXPLORER_READING, { frameWidth: EXPLORER_READING_FRAME_W, frameHeight: EXPLORER_READING_FRAME_H });
    this.scene.load.spritesheet(EXPLORER_IDLE_KEY,    ASSET_EXPLORER_IDLE,    { frameWidth: EXPLORER_IDLE_FRAME_W,    frameHeight: EXPLORER_IDLE_FRAME_H });
  }

  createAnimations(): void {
    if (!this.scene.anims.exists(EXPLORER_ANIM_WALK)) {
      this.scene.anims.create({ key: EXPLORER_ANIM_WALK,    frames: this.scene.anims.generateFrameNumbers(EXPLORER_WALK_KEY,    { start: 0, end: 5  }), frameRate: 8,  repeat: -1 });
    }
    if (!this.scene.anims.exists(EXPLORER_ANIM_READING)) {
      this.scene.anims.create({ key: EXPLORER_ANIM_READING, frames: this.scene.anims.generateFrameNumbers(EXPLORER_READING_KEY, { start: 0, end: 15 }), frameRate: 8,  repeat: -1 });
    }
    if (!this.scene.anims.exists(EXPLORER_ANIM_IDLE)) {
      this.scene.anims.create({ key: EXPLORER_ANIM_IDLE,    frames: this.scene.anims.generateFrameNumbers(EXPLORER_IDLE_KEY,    { start: 0, end: 3  }), frameRate: 4,  repeat: -1 });
    }
  }

  /** Lazily create the explorer sprite at the first spawn point. */
  private ensureCreated(): void {
    if (this.sprite) return;
    const spawn = EXPLORER_SPAWN_POINTS[0];

    const sprite = this.scene.add.sprite(spawn.x, spawn.y, EXPLORER_IDLE_KEY, 0);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(EXPLORER_SCALE);
    sprite.setDepth(12);
    sprite.play(EXPLORER_ANIM_IDLE);

    const label = this.scene.add.text(spawn.x, spawn.y - EXPLORER_WALK_FRAME_H * EXPLORER_SCALE - 6, '', {
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

  private setState(state: 'walk' | 'reading' | 'idle'): void {
    if (!this.sprite) return;
    const key = state === 'walk' ? EXPLORER_ANIM_WALK
              : state === 'reading' ? EXPLORER_ANIM_READING
              : EXPLORER_ANIM_IDLE;
    this.sprite.play(key, true);
  }

  private syncPos(x: number, y: number): void {
    if (this.sprite) this.sprite.setPosition(x, y);
    if (this.label)  this.label.setPosition(x, y - EXPLORER_WALK_FRAME_H * EXPLORER_SCALE - 6);
  }

  /** Start the snapshot/reading animation for a snapshot tool. */
  startSnapshot(_toolName: string): void {
    if (this.ctx.isRunFinished()) return;
    this.ensureCreated();

    if (this.label) {
      this.label.setText('Taking Snapshot...');
      this.label.setVisible(true);
    }

    if (this.atTarget) {
      this.setState('reading');
      return;
    }

    const spawnIdx = this.spawnIdx % EXPLORER_SPAWN_POINTS.length;
    this.spawnIdx++;
    const spawn = EXPLORER_SPAWN_POINTS[spawnIdx];

    this.syncPos(spawn.x, spawn.y);
    this.setState('walk');

    if (this.tween) { this.tween.stop(); this.tween = null; }

    const facingLeft = EXPLORER_TARGET_X < spawn.x;
    if (this.sprite) this.sprite.setFlipX(facingLeft);

    const dist = Phaser.Math.Distance.Between(spawn.x, spawn.y, EXPLORER_TARGET_X, EXPLORER_TARGET_Y);
    const dur  = Math.max(600, (dist / 68) * 1000);

    const pos = { x: spawn.x, y: spawn.y };
    this.tween = this.scene.tweens.add({
      targets: pos,
      x: EXPLORER_TARGET_X,
      y: EXPLORER_TARGET_Y,
      duration: dur,
      ease: 'Linear',
      onUpdate: () => { this.syncPos(pos.x, pos.y); },
      onComplete: () => {
        this.tween = null;
        this.atTarget = true;
        this.syncPos(EXPLORER_TARGET_X, EXPLORER_TARGET_Y);
        this.setState('reading');
      },
    });
  }

  /** Stop snapshot — transition to idle and hide label. */
  stopSnapshot(): void {
    this.setState('idle');
    if (this.label) this.label.setVisible(false);
  }

  /** Reset to spawn point 0 in idle state. */
  reset(spawn0: { x: number; y: number }): void {
    this.ctx.cancelStopTimer('explorerStopTimer');
    if (this.tween) { this.tween.stop(); this.tween = null; }
    this.atTarget = false;
    this.syncPos(spawn0.x, spawn0.y);
    if (this.sprite) { this.sprite.setFlipX(false); this.sprite.play(EXPLORER_ANIM_IDLE, true); }
    if (this.label) this.label.setVisible(false);
  }

  getActionStartTs(): number { return this.actionStartTs; }
}
