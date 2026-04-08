// Shared context interface passed to all character modules so they can
// query run state and schedule/cancel stop timers without circular imports.

export type CharId = 'mc' | 'thor' | 'grey' | 'batman';
export type TimerKey = 'mcStopTimer' | 'painterStopTimer' | 'explorerStopTimer' | 'rangerStopTimer' | 'fmStopTimer';

export interface HudContext {
  isRunFinished(): boolean;
  getSelectedCharacter(): CharId;
  getHeroTier(): number;
  isParchRespVisible(): boolean;
  scheduleStop(key: TimerKey, startTs: number, fn: () => void): void;
  cancelStopTimer(key: TimerKey): void;
}
