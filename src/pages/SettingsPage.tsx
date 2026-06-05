import { ChangeEvent, useMemo, useState } from 'react';
import { ChevronDown, Copy, Download, Moon, RotateCcw, Trash2, Upload } from 'lucide-react';
import { resetFoods, ThemeMode } from '../lib/storage';
import { DecisionHistory, FoodItem } from '../types';

interface SettingsPageProps {
  foods: FoodItem[];
  theme: ThemeMode;
  onChangeTheme: (theme: ThemeMode) => void;
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

export function SettingsPage({ foods, theme, onChangeTheme, onSaveFoods, onSaveHistory }: SettingsPageProps) {
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const exportJson = useMemo(() => JSON.stringify(foods, null, 2), [foods]);

  const notify = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(exportJson);
    notify('已复制菜品库 JSON。');
  };

  const downloadJson = () => {
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mealmood-foods.json';
    link.click();
    URL.revokeObjectURL(url);
    notify('已开始下载菜品库。');
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText);
      if (!isFoodArray(parsed)) {
        notify('导入失败：这份 JSON 不是菜品数组，检查一下格式。', true);
        return;
      }
      onSaveFoods(parsed);
      setImportText('');
      notify(`导入成功，菜品库已更新为 ${parsed.length} 道。`);
    } catch {
      notify('导入失败：JSON 解析不了，可能少了括号或多了逗号。', true);
    }
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => setImportText(text));
  };

  const handleResetFoods = () => {
    if (!window.confirm('重置默认菜品库？现有菜品会被默认列表覆盖，且无法撤销。')) return;
    const defaults = resetFoods();
    onSaveFoods(defaults);
    notify('菜品库已重置为默认。');
  };

  const handleClearHistory = () => {
    if (!window.confirm('清空历史记录？你的胃部档案会被全部抹掉，且无法撤销。')) return;
    onSaveHistory([]);
    notify('历史记录已清空，胃部档案归零。');
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">设置</p>
          <h1>把后台收拾干净</h1>
        </div>
        <span className="version-pill">v0.1.1</span>
      </header>

      <section className="settings-section">
        <div className="section-title-row">
          <h2>数据管理</h2>
        </div>
        <button type="button" className="settings-button danger" onClick={handleClearHistory}>
          <Trash2 size={18} />
          清空历史记录
        </button>
        <button type="button" className="settings-button" onClick={handleResetFoods}>
          <RotateCcw size={18} />
          重置默认菜品库
        </button>
      </section>

      <section className="settings-section">
        <div className="section-title-row">
          <h2>导出菜品库</h2>
          <span className="hint">{foods.length} 道</span>
        </div>
        <div className="settings-actions">
          <button type="button" onClick={copyJson}>
            <Copy size={17} />
            复制
          </button>
          <button type="button" onClick={downloadJson}>
            <Download size={17} />
            下载
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="section-title-row">
          <h2>导入菜品库</h2>
          <label className="file-pick">
            <Upload size={16} />
            选择文件
            <input type="file" accept="application/json,.json" onChange={handleImportFile} />
          </label>
        </div>
        <textarea
          className="json-box"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={6}
          placeholder="粘贴菜品库 JSON，或上方选择文件"
        />
        <button type="button" className="primary-button" onClick={importJson} disabled={!importText.trim()}>
          <Upload size={19} />
          导入
        </button>
      </section>

      <section className="settings-section">
        <div className="theme-toggle-row">
          <div className="theme-copy">
            <b>夜宵模式</b>
            <small>深色暖调，适合深夜放毒不刺眼</small>
          </div>
          <button
            type="button"
            className={`bare-switch ${theme === 'night' ? 'is-on' : ''}`}
            role="switch"
            aria-checked={theme === 'night'}
            aria-label="夜宵模式"
            onClick={() => onChangeTheme(theme === 'night' ? 'day' : 'night')}
          >
            <Moon size={15} aria-hidden="true" />
            <span className="switch-track" aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="settings-section">
        <button
          type="button"
          className={`advanced-toggle ${showAdvanced ? 'is-open' : ''}`}
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((value) => !value)}
        >
          高级选项
          <ChevronDown size={18} />
        </button>
        {showAdvanced && (
          <div className="field">
            <span>菜品库 JSON 预览（只读）</span>
            <textarea className="json-box" readOnly value={exportJson} rows={8} />
          </div>
        )}
      </section>

      {message && <div className={`toast-line ${isError ? 'is-error' : ''}`}>{message}</div>}
    </div>
  );
}
