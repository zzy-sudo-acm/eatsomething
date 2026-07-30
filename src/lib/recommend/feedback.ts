import { DecisionHistory } from '../../types';

const dayMs = 24 * 60 * 60 * 1000;

// ---- helpers ----

const getLatestFoodTime = (history: DecisionHistory[], foodId: string) =>
  history
    .filter((item) => item.foodId === foodId && item.feedback !== 'skipped')
    .map((item) => item.createdAt)
    .sort((a, b) => b - a)[0];

const ratedHistory = (history: DecisionHistory[], foodId: string) =>
  history
    .filter((item) => item.foodId === foodId && item.feedback && item.feedback !== 'skipped')
    .sort((a, b) => b.createdAt - a.createdAt);

// ---- scoring functions ----

/**
 * Penalty for recently-eaten food. Continuous decay from strong penalty.
 */
export const recentPenalty = (history: DecisionHistory[], foodId: string, now: number): number => {
  const latest = getLatestFoodTime(history, foodId);
  if (!latest) return 0;
  const days = (now - latest) / dayMs;
  if (days <= 0.5) return -28;
  if (days <= 1) return -25;
  if (days <= 3) return -15;
  if (days <= 7) return -8;
  return 0;
};

/**
 * Continuous feedback decay: Math.exp(-days / 30).
 * Replaces the old step-function (1 → 0.7 → 0.4).
 * Day 0: 1.0, Day 7: 0.79, Day 30: 0.37, Day 60: 0.14
 */
export const feedbackScore = (history: DecisionHistory[], foodId: string, now: number): number => {
  let positive = 0;
  let negative = 0;
  for (const item of ratedHistory(history, foodId)) {
    const days = (now - item.createdAt) / dayMs;
    const decay = Math.exp(-days / 30);
    if (item.feedback === 'worth') positive += 5 * decay;
    if (item.feedback === 'normal') positive += 1 * decay;
    if (item.feedback === 'regret') negative += 10 * decay;
  }
  return Math.round(Math.min(positive, 20) - Math.min(negative, 40));
};

/**
 * Consecutive regret count from most recent backwards.
 */
export const regretStreak = (history: DecisionHistory[], foodId: string): number => {
  let streak = 0;
  for (const item of ratedHistory(history, foodId)) {
    if (item.feedback === 'regret') streak += 1;
    else break;
  }
  return streak;
};

/**
 * Skip penalty: strong within 10 min, moderate within 24 h.
 */
export const skipPenalty = (history: DecisionHistory[], foodId: string, now: number): number => {
  const latest = history
    .filter((item) => item.foodId === foodId && item.feedback === 'skipped')
    .map((item) => item.createdAt)
    .sort((a, b) => b - a)[0];

  if (!latest) return 0;

  const minutes = (now - latest) / (60 * 1000);
  const days = (now - latest) / dayMs;

  if (minutes <= 10) return -30;
  if (days <= 1) return -10;
  return 0;
};
