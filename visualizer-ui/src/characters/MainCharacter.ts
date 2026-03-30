import Phaser from 'phaser';
import type { HudContext } from '../HudContext';
import {
  ASSET_MC_SIT_WAIT,
  ASSET_MC_WALK,
  ASSET_MC_FLY,
} from '../gameAssets';
import {
  MC_SIT_KEY,
  MC_WALK_KEY,
  MC_FLY_KEY,
  MC_SIT_FW,
  MC_SIT_FH,
  MC_WALK_FW,
  MC_WALK_FH,
  MC_FLY_FW,
  MC_FLY_FH,
  MC_SCALE,
  MC_ANIM_SIT,
  MC_ANIM_WALK,
  MC_ANIM_FLY,
  MC_HOME_X,
  MC_HOME_Y,
  MC_LABEL_OFFSET_Y,
  WALK_SPEED,
  HERO_NAVIGATION_WAYPOINTS,
} from '../scene-constants';

/** Main Character — sits idle between runs, flies/walks during navigation tools. */
export class MainCharacter {
  container: Phaser.GameObjects.Container | null = null;
  sprite: Phaser.GameObjects.Sprite | null = null;
  label: Phaser.GameObjects.Text | null = null;
  tween: Phaser.Tweens.Tween | null = null;
  actionStartTs = 0;

  constructor(
    private scene: Phaser.Scene,
    private ctx: HudContext,
    private onStartHeroNav: (toolName?: string) => void,
    private onStopHeroNav: () => void = () => {},
  ) {}

  preload(): void {
    this.scene.load.spritesheet(MC_SIT_KEY,  ASSET_MC_SIT_WAIT, { frameWidth: MC_SIT_FW,  frameHeight: MC_SIT_FH  });
    this.scene.load.spritesheet(MC_WALK_KEY, ASSET_MC_WALK,     { frameWidth: MC_WALK_FW, frameHeight: MC_WALK_FH });
    this.scene.load.spritesheet(MC_FLY_KEY,  ASSET_MC_FLY,      { frameWidth: MC_FLY_FW,  frameHeight: MC_FLY_FH  });
  }

  createAnimations(): void {
    if (!this.scene.anims.exists(MC_ANIM_SIT)) {
      this.scene.anims.create({ key: MC_ANIM_SIT,  frames: this.scene.anims.generateFrameNumbers(MC_SIT_KEY,  { start: 0, end: 7 }), frameRate: 6,  repeat: -1 });
    }
    if (!this.scene.anims.exists(MC_ANIM_WALK)) {
      this.scene.anims.create({ key: MC_ANIM_WALK, frames: this.scene.anims.generateFrameNumbers(MC_WALK_KEY, { start: 0, end: 5 }), frameRate: 10, repeat: -1 });
    }
    if (!this.scene.anims.exists(MC_ANIM_FLY)) {
      this.scene.anims.create({ key: MC_ANIM_FLY,  frames: this.scene.anims.generateFrameNumbers(MC_FLY_KEY,  { start: 0, end: 3 }), frameRate: 8,  repeat: -1 });
    }
  }

  /** Place the main character in sit-wait state at the home position. */
  create(): void {
    const sprite = this.scene.add.sprite(0, 0, MC_SIT_KEY, 0);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(MC_SCALE);
    sprite.play(MC_ANIM_SIT, true);

    const label = this.scene.add.text(0, MC_LABEL_OFFSET_Y, 'Waiting...', {
      fontSize: '11px',
      fontFamily: '"Courier New", Courier, monospace',
      color: '#ecf0f1',
      backgroundColor: '#2c3e50',
      padding: { x: 6, y: 2 },
      align: 'center',
    });
    label.setOrigin(0.5, 1);

    const container = this.scene.add.container(MC_HOME_X, MC_HOME_Y, [sprite, label]);
    container.setDepth(11);

    this.container = container;
    this.sprite    = sprite;
    this.label     = label;
  }

  /**
   * Start navigation:
   * 1) Walk to first waypoint.
   * 2) Fly through remaining waypoints.
   * Delegates to the hero nav callback if a hero is selected instead of MC.
   */
  /** Map a tool name to a short action label shown above the character. */
  private getLabelForTool(toolName?: string): string {
    if (!toolName) return 'Navigating';
    if (toolName.startsWith('navigation_go-to') || toolName === 'browser_navigate') return 'Navigating';
    if (toolName === 'navigation_go-back'  || toolName === 'browser_go_back')     return 'Going Back';
    if (toolName === 'navigation_go-forward' || toolName === 'browser_go_forward') return 'Going Forward';
    if (toolName === 'navigation_reload'   || toolName === 'browser_reload')       return 'Reloading';
    if (toolName.startsWith('navigation_'))   return 'Navigating';
    if (toolName === 'browser_new_tab')       return 'New Tab';
    if (toolName === 'browser_close_tab')     return 'Closing Tab';
    if (toolName === 'browser_switch_tab')    return 'Switching Tab';
    if (toolName === 'browser_press_key')     return 'Key Press';
    if (toolName === 'browser_handle_dialog') return 'Handling Dialog';
    if (toolName === 'browser_wait_for')      return 'Waiting...';
    if (toolName === 'browser_drag')          return 'Dragging';
    if (toolName === 'browser_hover')         return 'Hovering';
    if (toolName === 'interaction_click' || toolName === 'browser_click') return 'Clicked';
    return 'Navigating';
  }

  startNavigation(toolName?: string): void {
    if (this.ctx.getSelectedCharacter() !== 'mc') {
      this.onStartHeroNav(toolName);
      return;
    }
    if (!this.container || !this.sprite) return;
    if (this.tween) { this.tween.stop(); this.tween = null; }

    if (this.label) this.label.setText(this.getLabelForTool(toolName));

    const wp0  = HERO_NAVIGATION_WAYPOINTS[0];
    const dist0 = Phaser.Math.Distance.Between(
      this.container.x, this.container.y, wp0.x, wp0.y,
    );
    const walkDur = Math.max(400, (dist0 / WALK_SPEED) * 1000);

    this.sprite.play(MC_ANIM_WALK, true);
    this.sprite.setFlipX(wp0.x < this.container.x);

    this.tween = this.scene.tweens.add({
      targets: this.container,
      x: wp0.x,
      y: wp0.y,
      duration: walkDur,
      ease: 'Linear',
      onComplete: () => {
        this.tween = null;
        this.flyThroughWaypoints(1);
      },
    });
  }

  /** Fly through HERO_NAVIGATION_WAYPOINTS starting at startIdx. */
  private flyThroughWaypoints(startIdx: number): void {
    if (!this.container || !this.sprite) return;
    const waypoints = HERO_NAVIGATION_WAYPOINTS;
    if (startIdx >= waypoints.length) return;

    this.sprite.play(MC_ANIM_FLY, true);

    const flyStep = (idx: number): void => {
      if (idx >= waypoints.length || !this.container || !this.sprite) return;
      const wp   = waypoints[idx];
      const dist = Phaser.Math.Distance.Between(
        this.container.x, this.container.y, wp.x, wp.y,
      );
      const dur  = Math.max(400, (dist / (WALK_SPEED * 1.5)) * 1000);
      this.sprite.setFlipX(wp.x < this.container.x);

      this.tween = this.scene.tweens.add({
        targets: this.container,
        x: wp.x,
        y: wp.y,
        duration: dur,
        ease: 'Linear',
        onComplete: () => {
          this.tween = null;
          flyStep(idx + 1);
        },
      });
    };
    flyStep(startIdx);
  }

  /**
   * Stop the current action — cancel active tween, fly home, then sit-wait.
   * Delegates to the hero stop callback if a hero is selected.
   */
  stopAction(): void {
    if (this.ctx.getSelectedCharacter() !== 'mc') {
      this.onStopHeroNav();
      return;
    }
    if (!this.container || !this.sprite) return;
    if (this.tween) { this.tween.stop(); this.tween = null; }

    if (this.label) this.label.setText('Waiting...');

    const dist = Phaser.Math.Distance.Between(
      this.container.x, this.container.y, MC_HOME_X, MC_HOME_Y,
    );

    if (dist < 8) {
      this.sprite.play(MC_ANIM_SIT, true);
      this.sprite.setFlipX(false);
      return;
    }

    // Fly back home
    this.sprite.play(MC_ANIM_FLY, true);
    this.sprite.setFlipX(MC_HOME_X < this.container.x);

    const returnDur = Math.max(300, (dist / (WALK_SPEED * 1.8)) * 1000);
    this.tween = this.scene.tweens.add({
      targets: this.container,
      x: MC_HOME_X,
      y: MC_HOME_Y,
      duration: returnDur,
      ease: 'Linear',
      onComplete: () => {
        this.tween = null;
        if (this.sprite) {
          this.sprite.play(MC_ANIM_SIT, true);
          this.sprite.setFlipX(false);
        }
      },
    });
  }

  /**
   * Instantly reset to home position in sit-wait state.
   * Called on run_started.
   */
  reset(): void {
    if (this.tween) { this.tween.stop(); this.tween = null; }
    if (this.container) this.container.setPosition(MC_HOME_X, MC_HOME_Y);
    if (this.sprite) {
      this.sprite.play(MC_ANIM_SIT, true);
      this.sprite.setFlipX(false);
    }
    if (this.label) this.label.setText('Waiting...');
  }

  getContainer(): Phaser.GameObjects.Container | null { return this.container; }
  getActionStartTs(): number { return this.actionStartTs; }
}
