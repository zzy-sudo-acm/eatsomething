import { DecisionInput, FoodItem, ScoredFood } from '../../types';
import { hasDrinkMood, isEligibleAsAddon, isEligibleAsDrink } from './eligibility';

/**
 * Should we even consider a drink companion?
 */
export const shouldConsiderDrink = (
  main: FoodItem,
  input: DecisionInput,
  moods: string[],
  remainingBudget: number
): boolean => {
  // If user explicitly wants a drink
  if (hasDrinkMood(moods)) return true;
  // Couple mode — drink is a nice add-on
  if (input.coupleMode && remainingBudget >= 10) return true;
  // Reward / afterExam — treat yourself
  if ((moods.includes('reward') || moods.includes('afterExam')) && remainingBudget >= 10) return true;
  // Natural pairing: main + drink combo
  if (main.tags.includes('wantDrink') && remainingBudget >= 10) return true;
  return false;
};

/**
 * Score a drink candidate as a companion to the main food.
 */
export const scoreDrinkOption = (
  food: FoodItem,
  main: FoodItem,
  input: DecisionInput,
  moods: string[],
  remainingBudget: number
): ScoredFood | null => {
  const eligibility = isEligibleAsDrink(food, moods, remainingBudget);
  if (!eligibility.eligible) return null;

  let score = 5;
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Strong match if user explicitly wants this
  if (hasDrinkMood(moods) && food.tags.some((tag) => moods.includes(tag))) {
    score += 20;
    reasons.push('正好想喝');
  }

  // Milk tea specific
  if (moods.includes('milkTea') && food.tags.includes('milkTea')) {
    score += 18;
    reasons.push('想喝奶茶');
  }

  // Couple mode
  if (input.coupleMode && food.tags.includes('coupleFriendly')) {
    score += 6;
    reasons.push('适合两个人');
  }

  // Reward
  if (moods.includes('reward') && food.tags.includes('reward')) {
    score += 8;
    reasons.push('奖励自己');
  }

  // Budget fit: prefer drinks that leave some headroom
  const afterDrink = remainingBudget - food.estimatedPrice;
  if (afterDrink < 0) {
    score -= 50; // over budget — effectively excluded
    warnings.push('超出剩余预算');
  } else if (afterDrink >= 5) {
    score += 4; // comfortable fit
  }

  // Stability
  if (food.stability === 'high') score += 4;

  return {
    food,
    score,
    reasons,
    warnings,
    hardBlocked: false,
    hardBlockReasons: [],
  };
};

/**
 * Should we even consider an addon companion?
 */
export const shouldConsiderAddon = (
  main: FoodItem,
  input: DecisionInput,
  moods: string[],
  remainingBudget: number
): boolean => {
  // Main food not filling enough
  if (main.satiety <= 2 && remainingBudget >= 5) return true;
  // Couple mode — sharing
  if (input.coupleMode && remainingBudget >= 8) return true;
  // Reward / afterExam
  if ((moods.includes('reward') || moods.includes('afterExam')) && remainingBudget >= 10) return true;
  // Light meal + still room
  if (moods.includes('eatLight') && main.satiety <= 3 && remainingBudget >= 8) return true;
  return false;
};

/**
 * Score an addon candidate as a companion to the main food.
 */
export const scoreAddonOption = (
  food: FoodItem,
  main: FoodItem,
  input: DecisionInput,
  moods: string[],
  remainingBudget: number
): ScoredFood | null => {
  const eligibility = isEligibleAsAddon(food, moods, remainingBudget);
  if (!eligibility.eligible) return null;

  let score = 3;
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Complementary to main
  if (main.satiety <= 2 && food.satiety >= 2) {
    score += 12;
    reasons.push('补充饱腹度');
  }

  // Couple mode sharing
  if (input.coupleMode && food.tags.includes('coupleFriendly')) {
    score += 6;
    reasons.push('适合分享');
  }

  // Reward
  if (moods.includes('reward')) {
    score += 4;
    reasons.push('加个奖励小食');
  }

  // Budget fit
  const afterAddon = remainingBudget - food.estimatedPrice;
  if (afterAddon < 0) {
    score -= 50;
    warnings.push('超出剩余预算');
  } else if (afterAddon >= 5) {
    score += 2;
  }

  // Stability
  if (food.stability === 'high') score += 3;

  // No spicy when user doesn't want spicy
  if (moods.includes('noSpicy') && food.spicy) {
    score -= 20;
    warnings.push('不想吃辣');
  }

  return {
    food,
    score,
    reasons,
    warnings,
    hardBlocked: false,
    hardBlockReasons: [],
  };
};
