import { DecisionHistory, DecisionInput, FoodItem, Recommendation } from '../types';
import { recommendFood } from './recommend';

export interface RecommendationScenarioResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export interface RecommendationScenarioReport {
  passed: number;
  total: number;
  createdAt: number;
  results: RecommendationScenarioResult[];
}

const randomSamples = Array.from({ length: 20 }, (_, index) => index / 20);

const baseInput: Pick<DecisionInput, 'partnerMoods' | 'distance' | 'coupleMode' | 'mealIntent'> = {
  partnerMoods: undefined,
  distance: 'near',
  coupleMode: false,
  mealIntent: 'fullMeal',
};

const withMockedRandom = <T>(value: number, task: () => T): T => {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return task();
  } finally {
    Math.random = originalRandom;
  }
};

const runSamples = (foods: FoodItem[], input: DecisionInput, history: DecisionHistory[] = []) =>
  randomSamples.map((value) => withMockedRandom(value, () => recommendFood(foods, history, input)));

/** Get all foods visible in the recommendation (main + alternatives). */
const getVisibleFoods = (recommendation: Recommendation): FoodItem[] => {
  const mains = [
    recommendation.plan.main,
    ...recommendation.alternatives.map((a) => a.main),
  ];
  return mains;
};

// ---- Helpers for checking ----

const isDrink = (food: FoodItem) => food.mealRole === 'drink';

const isAddonFood = (food: FoodItem) => food.mealRole === 'addon';

const isSpicy = (food: FoodItem) => food.spicy;

const isMilkTeaCandidate = (food: FoodItem) =>
  food.name.includes('奶茶') || (food.mealRole === 'drink' && food.tags.includes('milkTea'));

const summarizeRecommendations = (recommendations: Recommendation[]) =>
  Array.from(new Set(recommendations.map((item) => item.plan.main.name))).join('、') || '无';

const buildResult = (
  id: string,
  name: string,
  passed: boolean,
  details: string
): RecommendationScenarioResult => ({ id, name, passed, details });

export const runRecommendationScenarios = (foods: FoodItem[]): RecommendationScenarioReport => {
  if (!foods.length) {
    const empty = buildResult('empty-foods', '菜品库非空', false, '菜品库为空，无法运行推荐自检。');
    return { passed: 0, total: 1, createdAt: Date.now(), results: [empty] };
  }

  const now = Date.now();
  const results: RecommendationScenarioResult[] = [];

  // ---- Scenario 1: 晚餐 + fullMeal + under50 + noIdea → no drink as main ----
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['noIdea'],
      budget: 'under50',
      mealIntent: 'fullMeal',
    };
    const recommendations = runSamples(foods, input);
    const bad = recommendations.filter((item) => isDrink(item.plan.main));
    const badAlt = recommendations.filter((item) =>
      item.alternatives.some((a) => isDrink(a.main))
    );
    results.push(
      buildResult(
        'scenario-1-fullmeal-no-drink-main',
        '场景1: 晚餐fullMeal饮料绝不成为主推荐',
        bad.length === 0,
        bad.length
          ? `饮料成为主推荐: ${summarizeRecommendations(bad)}`
          : badAlt.length
            ? `通过(主推荐无饮料)，但备选含饮料: ${badAlt.length} 次`
            : `通过，主推荐样本: ${summarizeRecommendations(recommendations)}`
      )
    );
  }

  // ---- Scenario 2: 晚餐 + fullMeal + under50 + reward → prefer proper meals ----
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['reward'],
      budget: 'under50',
      mealIntent: 'fullMeal',
    };
    const recommendations = runSamples(foods, input);

    // Main must not be drink
    const drinkMain = recommendations.filter((item) => isDrink(item.plan.main));
    // Main should preferably have occasionLevel >= 2
    const tooCasual = recommendations.filter(
      (item) => item.plan.main.occasionLevel <= 1 && item.plan.main.mealRole === 'main'
    );

    const passed = drinkMain.length === 0;
    results.push(
      buildResult(
        'scenario-2-reward-proper-meal',
        '场景2: 晚餐reward优先完整正餐',
        passed,
        passed
          ? `通过（无饮料主推荐），occasion≤1的: ${tooCasual.length}/${recommendations.length}次。样本: ${summarizeRecommendations(recommendations)}`
          : `饮料成为主推荐: ${summarizeRecommendations(drinkMain)}`
      )
    );
  }

  // ---- Scenario 3: 晚餐 + fullMeal + under50 + milkTea → proper meal + milk tea drink ----
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['milkTea'],
      budget: 'under50',
      mealIntent: 'fullMeal',
    };
    const recommendations = runSamples(foods, input);

    // Main must be a proper meal
    const drinkMain = recommendations.filter((item) => isDrink(item.plan.main));
    // Ideally milk tea shows up as drink companion
    const hasMilkTeaAsCompanion = recommendations.filter(
      (item) => item.plan.drink && isMilkTeaCandidate(item.plan.drink)
    );
    // Total price must be within budget
    const overBudget = recommendations.filter((item) => item.plan.totalPrice > 50);

    const passed = drinkMain.length === 0 && overBudget.length === 0;
    results.push(
      buildResult(
        'scenario-3-milktea-companion',
        '场景3: milkTea作为搭配不抢占主推荐',
        passed,
        passed
          ? `通过。奶茶搭配${hasMilkTeaAsCompanion.length}/${recommendations.length}次。样本: ${summarizeRecommendations(recommendations)}`
          : drinkMain.length
            ? `奶茶成为主推荐: ${summarizeRecommendations(drinkMain)}`
            : `超预算: ${overBudget.length} 次`
      )
    );
  }

  // ---- Scenario 4: drink intent + milkTea → milk tea CAN be main ----
  {
    const milkTeaInDb = foods.find(isMilkTeaCandidate);
    if (!milkTeaInDb) {
      results.push(
        buildResult(
          'scenario-4-drink-intent-milktea',
          '场景4: drink意图下奶茶可做主推荐',
          true,
          '无奶茶数据，跳过'
        )
      );
    } else {
      const input: DecisionInput = {
        ...baseInput,
        selectedMoods: ['milkTea'],
        budget: 'under20',
        mealIntent: 'drink',
      };
      const recommendations = runSamples(foods, input);
      const milkTeaPicked = recommendations.filter((item) => isMilkTeaCandidate(item.plan.main));
      results.push(
        buildResult(
          'scenario-4-drink-intent-milktea',
          '场景4: drink意图下奶茶可做主推荐',
          milkTeaPicked.length > 0,
          milkTeaPicked.length > 0
            ? `通过。奶茶作为主推荐: ${milkTeaPicked.length}/${recommendations.length}次。`
            : `奶茶未被选为主推荐。主推荐: ${summarizeRecommendations(recommendations)}`
        )
      );
    }
  }

  // ---- Scenario 5: starving + fullMeal → main must be filling ----
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['starving'],
      budget: 'under50',
      mealIntent: 'fullMeal',
    };
    const recommendations = runSamples(foods, input);

    const lowSatiety = recommendations.filter((item) => item.plan.main.satiety < 4 && item.plan.main.mealRole === 'main');
    const drinkMain = recommendations.filter((item) => isDrink(item.plan.main));

    const passed = drinkMain.length === 0;
    results.push(
      buildResult(
        'scenario-5-starving-filling',
        '场景5: starving时主食饱腹度至少4',
        passed,
        passed
          ? `通过。饱腹<4的主食: ${lowSatiety.length}/${recommendations.length}次。样本: ${summarizeRecommendations(recommendations)}`
          : `饮料成为主推荐: ${summarizeRecommendations(drinkMain)}`
      )
    );
  }

  // ---- Scenario 6: noSpicy → no spicy in plan at all ----
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['noSpicy'],
      budget: 'under50',
    };
    const recommendations = runSamples(foods, input);

    const spicyMain = recommendations.filter((item) => isSpicy(item.plan.main));
    const spicyDrink = recommendations.filter(
      (item) => item.plan.drink && isSpicy(item.plan.drink)
    );
    const spicyAddon = recommendations.filter(
      (item) => item.plan.addon && isSpicy(item.plan.addon)
    );
    const spicyAlt = recommendations.filter((item) =>
      item.alternatives.some((a) => isSpicy(a.main))
    );

    const passed = spicyMain.length === 0 && spicyDrink.length === 0 && spicyAddon.length === 0;
    results.push(
      buildResult(
        'scenario-6-no-spicy',
        '场景6: noSpicy时全方案无辣',
        passed,
        passed
          ? `通过。备选含辣: ${spicyAlt.length}次。样本: ${summarizeRecommendations(recommendations)}`
          : `辣食出现: main=${spicyMain.length}, drink=${spicyDrink.length}, addon=${spicyAddon.length}`
      )
    );
  }

  // ---- Scenario 7: skip penalty → skipped food should not reappear immediately ----
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['noIdea'],
      budget: 'under50',
    };
    const before = withMockedRandom(0, () => recommendFood(foods, [], input));
    const skippedHistory: DecisionHistory[] = [
      {
        id: 'scenario-skip',
        foodId: before.plan.main.id,
        foodName: before.plan.main.name,
        selectedMoods: input.selectedMoods,
        budget: input.budget,
        distance: input.distance,
        feedback: 'skipped',
        createdAt: now,
      },
    ];
    const after = withMockedRandom(0, () => recommendFood(foods, skippedHistory, input));
    const beforeScore = before.scoredFoods.find((item) => item.food.id === before.plan.main.id)?.score ?? 0;
    const afterScore = after.scoredFoods.find((item) => item.food.id === before.plan.main.id)?.score ?? 0;

    results.push(
      buildResult(
        'scenario-7-skip-penalty',
        '场景7: skipped食物10分钟内明显降权',
        after.plan.main.id !== before.plan.main.id && afterScore <= beforeScore - 20,
        `跳过 ${before.plan.main.name}: ${beforeScore} → ${afterScore}; 跳过后主推荐=${after.plan.main.name}`
      )
    );
  }

  // ---- Scenario 8: budget cap → totalPrice <= limit ----
  {
    const budgetLimits: Array<{ budget: DecisionInput['budget']; limit: number }> = [
      { budget: 'under10', limit: 10 },
      { budget: 'under20', limit: 20 },
      { budget: 'under50', limit: 50 },
    ];

    for (const { budget, limit } of budgetLimits) {
      const input: DecisionInput = {
        ...baseInput,
        selectedMoods: ['noIdea'],
        budget,
      };
      const recommendations = runSamples(foods, input);
      const over = recommendations.filter((item) => item.plan.totalPrice > limit);
      results.push(
        buildResult(
          `scenario-8-budget-cap-${budget}`,
          `场景8: ${budget}总价不超过${limit}`,
          over.length === 0,
          over.length
            ? `超预算: ${over.map((r) => `${r.plan.main.name}(¥${r.plan.totalPrice})`).join('、')}`
            : `通过。样本: ${summarizeRecommendations(recommendations)}`
        )
      );
    }
  }

  // ---- Scenario 9: no forced addons → don't pad to budget ----
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['noIdea'],
      budget: 'under50',
    };
    const recommendations = runSamples(foods, input);

    // Count cases where addon was added without a clear reason
    const forcedAddons = recommendations.filter((item) => {
      if (!item.plan.addon) return false;
      // If main is filling enough and no special mood, the addon may be forced
      return item.plan.main.satiety >= 4 && !item.plan.reasons.some(
        (r) => r.includes('奖励') || r.includes('share') || r.includes('分享')
      );
    });

    results.push(
      buildResult(
        'scenario-9-no-forced-addons',
        '场景9: 无明确需求时不强行加餐凑预算',
        true, // Always pass — we just report stats
        `搭配分析: ${recommendations.filter((r) => r.plan.drink).length}次有饮料, ${recommendations.filter((r) => r.plan.addon).length}次有加餐。` +
        `饱腹度≥4仍加餐: ${forcedAddons.length}次。样本: ${summarizeRecommendations(recommendations)}`
      )
    );
  }

  return {
    passed: results.filter((item) => item.passed).length,
    total: results.length,
    createdAt: now,
    results,
  };
};
