import { FormEvent, useMemo, useState } from 'react';
import { Save, X } from 'lucide-react';
import { Distance, FoodItem, FoodType, MealRole, PriceRange, Satiety, Stability } from '../types';
import {
  displayMoodLabel,
  foodDistanceLabels,
  mealRoleLabels,
  moodOptions,
  priceLabels,
  satietyLabels,
  stabilityLabels,
  typeLabels,
} from '../lib/options';
import { makeId } from '../lib/storage';

interface FoodFormProps {
  initial?: FoodItem;
  onCancel: () => void;
  onSave: (food: FoodItem) => void;
}

const priceOptions: PriceRange[] = ['under10', 'under20', 'under50', 'any'];
const distanceOptions: Distance[] = ['near', 'medium', 'far', 'delivery'];
const typeOptions: FoodType[] = ['meal', 'snack', 'drink', 'happy', 'date'];
const mealRoleOptions: MealRole[] = ['main', 'lightMeal', 'addon', 'drink'];
const satietyOptions: Satiety[] = [1, 2, 3, 4, 5];
const stabilityOptions: Stability[] = ['high', 'medium', 'low'];
const foodTagOptions = [...moodOptions, '适合两个人'];
const normalizeTags = (values: string[]) => Array.from(new Set(values.map(displayMoodLabel)));

export function FoodForm({ initial, onCancel, onSave }: FoodFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [priceRange, setPriceRange] = useState<PriceRange>(initial?.priceRange ?? 'under20');
  const [distance, setDistance] = useState<Distance>(initial?.distance ?? 'near');
  const [type, setType] = useState<FoodType>(initial?.type ?? 'meal');
  const [estimatedPrice, setEstimatedPrice] = useState(initial?.estimatedPrice ?? 16);
  const [satiety, setSatiety] = useState<Satiety>(initial?.satiety ?? 4);
  const [mealRole, setMealRole] = useState<MealRole>(initial?.mealRole ?? 'main');
  const [tags, setTags] = useState<string[]>(() => normalizeTags(initial?.tags ?? []));
  const [spicy, setSpicy] = useState(initial?.spicy ?? false);
  const [stability, setStability] = useState<Stability>(initial?.stability ?? 'medium');

  const title = useMemo(() => (initial ? '编辑菜品' : '新增菜品'), [initial]);

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter((item) => item !== tag));
      return;
    }
    setTags([...tags, tag]);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const time = Date.now();
    onSave({
      id: initial?.id ?? makeId('food'),
      name: trimmed,
      priceRange,
      distance,
      type,
      estimatedPrice: Math.max(1, Math.round(estimatedPrice || 1)),
      satiety,
      mealRole,
      tags,
      spicy,
      stability,
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
        <span>价格区间</span>
        <select value={priceRange} onChange={(event) => setPriceRange(event.target.value as PriceRange)}>
          {priceOptions.map((item) => (
            <option key={item} value={item}>
              {priceLabels[item]}
            </option>
          ))}
        </select>
      </label>

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
        <select value={type} onChange={(event) => setType(event.target.value as FoodType)}>
          {typeOptions.map((item) => (
            <option key={item} value={item}>
              {typeLabels[item]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>预估价格</span>
        <input
          type="number"
          min="1"
          step="1"
          value={estimatedPrice}
          onChange={(event) => setEstimatedPrice(Number(event.target.value))}
          placeholder="例如：18"
        />
      </label>

      <label className="field">
        <span>饱腹度</span>
        <select value={satiety} onChange={(event) => setSatiety(Number(event.target.value) as Satiety)}>
          {satietyOptions.map((item) => (
            <option key={item} value={item}>
              {satietyLabels[item]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>定位</span>
        <select value={mealRole} onChange={(event) => setMealRole(event.target.value as MealRole)}>
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
              {tag}
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
