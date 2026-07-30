import { DecisionHistory, DecisionInput, FoodItem, MealPlan, Recommendation } from '../types';
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

const dinnerTime = new Date(2026, 6, 30, 19, 0);

const withMockedRandom = <T>(value: number, task: () => T): T => {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return task();
  } finally {
    Math.random = originalRandom;
  }
};

const runSamples = (
  foods: FoodItem[],
  input: DecisionInput,
  history: DecisionHistory[] = [],
  now: Date = dinnerTime
) =>
  randomSamples.map((value) =>
    withMockedRandom(value, () => recommendFood(foods, history, input, Math.random, now))
  );

/** Get all visible MAIN foods (plan.main only for success/degraded results). */
const getVisibleMains = (r: Recommendation): FoodItem[] => {
  if (r.status === 'noMatch') return [];
  return [r.plan.main, ...r.alternatives.map((a) => a.main)];
};

const isDrink = (f: FoodItem) => f.mealRole === 'drink';
const isAddonFood = (f: FoodItem) => f.mealRole === 'addon';
const isSpicy = (f: FoodItem) => f.spicy;
const isMilkTea = (f: FoodItem) =>
  f.name.includes('奶茶') || (f.mealRole === 'drink' && f.tags.includes('milkTea'));

const summarize = (rs: Recommendation[]) =>
  Array.from(
    new Set(
      rs
        .filter((r): r is Extract<Recommendation, { status: 'success' | 'degraded' }> => r.status !== 'noMatch')
        .map((r) => r.plan.main.name)
    )
  ).join('、') || '无';

/** Narrow a recommendation to success/degraded for safe plan access. */
const asOk = (r: Recommendation): Extract<Recommendation, { status: 'success' | 'degraded' }> => {
  if (r.status === 'noMatch') throw new Error('Unexpected noMatch in scenario');
  return r;
};

const buildResult = (
  id: string,
  name: string,
  passed: boolean,
  details: string
): RecommendationScenarioResult => ({ id, name, passed, details });

export const runRecommendationScenarios = (foods: FoodItem[]): RecommendationScenarioReport => {
  if (!foods.length) {
    return {
      passed: 0, total: 1, createdAt: Date.now(),
      results: [buildResult('empty-foods', '菜品库非空', false, '菜品库为空')],
    };
  }

  const now = Date.now();
  const results: RecommendationScenarioResult[] = [];

  // =========================================================================
  // Scenario 1: fullMeal dinner → NO drink or addon as main or alternative
  // =========================================================================
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['noIdea'],
      budget: 'under50',
      mealIntent: 'fullMeal',
    };
    const recs = runSamples(foods, input);
    const badMain = recs.filter((r) => r.status !== 'noMatch' && (isDrink(r.plan.main) || isAddonFood(r.plan.main)));
    const badAlt = recs.filter((r) =>
      r.status !== 'noMatch' && r.alternatives.some((a) => isDrink(a.main) || isAddonFood(a.main))
    );
    const allBad = new Set([...badMain, ...badAlt]);
    results.push(buildResult(
      'scenario-1-fullmeal-no-drink-main',
      '场景1: dinner+fullMeal主推荐和备选都不能是饮料/addon',
      allBad.size === 0,
      allBad.size > 0
        ? `违规: main=${badMain.length}次, alt=${badAlt.length}次 → ${summarize([...allBad])}`
        : `通过 样本: ${summarize(recs)}`
    ));
  }

  // =========================================================================
  // Scenario 2: dinner + fullMeal + under50 + reward → prefer proper meals
  // =========================================================================
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['reward'],
      budget: 'under50',
      mealIntent: 'fullMeal',
    };
    const recs = runSamples(foods, input);
    const drinkMain = recs.filter((r) => r.status !== 'noMatch' && isDrink(r.plan.main));
    const hasHigher = foods.some((f) => f.mealRole === 'main' && f.occasionLevel >= 2 && f.estimatedPrice <= 50);
    const tooCasual = recs.filter(
      (r) => r.status !== 'noMatch' && r.plan.main.occasionLevel <= 1 && r.plan.main.mealRole === 'main'
    );
    const passed = drinkMain.length === 0 && !(hasHigher && tooCasual.length > recs.length * 0.6);

    results.push(buildResult(
      'scenario-2-reward-proper-meal',
      '场景2: reward优先完整正餐',
      passed,
      passed
        ? `通过 occ≤1: ${tooCasual.length}/${recs.length} 样本: ${summarize(recs)}`
        : drinkMain.length > 0
          ? `饮料成为主推荐: ${summarize(drinkMain)}`
          : `occasionLevel=1占比过高: ${tooCasual.length}/${recs.length}`
    ));
  }

  // =========================================================================
  // Scenario 3: fullMeal + under50 + milkTea → main + milkTea companion
  // =========================================================================
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['milkTea'],
      budget: 'under50',
      mealIntent: 'fullMeal',
    };
    const recs = runSamples(foods, input);
    const milkTeaInDb = foods.find(isMilkTea);
    const canCombo = milkTeaInDb
      ? foods.some(
          (f) =>
            f.mealRole === 'main' &&
            f.id !== milkTeaInDb.id &&
            f.estimatedPrice + milkTeaInDb.estimatedPrice <= 50
        )
      : false;

    const milkTeaMain = recs.filter((r) => r.status !== 'noMatch' && isMilkTea(r.plan.main));
    const withMilkTea = recs.filter(
      (r) => r.status !== 'noMatch' && r.plan.drink && isMilkTea(r.plan.drink)
    );
    const over = recs.filter((r) => r.status !== 'noMatch' && r.plan.totalPrice > 50);

    const passed =
      milkTeaMain.length === 0 && over.length === 0 &&
      !(canCombo && withMilkTea.length === 0);

    results.push(buildResult(
      'scenario-3-milktea-companion',
      '场景3: milkTea不能当主推荐，必须进搭配',
      passed,
      passed
        ? `通过 奶茶搭配${withMilkTea.length}/${recs.length}次 样本: ${summarize(recs)}`
        : milkTeaMain.length > 0
          ? `奶茶成为主推荐: ${summarize(milkTeaMain)}`
          : over.length > 0
            ? `超预算: ${over.length}次`
            : `可搭配但奶茶${withMilkTea.length === 0 ? '未' : '仅部分'}进入搭配: ${withMilkTea.length}/${recs.length}`
    ));
  }

  // =========================================================================
  // Scenario 4: drink intent → ONLY drinks as main (if drinks exist)
  // =========================================================================
  {
    const drinkInDb = foods.filter(
      (f) => f.mealRole === 'drink' && f.estimatedPrice <= 20
    );
    if (drinkInDb.length === 0) {
      results.push(buildResult(
        'scenario-4-drink-intent-only',
        '场景4: drink意图下所有主推荐都是饮料',
        true,
        '菜品库无预算内饮料，跳过'
      ));
    } else {
      const input1: DecisionInput = {
        ...baseInput,
        selectedMoods: ['milkTea'],
        budget: 'under20',
        mealIntent: 'drink',
      };
      const recs1 = runSamples(foods, input1);
      const notDrink1 = recs1.filter((r) => r.status !== 'noMatch' && !isDrink(r.plan.main));
      const passed1 = notDrink1.length === 0;

      const input2: DecisionInput = {
        ...baseInput,
        selectedMoods: [],
        budget: 'under20',
        mealIntent: 'drink',
      };
      const recs2 = runSamples(foods, input2);
      const notDrink2 = recs2.filter((r) => r.status !== 'noMatch' && !isDrink(r.plan.main));
      const passed2 = notDrink2.length === 0;

      const passed = passed1 && passed2;

      results.push(buildResult(
        'scenario-4-drink-intent-only',
        '场景4: drink意图下所有主推荐都是饮料',
        passed,
        passed
          ? `通过 (milkTea)${summarize(recs1)} / (noMood)${summarize(recs2)}`
          : `非饮料主推荐: milkTea=${notDrink1.length}, noMood=${notDrink2.length}`
      ));
    }
  }

  // =========================================================================
  // Scenario 5: starving + fullMeal → main satiety >= 4
  // =========================================================================
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['starving'],
      budget: 'under50',
      mealIntent: 'fullMeal',
    };
    const recs = runSamples(foods, input);

    const badRole = recs.filter(
      (r) => r.status !== 'noMatch' && (isDrink(r.plan.main) || isAddonFood(r.plan.main))
    );
    const lowSatiety = recs.filter(
      (r) => r.status !== 'noMatch' && r.plan.main.satiety < 4
    );

    const passed = badRole.length === 0 && lowSatiety.length === 0;
    results.push(buildResult(
      'scenario-5-starving-filling',
      '场景5: starving时主食饱腹度≥4',
      passed,
      passed
        ? `通过 样本: ${summarize(recs)}`
        : badRole.length > 0
          ? `饮料/addon成为主推荐: ${summarize(badRole)}`
          : `饱腹<4: ${lowSatiety.map(r => asOk(r).plan.main.name + '(' + asOk(r).plan.main.satiety + ')').join('、')}`
    ));
  }

  // =========================================================================
  // Scenario 6: noSpicy → zero spicy anywhere
  // =========================================================================
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['noSpicy'],
      budget: 'under50',
    };
    const recs = runSamples(foods, input);

    const spicyMain = recs.filter((r) => r.status !== 'noMatch' && isSpicy(r.plan.main));
    const spicyDrink = recs.filter((r) => r.status !== 'noMatch' && r.plan.drink && isSpicy(r.plan.drink));
    const spicyAddon = recs.filter((r) => r.status !== 'noMatch' && r.plan.addon && isSpicy(r.plan.addon));
    const spicyAlt = recs.filter((r) =>
      r.status !== 'noMatch' && r.alternatives.some((a) => isSpicy(a.main))
    );

    const passed =
      spicyMain.length === 0 &&
      spicyDrink.length === 0 &&
      spicyAddon.length === 0 &&
      spicyAlt.length === 0;

    results.push(buildResult(
      'scenario-6-no-spicy',
      '场景6: noSpicy全方案零辣',
      passed,
      passed
        ? `通过 样本: ${summarize(recs)}`
        : `辣食: main=${spicyMain.length} drink=${spicyDrink.length} addon=${spicyAddon.length} alt=${spicyAlt.length}`
    ));
  }

  // =========================================================================
  // Scenario 7: skip penalty
  // =========================================================================
  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['noIdea'],
      budget: 'under50',
    };
    const before = withMockedRandom(0.3, () =>
      recommendFood(foods, [], input, () => 0.3, dinnerTime)
    );
    if (before.status === 'noMatch') {
      results.push(buildResult(
        'scenario-7-skip-penalty',
        '场景7: skipped食物10分钟内明显降权',
        false,
        'before推荐返回了noMatch，无法测试skip'
      ));
    } else {
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
      const after = withMockedRandom(0.3, () =>
        recommendFood(foods, skippedHistory, input, () => 0.3, dinnerTime)
      );
      const beforeScore =
        before.scoredFoods.find((item) => item.food.id === before.plan.main.id)?.score ?? 0;
      const afterScore =
        after.status === 'noMatch' ? -999 : (after.scoredFoods.find((item) => item.food.id === before.plan.main.id)?.score ?? 0);

      results.push(buildResult(
        'scenario-7-skip-penalty',
        '场景7: skipped食物10分钟内明显降权',
        after.status !== 'noMatch' && after.plan.main.id !== before.plan.main.id && afterScore <= beforeScore - 20,
        `跳过 ${before.plan.main.name}: ${beforeScore} → ${afterScore}; 跳过后=${after.status === 'noMatch' ? 'noMatch' : after.plan.main.name}`
      ));
    }
  }

  // =========================================================================
  // Scenario 8: budget hard cap
  // =========================================================================
  {
    const budgetLimits: Array<{ budget: DecisionInput['budget']; limit: number }> = [
      { budget: 'under10', limit: 10 },
      { budget: 'under20', limit: 20 },
      { budget: 'under50', limit: 50 },
    ];

    for (const { budget, limit } of budgetLimits) {
      const input: DecisionInput = { ...baseInput, selectedMoods: ['noIdea'], budget };
      const recs = runSamples(foods, input);
      const over = recs.filter((r) => r.status !== 'noMatch' && r.plan.totalPrice > limit);
      results.push(buildResult(
        `scenario-8-budget-cap-${budget}`,
        `场景8a: 默认库${budget}总价≤${limit}`,
        over.length === 0,
        over.length
          ? `超预算: ${over.map((r) => asOk(r).plan.main.name + '(¥' + asOk(r).plan.totalPrice + ')').join('、')}`
          : `通过 样本: ${summarize(recs)}`
      ));
    }

    const customFoods: FoodItem[] = [
      {
        id: 'test-maocai', name: '冒菜(28元)', priceRange: 'under50', distance: 'medium',
        type: 'meal', estimatedPrice: 28, satiety: 4, mealRole: 'main',
        occasionLevel: 3, tags: ['starving', 'hotFood'], spicy: true, stability: 'medium',
        createdAt: now, updatedAt: now,
      },
      {
        id: 'test-hanbao', name: '汉堡(30元)', priceRange: 'under50', distance: 'delivery',
        type: 'happy', estimatedPrice: 30, satiety: 4, mealRole: 'main',
        occasionLevel: 2, tags: ['lazy', 'reward'], spicy: false, stability: 'medium',
        createdAt: now, updatedAt: now,
      },
    ];
    const customInput: DecisionInput = { ...baseInput, selectedMoods: ['noIdea'], budget: 'under20' };
    const customRecs = runSamples(customFoods, customInput);
    const notNoMatch = customRecs.filter((r) => r.status !== 'noMatch');
    const hasFakeFood = customRecs.filter((r) => r.status === 'noMatch' && (r.plan !== undefined || r.food !== undefined));
    results.push(buildResult(
      'scenario-8-budget-cap-custom',
      '场景8b: 全超预算时全部noMatch且不返回伪造食物',
      notNoMatch.length === 0 && hasFakeFood.length === 0,
      notNoMatch.length > 0
        ? `${notNoMatch.length}次未返回noMatch`
        : hasFakeFood.length > 0
          ? `${hasFakeFood.length}次noMatch但携带了plan/food`
          : `通过 全部${customRecs.length}次noMatch`
    ));
  }

  // =========================================================================
  // Scenario 9: no forced addons
  // =========================================================================
  {
    const input: DecisionInput = { ...baseInput, selectedMoods: ['noIdea'], budget: 'under50' };
    const recs = runSamples(foods, input);

    const forcedAddons = recs.filter((r) => {
      if (r.status === 'noMatch' || !r.plan.addon) return false;
      return (
        r.plan.main.satiety >= 4 &&
        !r.plan.reasons.some((reason) => reason.includes('奖励') || reason.includes('分享'))
      );
    });

    const passed = forcedAddons.length === 0;
    results.push(buildResult(
      'scenario-9-no-forced-addons',
      '场景9: 无明确需求不强行加餐凑预算',
      passed,
      passed
        ? `通过 饮料${recs.filter(r => r.status !== 'noMatch' && r.plan.drink).length}次 加餐${recs.filter(r => r.status !== 'noMatch' && r.plan.addon).length}次 样本: ${summarize(recs)}`
        : `强行加餐: ${forcedAddons.length}次 → ${forcedAddons.map(r => asOk(r).plan.main.name).join('、')}`
    ));
  }

  // =========================================================================
  // Scenario 10: alternatives never include drink/addon (custom tiny catalogue)
  // =========================================================================
  {
    const tinyFoods: FoodItem[] = [
      {
        id: 'tiny-main', name: '黄焖鸡', priceRange: 'under20', distance: 'near',
        type: 'meal', estimatedPrice: 18, satiety: 4, mealRole: 'main',
        occasionLevel: 2, tags: ['noIdea'], spicy: false, stability: 'high',
        createdAt: now, updatedAt: now,
      },
      {
        id: 'tiny-drink', name: '奶茶', priceRange: 'under20', distance: 'near',
        type: 'drink', estimatedPrice: 15, satiety: 1, mealRole: 'drink',
        occasionLevel: 1, tags: ['milkTea'], spicy: false, stability: 'medium',
        createdAt: now, updatedAt: now,
      },
      {
        id: 'tiny-addon', name: '小吃', priceRange: 'under20', distance: 'near',
        type: 'snack', estimatedPrice: 10, satiety: 2, mealRole: 'addon',
        occasionLevel: 1, tags: [], spicy: false, stability: 'medium',
        createdAt: now, updatedAt: now,
      },
    ];
    const tinyInput: DecisionInput = { ...baseInput, selectedMoods: ['noIdea'], budget: 'under20', mealIntent: 'fullMeal' };
    const tinyRecs = runSamples(tinyFoods, tinyInput);

    const altWithDrinkOrAddon = tinyRecs.filter((r) =>
      r.status !== 'noMatch' && r.alternatives.some((a) => isDrink(a.main) || isAddonFood(a.main))
    );

    results.push(buildResult(
      'scenario-10-alt-no-drink-addon',
      '场景10: 备选不含饮料或加餐(自定义库1正餐+1饮料+1加餐)',
      altWithDrinkOrAddon.length === 0,
      altWithDrinkOrAddon.length > 0
        ? `备选含饮料/addon: ${altWithDrinkOrAddon.length}次`
        : `通过 样本: ${summarize(tinyRecs)}; 备选数: ${tinyRecs.filter(r => r.status !== 'noMatch').map(r => r.alternatives.length).join(',')}`
    ));
  }

  return {
    passed: results.filter((item) => item.passed).length,
    total: results.length,
    createdAt: now,
    results,
  };
};
