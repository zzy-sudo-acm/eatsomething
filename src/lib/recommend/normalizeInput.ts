import { DecisionInput, MealIntent, MealPeriod, PriceRange } from '../../types';

/**
 * Detect meal period from local time.
 * breakfast: 05:00–10:30
 * lunch:     10:30–14:30
 * dinner:    16:30–21:30
 * lateNight: 21:30–05:00
 * other:     everything else
 */
export const detectMealPeriod = (now: Date = new Date()): MealPeriod => {
  const h = now.getHours();
  const m = now.getMinutes();
  const t = h + m / 60;

  if (t >= 5 && t < 10.5) return 'breakfast';
  if (t >= 10.5 && t < 14.5) return 'lunch';
  if (t >= 16.5 && t < 21.5) return 'dinner';
  if (t >= 21.5 || t < 5) return 'lateNight';
  return 'other';
};

/**
 * Resolve meal intent. Explicit user choice wins; otherwise derive from period.
 * Lunch & dinner default to fullMeal. Late-night defaults to lightMeal.
 */
export const resolveMealIntent = (input: DecisionInput, now: Date = new Date()): MealIntent => {
  if (input.mealIntent) return input.mealIntent;
  const period = detectMealPeriod(now);
  if (period === 'lunch' || period === 'dinner') return 'fullMeal';
  if (period === 'lateNight') return 'lightMeal';
  return 'fullMeal';
};

/** Map budget range to a hard price ceiling. */
export const getBudgetLimit = (budget: PriceRange): number => {
  switch (budget) {
    case 'under10': return 10;
    case 'under20': return 20;
    case 'under50': return 50;
    default: return Infinity;
  }
};

/**
 * Whether the current scenario suggests the user wants something more
 * substantial / formal than a bare-minimum meal.
 */
export const wantsUpscale = (
  moods: string[],
  period: MealPeriod,
  coupleMode: boolean
): boolean => {
  if (moods.includes('reward')) return true;
  if (moods.includes('afterExam')) return true;
  if (coupleMode) return true;
  if (period === 'dinner') return true;
  return false;
};
