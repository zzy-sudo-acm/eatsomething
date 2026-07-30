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

describe('推荐场景自检', () => {
  it('默认菜品库全部场景通过', () => {
    const report = runRecommendationScenarios(defaultFoods);
    const failed = report.results.filter((item) => !item.passed);
    // Log failures for debugging
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
    expect(result.food.spicy).toBe(false);
  });
});

describe('MealPlan 结构', () => {
  it('fullMeal 时主推荐不能是饮料', () => {
    const input: DecisionInput = { ...baseInput, mealIntent: 'fullMeal', budget: 'under50' };
    const result = recommendFood(defaultFoods, [], input, Math.random, dinnerTime);
    expect(result.plan.main.mealRole).not.toBe('drink');
  });

  it('drink 意图 + 存在饮料 → 所有主推荐都是饮料', () => {
    const input: DecisionInput = {
      ...baseInput,
      mealIntent: 'drink',
      budget: 'under20',
    };
    // Test 5 deterministic seeds
    for (let i = 0; i < 5; i++) {
      const result = recommendFood(defaultFoods, [], input, () => i / 5, dinnerTime);
      expect(result.plan.main.mealRole).toBe('drink');
    }
  });

  it('组合总价不超过预算上限', () => {
    const input: DecisionInput = { ...baseInput, budget: 'under20' };
    const result = recommendFood(defaultFoods, [], input, Math.random, dinnerTime);
    expect(result.plan.totalPrice).toBeLessThanOrEqual(20);
  });

  it('milkTea + dinner fullMeal 时奶茶不应成为主推荐', () => {
    const input: DecisionInput = {
      ...baseInput,
      mealIntent: 'fullMeal',
      selectedMoods: ['milkTea'],
      budget: 'under50',
    };
    const result = recommendFood(defaultFoods, [], input, Math.random, dinnerTime);
    const isMilkTeaMain = result.plan.main.name.includes('奶茶') || result.plan.main.tags.includes('milkTea');
    expect(isMilkTeaMain).toBe(false);
  });

  it('starving 时主食饱腹度应 >= 3', () => {
    const input: DecisionInput = {
      ...baseInput,
      mealIntent: 'fullMeal',
      selectedMoods: ['starving'],
      budget: 'under50',
    };
    for (let i = 0; i < 5; i++) {
      const result = recommendFood(defaultFoods, [], input, () => i / 5, dinnerTime);
      expect(result.plan.main.satiety).toBeGreaterThanOrEqual(3);
    }
  });

  it('预算硬上限: 超预算食物返回降级结果', () => {
    // Custom catalogue: only 28 and 30 yuan foods, under20 budget
    const customFoods: FoodItem[] = [
      {
        id: 'test-28',
        name: '冒菜28元',
        priceRange: 'under50',
        distance: 'near',
        type: 'meal',
        estimatedPrice: 28,
        satiety: 4,
        mealRole: 'main',
        occasionLevel: 3,
        tags: [],
        spicy: false,
        stability: 'medium',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'test-30',
        name: '汉堡30元',
        priceRange: 'under50',
        distance: 'near',
        type: 'happy',
        estimatedPrice: 30,
        satiety: 4,
        mealRole: 'main',
        occasionLevel: 2,
        tags: [],
        spicy: false,
        stability: 'medium',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const input: DecisionInput = { ...baseInput, budget: 'under20' };
    const result = recommendFood(customFoods, [], input, Math.random, dinnerTime);
    // All foods exceed budget → must be degraded with a reason
    expect(result.degraded).toBe(true);
    expect(result.degradeReason).toBeTruthy();
    expect(result.degradeReason).toContain('超出预算');
    // Over-budget foods must be hard-blocked
    const overBudgetScored = result.scoredFoods.filter((item) => item.food.estimatedPrice > 20);
    overBudgetScored.forEach((item) => expect(item.hardBlocked).toBe(true));
  });

  it('备选不包含饮料或加餐(自定义库)', () => {
    const tinyFoods: FoodItem[] = [
      {
        id: 'tiny-main',
        name: '黄焖鸡',
        priceRange: 'under20',
        distance: 'near',
        type: 'meal',
        estimatedPrice: 18,
        satiety: 4,
        mealRole: 'main',
        occasionLevel: 2,
        tags: ['noIdea'],
        spicy: false,
        stability: 'high',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'tiny-drink',
        name: '奶茶',
        priceRange: 'under20',
        distance: 'near',
        type: 'drink',
        estimatedPrice: 15,
        satiety: 1,
        mealRole: 'drink',
        occasionLevel: 1,
        tags: ['milkTea'],
        spicy: false,
        stability: 'medium',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'tiny-addon',
        name: '小吃',
        priceRange: 'under20',
        distance: 'near',
        type: 'snack',
        estimatedPrice: 10,
        satiety: 2,
        mealRole: 'addon',
        occasionLevel: 1,
        tags: [],
        spicy: false,
        stability: 'medium',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const input: DecisionInput = {
      ...baseInput,
      mealIntent: 'fullMeal',
      budget: 'under20',
    };
    const result = recommendFood(tinyFoods, [], input, Math.random, dinnerTime);
    // Alternatives must not contain drink or addon
    const badAlt = result.alternatives.filter(
      (a) => a.main.mealRole === 'drink' || a.main.mealRole === 'addon'
    );
    expect(badAlt.length).toBe(0);
  });
});

describe('胃部判决报告', () => {
  it('统计最常吃/回购王/后悔王/花费', () => {
    const now = Date.now();
    const history: DecisionHistory[] = [
      entry({ feedback: 'worth', createdAt: now - 1 * 24 * 3600 * 1000 }),
      entry({ feedback: 'worth', createdAt: now - 2 * 24 * 3600 * 1000 }),
      entry({
        foodId: 'food-malaxiangguo',
        foodName: '麻辣烫',
        feedback: 'regret',
        createdAt: now - 3 * 24 * 3600 * 1000,
      }),
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
      entry({
        feedback: 'worth',
        createdAt: now - 1 * 24 * 3600 * 1000,
        totalPrice: 33,
        drinkName: '奶茶',
      }),
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
    expect(a.plan.main.id).toBe(b.plan.main.id);
    expect(a.plan.totalPrice).toBe(b.plan.totalPrice);
  });
});
