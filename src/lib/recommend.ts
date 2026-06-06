import {
  DecisionCopy,
  DecisionHistory,
  DecisionInput,
  FoodItem,
  PriceRange,
  Recommendation,
  ScoredFood,
} from '../types';
import {
  coupleFriendlyTags,
  distanceLabels,
  foodDistanceLabels,
  isRelationshipMood,
  priceLabels,
  stabilityLabels,
} from './options';

const dayMs = 24 * 60 * 60 * 1000;
const primaryTypes: FoodItem['type'][] = ['meal', 'happy', 'date'];
const drinkPrimaryMoods = ['想喝点东西', '想喝奶茶', '不想吃太饱'];

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const isPrimaryType = (food: FoodItem) => primaryTypes.includes(food.type);

const hasDrinkNeed = (moods: string[]) => drinkPrimaryMoods.some((mood) => moods.includes(mood));

const hasSnackNeed = (input: DecisionInput, moods: string[], food: FoodItem) => {
  if (food.type !== 'snack') return false;
  if (moods.includes('不想吃太饱') && food.tags.includes('不想吃太饱')) return true;
  if (input.budget === 'under10' && moods.includes('想省钱') && food.priceRange === 'under10') return true;
  return moods.includes('不想排队') && food.tags.includes('不想排队');
};

const isCoupleFriendlyFood = (food: FoodItem) => food.tags.some((tag) => coupleFriendlyTags.includes(tag));

const canBeMainRecommendation = (food: FoodItem, input: DecisionInput, moods: string[]) => {
  if (isPrimaryType(food)) return true;
  if (food.type === 'drink') return hasDrinkNeed(moods);
  if (food.type === 'snack') return hasSnackNeed(input, moods, food) && !moods.includes('饿疯了');
  return false;
};

const budgetScore = (selected: PriceRange, food: FoodItem, moods: string[]): number => {
  if (selected === 'any') return 0;

  const saving = moods.includes('想省钱');

  if (selected === 'under10') {
    if (food.priceRange === 'under10') return 20;
    if (food.priceRange === 'under20') return 6;
    if (food.priceRange === 'under50') return -12;
    return -4;
  }

  if (selected === 'under20') {
    if (food.priceRange === 'under20') return 18;
    if (food.priceRange === 'under10') return 10;
    if (food.priceRange === 'under50') return -6;
    return 0;
  }

  if (food.priceRange === 'under50') return 22;
  if (food.priceRange === 'under20') return isPrimaryType(food) ? 4 : -2;
  if (food.priceRange === 'under10') return saving ? 5 : -10;
  return 0;
};

const typeMoodScore = (
  food: FoodItem,
  input: DecisionInput,
  moods: string[]
): { score: number; reasons: string[]; warnings: string[] } => {
  let score = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const drinkNeed = hasDrinkNeed(moods);
  const snackNeed = hasSnackNeed(input, moods, food);

  if (input.budget === 'under50') {
    if (isPrimaryType(food)) {
      score += 8;
      reasons.push('50以内优先吃像样一点');
    } else if ((food.type === 'drink' && !drinkNeed) || (food.type === 'snack' && !snackNeed)) {
      score -= 6;
      warnings.push('50以内不是低价凑数');
    }
  }

  if (food.type === 'drink' && !drinkNeed) {
    score -= 24;
    warnings.push('没有明确想喝');
  }

  if (food.type === 'snack' && !snackNeed) {
    score -= 8;
    warnings.push('小吃不适合当主餐');
  }

  if (moods.includes('饿疯了')) {
    if (isPrimaryType(food)) {
      score += 14;
      reasons.push('能当正餐');
    }
    if (food.type === 'drink') {
      score -= 32;
      warnings.push('饿疯了不能只喝');
    }
    if (food.type === 'snack') {
      score -= 14;
      warnings.push('小吃不够顶');
    }
    if (food.stability === 'high') {
      score += 5;
      reasons.push('饿的时候先吃稳的');
    }
  }

  if (drinkNeed && food.type === 'drink') {
    score += 34;
    reasons.push('明确想喝');
  }

  if (moods.includes('想奖励自己')) {
    if (food.type === 'happy' || food.type === 'date') {
      score += 16;
      reasons.push('奖励感更足');
    }
    if (food.priceRange === 'under50') {
      score += 8;
      reasons.push('今天值得吃好点');
    }
    if (food.priceRange === 'under10') {
      score -= 8;
      warnings.push('太省不够奖励');
    }
  }

  if (input.coupleMode) {
    if (isCoupleFriendlyFood(food)) {
      score += 8;
      reasons.push('适合两个人');
    }
    if (food.type === 'date') {
      score += 12;
      reasons.push('适合两个人');
    }
    if (food.type === 'happy') {
      score += 8;
      reasons.push('共享快乐餐');
    }
    if (food.type === 'drink') {
      score += 8;
      reasons.push('可以作为约会加餐');
    }
  }

  if (moods.includes('不知道想吃啥')) {
    if (isPrimaryType(food) && food.stability === 'high') {
      score += 10;
      reasons.push('不知道时选高稳定正餐');
    } else if (isPrimaryType(food)) {
      score += 4;
      reasons.push('不知道时先按正餐来');
    }

    if (food.stability === 'low') {
      score -= 12;
      warnings.push('不知道时不适合冒险');
    }

    if (food.type === 'drink' || food.type === 'snack') {
      score -= 6;
      warnings.push('不知道时不拿饮料小吃当答案');
    }
  }

  return { score, reasons, warnings };
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

const chooseMainRecommendation = (picked: ScoredFood, scoredFoods: ScoredFood[], input: DecisionInput, moods: string[]) => {
  if (canBeMainRecommendation(picked.food, input, moods)) return picked;

  const fallback = scoredFoods.find(
    (item) => canBeMainRecommendation(item.food, input, moods) && item.score >= picked.score - 15
  );

  return fallback ?? picked;
};

const formatList = (values: string[], fallback: string) => {
  if (!values.length) return fallback;
  if (values.length <= 3) return values.join('、');
  return `${values.slice(0, 3).join('、')}等状态`;
};

const pick = <T>(values: T[]): T => values[Math.floor(Math.random() * values.length)];

const getVerdict = (
  score: number,
  food: FoodItem,
  input: DecisionInput
): { verdict: string; verdictTone: DecisionCopy['verdictTone'] } => {
  const conflict = (input.selectedMoods.includes('不想吃辣') && food.spicy) || food.stability === 'low';
  if (score >= 40 && !conflict) return { verdict: '胃部通过率 高', verdictTone: 'good' };
  if (score >= 24 && !conflict) return { verdict: '匹配度 稳妥', verdictTone: 'good' };
  if (conflict) return { verdict: '今日风险 略高', verdictTone: 'risky' };
  return { verdict: '匹配度 还行', verdictTone: 'ok' };
};

const buildCopy = (
  picked: ScoredFood,
  input: DecisionInput,
  alternatives: FoodItem[],
  history: DecisionHistory[]
): Recommendation['copy'] => {
  const moods = unique(input.selectedMoods).filter((mood) => !isRelationshipMood(mood));
  const partnerMoods = unique(input.partnerMoods ?? []).filter((mood) => !isRelationshipMood(mood));
  const allMoods = unique([...moods, ...partnerMoods]);
  const food = picked.food;
  const matched = allMoods.filter((mood) => food.tags.includes(mood));
  const recentTime = getLatestFoodTime(history, food.id);
  const ateRecently = recentTime && Date.now() - recentTime < 7 * dayMs;
  const drinkAlternative = alternatives.find((item) => item.type === 'drink');
  const shouldTreatDrinkAsAddOn = drinkAlternative && food.type !== 'drink' && !hasDrinkNeed(allMoods);

  let title = '别折腾，今天吃稳的';
  if (input.coupleMode) title = '给你俩选了个不容易吵架的';
  else if (moods.includes('想省钱')) title = '钱包说了算，这个不亏';
  else if (moods.includes('想奖励自己') || moods.includes('刚考完')) title = '今天可以对自己好一点';
  else if (moods.includes('饿疯了')) title = '先把血条回满再说';
  else if (moods.includes('不知道想吃啥')) title = '别问脑子了，问你的胃';

  // Reason: written like a friend talking, not a rule dump.
  let reason: string;
  if (input.coupleMode) {
    const selfPart = formatList(moods, '没什么特别要求');
    const partnerPart = partnerMoods.length ? formatList(partnerMoods, '随缘') : '随缘';
    reason =
      `你这边${selfPart}，对方那边${partnerPart}，两边胃口合并之后，${food.name}是那个谁都不太会翻脸的答案。` +
      `预算压在${priceLabels[food.priceRange]}，${foodDistanceLabels[food.distance]}就能解决，不用为了一顿饭走太远。`;
  } else {
    const opener = matched.length
      ? `你说${formatList(matched, '现在这状态')}，那${food.name}基本就是为这个准备的。`
      : `你也没太想好吃啥，那就别难为自己——${food.name}不花哨，但今天胜在不用纠结。`;
    const why = pick([
      `不贵（${priceLabels[food.priceRange]}就够），${foodDistanceLabels[food.distance]}也顺手，稳定性${stabilityLabels[food.stability]}，踩雷概率不高。`,
      `${foodDistanceLabels[food.distance]}就能吃到，花费大概${priceLabels[food.priceRange]}，是那种闭着眼点也不会出错的选项。`,
      `你要的本来就不是惊喜，是一个不超预算、不用走太远、还不容易难吃的答案，它都占了。`,
    ]);
    reason = `${opener}${why}`;
  }

  if (input.budget === 'under50' && food.type !== 'drink') {
    reason +=
      '你今天预算给得比较松，可以吃得像样一点；这不是最低价方案，是今天相对值得的方案。系统也没有让你拿 50 的预算去喝一杯奶茶。';
  }

  // Risk: human, not a clause list.
  let risk: string;
  if (food.spicy && allMoods.includes('不想吃辣')) {
    risk = '它其实带点辣，你刚说不想吃辣——嘴硬可以，胃不一定买账。';
  } else if (food.spicy) {
    risk = '微辣预警，怕辣的话嘴下留情。';
  } else if (food.stability === 'low') {
    risk = '这家稳定性一般，今天算是带点探索成本，做好心理准备。';
  } else if (ateRecently) {
    risk = '最近刚吃过一次，可能会有点「又是它」的感觉。';
  } else if (input.distance !== food.distance) {
    risk = `跟你选的「${distanceLabels[input.distance]}」不完全对得上，但差得不多。`;
  } else {
    risk = '风险不大，唯一的问题是你吃完可能又会问「要不要换一个」。';
  }

  const punchlines = [
    '你现在不是没主见，你只是饿了。',
    '本次决定由系统背锅，你只负责张嘴。',
    '别折腾了，今天适合吃稳定选项。',
    '系统判定：今天不适合探索新店。',
    `你不是非要吃${food.name}，你只是想让生活少出一道选择题。`,
  ];

  const { verdict, verdictTone } = getVerdict(picked.score, food, input);
  const punchline = shouldTreatDrinkAsAddOn
    ? pick([
        `${drinkAlternative.name}可以喝，但它不能假装自己是一顿饭。`,
        `系统承认${drinkAlternative.name}很诱人，但你的胃表示需要主食。`,
      ])
    : input.coupleMode
      ? '本轮由系统背锅，吃不好不许怪对方。你俩的胃部意见已合并，挑的是个相对不容易吵架的答案。'
      : pick(punchlines);

  return {
    title,
    verdict,
    verdictTone,
    reason,
    risk,
    punchline,
    alternatives: alternatives.map((item) => item.name),
  };
};

export const recommendFood = (
  foods: FoodItem[],
  history: DecisionHistory[],
  input: DecisionInput
): Recommendation => {
  const now = Date.now();
  const allMoods = unique([...(input.selectedMoods ?? []), ...(input.partnerMoods ?? [])]).filter(
    (mood) => !isRelationshipMood(mood)
  );
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

      const budget = budgetScore(input.budget, food, allMoods);
      score += budget;
      if (budget > 0) reasons.push(`消费档位 ${priceLabels[input.budget]}`);
      if (budget < 0) {
        warnings.push(input.budget === 'under50' ? '今天不是最低价优先' : '预算档位不太合适');
      }

      const typeMood = typeMoodScore(food, input, allMoods);
      score += typeMood.score;
      reasons.push(...typeMood.reasons);
      warnings.push(...typeMood.warnings);

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
  const weightedPick = pickWeighted(top);
  const picked = chooseMainRecommendation(weightedPick, scoredFoods, input, allMoods);
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
