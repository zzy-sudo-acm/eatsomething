import { DecisionHistory, DecisionInput, FoodItem, MealIntent, Recommendation, ScoredFood } from '../../types';
import { toMoodIds } from '../moods';
import { isRelationshipMood } from '../options';
import {
  buildAlternatives,
  buildMealPlan,
  buildMealPlanWithDrinkPriority,
  selectMain,
} from './buildPlan';
import { buildCopy, buildNoMatchCopy } from './copy';
import { catalogHasDrink, hasDrinkMood, isEligibleAsMainDegraded } from './eligibility';
import { detectMealPeriod, getBudgetLimit, resolveMealIntent } from './normalizeInput';
import { scoreMainFood } from './scoreMain';

// =====================================================================
// Legal degradation helpers
// =====================================================================

/**
 * Re-evaluate foods with relaxed mealRole (lightMeal allowed for fullMeal),
 * returning a ScoredFood pool suitable for selectMain.
 */
const tryDegradeFullMealToLightMeal = (
  foods: FoodItem[],
  input: DecisionInput,
  moods: string[],
  budgetLimit: number,
  /** Optional: additional budget constraint (for drink reservation). */
  extraBudgetLimit: number = Infinity,
  rng: () => number = Math.random
): ScoredFood | null => {
  const candidates = foods
    .filter((food) => {
      if (food.mealRole !== 'lightMeal') return false;
      const effectiveLimit = Math.min(budgetLimit, extraBudgetLimit);
      const degElig = isEligibleAsMainDegraded(food, 'fullMeal', input, moods, effectiveLimit);
      return degElig.eligible;
    })
    .map((food) => ({
      food,
      score: 1,
      reasons: ['退化为轻食'],
      warnings: [] as string[],
      hardBlocked: false,
      hardBlockReasons: [] as string[],
    }))
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;
  return selectMain(candidates, moods, rng, extraBudgetLimit);
};

// =====================================================================
// Main entry point
// =====================================================================

export const recommendFood = (
  foods: FoodItem[],
  history: DecisionHistory[],
  input: DecisionInput,
  rng: () => number = Math.random,
  now: Date = new Date()
): Recommendation => {
  const nowMs = now.getTime();
  const allMoods = toMoodIds([...(input.selectedMoods ?? []), ...(input.partnerMoods ?? [])]).filter(
    (mood) => !isRelationshipMood(mood)
  );

  const period = detectMealPeriod(now);
  const intent = resolveMealIntent(input, now);
  const budgetLimit = getBudgetLimit(input.budget);
  const hasDrinkInCatalog = catalogHasDrink(foods, budgetLimit, allMoods);

  const scoredMains = foods
    .map<ScoredFood>((food) =>
      scoreMainFood(food, input, allMoods, period, intent, history, nowMs, hasDrinkInCatalog)
    )
    .sort((a, b) => b.score - a.score);

  // ---- Drink-priority path (milkTea / wantDrink + non-drink intent) ----
  if (hasDrinkMood(allMoods) && intent !== 'drink') {
    return handleDrinkPriorityPath(scoredMains, foods, input, allMoods, budgetLimit, intent, history, rng);
  }

  // ---- Standard path ----
  return handleStandardPath(scoredMains, foods, input, allMoods, budgetLimit, intent, period, history, rng);
};

// =====================================================================
// Drink-priority path
// =====================================================================

const handleDrinkPriorityPath = (
  scoredMains: ScoredFood[],
  foods: FoodItem[],
  input: DecisionInput,
  allMoods: string[],
  budgetLimit: number,
  intent: MealIntent,
  history: DecisionHistory[],
  rng: () => number
): Recommendation => {
  // Attempt 1: find compatible main + drink
  const result = buildMealPlanWithDrinkPriority(scoredMains, foods, input, allMoods, rng);
  if (result) {
    return buildSuccessOrDegraded(
      result.plan,
      result.main,
      result.drinkCandidate,
      result.addonCandidate,
      scoredMains,
      input,
      allMoods,
      history,
      intent,
      !result.drinkIncluded,
      result.drinkIncluded ? undefined : `预算内无法同时容纳正餐和${allMoods.includes('milkTea') ? '奶茶' : '饮料'}`,
      rng
    );
  }

  // Attempt 2 (Fix 2): degrade fullMeal to lightMeal, still keeping the drink
  if (intent === 'fullMeal') {
    const targetDrink = findTargetDrinkForPriority(foods, budgetLimit, allMoods);
    if (targetDrink) {
      const mainBudget = budgetLimit - targetDrink.estimatedPrice;
      const degradedPick = tryDegradeFullMealToLightMeal(foods, input, allMoods, budgetLimit, mainBudget, rng);
      if (degradedPick) {
        const result2 = buildMealPlan(degradedPick, foods, input, allMoods, rng);
        // Force the reserved drink into the plan
        const planWithDrink = {
          main: degradedPick.food,
          drink: targetDrink,
          totalPrice: degradedPick.food.estimatedPrice + targetDrink.estimatedPrice,
          reasons: ['当前没有合适正餐，已退化为轻食并保留你想喝的饮料'],
        };
        return buildSuccessOrDegraded(
          planWithDrink,
          degradedPick,
          { food: targetDrink, score: 100, reasons: ['预留预算'], warnings: [], hardBlocked: false, hardBlockReasons: [] },
          result2.addonCandidate,
          scoredMains,
          input,
          allMoods,
          history,
          intent,
          true,
          '当前没有合适正餐，已退化为轻食并保留你想喝的饮料',
          rng
        );
      }
    }

    // Attempt 3: give up on the drink, try lightMeal alone
    const degradedPick2 = tryDegradeFullMealToLightMeal(foods, input, allMoods, budgetLimit, Infinity, rng);
    if (degradedPick2) {
      const result3 = buildMealPlan(degradedPick2, foods, input, allMoods, rng);
      return buildSuccessOrDegraded(
        result3.plan,
        degradedPick2,
        result3.drinkCandidate,
        result3.addonCandidate,
        scoredMains,
        input,
        allMoods,
        history,
        intent,
        true,
        '预算内放不下饮料，退化为轻食',
        rng
      );
    }
  }

  // All attempts failed → noMatch
  return buildNoMatchResult(scoredMains, intent, budgetLimit, allMoods);
};

/** Find the best target drink within budget for drink-priority mode. */
const findTargetDrinkForPriority = (
  foods: FoodItem[],
  budgetLimit: number,
  moods: string[]
): FoodItem | null => {
  const candidates = foods
    .filter((food) => food.mealRole === 'drink' && food.estimatedPrice <= budgetLimit)
    .filter((food) => !(moods.includes('noSpicy') && food.spicy));

  if (!candidates.length) return null;

  if (moods.includes('milkTea')) {
    const milkTea = candidates.find((f) => f.tags.includes('milkTea'));
    if (milkTea) return milkTea;
  }
  if (moods.includes('wantDrink')) {
    const want = candidates.find((f) => f.tags.includes('wantDrink'));
    if (want) return want;
  }
  candidates.sort((a, b) => a.estimatedPrice - b.estimatedPrice);
  return candidates[0];
};

// =====================================================================
// Standard path
// =====================================================================

const handleStandardPath = (
  scoredMains: ScoredFood[],
  foods: FoodItem[],
  input: DecisionInput,
  allMoods: string[],
  budgetLimit: number,
  intent: MealIntent,
  period: ReturnType<typeof detectMealPeriod>,
  history: DecisionHistory[],
  rng: () => number
): Recommendation => {
  const mainPick = selectMain(scoredMains, allMoods, rng);

  if (mainPick) {
    const result = buildMealPlan(mainPick, foods, input, allMoods, rng);
    let degraded = false;
    let degradeReason: string | undefined;

    if (intent === 'drink' && !catalogHasDrink(foods, budgetLimit, allMoods)) {
      degraded = true;
      degradeReason = '菜品库中没有可用饮料，已退化为轻食或加餐';
    }

    return buildSuccessOrDegraded(
      result.plan,
      mainPick,
      result.drinkCandidate,
      result.addonCandidate,
      scoredMains,
      input,
      allMoods,
      history,
      intent,
      degraded,
      degradeReason,
      rng
    );
  }

  // No legal candidate — try degradation
  let degradedPick: ScoredFood | null = null;
  let degradeReason: string | undefined;

  if (intent === 'fullMeal') {
    degradedPick = tryDegradeFullMealToLightMeal(foods, input, allMoods, budgetLimit, Infinity, rng);
    if (degradedPick) {
      degradeReason = '当前没有合适正餐，退化为轻食';
    }
  } else if (intent === 'drink' && catalogHasDrink(foods, budgetLimit, allMoods)) {
    // Drinks exist but all blocked — try light fallback
    const candidates = scoredMains.filter(
      (item) => !item.hardBlocked && (item.food.mealRole === 'lightMeal' || item.food.mealRole === 'addon')
    );
    degradedPick = candidates.length ? selectMain(candidates, allMoods, rng) : null;
    if (degradedPick) degradeReason = '可用饮料不满足当前条件，退化为轻食或加餐';
  }

  if (degradedPick) {
    const result = buildMealPlan(degradedPick, foods, input, allMoods, rng);
    return buildSuccessOrDegraded(
      result.plan,
      degradedPick,
      result.drinkCandidate,
      result.addonCandidate,
      scoredMains,
      input,
      allMoods,
      history,
      intent,
      true,
      degradeReason,
      rng
    );
  }

  return buildNoMatchResult(scoredMains, intent, budgetLimit, allMoods);
};

// =====================================================================
// Result builders (construct discriminated-union return types)
// =====================================================================

const buildSuccessOrDegraded = (
  plan: Recommendation['plan'] & {},
  pickedMain: ScoredFood,
  drinkCandidate: ScoredFood | null,
  addonCandidate: ScoredFood | null,
  scoredMains: ScoredFood[],
  input: DecisionInput,
  allMoods: string[],
  history: DecisionHistory[],
  intent: MealIntent,
  degraded: boolean,
  degradeReason: string | undefined,
  rng: () => number
): Extract<Recommendation, { status: 'success' | 'degraded' }> => {
  const alternatives = buildAlternatives(pickedMain, scoredMains, input, allMoods);
  const copy = buildCopy(pickedMain, plan, input, alternatives, history, intent, degraded, degradeReason);

  const scoredFoods = scoredMains.map((item) => {
    if (drinkCandidate && item.food.id === drinkCandidate.food.id) {
      return { ...item, reasons: [...item.reasons, '→ 选为搭配饮料'], score: Math.max(item.score, 1) };
    }
    if (addonCandidate && item.food.id === addonCandidate.food.id) {
      return { ...item, reasons: [...item.reasons, '→ 选为搭配加餐'], score: Math.max(item.score, 1) };
    }
    return item;
  });

  return {
    status: degraded ? 'degraded' : 'success',
    plan,
    food: plan.main,
    score: pickedMain.score,
    alternatives,
    copy,
    scoredFoods,
    degraded,
    degradeReason,
  };
};

const buildNoMatchResult = (
  scoredMains: ScoredFood[],
  intent: MealIntent,
  budgetLimit: number,
  allMoods: string[]
): Extract<Recommendation, { status: 'noMatch' }> => {
  const degradeReason = buildNoMatchReason(intent, scoredMains, budgetLimit, allMoods);
  const copy = buildNoMatchCopy(intent, scoredMains, budgetLimit, allMoods, degradeReason);

  const scoredFoods = scoredMains.map((item) => item);

  return {
    status: 'noMatch',
    alternatives: [],
    copy,
    scoredFoods,
    degraded: true as const,
    degradeReason,
  };
};

// =====================================================================
// noMatch reason builder
// =====================================================================

const buildNoMatchReason = (
  intent: MealIntent,
  scoredMains: ScoredFood[],
  budgetLimit: number,
  moods: string[]
): string => {
  const withinBudget = scoredMains.filter((item) => item.food.estimatedPrice <= budgetLimit);

  if (withinBudget.length === 0) {
    return `所有食物均超出预算上限(${budgetLimit}元)`;
  }

  if (moods.includes('noSpicy')) {
    const nonSpicy = withinBudget.filter((item) => !item.food.spicy);
    if (nonSpicy.length === 0) {
      return '所有预算内食物都是辣的，没有符合"不吃辣"的选项';
    }
  }

  if (intent === 'fullMeal') {
    const mains = withinBudget.filter((item) => item.food.mealRole === 'main' && !item.hardBlocked);
    if (mains.length === 0) {
      const light = withinBudget.filter((item) => item.food.mealRole === 'lightMeal' && !item.hardBlocked);
      if (light.length > 0) {
        return '没有符合条件的正餐，且无法退化为轻食';
      }
      return '没有符合条件的正餐或轻食';
    }
  }

  if (intent === 'drink') {
    const drinks = withinBudget.filter((item) => item.food.mealRole === 'drink' && !item.hardBlocked);
    if (drinks.length === 0) {
      return '菜品库中没有可用饮料，且无替代选项';
    }
  }

  return '没有符合条件的候选';
};

// Re-export sub-modules for testing / inspection
export { detectMealPeriod, resolveMealIntent, getBudgetLimit, wantsUpscale } from './normalizeInput';
export { isEligibleAsMain, isEligibleAsDrink, isEligibleAsAddon, getHardBlockReasons, hasDrinkMood, catalogHasDrink, isEligibleAsMainDegraded } from './eligibility';
export { scoreMainFood } from './scoreMain';
export { scoreDrinkOption, scoreAddonOption, shouldConsiderDrink, shouldConsiderAddon } from './scoreAddon';
export { buildMealPlan, buildAlternatives, selectMain } from './buildPlan';
export { buildCopy, buildNoMatchCopy } from './copy';
export { recentPenalty, feedbackScore, regretStreak, skipPenalty } from './feedback';
