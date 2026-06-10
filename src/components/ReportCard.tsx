import { useMemo, useState } from 'react';
import {
  Brain,
  Camera,
  CircleDollarSign,
  Compass,
  MessageCircle,
  Repeat2,
  Siren,
  TrendingUp,
  Trophy,
  Utensils,
} from 'lucide-react';
import { buildStomachReport, ReportPeriod } from '../lib/report';
import { APP_VERSION } from '../lib/version';
import { DecisionHistory, FoodItem } from '../types';

interface ReportCardProps {
  history: DecisionHistory[];
  foods: FoodItem[];
}

const periods: { key: ReportPeriod; label: string }[] = [
  { key: 'week', label: '近 7 天' },
  { key: 'month', label: '近 30 天' },
];

export function ReportCard({ history, foods }: ReportCardProps) {
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const report = useMemo(() => buildStomachReport(history, foods, period), [history, foods, period]);

  return (
    <>
      <div className="filter-row" role="group" aria-label="报告周期">
        {periods.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`chip chip--small ${period === item.key ? 'is-selected' : ''}`}
            aria-pressed={period === item.key}
            onClick={() => setPeriod(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {report.mealCount === 0 ? (
        <div className="empty-state">
          <span className="empty-emoji">🫥</span>
          <b>{report.periodLabel}查无此胃。</b>
          <br />
          没有任何进食记录，系统想吐槽都无从下口。先去吃几顿再回来领判决。
        </div>
      ) : (
        <article className="report-card" aria-label="胃部判决报告">
          <div className="decision-card__topline">
            <span>胃部判决报告 · {report.periodLabel}</span>
            <span className={`verdict-pill tone-${report.verdictTone}`}>{report.verdict}</span>
          </div>

          <div className="report-bignum-row">
            <div className="report-bignum">
              <b>{report.mealCount}</b>
              <span>顿饭</span>
            </div>
            <div className="report-bignum">
              <b>{report.uniqueCount}</b>
              <span>种吃法</span>
            </div>
            <div className="report-bignum">
              <b>¥{report.estimatedSpend}</b>
              <span>估算花费</span>
            </div>
            <div className="report-bignum">
              <b>{report.skippedCount}</b>
              <span>次「换一个」</span>
            </div>
          </div>

          <div className="report-rows">
            <div className="report-row">
              <Utensils size={16} />
              <span>最常吃</span>
              <b>{report.mostEaten ? `${report.mostEaten.name} × ${report.mostEaten.count}` : '暂无'}</b>
            </div>
            <div className="report-row">
              <Trophy size={16} />
              <span>回购王</span>
              <b>{report.repurchaseKing ? `${report.repurchaseKing.name}（夸了 ${report.repurchaseKing.count} 次）` : '还没夸过谁'}</b>
            </div>
            <div className="report-row">
              <Siren size={16} />
              <span>后悔王</span>
              <b>{report.regretKing ? `${report.regretKing.name}（踩雷 ${report.regretKing.count} 次）` : '零案底，可喜可贺'}</b>
            </div>
            <div className="report-row">
              <Brain size={16} />
              <span>最常见饭前状态</span>
              <b>{report.topMood ? `${report.topMood.name} × ${report.topMood.count}` : '面无表情'}</b>
            </div>
            <div className="report-row">
              <CircleDollarSign size={16} />
              <span>预算人格</span>
              <b>{report.budgetPersona.title}</b>
            </div>
            <div className="report-row">
              <Compass size={16} />
              <span>探索率</span>
              <b>
                {Math.round(report.exploreRate * 100)}%
                {report.exploreRate < 0.4 ? '，胃在舒适区躺平' : '，胃部冒险家'}
              </b>
            </div>
          </div>

          <p className="report-persona-line">{report.budgetPersona.line}</p>

          <div className="report-trend">
            <TrendingUp size={16} />
            <span>{report.trendLine}</span>
          </div>

          <div className="punchline report-roast">
            <MessageCircle size={17} />
            <span>{report.roast}</span>
          </div>

          <div className="report-footer">
            <span className="report-stamp" aria-hidden="true">已审结</span>
            <span className="report-brand">MealMood · 今天吃点啥 · v{APP_VERSION}</span>
          </div>
        </article>
      )}

      {report.mealCount > 0 && (
        <p className="report-share-hint">
          <Camera size={14} />
          截个图发给饭搭子，让系统替你社交。
        </p>
      )}
    </>
  );
}
