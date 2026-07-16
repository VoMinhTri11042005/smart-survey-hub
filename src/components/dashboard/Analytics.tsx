import { Info, Sparkles, Timer, CheckCircle, TrendingUp, Download, ChevronDown, BarChart3, MessageSquare, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSurvey } from '../../context/SurveyContext';
import { computeSurveyAnalytics, exportResponsesToCsv } from '../../utils/analytics';
import type { Survey, SurveyResponse } from '../../types';

export function Analytics() {
  const { surveys, currentSurvey, setCurrentSurvey, fetchSurveys, fetchResponses } = useSurvey();
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(currentSurvey);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  useEffect(() => {
    if (!selectedSurvey && surveys.length > 0) {
      setSelectedSurvey(currentSurvey || surveys[0]);
    }
  }, [currentSurvey, selectedSurvey, surveys]);

  useEffect(() => {
    if (!selectedSurvey) return;
    setIsLoading(true);
    fetchResponses(selectedSurvey.id)
      .then(setResponses)
      .finally(() => setIsLoading(false));
  }, [selectedSurvey, fetchResponses]);

  const analytics = selectedSurvey ? computeSurveyAnalytics(selectedSurvey, responses) : null;

  const handleExport = () => {
    if (!selectedSurvey || responses.length === 0) return;
    const csv = exportResponsesToCsv(selectedSurvey, responses);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedSurvey.title.replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '_')}_responses.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectSurvey = (survey: Survey) => {
    setSelectedSurvey(survey);
    setCurrentSurvey(survey);
  };

  if (surveys.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex flex-col items-center justify-center py-32 animate-in fade-in">
        <BarChart3 size={48} className="text-text-secondary mb-4" />
        <h2 className="font-display text-2xl font-bold text-text-primary mb-2">Chưa có dữ liệu phân tích</h2>
        <p className="text-text-secondary text-sm text-center max-w-md">Tạo và xuất bản khảo sát, sau đó thu thập phản hồi để xem phân tích tại đây.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {selectedSurvey?.status === 'live' && (
              <span className="px-2.5 py-1 bg-sentiment-positive/10 text-sentiment-positive text-xs font-bold rounded-full flex items-center gap-1.5 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 bg-sentiment-positive rounded-full animate-pulse"></span> Trực tiếp
              </span>
            )}
            {analytics && (
              <span className="text-text-secondary text-xs font-medium">• {analytics.totalResponses} phản hồi</span>
            )}
          </div>

          {/* Survey Selector */}
          <div className="relative inline-block">
            <select
              value={selectedSurvey?.id || ''}
              onChange={(e) => {
                const s = surveys.find(sv => sv.id === e.target.value);
                if (s) handleSelectSurvey(s);
              }}
              className="font-display text-2xl md:text-4xl font-bold text-text-primary tracking-tight bg-transparent border-none outline-none cursor-pointer appearance-none pr-8"
            >
              {surveys.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <ChevronDown size={20} className="absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
          </div>
          <p className="text-text-secondary mt-2 text-sm">
            {selectedSurvey?.description || 'Bảng điều khiển phân tích phản hồi theo thời gian thực.'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => selectedSurvey && fetchResponses(selectedSurvey.id).then(setResponses)}
            className="p-2.5 bg-white border border-border-subtle rounded-xl hover:bg-surface-container-low transition-colors cursor-pointer"
            title="Làm mới"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExport}
            disabled={!analytics || analytics.totalResponses === 0}
            className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-white border border-border-subtle rounded-xl text-sm font-bold text-text-primary hover:bg-surface-container-low transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            Xuất CSV
          </button>
          <div className="bg-surface-container-lowest px-8 py-5 rounded-2xl shadow-sm border border-border-subtle flex items-center gap-8">
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold mb-1">Tổng phản hồi</p>
              <p className="font-display text-4xl font-bold text-secondary-container">{analytics?.totalResponses ?? 0}</p>
            </div>
            <div className="w-px h-12 bg-border-subtle"></div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold mb-1">Hoàn thành</p>
              <p className="font-display text-4xl font-bold text-primary">{analytics?.completionRate ?? 0}%</p>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={32} className="animate-spin text-primary" />
        </div>
      ) : analytics && analytics.totalResponses === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-border-subtle">
          <MessageSquare size={40} className="text-text-secondary mb-4" />
          <h3 className="font-display text-xl font-bold text-text-primary mb-2">Chưa có phản hồi</h3>
          <p className="text-text-secondary text-sm text-center max-w-md">Chia sẻ link khảo sát để bắt đầu thu thập dữ liệu phân tích.</p>
        </div>
      ) : analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* NPS */}
          {analytics.nps && (
            <div className="lg:col-span-4 bg-surface-container-lowest p-6 rounded-3xl border border-border-subtle shadow-sm flex flex-col items-center text-center">
              <div className="w-full flex justify-between items-center mb-8">
                <span className="text-sm font-semibold text-text-primary">Điểm NPS</span>
                <Info size={16} className="text-text-secondary" />
              </div>
              <div className="relative w-48 h-48 flex items-center justify-center mb-4">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="96" cy="96" r="80" fill="transparent" stroke="#E2E8F0" strokeWidth="16" />
                  <circle
                    cx="96" cy="96" r="80" fill="transparent" stroke="#1f108e" strokeWidth="16"
                    strokeDasharray="502"
                    strokeDashoffset={502 - (502 * Math.max(0, analytics.nps.score + 100) / 200)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-5xl font-bold text-primary">{analytics.nps.score}</span>
                  <span className={`text-xs font-bold mt-1 ${analytics.nps.score >= 50 ? 'text-sentiment-positive' : analytics.nps.score >= 0 ? 'text-sentiment-neutral' : 'text-sentiment-negative'}`}>
                    {analytics.nps.score >= 50 ? 'Xuất sắc' : analytics.nps.score >= 0 ? 'Tốt' : 'Cần cải thiện'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 w-full gap-4 pt-4 border-t border-border-subtle">
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Ủng hộ</span>
                  <span className="text-xl font-bold text-sentiment-positive">{analytics.nps.promoterPercent}%</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Thụ động</span>
                  <span className="text-xl font-bold text-sentiment-neutral">{analytics.nps.passivePercent}%</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-1">Phản đối</span>
                  <span className="text-xl font-bold text-sentiment-negative">{analytics.nps.detractorPercent}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Choice Distributions */}
          {analytics.choiceDistributions.length > 0 && (
            <div className={`${analytics.nps ? 'lg:col-span-8' : 'lg:col-span-12'} bg-surface-container-lowest p-6 rounded-3xl border border-border-subtle shadow-sm flex flex-col`}>
              <span className="text-sm font-semibold text-text-primary mb-6">Phân bố câu trả lời</span>
              <div className="flex-1 flex flex-col justify-center space-y-6">
                {analytics.choiceDistributions.slice(0, 4).map(dist => (
                  <div key={dist.questionId} className="space-y-3">
                    <p className="text-xs font-semibold text-text-secondary">{dist.questionText}</p>
                    {dist.options.slice(0, 4).map((opt, i) => (
                      <ProgressBar
                        key={opt.label}
                        label={opt.label}
                        count={`${opt.count} phản hồi`}
                        percent={opt.percent}
                        color={['bg-primary-container', 'bg-secondary-container', 'bg-primary-fixed-dim', 'bg-surface-container-highest'][i % 4]}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Star Ratings */}
          {analytics.starRatings.length > 0 && (
            <div className="lg:col-span-5 grid grid-cols-1 gap-4">
              {analytics.starRatings.map(sr => (
                <div key={sr.questionId} className="bg-surface-container-lowest p-6 rounded-3xl border border-border-subtle shadow-sm">
                  <p className="text-xs font-semibold text-text-secondary mb-2 line-clamp-2">{sr.questionText}</p>
                  <div className="flex items-end gap-2">
                    <span className="font-display text-4xl font-bold text-primary">{sr.average}</span>
                    <span className="text-text-secondary text-sm mb-1">/ 5 sao</span>
                  </div>
                  <div className="flex gap-1 mt-3">
                    {[1, 2, 3, 4, 5].map(star => (
                      <div key={star} className="flex-1 text-center">
                        <div className="h-16 bg-surface-container rounded-md flex items-end justify-center overflow-hidden">
                          <div
                            className="w-full bg-primary rounded-t-md transition-all duration-700"
                            style={{ height: `${analytics.totalResponses > 0 ? (sr.distribution[star] / analytics.totalResponses) * 100 : 0}%`, minHeight: sr.distribution[star] > 0 ? '4px' : '0' }}
                          />
                        </div>
                        <span className="text-[10px] text-text-secondary font-bold mt-1 block">{star}★</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* KPIs */}
          <div className={`${analytics.starRatings.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'} grid grid-cols-2 gap-6`}>
            <div className="bg-surface-container-lowest p-6 rounded-3xl border border-border-subtle shadow-sm flex flex-col justify-between">
              <Timer className="text-primary mb-4" size={24} />
              <div>
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1">Câu hỏi</p>
                <p className="font-display text-3xl font-bold text-text-primary">{selectedSurvey?.questions.length ?? 0}</p>
              </div>
            </div>
            <div className="bg-surface-container-lowest p-6 rounded-3xl border border-border-subtle shadow-sm flex flex-col justify-between">
              <CheckCircle className="text-sentiment-positive mb-4" size={24} />
              <div>
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mb-1">Hoàn thành</p>
                <p className="font-display text-3xl font-bold text-text-primary">{analytics.completionRate}%</p>
              </div>
            </div>
            {selectedSurvey?.isQuiz && analytics.averageScore !== undefined && (
              <div className="col-span-2 bg-primary-fixed/20 p-6 rounded-3xl border border-primary/20 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-primary shadow-sm">
                    <CheckCircle className="text-primary" size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">Điểm số trung bình</p>
                    <p className="font-display text-2xl font-bold text-primary">{analytics.averageScore} / {analytics.quizTotalQuestions}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="col-span-2 bg-secondary-fixed p-6 rounded-3xl border border-secondary-fixed-dim shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-primary shadow-sm">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-on-secondary-fixed-variant uppercase tracking-widest mb-1">Tổng phản hồi</p>
                  <p className="font-display text-2xl font-bold text-on-secondary-fixed">{analytics.totalResponses} phản hồi</p>
                </div>
              </div>
            </div>
          </div>

          {/* Text Responses & AI Insight */}
          {analytics.textResponses.length > 0 && (
            <div className="lg:col-span-7 bg-primary text-white p-8 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-primary-container/40 rounded-full blur-3xl"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <Sparkles className="text-secondary-container" size={24} />
                  <h3 className="font-display text-2xl font-bold">Phản hồi mở</h3>
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                  {analytics.textResponses.flatMap(tr => tr.responses.map((r, i) => (
                    <div key={`${tr.questionText}-${i}`} className="p-4 bg-white/10 rounded-xl border border-white/10 text-sm leading-relaxed">
                      "{r}"
                    </div>
                  )))}
                </div>
              </div>
            </div>
          )}

          {/* Recent Responses */}
          {analytics.recentResponses.length > 0 && (
            <div className={`${analytics.textResponses.length > 0 ? 'lg:col-span-5' : 'lg:col-span-12'} bg-surface-container-lowest p-6 rounded-3xl border border-border-subtle shadow-sm`}>
              <h3 className="text-sm font-semibold text-text-primary mb-4">Phản hồi gần đây</h3>
              <div className="space-y-3">
                {analytics.recentResponses.slice(0, 5).map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                    <span className="text-xs font-mono text-text-secondary">#{r.id.slice(0, 6)}</span>
                    <span className="text-xs text-text-secondary">{new Date(r.submittedAt).toLocaleString('vi-VN')}</span>
                    {selectedSurvey?.isQuiz && r.score !== undefined ? (
                      <span className="text-xs font-bold text-sentiment-positive">{r.score}/{r.totalQuizQuestions} điểm</span>
                    ) : (
                      <span className="text-xs font-bold text-primary">{Object.keys(r.answers).length} câu trả lời</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ label, count, percent, color }: { label: string; count: string; percent: number; color: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-medium">
        <span className="text-text-primary truncate mr-2">{label}</span>
        <span className="text-text-secondary flex-shrink-0">{count}</span>
      </div>
      <div className="h-4 w-full bg-surface-container rounded-md overflow-hidden">
        <div className={`h-full ${color} rounded-r-md transition-all duration-1000 ease-out`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
