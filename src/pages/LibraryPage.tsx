import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { FoodForm } from '../components/FoodForm';
import { FoodList } from '../components/FoodList';
import { FoodItem } from '../types';

interface LibraryPageProps {
  foods: FoodItem[];
  onSaveFoods: (foods: FoodItem[]) => void;
}

type FilterKey = 'all' | 'meal' | 'drink' | 'near' | 'cheap' | 'stable';

const filters: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'meal', label: '正餐' },
  { key: 'drink', label: '饮料' },
  { key: 'near', label: '近' },
  { key: 'cheap', label: '便宜' },
  { key: 'stable', label: '稳定' },
];

const matchFilter = (food: FoodItem, filter: FilterKey) => {
  switch (filter) {
    case 'meal':
      return food.mealRole === 'main' || food.mealRole === 'lightMeal';
    case 'drink':
      return food.mealRole === 'drink';
    case 'near':
      return food.distance === 'near';
    case 'cheap':
      return food.estimatedPrice <= 20;
    case 'stable':
      return food.stability === 'high';
    default:
      return true;
  }
};

export function LibraryPage({ foods, onSaveFoods }: LibraryPageProps) {
  const [editingFood, setEditingFood] = useState<FoodItem | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const visibleFoods = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...foods]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((food) => matchFilter(food, filter))
      .filter((food) => {
        if (!q) return true;
        return (
          food.name.toLowerCase().includes(q) ||
          food.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      });
  }, [foods, filter, query]);

  const saveFood = (food: FoodItem) => {
    const exists = foods.some((item) => item.id === food.id);
    const next = exists ? foods.map((item) => (item.id === food.id ? food : item)) : [food, ...foods];
    onSaveFoods(next);
    setEditingFood(undefined);
    setShowForm(false);
  };

  const deleteFood = (foodId: string) => {
    const food = foods.find((item) => item.id === foodId);
    if (!food) return;
    if (!window.confirm(`删除「${food.name}」？这条记录会从菜品库里消失。`)) return;
    onSaveFoods(foods.filter((item) => item.id !== foodId));
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">菜品库</p>
          <h1>你的吃饭候选池</h1>
        </div>
        <button
          type="button"
          className="icon-text-button"
          onClick={() => {
            setEditingFood(undefined);
            setShowForm(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Plus size={19} />
          新增
        </button>
      </header>

      {(showForm || editingFood) && (
        <FoodForm
          initial={editingFood}
          onCancel={() => {
            setEditingFood(undefined);
            setShowForm(false);
          }}
          onSave={saveFood}
        />
      )}

      <div className="search-row">
        <Search size={17} />
        <input
          className="search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜菜名或标签，比如「奶茶」「想省钱」"
          aria-label="搜索菜品"
        />
      </div>

      <div className="filter-row" role="group" aria-label="筛选">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`chip chip--small ${filter === item.key ? 'is-selected' : ''}`}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="library-count">共 {visibleFoods.length} 道{filter !== 'all' || query ? '（已筛选）' : ''}</p>

      {visibleFoods.length ? (
        <FoodList
          foods={visibleFoods}
          onEdit={(food) => {
            setEditingFood(food);
            setShowForm(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onDelete={deleteFood}
        />
      ) : (
        <div className="empty-state">
          <span className="empty-emoji">🔍</span>
          没找到匹配的菜。换个关键词，或者点右上角「新增」加一道。
        </div>
      )}
    </div>
  );
}
