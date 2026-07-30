// 胃部判决报告:基于本地历史的月度/周度统计。
// 数据不复杂,重点是嘴臭得有分寸。

import { DecisionHistory, FoodItem, PriceRange } from '../types';
import { moodLabel } from './moods';

export type ReportPeriod = 'week' | 'month';

export interface ReportEntry {
  name: string;
  count: number;
}

export interface StomachReport {
  periodLabel: string;
  mealCount: number;
  skippedCount: number;
  uniqueCount: number;
  estimatedSpend: number;
  exploreRate: number;
  regretRate: number;
  mostEaten?: ReportEntry;
  repurchaseKing?: ReportEntry;
  regretKing?: ReportEntry;
  topMood?: ReportEntry;
  budgetPersona: { title: string; line: string };
  trendLine: string;
  verdict: string;
  verdictTone: 'good' | 'ok' | 'risky';
  roast: string;
}

const dayMs = 24 * 60 * 60 * 1000;

const topOf = (counter: Map<string, number>): ReportEntry | undefined => {
  const sorted = [...counter.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return undefined;
  return { name: sorted[0][0], count: sorted[0][1] };
};

const count = <T>(items: T[], key: (item: T) => string | undefined) => {
  const counter = new Map<string, number>();
  items.forEach((item) => {
    const k = key(item);
    if (!k) return;
    counter.set(k, (counter.get(k) ?? 0) + 1);
  });
  return counter;
};

const budgetPersonas: Record<PriceRange, { title: string; line: string }> = {
  under10: { title: '十元战士', line: '把每一顿都过成了极限运动，钱包很欣慰。' },
  under20: { title: '二十元正规军', line: '不抠不飘，胃部中产，吃得最有性价比。' },
  under50: { title: '伙食股东', line: '对自己下手挺大方，这个月给胃发了年终奖。' },
  any: { title: '预算自由人', line: '价格栏常年填「无所谓」，胃说了算，钱包只能旁听。' },
};

const buildBudgetPersona = (eaten: DecisionHistory[], avgSpend: number) => {
  const counter = count(eaten, (item) => item.budget);
  const top = topOf(counter);
  const persona = budgetPersonas[(top?.name as PriceRange) ?? 'under20'] ?? budgetPersonas.under20;

  // 嘴硬检测:预算常选省钱档,实际人均却不低。
  if ((top?.name === 'under10' || top?.name === 'under20') && avgSpend > 22) {
    return { title: persona.title, line: '嘴上说省钱，身体很诚实——实际人均早就破防了。' };
  }
  return persona;
};

const buildTrendLine = (eaten: DecisionHistory[], now: number) => {
  const last7 = eaten.filter((item) => now - item.createdAt <= 7 * dayMs).length;
  const prev7 = eaten.filter(
    (item) => now - item.createdAt > 7 * dayMs && now - item.createdAt <= 14 * dayMs
  ).length;
  if (last7 > prev7 + 1) return `本周吃饭热情上涨（${prev7} → ${last7} 顿），胃部 KPI 超额完成。`;
  if (last7 + 1 < prev7) return `最近吃得少了（${prev7} → ${last7} 顿），是忙还是穷，系统没好意思问。`;
  return `吃饭节奏稳定（每周约 ${Math.max(last7, prev7)} 顿），像个上了发条的干饭人。`;
};

const buildRoast = (report: Omit<StomachReport, 'roast' | 'verdict' | 'verdictTone'>, eaten: DecisionHistory[]) => {
  const milkTeaCount = eaten.filter(
    (item) =>
      item.foodName.includes('奶茶') ||
      [...item.selectedMoods, ...(item.partnerMoods ?? [])].includes('milkTea')
  ).length;

  if (report.mealCount >= 4 && report.regretRate > 0.34) {
    return '后悔率有点超标。建议下次打分之前先问问自己：是菜的问题，还是你点的时候就心存侥幸？';
  }
  if (milkTeaCount >= 3 && milkTeaCount >= report.mealCount * 0.3) {
    return `本期奶茶含量 ${milkTeaCount} 次。系统不评判，但你的胃托我转告：它想吃点固体。`;
  }
  if (report.mostEaten && report.mealCount >= 5 && report.exploreRate < 0.4) {
    return `你和${report.mostEaten.name}的关系已经稳定到可以见家长了。专一是美德，但菜单不是婚姻。`;
  }
  if (report.skippedCount >= report.mealCount && report.skippedCount >= 4) {
    return `跳过 ${report.skippedCount} 次，吃掉 ${report.mealCount} 顿——你不是选择困难，你是把系统当老虎机玩。`;
  }
  if (report.repurchaseKing && report.repurchaseKing.count >= 2) {
    return `${report.repurchaseKing.name}被你夸了 ${report.repurchaseKing.count} 次，建议直接处成长期饭票。`;
  }
  return '总体表现正常，正常到系统都没什么好吐槽的。下期请加点戏。';
};

export const buildStomachReport = (
  history: DecisionHistory[],
  foods: FoodItem[],
  period: ReportPeriod = 'month',
  now = Date.now()
): StomachReport => {
  const days = period === 'week' ? 7 : 30;
  const inPeriod = history.filter((item) => now - item.createdAt <= days * dayMs);
  const eaten = inPeriod.filter((item) => item.feedback !== 'skipped');
  const skippedCount = inPeriod.length - eaten.length;

  const foodById = new Map(foods.map((food) => [food.id, food]));
  const knownPrices = foods.map((food) => food.estimatedPrice);
  const fallbackPrice = knownPrices.length
    ? Math.round(knownPrices.reduce((sum, value) => sum + value, 0) / knownPrices.length)
    : 15;
  const estimatedSpend = eaten.reduce((sum, item) => {
    // Prefer stored totalPrice from meal-plan snapshot; fall back to main food price
    if (typeof item.totalPrice === 'number' && item.totalPrice > 0) return sum + item.totalPrice;
    return sum + (foodById.get(item.foodId)?.estimatedPrice ?? fallbackPrice);
  }, 0);

  const nameCounter = count(eaten, (item) => item.foodName);
  const uniqueCount = nameCounter.size;
  const rated = eaten.filter((item) => item.feedback === 'worth' || item.feedback === 'normal' || item.feedback === 'regret');
  const regrets = eaten.filter((item) => item.feedback === 'regret');
  const regretRate = rated.length ? regrets.length / rated.length : 0;

  const moodCounter = count(
    eaten.flatMap((item) => [...item.selectedMoods, ...(item.partnerMoods ?? [])]),
    (mood) => mood
  );
  const topMoodRaw = topOf(moodCounter);

  const avgSpend = eaten.length ? estimatedSpend / eaten.length : 0;
  const exploreRate = eaten.length ? uniqueCount / eaten.length : 0;

  const base = {
    periodLabel: period === 'week' ? '近 7 天' : '近 30 天',
    mealCount: eaten.length,
    skippedCount,
    uniqueCount,
    estimatedSpend,
    exploreRate,
    regretRate,
    mostEaten: topOf(nameCounter),
    repurchaseKing: topOf(count(eaten.filter((item) => item.feedback === 'worth'), (item) => item.foodName)),
    regretKing: topOf(count(regrets, (item) => item.foodName)),
    topMood: topMoodRaw ? { name: moodLabel(topMoodRaw.name), count: topMoodRaw.count } : undefined,
    budgetPersona: buildBudgetPersona(eaten, avgSpend),
    trendLine: buildTrendLine(eaten, now),
  };

  let verdict = '正常营业';
  let verdictTone: StomachReport['verdictTone'] = 'ok';
  if (!eaten.length) {
    verdict = '查无此胃';
    verdictTone = 'risky';
  } else if (eaten.length >= 8 && regretRate <= 0.15) {
    verdict = '胃部运营良好';
    verdictTone = 'good';
  } else if (regretRate > 0.34) {
    verdict = '后悔率超标';
    verdictTone = 'risky';
  }

  return { ...base, verdict, verdictTone, roast: buildRoast(base, eaten) };
};
