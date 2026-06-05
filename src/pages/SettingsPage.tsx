import { ChangeEvent, useMemo, useState } from 'react';
import { Copy, Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { resetFoods } from '../lib/storage';
import { DecisionHistory, FoodItem } from '../types';

interface SettingsPageProps {
  foods: FoodItem[];
  onSaveFoods: (foods: FoodItem[]) => void;
  onSaveHistory: (history: DecisionHistory[]) => void;
}

const isFoodArray = (value: unknown): value is FoodItem[] => {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as FoodItem).id === 'string' &&
      typeof (item as FoodItem).name === 'string' &&
      Array.isArray((item as FoodItem).tags)
  );
};

export function SettingsPage({ foods, onSaveFoods, onSaveHistory }: SettingsPageProps) {
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');

  const exportJson = useMemo(() => JSON.stringify(foods, null, 2), [foods]);

  const copyJson = async () => {
    await navigator.clipboard.writeText(exportJson);
    setMessage('已复制菜品库 JSON。');
  };

  const downloadJson = () => {
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mealmood-foods.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText);
      if (!isFoodArray(parsed)) {
        setMessage('导入失败：JSON 不是菜品数组。');
        return;
      }
      onSaveFoods(parsed);
      setImportText('');
      setMessage('导入成功。');
    } catch {
      setMessage('导入失败：JSON 格式不对。');
    }
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => setImportText(text));
  };

  const handleResetFoods = () => {
    if (!window.confirm('重置默认菜品库？现有菜品会被覆盖。')) return;
    const defaults = resetFoods();
    onSaveFoods(defaults);
    setMessage('菜品库已重置。');
  };

  const handleClearHistory = () => {
    if (!window.confirm('清空历史记录？')) return;
    onSaveHistory([]);
    setMessage('历史记录已清空。');
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>设置</h1>
        </div>
        <span className="version-pill">v0.1</span>
      </header>

      <section className="settings-section">
        <button type="button" className="settings-button danger" onClick={handleClearHistory}>
          <Trash2 size={19} />
          清空历史记录
        </button>
        <button type="button" className="settings-button" onClick={handleResetFoods}>
          <RotateCcw size={19} />
          重置默认菜品库
        </button>
      </section>

      <section className="settings-section">
        <div className="section-title-row">
          <h2>导出菜品库 JSON</h2>
          <span>{foods.length} 项</span>
        </div>
        <div className="settings-actions">
          <button type="button" onClick={copyJson}>
            <Copy size={18} />
            复制
          </button>
          <button type="button" onClick={downloadJson}>
            <Download size={18} />
            下载
          </button>
        </div>
        <textarea className="json-box" readOnly value={exportJson} rows={8} />
      </section>

      <section className="settings-section">
        <div className="section-title-row">
          <h2>导入菜品库 JSON</h2>
          <label className="file-pick">
            <Upload size={17} />
            文件
            <input type="file" accept="application/json,.json" onChange={handleImportFile} />
          </label>
        </div>
        <textarea
          className="json-box"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={8}
          placeholder="粘贴 JSON"
        />
        <button type="button" className="primary-button" onClick={importJson}>
          <Upload size={20} />
          导入
        </button>
      </section>

      {message && <div className="toast-line">{message}</div>}
    </div>
  );
}
