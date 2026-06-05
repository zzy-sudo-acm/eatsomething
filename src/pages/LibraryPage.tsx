import { useState } from 'react';
import { Plus } from 'lucide-react';
import { FoodForm } from '../components/FoodForm';
import { FoodList } from '../components/FoodList';
import { FoodItem } from '../types';

interface LibraryPageProps {
  foods: FoodItem[];
  onSaveFoods: (foods: FoodItem[]) => void;
}

export function LibraryPage({ foods, onSaveFoods }: LibraryPageProps) {
  const [editingFood, setEditingFood] = useState<FoodItem | undefined>();
  const [showForm, setShowForm] = useState(false);

  const sortedFoods = [...foods].sort((a, b) => b.updatedAt - a.updatedAt);

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
    if (!window.confirm(`删除「${food.name}」？`)) return;
    onSaveFoods(foods.filter((item) => item.id !== foodId));
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Library</p>
          <h1>菜品库</h1>
        </div>
        <button
          type="button"
          className="icon-text-button"
          onClick={() => {
            setEditingFood(undefined);
            setShowForm(true);
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

      <FoodList
        foods={sortedFoods}
        onEdit={(food) => {
          setEditingFood(food);
          setShowForm(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onDelete={deleteFood}
      />
    </div>
  );
}
