import { DecisionInput, FoodItem, MealPlan, ScoredFood } from '../../types';
import { getBudgetLimit } from './normalizeInput';
import {
  scoreAddonOption,
  scoreDrinkOption,
  shouldConsiderAddon,
  shouldConsiderDrink,
} from './scoreAddon';
import { hasDrinkMood } from './eligibility';

/**
 * Weighted random pick from scored items.
 * rng parameter makes this deterministic in tests.
 * Returns null if items is empty.
 */
const pickWeighted = <T extends ScoredFood>(
  items: T[],
  rng: () => number
): T | null => {
  if (!items.length) return null;
  const minScore = Math.min(...items.map((item) => item.score));
  const weighted = items.map((item) => ({
    item,
    weight: Math.max(1, item.score - minScore + 3),
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return weighted[0].item;
};

/**
 * Select the main food from scored candidates.
 * Returns null when no eligible food exists (degraded result).
 *
 * Fix 3: when hasDrinkMood, reserve budget for the drink before selecting main.
 */
export const selectMain = (
  scoredMains: ScoredFood[],
  moods: string[],
  rng: () => number,
  /** If set, only consider foods within this budget (for drink reservation). */
  mainBudgetLimit: number = Infinity
): ScoredFood | null => {
  // Filter: not hard-blocked AND within mainBudget
  let eligible = scoredMains.filter(
    (item) => !item.hardBlocked && item.food.estimatedPrice <= mainBudgetLimit
  );

  if (!eligible.length) return null;

  const bestScore = eligible[0]?.score ?? 0;
  let pool = eligible.filter((item) => item.score >= bestScore - 18).slice(0, 6);

  if (!pool.length) pool = eligible.slice(0, 6);

  // Starving: prefer filling mains
  if (moods.includes('starving')) {
    const filling = pool.filter(
      (item) => item.food.mealRole === 'main' && item.food.satiety >= 4
    );
    if (filling.length) pool = filling;
  }

  // noSpicy: if possible, avoid spicy
  if (moods.includes('noSpicy')) {
    const nonSpicy = pool.filter((item) => !item.food.spicy);
    if (nonSpicy.length) pool = nonSpicy;
  }

  return pickWeighted(pool, rng);
};

/**
 * Find the best target drink within budget, for drink-reservation mode.
 */
const findTargetDrink = (
  foods: FoodItem[],
  budgetLimit: number,
  moods: string[],
  input: DecisionInput
): FoodItem | null => {
  const candidates = foods
    .filter((food) => food.mealRole === 'drink' && food.estimatedPrice <= budgetLimit)
    .filter((food) => !(moods.includes('noSpicy') && food.spicy));

  if (!candidates.length) return null;

  // Prefer milkTea if user wants it
  if (moods.includes('milkTea')) {
    const milkTea = candidates.find((f) => f.tags.includes('milkTea'));
    if (milkTea) return milkTea;
  }

  // Prefer wantDrink-tagged
  if (moods.includes('wantDrink')) {
    const want = candidates.find((f) => f.tags.includes('wantDrink'));
    if (want) return want;
  }

  // Fallback: cheapest drink
  candidates.sort((a, b) => a.estimatedPrice - b.estimatedPrice);
  return candidates[0];
};

/**
 * Build the full meal plan from selected main and candidate companions.
 */
export const buildMealPlan = (
  main: ScoredFood,
  allFoods: FoodItem[],
  input: DecisionInput,
  moods: string[],
  rng: () => number
): { plan: MealPlan; drinkCandidate: ScoredFood | null; addonCandidate: ScoredFood | null } => {
  const budgetLimit = getBudgetLimit(input.budget);
  const remaining = budgetLimit - main.food.estimatedPrice;

  const reasons: string[] = [];
  let drink: FoodItem | undefined;
  let addon: FoodItem | undefined;
  let drinkCandidate: ScoredFood | null = null;
  let addonCandidate: ScoredFood | null = null;

  // --- Drink ---
  if (shouldConsiderDrink(main.food, input, moods, remaining)) {
    const drinkOptions = allFoods
      .filter((food) => food.id !== main.food.id)
      .map((food) => scoreDrinkOption(food, main.food, input, moods, remaining))
      .filter((item): item is ScoredFood => item !== null && !item.hardBlocked)
      .sort((a, b) => b.score - a.score);

    if (drinkOptions.length > 0) {
      const best = drinkOptions[0];
      const drinkMood = hasDrinkMood(moods);
      const isMilkTea = best.food.tags.includes('milkTea') && moods.includes('milkTea');

      if (drinkMood || isMilkTea || best.score >= 12) {
        drink = best.food;
        drinkCandidate = best;
        if (drinkMood) reasons.push('你想喝点东西，预算刚好够搭一个');
        else if (isMilkTea) reasons.push('想喝奶茶，剩下的预算刚好配一杯');
        else reasons.push('搭个喝的，这顿更完整');
      }
    }
  }

  // --- Addon ---
  const afterDrink = remaining - (drink?.estimatedPrice ?? 0);
  if (shouldConsiderAddon(main.food, input, moods, afterDrink)) {
    const usedIds = new Set([main.food.id, drink?.id].filter(Boolean) as string[]);
    const addonOptions = allFoods
      .filter((food) => !usedIds.has(food.id))
      .map((food) => scoreAddonOption(food, main.food, input, moods, afterDrink))
      .filter((item): item is ScoredFood => item !== null && !item.hardBlocked)
      .sort((a, b) => b.score - a.score);

    if (addonOptions.length > 0) {
      const best = addonOptions[0];
      if (best.score >= 10 || main.food.satiety <= 2) {
        addon = best.food;
        addonCandidate = best;
        if (main.food.satiety <= 2) reasons.push('主食不够顶，加个餐补一下');
        else reasons.push('今天这顿还能再加个小的');
      }
    }
  }

  const totalPrice = main.food.estimatedPrice + (drink?.estimatedPrice ?? 0) + (addon?.estimatedPrice ?? 0);

  return {
    plan: {
      main: main.food,
      drink,
      addon,
      totalPrice,
      reasons,
    },
    drinkCandidate,
    addonCandidate,
  };
};

/**
 * Build the meal plan with drink-priority: reserve budget for the drink FIRST,
 * then select a main that fits the remaining budget.
 *
 * Returns the plan + whether the drink was successfully included.
 */
export const buildMealPlanWithDrinkPriority = (
  scoredMains: ScoredFood[],
  allFoods: FoodItem[],
  input: DecisionInput,
  moods: string[],
  rng: () => number
): { plan: MealPlan; main: ScoredFood; drinkIncluded: boolean; drinkCandidate: ScoredFood | null; addonCandidate: ScoredFood | null } => {
  const budgetLimit = getBudgetLimit(input.budget);
  const targetDrink = findTargetDrink(allFoods, budgetLimit, moods, input);

  if (targetDrink) {
    const mainBudget = budgetLimit - targetDrink.estimatedPrice;
    const main = selectMain(scoredMains, moods, rng, mainBudget);

    if (main) {
      // Build plan with the reserved drink
      const remaining = mainBudget - main.food.estimatedPrice;
      // Force-add the target drink
      const { plan: fullPlan, addonCandidate } = buildMealPlan(main, allFoods, input, moods, rng);

      // Override the plan to use our reserved drink
      const reasons: string[] = [];
      if (moods.includes('milkTea')) reasons.push(`预留了${targetDrink.name}的预算，先保证奶茶能配上`);
      else reasons.push('先留了饮料的预算，再选主食');

      // Rebuild addon after drink
      let addon: FoodItem | undefined;
      let finalAddonCandidate: ScoredFood | null = null;
      const afterDrink = mainBudget - main.food.estimatedPrice;
      if (shouldConsiderAddon(main.food, input, moods, afterDrink)) {
        const usedIds = new Set([main.food.id, targetDrink.id]);
        const addonOptions = allFoods
          .filter((food) => !usedIds.has(food.id))
          .map((food) => scoreAddonOption(food, main.food, input, moods, afterDrink))
          .filter((item): item is ScoredFood => item !== null && !item.hardBlocked)
          .sort((a, b) => b.score - a.score);
        if (addonOptions.length > 0 && (addonOptions[0].score >= 10 || main.food.satiety <= 2)) {
          addon = addonOptions[0].food;
          finalAddonCandidate = addonOptions[0];
        }
      }

      const totalPrice = main.food.estimatedPrice + targetDrink.estimatedPrice + (addon?.estimatedPrice ?? 0);

      return {
        plan: {
          main: main.food,
          drink: targetDrink,
          addon,
          totalPrice,
          reasons,
        },
        main,
        drinkIncluded: true,
        drinkCandidate: {
          food: targetDrink,
          score: 100,
          reasons: ['预留预算'],
          warnings: [],
          hardBlocked: false,
          hardBlockReasons: [],
        },
        addonCandidate: finalAddonCandidate,
      };
    }
  }

  // Drink couldn't be included — fall back to normal selection
  const main = selectMain(scoredMains, moods, rng);
  if (!main) {
    // Ultimate fallback
    return {
      plan: { main: scoredMains[0]?.food ?? allFoods[0], totalPrice: scoredMains[0]?.food?.estimatedPrice ?? 0, reasons: ['无可选方案'] },
      main: scoredMains[0],
      drinkIncluded: false,
      drinkCandidate: null,
      addonCandidate: null,
    };
  }

  const result = buildMealPlan(main, allFoods, input, moods, rng);
  return {
    plan: result.plan,
    main,
    drinkIncluded: false,
    drinkCandidate: result.drinkCandidate,
    addonCandidate: result.addonCandidate,
  };
};

/**
 * Build alternative meal plans (up to 2).
 * Fix 4: strict only — no loose fallback that re-admits hardBlocked foods.
 */
export const buildAlternatives = (
  mainPicked: ScoredFood,
  scoredMains: ScoredFood[],
  input: DecisionInput,
  moods: string[]
): MealPlan[] => {
  const results: MealPlan[] = [];
  const seen = new Set([mainPicked.food.id]);
  const avoidSpicy = moods.includes('noSpicy');

  const strict = scoredMains
    .filter((item) => !seen.has(item.food.id))
    .filter((item) => !item.hardBlocked)
    .filter((item) => !(avoidSpicy && item.food.spicy));

  for (let i = 0; i < Math.min(2, strict.length); i++) {
    const alt = strict[i];
    seen.add(alt.food.id);
    results.push({
      main: alt.food,
      totalPrice: alt.food.estimatedPrice,
      reasons: [],
    });
  }

  // No loose fallback. If fewer than 2, that's fine.
  return results;
};
