// Stable mood/tag ids. 显示文案只在 UI 层查表,存储和推荐逻辑一律用 id。
// 改这里的 label 不会破坏任何已存数据。

export type MoodId =
  | 'lazy'
  | 'saveMoney'
  | 'reward'
  | 'starving'
  | 'noIdea'
  | 'noSpicy'
  | 'hotFood'
  | 'noQueue'
  | 'noRisk'
  | 'afterExam'
  | 'wantDrink'
  | 'milkTea'
  | 'eatLight'
  | 'coupleFriendly';

export const moodLabels: Record<MoodId, string> = {
  lazy: '懒得出门',
  saveMoney: '想省钱',
  reward: '想奖励自己',
  starving: '饿疯了',
  noIdea: '不知道想吃啥',
  noSpicy: '不想吃辣',
  hotFood: '想吃热的',
  noQueue: '不想排队',
  noRisk: '不想踩雷',
  afterExam: '刚考完',
  wantDrink: '想喝点东西',
  milkTea: '想喝奶茶',
  eatLight: '不想吃太饱',
  coupleFriendly: '适合两个人',
};

/** 可在「决定」页选择的状态(coupleFriendly 是菜品专属标签,不在状态选择里)。 */
export const selectableMoodIds: MoodId[] = [
  'lazy',
  'saveMoney',
  'reward',
  'starving',
  'noIdea',
  'noSpicy',
  'hotFood',
  'noQueue',
  'noRisk',
  'afterExam',
  'wantDrink',
  'milkTea',
  'eatLight',
];

/** 首屏高频状态,其余折叠进「更多状态」。 */
export const primaryMoodIds: MoodId[] = [
  'lazy',
  'saveMoney',
  'reward',
  'starving',
  'noIdea',
  'noSpicy',
  'afterExam',
];

/** 菜品可打的标签 = 全部状态 + 适合两个人。 */
export const foodTagIds: MoodId[] = [...selectableMoodIds, 'coupleFriendly'];

// ---- 旧数据迁移:历史版本把中文文案直接存进了 localStorage ----

const legacyLabelToId = new Map<string, MoodId>([
  ...(Object.entries(moodLabels) as [MoodId, string][]).map(
    ([id, label]) => [label, id] as [string, MoodId]
  ),
  // 更早版本的别名
  ['和女友一起', 'coupleFriendly'],
]);

const moodIdSet = new Set<string>(Object.keys(moodLabels));

export const isMoodId = (value: string): value is MoodId => moodIdSet.has(value);

/** 把存储里的值统一成 id;认不出来的原样保留(用户自定义内容不丢)。 */
export const toMoodId = (value: string): string => legacyLabelToId.get(value) ?? value;

export const toMoodIds = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean).map(toMoodId)));

/** 任意存储值 → 显示文案。兼容 id、旧中文文案与未知自定义值。 */
export const moodLabel = (value: string): string =>
  isMoodId(value) ? moodLabels[value] : moodLabels[toMoodId(value) as MoodId] ?? value;
