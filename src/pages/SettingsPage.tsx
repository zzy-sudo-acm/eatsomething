import { ChangeEvent, useMemo, useState } from 'react';
import { ChevronDown, Copy, Download, Moon, RotateCcw, Trash2, Upload, Wrench } from 'lucide-react';
import { normalizeFoodsForImport, resetFoods, ThemeMode } from '../lib/storage';
import { DecisionHistory, FoodItem } from '../types';
import { runRecommendationScenarios, type RecommendationScenarioReport } from '../lib/recommendationScenarios';
import { APP_VERSION } from '../lib/version';

interface SettingsPageProps {
  foods: FoodItem[];
  theme: ThemeMode;
  devMode: boolean;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeDevMode: (devMode: boolean) => void;
  onSaveFoods: (foods: FoodItem[]) => void;
  onSaveHistory: (history: DecisionHistory[]) => void;
}

export function SettingsPage({
  foods,
  theme,
  devMode,
  onChangeTheme,
  onChangeDevMode,
  onSaveFoods,
  onSaveHistory,
}: SettingsPageProps) {
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRecommendationCheck, setShowRecommendationCheck] = useState(false);
  const [scenarioReport, setScenarioReport] = useState<RecommendationScenarioReport | null>(null);

  const exportJson = useMemo(() => JSON.stringify(foods, null, 2), [foods]);

  const notify = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  const copyJson = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(exportJson);
      notify('已复制菜品库 JSON。');
    } catch {
      notify('复制失败，浏览器好像没把胃部档案交出来。', true);
    }
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      notify('导入失败：JSON 解析不了，可能少了括号或多了逗号。', true);
      return;
    }

    try {
      const normalized = normalizeFoodsForImport(parsed);
      onSaveFoods(normalized);
      setImportText('');
      notify(`导入成功，菜品库已更新为 ${normalized.length} 道。`);
    } catch {
      notify('导入失败：需要导入 MealMood 导出的菜品库 JSON。', true);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setImportText(text);
    } catch {
      notify('读取文件失败，这份胃部档案可能打不开。', true);
    }
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

  const handleRunRecommendationCheck = () => {
    const report = runRecommendationScenarios(foods);
    setScenarioReport(report);
    notify(`推荐自检完成：${report.passed}/${report.total} 通过。`, report.passed !== report.total);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">设置</p>
          <h1>把后台收拾干净</h1>
        </div>
        <span className="version-pill">v{APP_VERSION}</span>
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
        <div className="theme-toggle-row">
          <div className="theme-copy">
            <b>开发者模式</b>
            <small>显示推荐依据和推荐自检，给折腾型选手用</small>
          </div>
          <button
            type="button"
            className={`bare-switch ${devMode ? 'is-on' : ''}`}
            role="switch"
            aria-checked={devMode}
            aria-label="开发者模式"
            onClick={() => onChangeDevMode(!devMode)}
          >
            <Wrench size={15} aria-hidden="true" />
            <span className="switch-track" aria-hidden="true" />
          </button>
        </div>
      </section>

      {devMode && (
        <section className="settings-section">
          <button
            type="button"
            className={`advanced-toggle ${showRecommendationCheck ? 'is-open' : ''}`}
            aria-expanded={showRecommendationCheck}
            onClick={() => setShowRecommendationCheck((value) => !value)}
          >
            推荐自检
            <ChevronDown size={18} />
          </button>
          {showRecommendationCheck && (
            <div className="scenario-check">
              <button type="button" className="settings-button" onClick={handleRunRecommendationCheck}>
                运行推荐自检
              </button>
              {scenarioReport && (
                <div className="scenario-report">
                  <div className="scenario-summary">
                    {scenarioReport.passed}/{scenarioReport.total} 通过
                  </div>
                  {scenarioReport.results.map((result) => (
                    <div className="scenario-row" key={result.id}>
                      <b className={result.passed ? 'scenario-pass' : 'scenario-fail'}>
                        {result.passed ? '通过' : '失败'}
                      </b>
                      <div>
                        <strong>{result.name}</strong>
                        <p>{result.details}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

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
