import { FormEvent, useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';
import { Distance, FoodItem, FoodType, MealRole, OccasionLevel, PriceRange, Satiety, Stability } from '../types';
import {
  displayMoodLabel,
  foodDistanceLabels,
  inferPriceRangeFromEstimatedPrice,
  mealRoleLabels,
  moodOptions,
  satietyLabels,
  stabilityLabels,
  typeLabels,
} from '../lib/options';
import { makeId } from '../lib/storage';
import { toMoodIds } from '../lib/moods';

interface FoodFormProps {
  initial?: FoodItem;
  onCancel: () => void;
  onSave: (food: FoodItem) => void;
}

const distanceOptions: Distance[] = ['near', 'medium', 'far', 'delivery'];
const typeOptions: FoodType[] = ['meal', 'snack', 'drink', 'happy', 'date'];
const mealRoleOptions: MealRole[] = ['main', 'lightMeal', 'addon', 'drink'];
const satietyOptions: Satiety[] = [1, 2, 3, 4, 5];
const stabilityOptions: Stability[] = ['high', 'medium', 'low'];
const occasionLevelOptions: OccasionLevel[] = [1, 2, 3, 4, 5];
const occasionLevelLabels: Record<OccasionLevel, string> = {
  1: '1 快速解决',
  2: '2 普通正餐',
  3: '3 像样一顿',
  4: '4 吃好一点',
  5: '5 正式聚餐',
};
const foodTagOptions = [...moodOptions, 'coupleFriendly'];
const normalizeTags = (values: string[]) => toMoodIds(values);
const autoPriceLabels: Record<PriceRange, string> = {
  under10: '10元内',
  under20: '20元内',
  under50: '50元内',
  any: '50元以上',
};

const inferFoodDefaultsByType = (
  type: FoodType
): { estimatedPrice: number; satiety: Satiety; mealRole: MealRole } => {
  if (type === 'drink') return { estimatedPrice: 15, satiety: 1, mealRole: 'drink' };
  if (type === 'snack') return { estimatedPrice: 15, satiety: 2, mealRole: 'lightMeal' };
  if (type === 'happy' || type === 'date') return { estimatedPrice: 30, satiety: 4, mealRole: 'main' };
  return { estimatedPrice: 16, satiety: 4, mealRole: 'main' };
};

export function FoodForm({ initial, onCancel, onSave }: FoodFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [distance, setDistance] = useState<Distance>(initial?.distance ?? 'near');
  const [type, setType] = useState<FoodType>(initial?.type ?? 'meal');
  const [estimatedPrice, setEstimatedPrice] = useState(initial?.estimatedPrice ?? 16);
  const [satiety, setSatiety] = useState<Satiety>(initial?.satiety ?? 4);
  const [mealRole, setMealRole] = useState<MealRole>(initial?.mealRole ?? 'main');
  const [tags, setTags] = useState<string[]>(() => normalizeTags(initial?.tags ?? []));
  const [spicy, setSpicy] = useState(initial?.spicy ?? false);
  const [stability, setStability] = useState<Stability>(initial?.stability ?? 'medium');
  const [occasionLevel, setOccasionLevel] = useState<OccasionLevel>(initial?.occasionLevel ?? 2);
  const [priceTouched, setPriceTouched] = useState(false);
  const [satietyTouched, setSatietyTouched] = useState(false);
  const [mealRoleTouched, setMealRoleTouched] = useState(false);

  const title = useMemo(() => (initial ? '编辑菜品' : '新增菜品'), [initial]);
  const inferredPriceRange = useMemo(
    () => inferPriceRangeFromEstimatedPrice(Math.max(1, Math.round(estimatedPrice || 1))),
    [estimatedPrice]
  );

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter((item) => item !== tag));
      return;
    }
    setTags([...tags, tag]);
  };

  const handleTypeChange = (nextType: FoodType) => {
    setType(nextType);
    const defaults = inferFoodDefaultsByType(nextType);

    if (!priceTouched) {
      setEstimatedPrice(defaults.estimatedPrice);
    }

    if (!satietyTouched) {
      setSatiety(defaults.satiety);
    }

    if (!mealRoleTouched) {
      setMealRole(defaults.mealRole);
    }
  };

  const handleEstimatedPriceChange = (value: number) => {
    setPriceTouched(true);
    setEstimatedPrice(value);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const time = Date.now();
    const normalizedPrice = Math.max(1, Math.round(estimatedPrice || 1));
    onSave({
      id: initial?.id ?? makeId('food'),
      name: trimmed,
      priceRange: inferPriceRangeFromEstimatedPrice(normalizedPrice),
      distance,
      type,
      estimatedPrice: normalizedPrice,
      satiety,
      mealRole,
      tags,
      spicy,
      stability,
      occasionLevel,
      createdAt: initial?.createdAt ?? time,
      updatedAt: time,
    });
  };

  return (
    <form className="food-form" onSubmit={handleSubmit}>
      <div className="section-title-row">
        <h2>{title}</h2>
        <button type="button" className="icon-button" onClick={onCancel} aria-label="关闭" title="关闭">
          <X size={19} />
        </button>
      </div>

      <label className="field">
        <span>名称</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：牛肉粉" />
      </label>

      <label className="field">
        <span>预估价格</span>
        <input
          type="number"
          min="1"
          step="1"
          value={estimatedPrice}
          onChange={(event) => handleEstimatedPriceChange(Number(event.target.value))}
          placeholder="例如：18"
        />
      </label>

      <div className="field auto-price-field">
        <span>价格档位</span>
        <div className="auto-price-badge" aria-live="polite">自动归类：{autoPriceLabels[inferredPriceRange]}</div>
        <small className="field-hint">根据预估价格实时计算，用来匹配预算筛选。</small>
      </div>

      <label className="field">
        <span>距离</span>
        <select value={distance} onChange={(event) => setDistance(event.target.value as Distance)}>
          {distanceOptions.map((item) => (
            <option key={item} value={item}>
              {foodDistanceLabels[item]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>类型</span>
        <select value={type} onChange={(event) => handleTypeChange(event.target.value as FoodType)}>
          {typeOptions.map((item) => (
            <option key={item} value={item}>
              {typeLabels[item]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>饱腹度</span>
        <select
          value={satiety}
          onChange={(event) => {
            setSatietyTouched(true);
            setSatiety(Number(event.target.value) as Satiety);
          }}
        >
          {satietyOptions.map((item) => (
            <option key={item} value={item}>
              {satietyLabels[item]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>定位</span>
        <select
          value={mealRole}
          onChange={(event) => {
            setMealRoleTouched(true);
            setMealRole(event.target.value as MealRole);
          }}
        >
          {mealRoleOptions.map((item) => (
            <option key={item} value={item}>
              {mealRoleLabels[item]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>稳定性</span>
        <select value={stability} onChange={(event) => setStability(event.target.value as Stability)}>
          {stabilityOptions.map((item) => (
            <option key={item} value={item}>
              {stabilityLabels[item]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>正式程度</span>
        <select value={occasionLevel} onChange={(event) => setOccasionLevel(Number(event.target.value) as OccasionLevel)}>
          {occasionLevelOptions.map((item) => (
            <option key={item} value={item}>
              {occasionLevelLabels[item]}
            </option>
          ))}
        </select>
      </label>

      <label className="toggle-row">
        <span>辣</span>
        <input type="checkbox" checked={spicy} onChange={(event) => setSpicy(event.target.checked)} />
      </label>

      <div className="form-tags">
        <span>标签</span>
        <div className="chip-grid">
          {foodTagOptions.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`chip chip--small ${tags.includes(tag) ? 'is-selected' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {displayMoodLabel(tag)}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" className="primary-button">
        <Save size={20} />
        保存
      </button>
    </form>
  );
}
