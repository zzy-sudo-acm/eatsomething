import { DecisionInput, FoodItem, MealIntent } from '../../types';

// ---- helpers ----

const drinkPrimaryMoods = ['wantDrink', 'milkTea'];

export const hasDrinkMood = (moods: string[]) =>
  drinkPrimaryMoods.some((mood) => moods.includes(mood));

const hasLightMealReason = (input: DecisionInput, moods: string[], food: FoodItem): boolean => {
  if (moods.includes('eatLight') && food.tags.includes('eatLight')) return true;
  // Fixed: only pass-through if the food actually qualifies (<=10 and saveMoney tag)
  if (input.budget === 'under10' && moods.includes('saveMoney') && food.estimatedPrice <= 10 && food.tags.includes('saveMoney')) return true;
  return moods.includes('noQueue') && food.tags.includes('noQueue');
};

// ---- main-food eligibility ----

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

/**
 * Can this food serve as the MAIN recommendation?
 * This is a hard gate — if false, the food cannot be the primary pick.
 */
export const isEligibleAsMain = (
  food: FoodItem,
  intent: MealIntent,
  input: DecisionInput,
  moods: string[]
): EligibilityResult => {
  // Spicy block
  if (moods.includes('noSpicy') && food.spicy) {
    return { eligible: false, reason: '明确不想吃辣' };
  }

  // Starving needs satiety
  if (moods.includes('starving') && food.satiety <= 1) {
    return { eligible: false, reason: '饿疯了需要顶饱' };
  }

  if (intent === 'fullMeal') {
    if (food.mealRole === 'main') return { eligible: true };
    if (food.mealRole === 'lightMeal') {
      // Allow light meals as main if user explicitly asked for light
      if (moods.includes('eatLight')) return { eligible: true };
      // Tight budget fallback: when under10, light meals may be the only option
      if (input.budget === 'under10') return { eligible: true };
      return { eligible: false, reason: '正经吃一顿，轻食不适合当主食' };
    }
    if (food.mealRole === 'drink') return { eligible: false, reason: '饮料不能假装正餐' };
    if (food.mealRole === 'addon') {
      if (hasLightMealReason(input, moods, food) && !moods.includes('starving')) {
        return { eligible: true };
      }
      return { eligible: false, reason: '加餐不够当正餐' };
    }
    return { eligible: false };
  }

  if (intent === 'lightMeal') {
    if (food.mealRole === 'lightMeal') return { eligible: true };
    if (food.mealRole === 'main' && food.satiety <= 3) return { eligible: true };
    if (food.mealRole === 'main' && food.satiety >= 4) {
      return { eligible: false, reason: '不想吃太饱，这个太顶了' };
    }
    if (food.mealRole === 'drink') {
      if (hasDrinkMood(moods)) return { eligible: true };
      return { eligible: false, reason: '少吃点不等于只喝' };
    }
    if (food.mealRole === 'addon') return { eligible: true };
    return { eligible: false };
  }

  if (intent === 'drink') {
    if (food.mealRole === 'drink') return { eligible: true };
    // Allow light snacks as fallback for drink-only intent
    if (food.mealRole === 'lightMeal' || food.mealRole === 'addon') {
      return { eligible: true };
    }
    return { eligible: false, reason: '只想喝点东西' };
  }

  return { eligible: false };
};

// ---- drink eligibility (as a companion, not main) ----

export const isEligibleAsDrink = (
  food: FoodItem,
  moods: string[],
  remainingBudget: number
): EligibilityResult => {
  if (food.mealRole !== 'drink') {
    return { eligible: false, reason: '不是饮料' };
  }
  if (moods.includes('noSpicy') && food.spicy) {
    return { eligible: false, reason: '不想吃辣' };
  }
  if (food.estimatedPrice > remainingBudget) {
    return { eligible: false, reason: '超出剩余预算' };
  }
  return { eligible: true };
};

// ---- addon eligibility (as a companion) ----

export const isEligibleAsAddon = (
  food: FoodItem,
  moods: string[],
  remainingBudget: number
): EligibilityResult => {
  if (food.mealRole !== 'addon' && food.mealRole !== 'lightMeal') {
    return { eligible: false, reason: '不是加餐类' };
  }
  if (moods.includes('noSpicy') && food.spicy) {
    return { eligible: false, reason: '不想吃辣' };
  }
  if (food.estimatedPrice > remainingBudget) {
    return { eligible: false, reason: '超出剩余预算' };
  }
  return { eligible: true };
};

// ---- hard-block reasons (for debug / display) ----

export const getHardBlockReasons = (
  food: FoodItem,
  input: DecisionInput,
  moods: string[],
  intent: MealIntent
): string[] => {
  const reasons: string[] = [];
  const drinkNeed = hasDrinkMood(moods);

  if (moods.includes('noSpicy') && food.spicy) {
    reasons.push('明确不想吃辣');
  }

  if (moods.includes('starving') && food.satiety <= 1) {
    reasons.push('饿疯了需要顶饱');
  }

  if (moods.includes('starving') && food.mealRole === 'addon') {
    reasons.push('加餐不够当饭');
  }

  if (intent === 'fullMeal' && food.mealRole === 'drink' && !drinkNeed) {
    reasons.push('饮料不能假装正餐');
  }

  if (intent === 'fullMeal' && food.mealRole === 'addon' && food.satiety < 4) {
    reasons.push('加餐不够当正餐');
  }

  return reasons;
};
