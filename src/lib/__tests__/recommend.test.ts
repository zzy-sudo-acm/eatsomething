import { describe, expect, it } from 'vitest';
import { defaultFoods } from '../../data/defaultFoods';
import { DecisionHistory, DecisionInput, FoodItem } from '../../types';
import { recommendFood } from '../recommend';
import { runRecommendationScenarios } from '../recommendationScenarios';
import { buildStomachReport } from '../report';

const dinnerTime = new Date(2026, 6, 30, 19, 0);

const baseInput: DecisionInput = {
  selectedMoods: ['noIdea'],
  partnerMoods: undefined,
  budget: 'under20',
  distance: 'near',
  coupleMode: false,
  mealIntent: 'fullMeal',
};

const entry = (overrides: Partial<DecisionHistory>): DecisionHistory => ({
  id: `h-${Math.random().toString(36).slice(2, 8)}`,
  foodId: 'food-huangmenji',
  foodName: '黄焖鸡',
  selectedMoods: ['noIdea'],
  budget: 'under20',
  distance: 'near',
  createdAt: Date.now(),
  ...overrides,
});

const now = Date.now();

const makeFood = (overrides: Partial<FoodItem> & { id: string; name: string }): FoodItem => ({
  priceRange: 'under20',
  distance: 'near',
  type: 'meal',
  estimatedPrice: 15,
  satiety: 4,
  mealRole: 'main',
  occasionLevel: 2,
  tags: [],
  spicy: false,
  stability: 'medium',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('推荐场景自检', () => {
  it('默认菜品库全部场景通过', () => {
    const report = runRecommendationScenarios(defaultFoods);
    const failed = report.results.filter((item) => !item.passed);
    if (failed.length) {
      console.log('FAILED SCENARIOS:');
      failed.forEach((f) => console.log(`  ${f.id}: ${f.name}\n    ${f.details}`));
    }
    expect(failed.map((item) => `${item.name}: ${item.details}`)).toEqual([]);
  });
});

describe('反馈权重', () => {
  const scoreOf = (history: DecisionHistory[], foodId: string) =>
    recommendFood(defaultFoods, history, baseInput, Math.random, dinnerTime).scoredFoods.find(
      (item) => item.food.id === foodId
    )?.score ?? 0;

  it('连续两次后悔明显降权', () => {
    const clean = scoreOf([], 'food-huangmenji');
    const twoRegrets = [
      entry({ feedback: 'regret', createdAt: Date.now() - 9 * 24 * 3600 * 1000 }),
      entry({ feedback: 'regret', createdAt: Date.now() - 10 * 24 * 3600 * 1000 }),
    ];
    expect(scoreOf(twoRegrets, 'food-huangmenji')).toBeLessThanOrEqual(clean - 25);
  });

  it('历史好评加权,且「不想踩雷」时口碑额外加分', () => {
    const worths = [
      entry({ feedback: 'worth', createdAt: Date.now() - 8 * 24 * 3600 * 1000 }),
      entry({ feedback: 'worth', createdAt: Date.now() - 9 * 24 * 3600 * 1000 }),
      entry({ feedback: 'worth', createdAt: Date.now() - 10 * 24 * 3600 * 1000 }),
    ];
    const clean = scoreOf([], 'food-huangmenji');
    const praised = scoreOf(worths, 'food-huangmenji');
    expect(praised).toBeGreaterThan(clean + 5);

    const noRiskInput: DecisionInput = { ...baseInput, selectedMoods: ['noRisk'] };
    const praisedNoRisk =
      recommendFood(defaultFoods, worths, noRiskInput, Math.random, dinnerTime).scoredFoods.find(
        (item) => item.food.id === 'food-huangmenji'
      )?.score ?? 0;
    const cleanNoRisk =
      recommendFood(defaultFoods, [], noRiskInput, Math.random, dinnerTime).scoredFoods.find(
        (item) => item.food.id === 'food-huangmenji'
      )?.score ?? 0;
    expect(praisedNoRisk).toBeGreaterThan(cleanNoRisk + 10);
  });

  it('最近吃过会降权', () => {
    const clean = scoreOf([], 'food-huangmenji');
    const yesterday = [entry({ feedback: 'normal', createdAt: Date.now() - 20 * 3600 * 1000 })];
    expect(scoreOf(yesterday, 'food-huangmenji')).toBeLessThan(clean);
  });
});

describe('旧中文文案数据兼容', () => {
  it('旧版中文 mood 仍能参与推荐(自动映射为 id)', () => {
    const legacyInput: DecisionInput = { ...baseInput, selectedMoods: ['不想吃辣'] };
    const result = recommendFood(defaultFoods, [], legacyInput, Math.random, dinnerTime);
    const spicyScored = result.scoredFoods.filter((item) => item.food.spicy);
    expect(spicyScored.length).toBeGreaterThan(0);
    spicyScored.forEach((item) => expect(item.hardBlocked).toBe(true));
    if (result.status !== 'noMatch') {
      expect(result.food.spicy).toBe(false);
    }
  });
});

// =========================================================================
// Fix 1: starving hard constraint
// =========================================================================
describe('starving 硬约束', () => {
  it('starving+fullMeal+under10+仅低饱腹轻食 → noMatch', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 'f1', name: '轻食A', mealRole: 'lightMeal', type: 'snack', estimatedPrice: 8, satiety: 2, occasionLevel: 1 }),
      makeFood({ id: 'f2', name: '轻食B', mealRole: 'lightMeal', type: 'snack', estimatedPrice: 10, satiety: 2, occasionLevel: 1 }),
    ];
    const input: DecisionInput = {
      ...baseInput, mealIntent: 'fullMeal', budget: 'under10', selectedMoods: ['starving'],
    };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);
    expect(result.status).toBe('noMatch');
    expect(result.plan).toBeUndefined();
    expect(result.food).toBeUndefined();
  });

  it('starving+fullMeal 存在 main satiety>=4 → 优先选择', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 'f1', name: '低饱轻食', mealRole: 'lightMeal', type: 'snack', estimatedPrice: 8, satiety: 2, occasionLevel: 1 }),
      makeFood({ id: 'f2', name: '顶饱正餐', mealRole: 'main', type: 'meal', estimatedPrice: 10, satiety: 4, occasionLevel: 2, tags: ['starving'] }),
    ];
    const input: DecisionInput = {
      ...baseInput, mealIntent: 'fullMeal', budget: 'under10', selectedMoods: ['starving'],
    };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);
    expect(result.status).not.toBe('noMatch');
    if (result.status !== 'noMatch') {
      expect(result.plan.main.mealRole).toBe('main');
      expect(result.plan.main.satiety).toBeGreaterThanOrEqual(4);
    }
  });
});

// =========================================================================
// Fix 2: drink-priority lightMeal degradation
// =========================================================================
describe('饮料优先路径轻食降级', () => {
  it('milkTea+fullMeal+仅轻食 → degraded, lightMeal+drink组合', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 'f1', name: '轻食', mealRole: 'lightMeal', type: 'snack', estimatedPrice: 12, satiety: 3, occasionLevel: 1 }),
      makeFood({ id: 'f2', name: '奶茶', mealRole: 'drink', type: 'drink', estimatedPrice: 15, satiety: 1, occasionLevel: 1, tags: ['milkTea'] }),
    ];
    const input: DecisionInput = {
      ...baseInput, mealIntent: 'fullMeal', budget: 'under50', selectedMoods: ['milkTea'],
    };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);

    expect(result.status).toBe('degraded');
    if (result.status !== 'noMatch') {
      expect(result.plan.main.mealRole).toBe('lightMeal');
      expect(result.plan.drink).toBeDefined();
      expect(result.plan.drink!.tags).toContain('milkTea');
      expect(result.plan.totalPrice).toBe(27);
      expect(result.degradeReason).toContain('轻食');
    }
  });

  it('milkTea+starving+低饱腹轻食 → noMatch, 不能为了饮料推荐不够吃的', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 'f1', name: '低饱轻食', mealRole: 'lightMeal', type: 'snack', estimatedPrice: 12, satiety: 2, occasionLevel: 1 }),
      makeFood({ id: 'f2', name: '奶茶', mealRole: 'drink', type: 'drink', estimatedPrice: 15, satiety: 1, occasionLevel: 1, tags: ['milkTea'] }),
    ];
    const input: DecisionInput = {
      ...baseInput, mealIntent: 'fullMeal', budget: 'under50', selectedMoods: ['milkTea', 'starving'],
    };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);

    expect(result.status).toBe('noMatch');
  });

  it('milkTea+主食超预算 → 不突破预算', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 'f1', name: '贵正餐', mealRole: 'main', type: 'meal', estimatedPrice: 40, satiety: 4, occasionLevel: 3 }),
      makeFood({ id: 'f2', name: '奶茶', mealRole: 'drink', type: 'drink', estimatedPrice: 15, satiety: 1, occasionLevel: 1, tags: ['milkTea'] }),
    ];
    const input: DecisionInput = {
      ...baseInput, mealIntent: 'fullMeal', budget: 'under50', selectedMoods: ['milkTea'],
    };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);

    // 40+15=55 > 50, must not break budget
    if (result.status !== 'noMatch') {
      expect(result.plan.totalPrice).toBeLessThanOrEqual(50);
    }
  });
});

// =========================================================================
// noMatch tests
// =========================================================================
describe('noMatch: 无合法候选不返回 hardBlocked 食物', () => {
  it('全部超预算 → noMatch, 不得返回超预算食物', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 't1-a', name: '28元正餐', estimatedPrice: 28, priceRange: 'under50' }),
      makeFood({ id: 't1-b', name: '30元正餐', estimatedPrice: 30, priceRange: 'under50' }),
    ];
    const input: DecisionInput = { ...baseInput, budget: 'under20', mealIntent: 'fullMeal' };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);

    expect(result.status).toBe('noMatch');
    expect(result.plan).toBeUndefined();
    expect(result.food).toBeUndefined();
    expect(result.alternatives).toEqual([]);
    expect(result.degraded).toBe(true);
    expect(result.degradeReason).toBeTruthy();
  });

  it('全部辣食 + noSpicy → noMatch', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 't2-a', name: '辣菜A', spicy: true, estimatedPrice: 15 }),
      makeFood({ id: 't2-b', name: '辣菜B', spicy: true, estimatedPrice: 18 }),
    ];
    const input: DecisionInput = { ...baseInput, selectedMoods: ['noSpicy'], budget: 'under20', mealIntent: 'fullMeal' };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);

    expect(result.status).toBe('noMatch');
    expect(result.plan).toBeUndefined();
    expect(result.food).toBeUndefined();
    result.scoredFoods.forEach((item) => expect(item.hardBlocked).toBe(true));
  });

  it('fullMeal + 只有饮料 → noMatch, 饮料不能降级为正餐', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 't3-a', name: '奶茶', mealRole: 'drink', type: 'drink', estimatedPrice: 15, satiety: 1, occasionLevel: 1 }),
      makeFood({ id: 't3-b', name: '果汁', mealRole: 'drink', type: 'drink', estimatedPrice: 12, satiety: 1, occasionLevel: 1 }),
    ];
    const input: DecisionInput = { ...baseInput, selectedMoods: [], budget: 'under20', mealIntent: 'fullMeal' };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);

    expect(result.status).toBe('noMatch');
    expect(result.plan).toBeUndefined();
    expect(result.food).toBeUndefined();
  });

  it('fullMeal 无正餐但有轻食 → degraded, plan.main.mealRole=lightMeal', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 't4-a', name: '轻食A', mealRole: 'lightMeal', type: 'snack', estimatedPrice: 12, satiety: 2, occasionLevel: 1, tags: ['eatLight'] }),
      makeFood({ id: 't4-b', name: '轻食B', mealRole: 'lightMeal', type: 'snack', estimatedPrice: 10, satiety: 3, occasionLevel: 1, tags: ['eatLight'] }),
    ];
    const input: DecisionInput = { ...baseInput, selectedMoods: [], budget: 'under20', mealIntent: 'fullMeal' };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);

    expect(result.status).toBe('degraded');
    if (result.status !== 'noMatch') {
      expect(result.plan.main.mealRole).toBe('lightMeal');
      expect(result.food).toBeDefined();
      expect(result.degraded).toBe(true);
      expect(result.degradeReason).toContain('轻食');
    }
  });

  it('starving + only low-satiety lightMeal → noMatch, 不能退化', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 't5-a', name: '粥', mealRole: 'lightMeal', type: 'snack', estimatedPrice: 8, satiety: 2, occasionLevel: 1 }),
    ];
    const input: DecisionInput = { ...baseInput, selectedMoods: ['starving'], budget: 'under20', mealIntent: 'fullMeal' };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);

    expect(result.status).toBe('noMatch');
    expect(result.plan).toBeUndefined();
    expect(result.food).toBeUndefined();
  });

  it('noMatch 结果不应生成历史条目', () => {
    const foods: FoodItem[] = [
      makeFood({ id: 't6-a', name: '只有辣菜', spicy: true, estimatedPrice: 15 }),
    ];
    const input: DecisionInput = { ...baseInput, selectedMoods: ['noSpicy'], budget: 'under20', mealIntent: 'fullMeal' };
    const result = recommendFood(foods, [], input, () => 0.5, dinnerTime);

    expect(result.status).toBe('noMatch');
    expect(result.plan).toBeUndefined();
    expect(result.food).toBeUndefined();
    expect(result.score).toBeUndefined();
  });
});

// =========================================================================
// MealPlan structure tests
// =========================================================================
describe('MealPlan 结构', () => {
  it('fullMeal 时主推荐不能是饮料', () => {
    const input: DecisionInput = { ...baseInput, mealIntent: 'fullMeal', budget: 'under50' };
    const result = recommendFood(defaultFoods, [], input, Math.random, dinnerTime);
    if (result.status !== 'noMatch') {
      expect(result.food.mealRole).not.toBe('drink');
    }
  });

  it('drink 意图 + 存在饮料 → 所有主推荐都是饮料', () => {
    const input: DecisionInput = { ...baseInput, mealIntent: 'drink', budget: 'under20' };
    for (let i = 0; i < 5; i++) {
      const result = recommendFood(defaultFoods, [], input, () => i / 5, dinnerTime);
      if (result.status !== 'noMatch') {
        expect(result.food.mealRole).toBe('drink');
      }
    }
  });

  it('组合总价不超过预算上限', () => {
    const input: DecisionInput = { ...baseInput, budget: 'under20' };
    const result = recommendFood(defaultFoods, [], input, Math.random, dinnerTime);
    if (result.status !== 'noMatch') {
      expect(result.plan.totalPrice).toBeLessThanOrEqual(20);
    }
  });

  it('milkTea + dinner fullMeal 时奶茶不应成为主推荐', () => {
    const input: DecisionInput = {
      ...baseInput, mealIntent: 'fullMeal', selectedMoods: ['milkTea'], budget: 'under50',
    };
    const result = recommendFood(defaultFoods, [], input, Math.random, dinnerTime);
    if (result.status !== 'noMatch') {
      const isMilkTeaMain = result.food.name.includes('奶茶') || result.food.tags.includes('milkTea');
      expect(isMilkTeaMain).toBe(false);
    }
  });

  it('starving 时主食饱腹度应 >= 3', () => {
    const input: DecisionInput = {
      ...baseInput, mealIntent: 'fullMeal', selectedMoods: ['starving'], budget: 'under50',
    };
    for (let i = 0; i < 5; i++) {
      const result = recommendFood(defaultFoods, [], input, () => i / 5, dinnerTime);
      if (result.status !== 'noMatch') {
        expect(result.food.satiety).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('备选不包含饮料或加餐(自定义库)', () => {
    const tinyFoods: FoodItem[] = [
      makeFood({ id: 'tiny-main', name: '黄焖鸡', mealRole: 'main', estimatedPrice: 18, satiety: 4 }),
      { ...makeFood({ id: 'tiny-drink', name: '奶茶', mealRole: 'drink', type: 'drink', estimatedPrice: 15, satiety: 1 }), tags: ['milkTea'] },
      makeFood({ id: 'tiny-addon', name: '小吃', mealRole: 'addon', type: 'snack', estimatedPrice: 10, satiety: 2 }),
    ];
    const input: DecisionInput = { ...baseInput, mealIntent: 'fullMeal', budget: 'under20' };
    const result = recommendFood(tinyFoods, [], input, Math.random, dinnerTime);
    if (result.status !== 'noMatch') {
      const badAlt = result.alternatives.filter(
        (a) => a.main.mealRole === 'drink' || a.main.mealRole === 'addon'
      );
      expect(badAlt.length).toBe(0);
    }
  });
});

describe('胃部判决报告', () => {
  it('统计最常吃/回购王/后悔王/花费', () => {
    const now = Date.now();
    const history: DecisionHistory[] = [
      entry({ feedback: 'worth', createdAt: now - 1 * 24 * 3600 * 1000 }),
      entry({ feedback: 'worth', createdAt: now - 2 * 24 * 3600 * 1000 }),
      entry({ foodId: 'food-malaxiangguo', foodName: '麻辣烫', feedback: 'regret', createdAt: now - 3 * 24 * 3600 * 1000 }),
      entry({ feedback: 'skipped', createdAt: now - 4 * 24 * 3600 * 1000 }),
    ];
    const report = buildStomachReport(history, defaultFoods, 'month', now);
    expect(report.mealCount).toBe(3);
    expect(report.skippedCount).toBe(1);
    expect(report.mostEaten?.name).toBe('黄焖鸡');
    expect(report.repurchaseKing?.name).toBe('黄焖鸡');
    expect(report.regretKing?.name).toBe('麻辣烫');
    expect(report.estimatedSpend).toBe(18 + 18 + 18);
    expect(report.topMood?.name).toBe('不知道想吃啥');
  });

  it('历史含 totalPrice 时优先使用组合总价', () => {
    const now = Date.now();
    const history: DecisionHistory[] = [
      entry({ feedback: 'worth', createdAt: now - 1 * 24 * 3600 * 1000, totalPrice: 33, drinkName: '奶茶' }),
    ];
    const report = buildStomachReport(history, defaultFoods, 'month', now);
    expect(report.estimatedSpend).toBe(33);
  });

  it('空历史 → 查无此胃', () => {
    const report = buildStomachReport([], defaultFoods, 'week');
    expect(report.mealCount).toBe(0);
    expect(report.verdict).toBe('查无此胃');
  });
});

describe('确定性 RNG', () => {
  it('相同输入 + 相同 RNG + 相同时间 → 相同结果', () => {
    const a = recommendFood(defaultFoods, [], baseInput, () => 0.5, dinnerTime);
    const b = recommendFood(defaultFoods, [], baseInput, () => 0.5, dinnerTime);
    if (a.status !== 'noMatch' && b.status !== 'noMatch') {
      expect(a.food.id).toBe(b.food.id);
      expect(a.plan.totalPrice).toBe(b.plan.totalPrice);
    }
  });
});
