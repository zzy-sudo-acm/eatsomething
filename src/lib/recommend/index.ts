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
// Legal degradation rules
// =====================================================================

/**
 * Try to degrade fullMeal to lightMeal when no main exists.
 * Re-evaluates eligibility with relaxed mealRole constraint.
 */
const tryDegradeFullMealToLightMeal = (
  foods: FoodItem[],
  input: DecisionInput,
  moods: string[],
  budgetLimit: number,
  rng: () => number
): ScoredFood | null => {
  const candidates = foods
    .filter((food) => {
      // Only consider lightMeal foods (or main, already covered by normal path)
      if (food.mealRole !== 'lightMeal') return false;
      const degElig = isEligibleAsMainDegraded(food, 'fullMeal', input, moods, budgetLimit);
      return degElig.eligible;
    })
    .map((food) => ({
      food,
      score: 1, // low baseline — they're fallbacks
      reasons: ['退化为轻食'],
      warnings: [] as string[],
      hardBlocked: false,
      hardBlockReasons: [] as string[],
    }))
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;
  return selectMain(candidates, moods, rng);
};

/**
 * Try to degrade drink intent to lightMeal/addon when no drinks exist in catalog.
 * Already handled by hasDrinkInCatalog flag, but if drinks exist yet all are blocked
 * (e.g. over-budget), try light fallback.
 */
const tryDegradeDrinkToLight = (
  scoredMains: ScoredFood[],
  moods: string[],
  rng: () => number
): ScoredFood | null => {
  const candidates = scoredMains.filter(
    (item) =>
      !item.hardBlocked &&
      (item.food.mealRole === 'lightMeal' || item.food.mealRole === 'addon')
  );
  if (!candidates.length) return null;
  return selectMain(candidates, moods, rng);
};

// =====================================================================
// Main entry point
// =====================================================================

/**
 * Main entry point: recommend a meal plan.
 *
 * @param foods   - full food catalogue
 * @param history - decision history (for feedback / skip / recency)
 * @param input   - user's decision input
 * @param rng     - injectable random function (default Math.random)
 * @param now     - injectable "current time" (default new Date())
 */
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

  // ---- Phase 1: Score all main-eligible foods ----
  const scoredMains = foods
    .map<ScoredFood>((food) =>
      scoreMainFood(food, input, allMoods, period, intent, history, nowMs, hasDrinkInCatalog)
    )
    .sort((a, b) => b.score - a.score);

  // ---- Phase 2: Select main + build plan ----
  let status: Recommendation['status'] = 'success';
  let plan: Recommendation['plan'] | undefined;
  let pickedMain: ScoredFood | null = null;
  let drinkCandidate: ScoredFood | null = null;
  let addonCandidate: ScoredFood | null = null;
  let degraded = false;
  let degradeReason: string | undefined;

  // --- Drink-priority mode (Fix 3 from previous round) ---
  if (hasDrinkMood(allMoods) && intent !== 'drink') {
    const result = buildMealPlanWithDrinkPriority(scoredMains, foods, input, allMoods, rng);
    if (result) {
      plan = result.plan;
      pickedMain = result.main;
      drinkCandidate = result.drinkCandidate;
      addonCandidate = result.addonCandidate;
      if (!result.drinkIncluded) {
        degraded = true;
        const drinkMood = allMoods.includes('milkTea') ? '奶茶' : '饮料';
        degradeReason = `预算内无法同时容纳正餐和${drinkMood}`;
      }
    } else {
      // Drink-priority mode found no legal main → noMatch
      status = 'noMatch';
      degraded = true;
      degradeReason = buildNoMatchReason(intent, scoredMains, budgetLimit, allMoods);
    }
  } else {
    // --- Standard mode ---
    // --- Standard mode ---
    const mainPick = selectMain(scoredMains, allMoods, rng);

    if (mainPick) {
      // Happy path: selectMain returned a legal candidate
      pickedMain = mainPick;
      const result = buildMealPlan(pickedMain, foods, input, allMoods, rng);
      plan = result.plan;
      drinkCandidate = result.drinkCandidate;
      addonCandidate = result.addonCandidate;

      // Drink intent with no drinks in catalog → degraded but legal
      if (intent === 'drink' && !hasDrinkInCatalog) {
        degraded = true;
        degradeReason = '菜品库中没有可用饮料，已退化为轻食或加餐';
      }

      // Starving with lightMeal → warn
      if (allMoods.includes('starving') && pickedMain.food.mealRole === 'lightMeal' && pickedMain.food.satiety <= 3) {
        degraded = true;
        degradeReason = '饿疯了但没有合适正餐，只能先垫一下';
      }
    } else {
      // No legal candidate from selectMain — try legal degradation
      if (intent === 'fullMeal') {
        // Degrade: fullMeal → lightMeal (re-evaluated with relaxed eligibility)
        const degradedPick = tryDegradeFullMealToLightMeal(foods, input, allMoods, budgetLimit, rng);
        if (degradedPick) {
          pickedMain = degradedPick;
          degraded = true;
          degradeReason = '当前没有合适正餐，退化为轻食';
          const result = buildMealPlan(pickedMain, foods, input, allMoods, rng);
          plan = result.plan;
          drinkCandidate = result.drinkCandidate;
          addonCandidate = result.addonCandidate;
        }
      } else if (intent === 'drink' && hasDrinkInCatalog) {
        // Drinks exist but all are blocked → try light fallback
        const degradedPick = tryDegradeDrinkToLight(scoredMains, allMoods, rng);
        if (degradedPick) {
          pickedMain = degradedPick;
          degraded = true;
          degradeReason = '可用饮料不满足当前条件，退化为轻食或加餐';
          const result = buildMealPlan(pickedMain, foods, input, allMoods, rng);
          plan = result.plan;
          drinkCandidate = result.drinkCandidate;
          addonCandidate = result.addonCandidate;
        }
      } else if (intent === 'drink' && !hasDrinkInCatalog) {
        // No drinks at all — already handled in scoring by allowing lightMeal/addon
        // selectMain should have picked from them; if still null, truly noMatch
      }
      // lightMeal intent: selectMain already includes addon/lightMeal in pool
      // If it returned null, there's truly nothing.

      // If still no pick after all degradation attempts → noMatch
      if (!pickedMain) {
        status = 'noMatch';
        degraded = true;
        degradeReason = buildNoMatchReason(intent, scoredMains, budgetLimit, allMoods);
      }
    }
  }

  // ---- Phase 3: Build alternatives ----
  const alternativePlans: Recommendation['alternatives'] =
    status === 'noMatch' || !pickedMain
      ? []
      : buildAlternatives(pickedMain, scoredMains, input, allMoods);

  // ---- Phase 4: Build copy ----
  const copy =
    status === 'noMatch'
      ? buildNoMatchCopy(intent, scoredMains, budgetLimit, allMoods, degradeReason ?? '')
      : buildCopy(pickedMain!, plan!, input, alternativePlans, history, intent, degraded, degradeReason);

  // ---- Phase 5: Finalize scoredFoods for debug ----
  const scoredFoods = scoredMains.map((item) => {
    if (drinkCandidate && item.food.id === drinkCandidate.food.id) {
      return { ...item, reasons: [...item.reasons, '→ 选为搭配饮料'], score: Math.max(item.score, 1) };
    }
    if (addonCandidate && item.food.id === addonCandidate.food.id) {
      return { ...item, reasons: [...item.reasons, '→ 选为搭配加餐'], score: Math.max(item.score, 1) };
    }
    return item;
  });

  if (status === 'noMatch') {
    return {
      status: 'noMatch',
      plan: undefined,
      alternatives: [],
      food: undefined,
      score: undefined,
      scoredFoods,
      copy,
      degraded,
      degradeReason,
    };
  }

  return {
    status: degraded ? 'degraded' : 'success',
    plan: plan!,
    alternatives: alternativePlans,
    food: plan!.main,
    score: pickedMain!.score,
    scoredFoods,
    copy,
    degraded,
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
  const allOverBudget = withinBudget.length === 0;

  if (allOverBudget) {
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
export { isEligibleAsMain, isEligibleAsDrink, isEligibleAsAddon, getHardBlockReasons, hasDrinkMood, catalogHasDrink } from './eligibility';
export { scoreMainFood } from './scoreMain';
export { scoreDrinkOption, scoreAddonOption, shouldConsiderDrink, shouldConsiderAddon } from './scoreAddon';
export { buildMealPlan, buildAlternatives, selectMain } from './buildPlan';
export { buildCopy, buildNoMatchCopy } from './copy';
export { recentPenalty, feedbackScore, regretStreak, skipPenalty } from './feedback';
