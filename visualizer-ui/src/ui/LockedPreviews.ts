import Phaser from 'phaser';
import type { HudContext } from '../HudContext';
import type { CharId } from '../HudContext';
import {
  HERO_FW,
  HERO_TIER_THRESHOLDS,
  LOCK_Y,
  LOCK_X_MC,
  LOCK_X_THOR,
  LOCK_X_GREY,
  LOCK_X_BATMAN,
  LOCK_PANEL_W,
  LOCK_PANEL_H,
  MC_WALK_KEY,
  THOR_ELECTRIC_KEY,
  GREY_SMOKE_KEY,
  BAT_BATMOBILE_KEY,
} from '../scene-constants';

/** Bottom-row locked/unlocked character selection panels. */
export class LockedPreviews {
  private objects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: Phaser.Scene,
    private ctx: HudContext,
    private onSelect: (char: CharId) => void,
  ) {}

  /** Build all preview panels from scratch. */
  create(): void {
    const defs = [
      { tier: 0, key: MC_WALK_KEY,       name: 'Woodsman',    required: 0,                       x: LOCK_X_MC     },
      { tier: 1, key: THOR_ELECTRIC_KEY, name: 'Thor',        required: HERO_TIER_THRESHOLDS[1], x: LOCK_X_THOR   },
      { tier: 2, key: GREY_SMOKE_KEY,    name: 'GreyIronMan', required: HERO_TIER_THRESHOLDS[2], x: LOCK_X_GREY   },
      { tier: 3, key: BAT_BATMOBILE_KEY, name: 'Batman',      required: HERO_TIER_THRESHOLDS[3], x: LOCK_X_BATMAN },
    ];

    const charId = (tier: number): CharId =>
      tier === 0 ? 'mc' : tier === 1 ? 'thor' : tier === 2 ? 'grey' : 'batman';

    // Panels are visible when at least one hero is unlocked OR the parchment is open.
    const vis = this.ctx.getHeroTier() > 0 || this.ctx.isParchRespVisible();

    for (const d of defs) {
      const id       = charId(d.tier);
      const unlocked = d.tier === 0 || this.ctx.getHeroTier() >= d.tier;
      const selected = this.ctx.getSelectedCharacter() === id;
      const D        = 300;
      const previewScale = (LOCK_PANEL_W - 10) / HERO_FW;

      const borderColor = selected ? 0x00ff88 : unlocked ? 0xffd700 : 0x555555;
      const borderWidth = selected ? 3 : 2;

      // Panel background
      const panel = this.scene.add.rectangle(d.x, LOCK_Y, LOCK_PANEL_W + 4, LOCK_PANEL_H, 0x000000, unlocked ? 0.55 : 0.75);
      panel.setDepth(D);
      panel.setStrokeStyle(borderWidth, borderColor);
      panel.setVisible(vis);
      this.objects.push(panel);

      // Invisible hit zone (only when unlocked and visible)
      if (unlocked && vis) {
        const hit = this.scene.add.rectangle(d.x, LOCK_Y, LOCK_PANEL_W + 4, LOCK_PANEL_H, 0x000000, 0);
        hit.setDepth(D + 5);
        hit.setInteractive({ cursor: 'pointer' });
        hit.on('pointerdown', () => { this.onSelect(id); });
        hit.on('pointerover', () => { if (!selected) panel.setStrokeStyle(3, 0xffffff); });
        hit.on('pointerout',  () => { panel.setStrokeStyle(borderWidth, borderColor); });
        this.objects.push(hit);
      }

      // Character first-frame preview sprite
      const preview = this.scene.add.sprite(d.x, LOCK_Y - 10, d.key, 0);
      preview.setScale(previewScale);
      preview.setDepth(D + 1);
      if (!unlocked) preview.setTint(0x444444);
      preview.setVisible(vis);
      this.objects.push(preview);

      // Row 1: required tools (or "default" for MC)
      const reqText = d.tier === 0 ? 'default' : `${d.required} tools`;
      const line1 = this.scene.add.text(d.x, LOCK_Y + LOCK_PANEL_H / 2 - 22, reqText, {
        fontSize: '6px', fontFamily: '"Press Start 2P", monospace',
        color: selected ? '#00ff88' : unlocked ? '#ffd700' : '#888888',
      });
      line1.setOrigin(0.5, 0);
      line1.setDepth(D + 2);
      line1.setVisible(vis);
      this.objects.push(line1);

      // Row 2: character name
      const line2 = this.scene.add.text(d.x, LOCK_Y + LOCK_PANEL_H / 2 - 10, d.name, {
        fontSize: '7px', fontFamily: '"Press Start 2P", monospace',
        color: selected ? '#00ff88' : unlocked ? '#ffffff' : '#aaaaaa',
        fontStyle: unlocked ? 'bold' : 'normal',
      });
      line2.setOrigin(0.5, 0);
      line2.setDepth(D + 2);
      line2.setVisible(vis);
      this.objects.push(line2);

      // "ACTIVE" badge on top of selected panel
      if (selected) {
        const badge = this.scene.add.text(d.x, LOCK_Y - LOCK_PANEL_H / 2 + 2, '▶ ACTIVE', {
          fontSize: '5px', fontFamily: '"Press Start 2P", monospace',
          color: '#00ff88', fontStyle: 'bold',
        });
        badge.setOrigin(0.5, 0);
        badge.setDepth(D + 2);
        badge.setVisible(vis);
        this.objects.push(badge);
      }

      // Lock icon on locked panels
      if (!unlocked) {
        const lock = this.scene.add.text(d.x + LOCK_PANEL_W / 2 - 4, LOCK_Y - LOCK_PANEL_H / 2 + 3, '🔒', { fontSize: '11px' });
        lock.setDepth(D + 2);
        lock.setVisible(vis);
        this.objects.push(lock);
      }
    }
  }

  /** Destroy all existing panels and recreate them (e.g. after selection change). */
  refresh(): void {
    for (const obj of this.objects) (obj as Phaser.GameObjects.GameObject).destroy();
    this.objects = [];
    this.create();
  }

  /** Cycle selection by dir (-1 = left, +1 = right) through unlocked characters. */
  cycle(dir: -1 | 1): void {
    const all: CharId[] = ['mc', 'thor', 'grey', 'batman'];
    const unlocked = all.filter((_c, i) => i === 0 || this.ctx.getHeroTier() >= i);
    const cur  = unlocked.indexOf(this.ctx.getSelectedCharacter());
    const next = (cur + dir + unlocked.length) % unlocked.length;
    this.onSelect(unlocked[next]);
  }
}
