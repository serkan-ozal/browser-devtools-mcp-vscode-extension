import Phaser from 'phaser';
import type { HudContext } from '../HudContext';
import { WORLD_WIDTH, WORLD_HEIGHT, PARSOMEN_KEY } from '../scene-constants';

/** Parchment scroll panel that displays agent response text. */
export class ParchmentPanel {
  group: Phaser.GameObjects.GameObject[] = [];
  pages: string[] = [];
  pageIdx = 0;
  visible = false;
  timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private scene: Phaser.Scene,
    private ctx: HudContext,
    private onShow: () => void,
    private onHide: () => void,
  ) {}

  /** Schedule showing the parchment 8 seconds after receiving the response text. */
  scheduleShow(responseText: string): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    const DELAY_MS = 8_000;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.show(responseText);
    }, DELAY_MS);
  }

  /** Show the parchment panel immediately with the given response text. */
  show(responseText: string): void {
    this.clear();
    this.visible = true;
    this.pages   = this.paginate(responseText);
    this.pageIdx = 0;
    this.onShow();
    this.renderPage();
  }

  /** Clear and hide the parchment panel. */
  clear(): void {
    for (const obj of this.group) {
      if (obj && typeof (obj as { destroy?: () => void }).destroy === 'function') {
        (obj as { destroy: () => void }).destroy();
      }
    }
    this.group   = [];
    this.pages   = [];
    this.pageIdx = 0;
    this.visible = false;
    this.onHide();
  }

  /** Cancel pending schedule timer and clear the panel. */
  cancelAndClear(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.clear();
  }

  isVisible(): boolean { return this.visible; }

  /** Re-render the current page (e.g. after panel visibility changes). */
  refresh(): void {
    if (!this.visible) return;
    this.renderPage();
  }

  private renderPage(): void {
    const prev = this.group.slice();
    this.group = [];

    const D  = 60;
    const PW = 540;
    const PH = 420; // shorter to leave ~100px for hero panels at bottom
    const PX = WORLD_WIDTH  / 2;      // 400
    const PY = WORLD_HEIGHT / 2 - 10; // 290 — shifted up to stay within view

    const parch = this.scene.add.image(PX, PY, PARSOMEN_KEY);
    parch.setDisplaySize(PW, PH);
    parch.setDepth(D);
    this.group.push(parch);

    // Writable area — rollers occupy ~20% top/bottom; side margins ~22% each side.
    const WA_LEFT  = PX - PW * 0.22;
    const WA_WIDTH = PW * 0.54;
    const WA_TOP   = PY - PH * 0.30;
    const WA_BOT   = PY + PH * 0.29;

    const FONT_BODY = '"Palatino Linotype", "Book Antiqua", Palatino, serif';
    const FONT_BTN  = '"Palatino Linotype", "Book Antiqua", Palatino, serif';

    const title = this.scene.add.text(PX, WA_TOP + 18, '✦  BROWSER DEVTOOLS MCP RESULT  ✦', {
      fontSize: '15px',
      fontFamily: FONT_BODY,
      color: '#1a0800',
      fontStyle: 'bold italic',
    });
    title.setOrigin(0.5, 0);
    title.setDepth(D + 2);
    this.group.push(title);

    // Close button — top right
    const closeBtn = this.scene.add.text(WA_LEFT + WA_WIDTH, WA_TOP + 10, '[ ✕ ]', {
      fontSize: '13px',
      fontFamily: FONT_BTN,
      color: '#7a3a00',
      fontStyle: 'bold',
    });
    closeBtn.setOrigin(1, 0);
    closeBtn.setDepth(D + 3);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover',  () => closeBtn.setColor('#c0392b'));
    closeBtn.on('pointerout',   () => closeBtn.setColor('#7a3a00'));
    closeBtn.on('pointerdown',  () => this.clear());
    this.group.push(closeBtn);

    // Divider
    const divGfx = this.scene.add.graphics();
    divGfx.lineStyle(1, 0x8b6020, 0.7);
    divGfx.beginPath();
    divGfx.moveTo(WA_LEFT + 8,              WA_TOP + 36);
    divGfx.lineTo(WA_LEFT + WA_WIDTH - 8,  WA_TOP + 36);
    divGfx.strokePath();
    divGfx.setDepth(D + 2);
    this.group.push(divGfx);

    // Content area
    const contentTopY = WA_TOP + 44;
    const bottomBarH  = 28;
    const contentBotY = WA_BOT - bottomBarH;
    const displayText = this.pages[this.pageIdx] ?? '';
    const CONTENT_W   = WA_WIDTH - 24;

    // Warm tint behind text
    const textBg = this.scene.add.rectangle(
      PX,
      contentTopY + (contentBotY - contentTopY) / 2,
      CONTENT_W + 4,
      contentBotY - contentTopY,
      0xf5e8c0,
      0.35,
    );
    textBg.setDepth(D + 1);
    this.group.push(textBg);

    const content = this.scene.add.text(WA_LEFT + 12, contentTopY, displayText, {
      fontSize: '13px',
      fontFamily: FONT_BODY,
      color: '#1a0800',
      align: 'left',
      lineSpacing: 5,
      wordWrap: { width: CONTENT_W },
    });
    content.setOrigin(0, 0);
    content.setDepth(D + 2);
    this.group.push(content);

    // Bottom navigation bar
    const navY = WA_BOT - bottomBarH / 2 - 8;
    const totalPages = this.pages.length;

    if (totalPages > 1) {
      // Page indicator — centered
      const pageLabel = this.scene.add.text(PX, navY, `${this.pageIdx + 1} / ${totalPages}`, {
        fontSize: '12px',
        fontFamily: FONT_BTN,
        color: '#3d1f00',
        fontStyle: 'bold',
      });
      pageLabel.setOrigin(0.5, 0.5);
      pageLabel.setDepth(D + 2);
      this.group.push(pageLabel);

      // Previous button
      const prevEnabled = this.pageIdx > 0;
      const prevBtn = this.scene.add.text(WA_LEFT + 8, navY, '◄ Prev', {
        fontSize: '12px',
        fontFamily: FONT_BTN,
        color: prevEnabled ? '#5a2d00' : '#b8a070',
        fontStyle: 'bold',
        backgroundColor: prevEnabled ? '#e8d090' : undefined,
        padding: { x: 5, y: 2 },
      });
      prevBtn.setOrigin(0, 0.5);
      prevBtn.setDepth(D + 3);
      if (prevEnabled) {
        prevBtn.setInteractive({ useHandCursor: true });
        prevBtn.on('pointerover',  () => prevBtn.setBackgroundColor('#c8a840'));
        prevBtn.on('pointerout',   () => prevBtn.setBackgroundColor('#e8d090'));
        prevBtn.on('pointerdown',  () => this.flipPage(-1));
      }
      this.group.push(prevBtn);

      // Next button
      const nextEnabled = this.pageIdx < totalPages - 1;
      const nextBtn = this.scene.add.text(WA_LEFT + WA_WIDTH - 8, navY, 'Next ►', {
        fontSize: '12px',
        fontFamily: FONT_BTN,
        color: nextEnabled ? '#5a2d00' : '#b8a070',
        fontStyle: 'bold',
        backgroundColor: nextEnabled ? '#e8d090' : undefined,
        padding: { x: 5, y: 2 },
      });
      nextBtn.setOrigin(1, 0.5);
      nextBtn.setDepth(D + 3);
      if (nextEnabled) {
        nextBtn.setInteractive({ useHandCursor: true });
        nextBtn.on('pointerover',  () => nextBtn.setBackgroundColor('#c8a840'));
        nextBtn.on('pointerout',   () => nextBtn.setBackgroundColor('#e8d090'));
        nextBtn.on('pointerdown',  () => this.flipPage(1));
      }
      this.group.push(nextBtn);
    }

    this.destroyObjects(prev);
  }

  private flipPage(dir: -1 | 1): void {
    const next = this.pageIdx + dir;
    if (next < 0 || next >= this.pages.length) return;
    this.pageIdx = next;
    this.renderPage();
  }

  /** Paginate text: 48 chars/line, 9 lines/page. */
  private paginate(text: string): string[] {
    const CHARS = 48;
    const LINES = 9;
    const wrapped = text
      .split('\n')
      .flatMap((line) => this.wrapLine(line, CHARS));
    const pages: string[] = [];
    for (let i = 0; i < wrapped.length; i += LINES) {
      pages.push(wrapped.slice(i, i + LINES).join('\n'));
    }
    return pages.length > 0 ? pages : ['(empty response)'];
  }

  private wrapLine(line: string, maxChars: number): string[] {
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

  private destroyObjects(objects: Phaser.GameObjects.GameObject[]): void {
    for (const obj of objects) {
      if (obj && typeof (obj as { destroy?: () => void }).destroy === 'function') {
        (obj as { destroy: () => void }).destroy();
      }
    }
  }
}
