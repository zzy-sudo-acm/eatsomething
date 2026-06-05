import {
  DecisionHistory,
  DecisionInput,
  FoodItem,
  PriceRange,
  Recommendation,
  ScoredFood,
} from '../types';
import { distanceLabels, foodDistanceLabels, priceLabels, priceOrder, stabilityLabels } from './options';

const dayMs = 24 * 60 * 60 * 1000;

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const budgetScore = (selected: PriceRange, food: FoodItem): number => {
  if (selected === 'any') return 6;
  if (food.priceRange === 'any') return 2;
  return priceOrder[food.priceRange] <= priceOrder[selected] ? 10 : -8;
};

const distanceScore = (selected: DecisionInput['distance'], food: FoodItem): number => {
  if (selected === food.distance) return selected === 'delivery' ? 10 : 8;
  const matrix: Record<DecisionInput['distance'], Partial<Record<FoodItem['distance'], number>>> = {
    near: { medium: 1, delivery: 2, far: -8 },
    medium: { near: 6, far: 1, delivery: 2 },
    delivery: { near: 3, medium: 1, far: -3 },
    far: { near: 4, medium: 5, delivery: 2 },
  };
  return matrix[selected][food.distance] ?? 0;
};

const stabilityScore = (food: FoodItem) => {
  if (food.stability === 'high') return 8;
  if (food.stability === 'medium') return 4;
  return 0;
};

const getLatestFoodTime = (history: DecisionHistory[], foodId: string) =>
  history
    .filter((item) => item.foodId === foodId)
    .map((item) => item.createdAt)
    .sort((a, b) => b - a)[0];

const recentPenalty = (history: DecisionHistory[], foodId: string, now: number): number => {
  const latest = getLatestFoodTime(history, foodId);
  if (!latest) return 0;
  const days = (now - latest) / dayMs;
  if (days <= 1) return -25;
  if (days <= 3) return -15;
  if (days <= 7) return -8;
  return 0;
};

const feedbackScore = (history: DecisionHistory[], foodId: string) => {
  const foodHistory = history.filter((item) => item.foodId === foodId);
  const worth = foodHistory.filter((item) => item.feedback === 'worth').length;
  const normal = foodHistory.filter((item) => item.feedback === 'normal').length;
  const regret = foodHistory.filter((item) => item.feedback === 'regret').length;
  return Math.min(worth * 4 + normal * 1, 18) - Math.min(regret * 9, 36);
};

const pickWeighted = (items: ScoredFood[]) => {
  const minScore = Math.min(...items.map((item) => item.score));
  const weighted = items.map((item) => ({
    item,
    weight: Math.max(1, item.score - minScore + 3),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return weighted[0].item;
};

const formatList = (values: string[], fallback: string) => {
  if (!values.length) return fallback;
  if (values.length <= 3) return values.join('、');
  return `${values.slice(0, 3).join('、')}等状态`;
};

const buildCopy = (
  picked: ScoredFood,
  input: DecisionInput,
  alternatives: FoodItem[],
  history: DecisionHistory[]
): Recommendation['copy'] => {
  const moods = unique(input.selectedMoods);
  const partnerMoods = unique(input.partnerMoods ?? []);
  const allMoods = unique([...moods, ...partnerMoods]);
  const food = picked.food;
  const matched = allMoods.filter((mood) => food.tags.includes(mood));
  const recentTime = getLatestFoodTime(history, food.id);
  const ateRecently = recentTime && Date.now() - recentTime < 7 * dayMs;

  let title = '别折腾，吃稳定选项';
  if (input.coupleMode) title = '今晚走折中路线';
  else if (moods.includes('想省钱')) title = '预算守门员上线';
  else if (moods.includes('想奖励自己') || moods.includes('刚考完')) title = '今天允许快乐一点';
  else if (moods.includes('饿疯了')) title = '先把血条回上来';
  else if (moods.includes('不知道想吃啥')) title = '别问灵魂，问胃';

  const selfPart = formatList(moods, '你没有给太多线索');
  const partnerPart = partnerMoods.length ? `，她偏向${formatList(partnerMoods, '随缘')}` : '';
  const matchPart = matched.length ? `它正好接住了${formatList(matched, '当前状态')}` : '它不是最花哨的，但今天胜在不用纠结';
  const relationPart = input.coupleMode
    ? `你这边是${selfPart}${partnerPart}，系统做了个不太离谱的折中。`
    : `你现在是${selfPart}。`;

  const reason = `${relationPart}${matchPart}，预算大概压在${priceLabels[food.priceRange]}，距离属于${foodDistanceLabels[food.distance]}，稳定性${stabilityLabels[food.stability]}。`;

  const risks = [];
  if (food.spicy) risks.push('带辣，嘴硬可以，胃未必同意');
  if (food.stability === 'low') risks.push('稳定性偏低，今天有探索成本');
  if (input.distance !== food.distance) risks.push(`和你选的${distanceLabels[input.distance]}不完全一致`);
  if (ateRecently) risks.push('最近吃过一次，重复感可能会冒头');
  if (!risks.length) risks.push('风险不大，主要风险是你又开始问“要不要换一个”');

  const punchlines = [
        '你现在不是没主见，你只是饿了。',
        '系统判定：今天不适合探索新店。',
        '本次决定由系统背锅。',
        `你不是想吃${food.name}，你是想让生活别再出选择题。`,
        '别装了，今天你的胃只想要一个稳定答案。',
      ];

  return {
    title,
    reason,
    risk: risks.join('；'),
    punchline: input.coupleMode ? '本轮由系统背锅，吃不好不许怪对方。' : punchlines[Math.floor(Math.random() * punchlines.length)],
    alternatives: alternatives.map((item) => item.name),
  };
};

export const recommendFood = (
  foods: FoodItem[],
  history: DecisionHistory[],
  input: DecisionInput
): Recommendation => {
  const now = Date.now();
  const allMoods = unique([...(input.selectedMoods ?? []), ...(input.partnerMoods ?? [])]);
  const scoredFoods = foods
    .map<ScoredFood>((food) => {
      let score = 10;
      const reasons: string[] = [];
      const warnings: string[] = [];

      const matchedMoods = allMoods.filter((mood) => food.tags.includes(mood));
      if (matchedMoods.length) {
        score += matchedMoods.length * 8;
        reasons.push(`匹配 ${matchedMoods.join('、')}`);
      }

      const budget = budgetScore(input.budget, food);
      score += budget;
      if (budget > 0) reasons.push(`预算 ${priceLabels[input.budget]}`);
      else warnings.push('预算可能超一点');

      const distance = distanceScore(input.distance, food);
      score += distance;
      if (distance > 0) reasons.push(`距离 ${distanceLabels[input.distance]}`);
      else warnings.push('距离不太顺手');

      const stable = stabilityScore(food);
      score += stable;
      if (food.stability === 'high') reasons.push('稳定性高');

      if (allMoods.includes('不想吃辣') && food.spicy) {
        score -= 20;
        warnings.push('你说不想吃辣');
      }

      if (allMoods.includes('不想踩雷') && food.stability === 'low') {
        score -= 15;
        warnings.push('稳定性低');
      }

      const recent = recentPenalty(history, food.id, now);
      score += recent;
      if (recent < 0) warnings.push('最近吃过');

      const feedback = feedbackScore(history, food.id);
      score += feedback;
      if (feedback > 0) reasons.push('历史反馈不错');
      if (feedback < 0) warnings.push('历史后悔偏多');

      if (input.coupleMode && matchedMoods.length >= 2) {
        score += 4;
        reasons.push('适合折中');
      }

      return { food, score, reasons, warnings };
    })
    .sort((a, b) => b.score - a.score);

  const top = scoredFoods.slice(0, Math.min(5, scoredFoods.length));
  const picked = pickWeighted(top);
  const alternatives = scoredFoods.filter((item) => item.food.id !== picked.food.id).slice(0, 2);

  return {
    food: picked.food,
    score: picked.score,
    scoredFoods,
    copy: buildCopy(
      picked,
      input,
      alternatives.map((item) => item.food),
      history
    ),
  };
};
