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

const baseInput: Pick<DecisionInput, 'partnerMoods' | 'distance' | 'coupleMode'> = {
  partnerMoods: undefined,
  distance: 'near',
  coupleMode: false,
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

const getAlternativeFoods = (recommendation: Recommendation) =>
  recommendation.copy.alternatives
    .map((name) => recommendation.scoredFoods.find((item) => item.food.name === name)?.food)
    .filter((food): food is FoodItem => Boolean(food));

const getVisibleFoods = (recommendation: Recommendation) => [recommendation.food, ...getAlternativeFoods(recommendation)];

const hasDrink = (foods: FoodItem[]) => foods.some((food) => food.mealRole === 'drink');

const hasAddon = (foods: FoodItem[]) => foods.some((food) => food.mealRole === 'addon');

const hasSpicy = (foods: FoodItem[]) => foods.some((food) => food.spicy);

const summarizeRecommendations = (recommendations: Recommendation[]) =>
  Array.from(new Set(recommendations.map((item) => item.food.name))).join('、') || '无';

const findMilkTea = (recommendation: Recommendation) =>
  recommendation.scoredFoods.find(
    (item) => item.food.name.includes('奶茶') || item.food.tags.includes('想喝奶茶')
  );

const buildResult = (
  id: string,
  name: string,
  passed: boolean,
  details: string
): RecommendationScenarioResult => ({
  id,
  name,
  passed,
  details,
});

export const runRecommendationScenarios = (foods: FoodItem[]): RecommendationScenarioReport => {
  if (!foods.length) {
    const empty = buildResult('empty-foods', '菜品库非空', false, '菜品库为空，无法运行推荐自检。');
    return { passed: 0, total: 1, createdAt: Date.now(), results: [empty] };
  }

  const now = Date.now();
  const results: RecommendationScenarioResult[] = [];

  {
    const recommendations = runSamples(foods, {
      ...baseInput,
      selectedMoods: ['不知道想吃啥'],
      budget: 'under50',
    });
    const bad = recommendations.filter((item) => hasDrink(getVisibleFoods(item)));
    results.push(
      buildResult(
        'under50-unknown-no-drink',
        '50以内 + 不知道想吃啥不出现饮料',
        bad.length === 0,
        bad.length
          ? `发现饮料进入主推荐或备选：${summarizeRecommendations(bad)}`
          : `通过，主推荐样本：${summarizeRecommendations(recommendations)}`
      )
    );
  }

  {
    const recommendations = runSamples(foods, {
      ...baseInput,
      selectedMoods: ['饿疯了'],
      budget: 'under20',
    });
    const badRole = recommendations.filter((item) => hasDrink(getVisibleFoods(item)) || hasAddon(getVisibleFoods(item)));
    const notFilling = recommendations.filter((item) => item.food.satiety < 4);
    results.push(
      buildResult(
        'hungry-filling-main',
        '饿疯了优先顶饱正餐',
        badRole.length === 0 && notFilling.length === 0,
        badRole.length || notFilling.length
          ? `不合理样本：${summarizeRecommendations([...badRole, ...notFilling])}`
          : `通过，主推荐样本：${summarizeRecommendations(recommendations)}`
      )
    );
  }

  {
    const recommendations = runSamples(foods, {
      ...baseInput,
      selectedMoods: ['想喝奶茶'],
      budget: 'under20',
    });
    const first = recommendations[0];
    const milkTea = findMilkTea(first);
    const everPickedMilkTea = recommendations.some((item) => findMilkTea(item)?.food.id === item.food.id);
    results.push(
      buildResult(
        'milk-tea-allowed',
        '想喝奶茶时奶茶可作为主推荐',
        Boolean(milkTea && !milkTea.hardBlocked && everPickedMilkTea),
        milkTea
          ? `奶茶 hardBlocked=${milkTea.hardBlocked}，分数=${milkTea.score}，主推荐样本：${summarizeRecommendations(
              recommendations
            )}`
          : '没有找到带“奶茶/想喝奶茶”标签的候选。'
      )
    );
  }

  {
    const recommendations = runSamples(foods, {
      ...baseInput,
      selectedMoods: ['不想吃辣'],
      budget: 'under50',
    });
    const bad = recommendations.filter((item) => hasSpicy(getVisibleFoods(item)));
    results.push(
      buildResult(
        'avoid-spicy',
        '不想吃辣时主推荐和备选避开辣菜',
        bad.length === 0,
        bad.length
          ? `发现辣菜进入主推荐或备选：${summarizeRecommendations(bad)}`
          : `通过，主推荐样本：${summarizeRecommendations(recommendations)}`
      )
    );
  }

  {
    const recommendations = runSamples(foods, {
      ...baseInput,
      selectedMoods: ['不想吃太饱'],
      budget: 'under20',
    });
    const bad = recommendations.filter((item) => item.food.mealRole !== 'lightMeal');
    results.push(
      buildResult(
        'light-meal',
        '不想吃太饱优先轻食',
        bad.length === 0,
        bad.length
          ? `非轻食样本：${summarizeRecommendations(bad)}`
          : `通过，主推荐样本：${summarizeRecommendations(recommendations)}`
      )
    );
  }

  {
    const recommendations = runSamples(foods, {
      ...baseInput,
      selectedMoods: ['想奖励自己'],
      budget: 'under50',
    });
    const bad = recommendations.filter(
      (item) => item.food.mealRole !== 'main' || item.food.estimatedPrice < 25 || item.food.estimatedPrice > 45
    );
    results.push(
      buildResult(
        'under50-reward',
        '50以内 + 想奖励自己偏向25到45元正餐',
        bad.length === 0,
        bad.length
          ? `不在目标价位样本：${summarizeRecommendations(bad)}`
          : `通过，主推荐样本：${summarizeRecommendations(recommendations)}`
      )
    );
  }

  {
    const input: DecisionInput = {
      ...baseInput,
      selectedMoods: ['不知道想吃啥'],
      budget: 'under50',
    };
    const before = withMockedRandom(0, () => recommendFood(foods, [], input));
    const skippedHistory: DecisionHistory[] = [
      {
        id: 'scenario-skip',
        foodId: before.food.id,
        foodName: before.food.name,
        selectedMoods: input.selectedMoods,
        budget: input.budget,
        distance: input.distance,
        feedback: 'skipped',
        createdAt: now,
      },
    ];
    const after = withMockedRandom(0, () => recommendFood(foods, skippedHistory, input));
    const beforeScore = before.scoredFoods.find((item) => item.food.id === before.food.id)?.score ?? 0;
    const afterScore = after.scoredFoods.find((item) => item.food.id === before.food.id)?.score ?? 0;
    results.push(
      buildResult(
        'skip-penalty',
        'skipped 食物10分钟内明显降权',
        after.food.id !== before.food.id && afterScore <= beforeScore - 20,
        `跳过 ${before.food.name}：${beforeScore} -> ${afterScore}；跳过后主推荐=${after.food.name}`
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
