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
 * Check whether any budget-fitting drink exists in the entire catalog.
 */
export const catalogHasDrink = (
  allFoods: FoodItem[],
  budgetLimit: number,
  moods: string[]
): boolean =>
  allFoods.some(
    (food) =>
      food.mealRole === 'drink' &&
      food.estimatedPrice <= budgetLimit &&
      !(moods.includes('noSpicy') && food.spicy)
  );

/**
 * Can this food serve as the MAIN recommendation?
 * This is a hard gate — if false, the food cannot be the primary pick.
 */
export const isEligibleAsMain = (
  food: FoodItem,
  intent: MealIntent,
  input: DecisionInput,
  moods: string[],
  budgetLimit: number = Infinity,
  hasDrinkInCatalog: boolean = true
): EligibilityResult => {
  // -------- Hard budget cap (Fix 2) --------
  if (food.estimatedPrice > budgetLimit) {
    return { eligible: false, reason: `超出预算上限(${budgetLimit}元)` };
  }

  // Spicy block
  if (moods.includes('noSpicy') && food.spicy) {
    return { eligible: false, reason: '明确不想吃辣' };
  }

  // Starving: lightMeal or addon with satiety <= 2 cannot substitute a real meal
  if (moods.includes('starving') && food.mealRole !== 'main' && food.satiety <= 2) {
    return { eligible: false, reason: '饿疯了，轻食或加餐不够顶' };
  }

  if (intent === 'fullMeal') {
    if (food.mealRole === 'main') {
      // Starving requires adequate satiety even for mains
      if (moods.includes('starving') && food.satiety <= 2) {
        return { eligible: false, reason: '饿疯了，这个不够顶饱' };
      }
      return { eligible: true };
    }
    if (food.mealRole === 'lightMeal') {
      if (moods.includes('eatLight')) return { eligible: true };
      // Tight budget fallback: under10 may have no true mains
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

  // -------- Fix 1: drink intent — layered candidates --------
  if (intent === 'drink') {
    // If any budget-fitting drink exists in the catalog, ONLY drinks can be main
    if (hasDrinkInCatalog) {
      if (food.mealRole === 'drink') return { eligible: true };
      return { eligible: false, reason: '只想喝点东西，菜品库有饮料可选' };
    }
    // No drinks in catalog: degrade to lightMeal or addon
    if (food.mealRole === 'drink') return { eligible: true };
    if (food.mealRole === 'lightMeal' || food.mealRole === 'addon') {
      return { eligible: true };
    }
    return { eligible: false, reason: '只想喝点东西，菜品库也没有饮料' };
  }

  return { eligible: false };
};

// ---- drink eligibility (as a companion, not main) ----

export const isEligibleAsDrink = (
  food: FoodItem,
  moods: string[],
  remainingBudget: number
): EligibilityResult => {
  if (food.estimatedPrice > remainingBudget) {
    return { eligible: false, reason: '超出剩余预算' };
  }
  if (food.mealRole !== 'drink') {
    return { eligible: false, reason: '不是饮料' };
  }
  if (moods.includes('noSpicy') && food.spicy) {
    return { eligible: false, reason: '不想吃辣' };
  }
  return { eligible: true };
};

// ---- addon eligibility (as a companion) ----

export const isEligibleAsAddon = (
  food: FoodItem,
  moods: string[],
  remainingBudget: number
): EligibilityResult => {
  if (food.estimatedPrice > remainingBudget) {
    return { eligible: false, reason: '超出剩余预算' };
  }
  if (food.mealRole !== 'addon' && food.mealRole !== 'lightMeal') {
    return { eligible: false, reason: '不是加餐类' };
  }
  if (moods.includes('noSpicy') && food.spicy) {
    return { eligible: false, reason: '不想吃辣' };
  }
  return { eligible: true };
};

/**
 * Degradation eligibility: like isEligibleAsMain but relaxes fullMeal's
 * restriction on lightMeal. Used when no 'main' food exists.
 *
 * All OTHER hard constraints (budget, spicy, starving, etc.) still apply.
 */
export const isEligibleAsMainDegraded = (
  food: FoodItem,
  intent: MealIntent,
  input: DecisionInput,
  moods: string[],
  budgetLimit: number = Infinity,
  hasDrinkInCatalog: boolean = true
): EligibilityResult => {
  // Same hard constraints
  if (food.estimatedPrice > budgetLimit) {
    return { eligible: false, reason: `超出预算上限(${budgetLimit}元)` };
  }
  if (moods.includes('noSpicy') && food.spicy) {
    return { eligible: false, reason: '明确不想吃辣' };
  }
  if (moods.includes('starving') && food.satiety <= 1) {
    return { eligible: false, reason: '饿疯了需要顶饱' };
  }
  // Starving + low-satiety lightMeal → still blocked
  if (moods.includes('starving') && food.mealRole === 'lightMeal' && food.satiety <= 2) {
    return { eligible: false, reason: '饿疯了，轻食不够顶' };
  }

  if (intent === 'fullMeal') {
    // Relax: allow lightMeal as degraded fallback
    if (food.mealRole === 'main' || food.mealRole === 'lightMeal') return { eligible: true };
    if (food.mealRole === 'drink') return { eligible: false, reason: '饮料不能假装正餐' };
    if (food.mealRole === 'addon') {
      return { eligible: false, reason: '加餐不够当正餐' };
    }
    return { eligible: false };
  }

  // For other intents, use normal eligibility
  return isEligibleAsMain(food, intent, input, moods, budgetLimit, hasDrinkInCatalog);
};

// ---- hard-block reasons (for debug / display) ----

export const getHardBlockReasons = (
  food: FoodItem,
  input: DecisionInput,
  moods: string[],
  intent: MealIntent,
  budgetLimit: number = Infinity
): string[] => {
  const reasons: string[] = [];
  const drinkNeed = hasDrinkMood(moods);

  if (food.estimatedPrice > budgetLimit) {
    reasons.push(`超出预算上限(${budgetLimit}元)`);
  }

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
