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
 * Weighted random pick from scored items (mutable — modifies weights by score).
 * rng parameter makes this deterministic in tests.
 */
const pickWeighted = <T extends ScoredFood>(
  items: T[],
  rng: () => number
): T => {
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
 */
export const selectMain = (
  scoredMains: ScoredFood[],
  moods: string[],
  rng: () => number
): ScoredFood => {
  const eligible = scoredMains.filter((item) => !item.hardBlocked);
  if (!eligible.length) {
    // Fallback: use everything
    return pickWeighted(scoredMains, rng);
  }

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
      // Don't automatically add — only if there's a real reason
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
      // Only add if there's a clear reason, not just "budget allows it"
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
 * Build alternative meal plans (2 max).
 * Each alternative is just a different main food without companions
 * (to keep the UI simple and avoid combinatorial explosion).
 */
export const buildAlternatives = (
  mainPicked: ScoredFood,
  scoredMains: ScoredFood[],
  allFoods: FoodItem[],
  input: DecisionInput,
  moods: string[],
  rng: () => number
): MealPlan[] => {
  const results: MealPlan[] = [];
  const seen = new Set([mainPicked.food.id]);
  const avoidSpicy = moods.includes('noSpicy');

  // First pass: strict alternatives (eligible, unblocked, different food)
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

  // Second pass: loose alternatives if we don't have 2 yet
  if (results.length < 2) {
    const loose = scoredMains
      .filter((item) => !seen.has(item.food.id))
      .filter((item) => !(avoidSpicy && item.food.spicy));

    for (let i = 0; i < Math.min(2 - results.length, loose.length); i++) {
      results.push({
        main: loose[i].food,
        totalPrice: loose[i].food.estimatedPrice,
        reasons: [],
      });
    }
  }

  return results;
};
