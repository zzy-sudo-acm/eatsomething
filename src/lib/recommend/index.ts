import { DecisionHistory, DecisionInput, FoodItem, Recommendation, ScoredFood } from '../../types';
import { toMoodIds } from '../moods';
import { isRelationshipMood } from '../options';
import {
  buildAlternatives,
  buildMealPlan,
  buildMealPlanWithDrinkPriority,
  selectMain,
} from './buildPlan';
import { buildCopy } from './copy';
import { catalogHasDrink, hasDrinkMood } from './eligibility';
import { detectMealPeriod, getBudgetLimit, resolveMealIntent } from './normalizeInput';
import { scoreMainFood } from './scoreMain';

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

  // Fix 1: check whether any budget-fitting drink exists (for drink-intent layered candidates)
  const hasDrinkInCatalog = catalogHasDrink(foods, budgetLimit, allMoods);

  let degraded = false;
  let degradeReason: string | undefined;

  // ---- Phase 1: Score all main-eligible foods ----
  const scoredMains = foods
    .map<ScoredFood>((food) =>
      scoreMainFood(food, input, allMoods, period, intent, history, nowMs, hasDrinkInCatalog)
    )
    .sort((a, b) => b.score - a.score);

  // ---- Phase 2: Select main food (with drink budget reservation if needed) ----
  let plan: Recommendation['plan'];
  let pickedMain: ScoredFood;
  let drinkCandidate: ScoredFood | null = null;
  let addonCandidate: ScoredFood | null = null;

  if (hasDrinkMood(allMoods) && intent !== 'drink') {
    // Fix 3: drink-priority mode — reserve budget for the drink first
    const result = buildMealPlanWithDrinkPriority(
      scoredMains,
      foods,
      input,
      allMoods,
      rng
    );
    plan = result.plan;
    pickedMain = result.main;
    drinkCandidate = result.drinkCandidate;
    addonCandidate = result.addonCandidate;
    if (!result.drinkIncluded && hasDrinkMood(allMoods)) {
      degraded = true;
      const drinkMood = allMoods.includes('milkTea') ? '奶茶' : '饮料';
      degradeReason = `预算内无法同时容纳正餐和${drinkMood}`;
    }
  } else {
    // Standard mode
    const mainPick = selectMain(scoredMains, allMoods, rng);

    if (!mainPick) {
      // Fix 2: no eligible food → degraded result
      degraded = true;
      const withinBudget = scoredMains.filter((item) => item.food.estimatedPrice <= budgetLimit);
      if (withinBudget.length > 0) {
        // Some foods fit budget but are blocked for other reasons
        degradeReason = `预算${budgetLimit}元内有${withinBudget.length}个候选但不完全匹配当前条件`;
        pickedMain = withinBudget[0];
      } else {
        // All foods exceed budget — use cheapest as last resort, heavily degraded
        degradeReason = `所有食物均超出预算上限(${budgetLimit}元)，无合规候选`;
        const cheapest = [...scoredMains].sort((a, b) => a.food.estimatedPrice - b.food.estimatedPrice)[0];
        pickedMain = cheapest;
      }

      plan = {
        main: pickedMain.food,
        totalPrice: pickedMain.food.estimatedPrice,
        reasons: ['⚠ 降级结果：没有完全匹配的选项'],
      };
    } else {
      pickedMain = mainPick;
      const result = buildMealPlan(pickedMain, foods, input, allMoods, rng);
      plan = result.plan;
      drinkCandidate = result.drinkCandidate;
      addonCandidate = result.addonCandidate;
    }

    // Fix 1: drink intent degradation notice
    if (intent === 'drink' && !hasDrinkInCatalog) {
      degraded = true;
      degradeReason = '菜品库中没有可用饮料，已退化为轻食或加餐';
    }
  }

  // ---- Phase 4: Build alternatives (as MealPlans) ----
  const alternativePlans = buildAlternatives(
    pickedMain,
    scoredMains,
    input,
    allMoods
  );

  // ---- Phase 5: Build copy ----
  const copy = buildCopy(pickedMain, plan, input, alternativePlans, history, intent, degraded, degradeReason);

  // ---- Phase 6: Inject addon/drink candidates into scoredFoods for debug ----
  const scoredFoods = scoredMains.map((item) => {
    if (drinkCandidate && item.food.id === drinkCandidate.food.id) {
      return {
        ...item,
        reasons: [...item.reasons, '→ 选为搭配饮料'],
        score: Math.max(item.score, 1),
      };
    }
    if (addonCandidate && item.food.id === addonCandidate.food.id) {
      return {
        ...item,
        reasons: [...item.reasons, '→ 选为搭配加餐'],
        score: Math.max(item.score, 1),
      };
    }
    return item;
  });

  return {
    plan,
    alternatives: alternativePlans,
    food: plan.main,
    score: pickedMain.score,
    scoredFoods,
    copy,
    degraded,
    degradeReason,
  };
};

// Re-export sub-modules for testing / inspection
export { detectMealPeriod, resolveMealIntent, getBudgetLimit, wantsUpscale } from './normalizeInput';
export { isEligibleAsMain, isEligibleAsDrink, isEligibleAsAddon, getHardBlockReasons, hasDrinkMood, catalogHasDrink } from './eligibility';
export { scoreMainFood } from './scoreMain';
export { scoreDrinkOption, scoreAddonOption, shouldConsiderDrink, shouldConsiderAddon } from './scoreAddon';
export { buildMealPlan, buildAlternatives, selectMain } from './buildPlan';
export { buildCopy } from './copy';
export { recentPenalty, feedbackScore, regretStreak, skipPenalty } from './feedback';
