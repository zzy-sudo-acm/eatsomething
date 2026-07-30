import {
  DecisionCopy,
  DecisionHistory,
  DecisionInput,
  FoodItem,
  MealIntent,
  MealPlan,
  ScoredFood,
} from '../../types';
import { distanceLabels, foodDistanceLabels, stabilityLabels } from '../options';
import { moodLabel, toMoodIds } from '../moods';
import { isRelationshipMood } from '../options';
import { hasDrinkMood } from './eligibility';

const dayMs = 24 * 60 * 60 * 1000;

const unique = (values: string[]) =>
  Array.from(new Set(values.filter(Boolean)));

const getLatestFoodTime = (history: DecisionHistory[], foodId: string) =>
  history
    .filter((item) => item.foodId === foodId && item.feedback !== 'skipped')
    .map((item) => item.createdAt)
    .sort((a, b) => b - a)[0];

const formatList = (values: string[], fallback: string) => {
  if (!values.length) return fallback;
  if (values.length <= 3) return values.join('、');
  return `${values.slice(0, 3).join('、')}等状态`;
};

const pick = <T>(values: T[]): T => values[Math.floor(Math.random() * values.length)];

const getVerdict = (
  score: number,
  food: FoodItem,
  allMoods: string[]
): { verdict: string; verdictTone: DecisionCopy['verdictTone'] } => {
  const conflict = (allMoods.includes('noSpicy') && food.spicy) || food.stability === 'low';
  if (score >= 40 && !conflict)
    return { verdict: pick(['胃部通过率 高', '匹配度 很稳', '本轮稳了']), verdictTone: 'good' };
  if (score >= 24 && !conflict)
    return { verdict: pick(['匹配度 稳妥', '大概率不翻车']), verdictTone: 'good' };
  if (conflict) return { verdict: '今日风险 略高', verdictTone: 'risky' };
  return { verdict: '匹配度 还行', verdictTone: 'ok' };
};

export const buildCopy = (
  picked: ScoredFood,
  plan: MealPlan,
  input: DecisionInput,
  alternatives: MealPlan[],
  history: DecisionHistory[],
  intent: MealIntent
): DecisionCopy => {
  const moods = unique(input.selectedMoods).filter((mood) => !isRelationshipMood(mood));
  const partnerMoods = unique(input.partnerMoods ?? []).filter((mood) => !isRelationshipMood(mood));
  const allMoods = unique([...moods, ...partnerMoods]);
  const food = picked.food;
  const matched = allMoods.filter((mood) => food.tags.includes(mood));
  const matchedLabels = matched.map(moodLabel);
  const moodLabelsList = moods.map(moodLabel);
  const partnerMoodLabels = partnerMoods.map(moodLabel);
  const recentTime = getLatestFoodTime(history, food.id);
  const ateRecently = recentTime && Date.now() - recentTime < 7 * dayMs;

  // Title
  let title = '别折腾，今天吃稳的';
  if (input.coupleMode) title = '给你俩选了个不容易吵架的';
  else if (moods.includes('saveMoney')) title = '钱包说了算，这个不亏';
  else if (moods.includes('reward') || moods.includes('afterExam')) title = '今天可以对自己好一点';
  else if (moods.includes('starving')) title = '先把血条回满再说';
  else if (moods.includes('noIdea')) title = '别问脑子了，问你的胃';

  // Reason
  let reason: string;
  if (input.coupleMode) {
    const selfPart = formatList(moodLabelsList, '没什么特别要求');
    const partnerPart = partnerMoodLabels.length ? formatList(partnerMoodLabels, '随缘') : '随缘';
    reason =
      `你这边${selfPart}，对方那边${partnerPart}，两边胃口合并之后，${food.name}是那个谁都不太会翻脸的答案。` +
      `大概${food.estimatedPrice}元，${foodDistanceLabels[food.distance]}就能解决，不用为了一顿饭走太远。`;
  } else {
    const opener = matched.length
      ? pick([
          `你说${formatList(matchedLabels, '现在这状态')}，那${food.name}基本就是为这个量身定的。`,
          `就你这「${formatList(matchedLabels, '现在这状态')}」的状态，闭眼选都该是${food.name}。`,
          `行吧，${formatList(matchedLabels, '现在这状态')}——${food.name}举手了，说这活它最熟。`,
        ])
      : pick([
          `你也没太想好吃啥，那就别难为自己——${food.name}不花哨，但今天胜在不用纠结。`,
          `线索给得不多，系统替你拿了主意：${food.name}，主打一个不会出错。`,
          `你这是把选择权整个交出来了，那系统就不客气——${food.name}，安排。`,
        ]);
    const why = pick([
      `大概${food.estimatedPrice}元，${foodDistanceLabels[food.distance]}也顺手，稳定性${stabilityLabels[food.stability]}，踩雷概率不高。`,
      `${foodDistanceLabels[food.distance]}就能吃到，花费大概${food.estimatedPrice}元，是那种闭着眼点也不会出错的选项。`,
      `你要的本来就不是惊喜，是一个预算合适、不用走太远、还不容易难吃的答案，它都占了。`,
      `${food.estimatedPrice}元上下，${foodDistanceLabels[food.distance]}，稳定性${stabilityLabels[food.stability]}——典型的「不惊艳但不翻车」型选手。`,
      `别看它普通，${food.estimatedPrice}元能稳稳把你喂饱这件事，本身就挺加分。`,
      `它不负责让你惊喜，只负责让你吃完不后悔——${food.estimatedPrice}元，${foodDistanceLabels[food.distance]}，刚好。`,
    ]);
    reason = `${opener}${why}`;
  }

  // Budget disclaimer
  if (input.budget === 'under50' && plan.totalPrice < 45 && !moods.includes('saveMoney')) {
    reason += pick([
      '今天预算比较松，但预算是上限，不是任务——没为了凑到50硬塞小吃。',
      '预算给得宽，但系统没乱花，够吃就行。',
    ]);
  } else if (input.budget === 'under50' && intent === 'fullMeal') {
    reason += '今天预算给得比较松，系统还是先按能好好吃饭来选，没有让饮料抢主菜位置。';
  }

  // Plan explanation
  if (plan.drink && plan.addon) {
    reason += `${plan.drink.name}和${plan.addon.name}是搭的，加起来${plan.totalPrice}元，没超预算。`;
  } else if (plan.drink) {
    if (moods.includes('milkTea')) {
      reason += `你想喝奶茶，但现在是正餐时间，所以没让它单独上位。先用${food.name}把饭吃了，剩下的预算刚好配一杯${plan.drink.name}。`;
    } else if (hasDrinkMood(allMoods)) {
      reason += `${plan.drink.name}是你想喝的，${food.name}负责喂饱你，分工明确。`;
    } else {
      reason += `搭了杯${plan.drink.name}，总共${plan.totalPrice}元，刚好都在预算里。`;
    }
  } else if (plan.addon) {
    reason += `加了个${plan.addon.name}，共${plan.totalPrice}元，不超预算。`;
  }

  // eatLight context
  if (allMoods.includes('eatLight') && food.mealRole === 'lightMeal') {
    reason += '这不是不吃饭，是吃轻一点，给胃留点余地。';
  }

  // Risk
  let risk: string;
  if (food.spicy && allMoods.includes('noSpicy')) {
    risk = '它其实带点辣，你刚说不想吃辣——嘴硬可以，胃不一定买账。';
  } else if (food.spicy) {
    risk = pick(['微辣预警，怕辣的话嘴下留情，别逞强。', '它带点辣，嘴硬可以，明天的你不一定原谅今天的你。']);
  } else if (food.stability === 'low') {
    risk = '这家稳定性一般，今天算是带点探索成本，做好心理准备。';
  } else if (ateRecently) {
    risk = '最近刚吃过一次，可能会有点「又是它」的感觉。';
  } else if (input.distance !== food.distance) {
    risk = `跟你选的「${distanceLabels[input.distance]}」不完全对得上，但差得不多。`;
  } else {
    risk = pick([
      '风险不大，唯一的隐患是你吃完可能又开始问「要不要换一个」。',
      '基本零风险，真要说问题，就是它太稳了，稳到没有故事可讲。',
      '没什么坑，放心吃；真出事，算系统的。',
    ]);
  }

  // Punchline
  const drinkAlt = alternatives.find((a) => a.main.mealRole === 'drink');
  const shouldTreatDrinkAsAddOn = drinkAlt && food.mealRole !== 'drink' && !hasDrinkMood(allMoods);

  const punchlines = [
    '你现在不是没主见，你只是饿了。',
    '本次决定由系统背锅，你只负责张嘴。',
    '别折腾了，今天适合吃稳定选项。',
    '系统判定：今天不适合探索新店。',
    `你不是非要吃${food.name}，你只是想让生活少出一道选择题。`,
    '选择困难的尽头，是让别人替你选。这次别人就位了。',
    '吃就完事了，纠结的时间够你吃两口。',
    `${food.name}已经签字画押，剩下的交给你的嘴。`,
  ];

  const { verdict, verdictTone } = getVerdict(picked.score, food, allMoods);

  const punchline = plan.drink && moods.includes('milkTea')
    ? pick([
        `${plan.drink.name}不能假装自己是一顿饭，但它确实是个好搭子。`,
        `系统承认${plan.drink.name}很诱人，但你的胃表示需要主食——于是两个都给你安排了。`,
      ])
    : shouldTreatDrinkAsAddOn
      ? pick([
          `${drinkAlt!.main.name}可以喝，但它不能假装自己是一顿饭。`,
          `系统承认${drinkAlt!.main.name}很诱人，但你的胃表示需要主食。`,
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
    alternatives: alternatives.map((a) => a.main.name),
  };
};
