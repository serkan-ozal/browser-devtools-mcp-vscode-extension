import type Phaser from 'phaser';

export type AgentAnimationState = 'idle' | 'walking' | 'acting';

/** One item in the per-agent animation queue: walk to zone then run action until tool_finished. */
export type QueuedAction = {
  toolName: string;
  catalogId: string;
  zone: { x: number; y: number };
};

export type AgentState = {
  /** Container that moves together (shadow + hero sprite as children). */
  container: Phaser.GameObjects.Container;
  /** The animated character sprite inside the container. */
  heroSprite: Phaser.GameObjects.Sprite;
  /** Optional floating label above character (used by content wizard). */
  headLabel?: Phaser.GameObjects.Text;
  walkTween: Phaser.Tweens.Tween | null;
  actionTween: Phaser.Tweens.Tween | null;
  finishTimer: Phaser.Time.TimerEvent | null;
  actionStartedAtMs: number;
  pendingFinishes: number;
  currentToolName?: string;
  /** Per-agent queue: walk to zone → action; next item only starts when current action is stopped by tool_finished. */
  animationQueue: QueuedAction[];
  state: AgentAnimationState;
};
