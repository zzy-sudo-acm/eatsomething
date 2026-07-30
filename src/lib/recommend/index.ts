import { DecisionHistory, DecisionInput, FoodItem, Recommendation, ScoredFood } from '../../types';
import { toMoodIds } from '../moods';
import { isRelationshipMood } from '../options';
import { buildAlternatives, buildMealPlan, selectMain } from './buildPlan';
import { buildCopy } from './copy';
import { detectMealPeriod, getBudgetLimit, resolveMealIntent } from './normalizeInput';
import { scoreMainFood } from './scoreMain';

/**
 * Main entry point: recommend a meal plan.
 *
 * @param foods   - full food catalogue
 * @param history - decision history (for feedback / skip / recency)
 * @param input   - user's decision input
 * @param rng     - injectable random function (default Math.random)
 */
export const recommendFood = (
  foods: FoodItem[],
  history: DecisionHistory[],
  input: DecisionInput,
  rng: () => number = Math.random
): Recommendation => {
  const now = Date.now();
  const allMoods = toMoodIds([...(input.selectedMoods ?? []), ...(input.partnerMoods ?? [])]).filter(
    (mood) => !isRelationshipMood(mood)
  );

  const period = detectMealPeriod();
  const intent = resolveMealIntent(input);
  const budgetLimit = getBudgetLimit(input.budget);

  // ---- Phase 1: Score all main-eligible foods ----
  const scoredMains = foods
    .map<ScoredFood>((food) =>
      scoreMainFood(food, input, allMoods, period, intent, history, now)
    )
    .sort((a, b) => b.score - a.score);

  // ---- Phase 2: Select main food ----
  const pickedMain = selectMain(scoredMains, allMoods, rng);

  // ---- Phase 3: Build meal plan ----
  const { plan, drinkCandidate, addonCandidate } = buildMealPlan(
    pickedMain,
    foods,
    input,
    allMoods,
    rng
  );

  // ---- Phase 4: Build alternatives (as MealPlans) ----
  const alternativePlans = buildAlternatives(
    pickedMain,
    scoredMains,
    foods,
    input,
    allMoods,
    rng
  );

  // ---- Phase 5: Build copy ----
  const copy = buildCopy(pickedMain, plan, input, alternativePlans, history, intent);

  // ---- Phase 6: Inject addon/drink candidates into scoredFoods for debug ----
  // We keep the original scoredFoods ordered by main-food score,
  // but mark which ones were picked as companions so the debug panel is useful.
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
  };
};

// Re-export sub-modules for testing / inspection
export { detectMealPeriod, resolveMealIntent, getBudgetLimit, wantsUpscale } from './normalizeInput';
export { isEligibleAsMain, isEligibleAsDrink, isEligibleAsAddon, getHardBlockReasons, hasDrinkMood } from './eligibility';
export { scoreMainFood } from './scoreMain';
export { scoreDrinkOption, scoreAddonOption, shouldConsiderDrink, shouldConsiderAddon } from './scoreAddon';
export { buildMealPlan, buildAlternatives, selectMain } from './buildPlan';
export { buildCopy } from './copy';
export { recentPenalty, feedbackScore, regretStreak, skipPenalty } from './feedback';
