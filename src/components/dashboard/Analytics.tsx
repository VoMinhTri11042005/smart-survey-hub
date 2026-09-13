import { Info, Sparkles, Timer, CheckCircle, TrendingUp, Download, ChevronDown, BarChart3, MessageSquare, RefreshCw, Trash2, Search, Users, ClipboardCheck, Clock3, ListChecks, Filter, FileSpreadsheet } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSurvey } from '../../context/SurveyContext';
import { computeSurveyAnalytics, exportResponsesToCsv, type TextCategoryDistribution } from '../../utils/analytics';
import { exportSurveyAnalysisToExcel } from '../../utils/excelExport';
import { cleanHtmlWhitespace, stripHtml, toUnaccented } from '../../utils/stringUtils';
import { getTextAnalyticsEligibility, isPersonalIdentifierQuestion } from '../../utils/textAnalytics';
import type { Survey, SurveyResponse } from '../../types';

const QUESTION_CHART_COLORS = ['#3730a3', '#006591', '#89ceff', '#c3c0ff', '#94a3b8', '#10b981', '#f59e0b', '#ef4444'];
const hasAnswer = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return stripHtml(cleanHtmlWhitespace(value)).trim().length > 0;
  return value !== undefined && value !== null;
};
const getRatingLevels = (distribution: Record<number, number>) => Object.keys(distribution).map(Number).sort((a, b) => a - b);

export function Analytics() {
  const { surveys, currentSurvey, setCurrentSurvey, fetchSurveys, fetchResponses, resetResponses } = useSurvey();
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(currentSurvey);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [analysisSearch, setAnalysisSearch] = useState('');
  const [questionFilter, setQuestionFilter] = useState<'all' | 'choice' | 'rating' | 'nps' | 'text'>('all');

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
  const normalizedSearch = analysisSearch.trim().toLocaleLowerCase('vi-VN');
  const matchesSearch = (...values: unknown[]) => !normalizedSearch || values.some(value => String(value ?? '').toLocaleLowerCase('vi-VN').includes(normalizedSearch));
  const questionMetrics = (selectedSurvey?.questions || []).map(question => {
    const answered = responses.filter(response => {
      const answer = response.answers[question.id];
      return hasAnswer(answer);
    }).length;
    return { question, answered, missing: responses.length - answered, rate: responses.length ? Math.round((answered / responses.length) * 100) : 0 };
  });
  const filteredChoiceDistributions = analytics?.choiceDistributions.filter(item => matchesSearch(stripHtml(item.questionText), ...item.options.map(option => option.label))) || [];
  const filteredRatings = analytics?.starRatings.filter(item => matchesSearch(stripHtml(item.questionText))) || [];
  const filteredTextResponses = analytics?.textResponses.filter(item => {
    const question = selectedSurvey?.questions.find(candidate => candidate.id === item.questionId);
    return (!question || !isPersonalIdentifierQuestion(question)) && matchesSearch(stripHtml(item.questionText), ...item.responses);
  }) || [];
  const filteredRecentResponses = analytics?.recentResponses.filter(response => matchesSearch(response.id, new Date(response.submittedAt).toLocaleString('vi-VN'), ...Object.values(response.answers))) || [];
  const filteredQuestionMetrics = questionMetrics.filter(item => matchesSearch(stripHtml(item.question.text), item.question.label, item.question.type));
  const responseDays = new Set(responses.map(response => new Date(response.submittedAt).toLocaleDateString('vi-VN'))).size;
  const latestResponse = analytics?.recentResponses[0];
  const responseTimeline = responses.reduce<Record<string, number>>((timeline, response) => {
    const day = new Date(response.submittedAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    timeline[day] = (timeline[day] || 0) + 1;
    return timeline;
  }, {});
  const timelineEntries = Object.entries(responseTimeline).slice(-14) as [string, number][];
  const maxTimelineResponses = Math.max(...timelineEntries.map(([, count]) => Number(count)), 1);
  const visibleQuestionMetrics = filteredQuestionMetrics.filter(({ question }) => {
    if (questionFilter === 'all') return true;
    if (questionFilter === 'choice') return question.type === 'single_choice' || question.type === 'multiple_choice';
    return question.type === questionFilter;
  });

  const handleExport = () => {
    if (!selectedSurvey || responses.length === 0) return;
    const csv = exportResponsesToCsv(selectedSurvey, responses);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeTitle = toUnaccented(stripHtml(selectedSurvey.title)).replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    link.download = `${safeTitle}_responses.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExcelExport = async () => {
    if (!selectedSurvey || responses.length === 0) return;
    try {
      await exportSurveyAnalysisToExcel(selectedSurvey, responses);
    } catch (error) {
      console.error('Excel export failed:', error);
      alert('Không thể tạo file Excel. Vui lòng thử lại.');
    }
  };

  const handleSelectSurvey = (survey: Survey) => {
    setSelectedSurvey(survey);
    setCurrentSurvey(survey);
  };

  const handleResetResponses = async () => {
    if (!selectedSurvey) return;
    setIsResetting(true);
    try {
      await resetResponses(selectedSurvey.id);
      setResponses([]);
      await fetchSurveys();
      setShowResetConfirm(false);
    } catch (error) {
      console.error('Error resetting survey responses:', error);
      alert('Không thể xóa dữ liệu phản hồi. Vui lòng thử lại.');
    } finally {
      setIsResetting(false);
    }
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
              className="max-w-full font-display text-2xl md:text-4xl font-bold text-text-primary tracking-tight bg-transparent border-none outline-none cursor-pointer appearance-none pr-8 truncate"
            >
              {surveys.map(s => (
                <option key={s.id} value={s.id} className="text-base font-sans font-normal text-text-primary">
                  {stripHtml(s.title)}
                </option>
              ))}
            </select>
            <ChevronDown size={20} className="absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
          </div>
          <p className="text-text-secondary mt-2 text-sm">
            {stripHtml(selectedSurvey?.description) || 'Bảng điều khiển phân tích phản hồi theo thời gian thực.'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <label className="hidden xl:flex items-center gap-2 rounded-xl border border-border-subtle bg-white px-3 py-2.5 text-text-secondary shadow-sm">
            <Search size={17} />
            <input
              value={analysisSearch}
              onChange={(e) => setAnalysisSearch(e.target.value)}
              placeholder="Tìm câu hỏi, đáp án, phản hồi..."
              className="w-56 bg-transparent text-sm outline-none placeholder:text-text-secondary"
            />
          </label>
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
          <button
            onClick={handleExcelExport}
            disabled={!analytics || analytics.totalResponses === 0}
            className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={18} />
            Xuất Excel
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={!analytics || analytics.totalResponses === 0}
            className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-white border border-sentiment-negative/30 rounded-xl text-sm font-bold text-sentiment-negative hover:bg-sentiment-negative/10 transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Xóa toàn bộ phản hồi để thu thập dữ liệu mới"
          >
            <Trash2 size={18} />
            Xóa dữ liệu
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
        <>
          <label className="xl:hidden flex items-center gap-2 rounded-xl border border-border-subtle bg-white px-3 py-2.5 text-text-secondary shadow-sm">
            <Search size={17} />
            <input value={analysisSearch} onChange={(e) => setAnalysisSearch(e.target.value)} placeholder="Tìm câu hỏi, đáp án, phản hồi..." className="w-full bg-transparent text-sm outline-none placeholder:text-text-secondary" />
          </label>

          <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <InsightCard icon={<Users size={19} />} label="Người trả lời" value={analytics.totalResponses} detail="Tổng phản hồi" tone="text-secondary-container bg-secondary-fixed/30" />
            <InsightCard icon={<ListChecks size={19} />} label="Câu hỏi" value={selectedSurvey?.questions.length ?? 0} detail={`${selectedSurvey?.questions.filter(q => q.required).length ?? 0} câu bắt buộc`} tone="text-primary bg-primary-fixed" />
            <InsightCard icon={<ClipboardCheck size={19} />} label="Hoàn thành" value={`${analytics.completionRate}%`} detail={`${Math.round((analytics.completionRate / 100) * analytics.totalResponses)} bài đầy đủ`} tone="text-sentiment-positive bg-sentiment-positive/10" />
            <InsightCard icon={<Clock3 size={19} />} label="Ngày có phản hồi" value={responseDays} detail={latestResponse ? `Mới nhất: ${new Date(latestResponse.submittedAt).toLocaleDateString('vi-VN')}` : 'Chưa có dữ liệu'} tone="text-primary bg-primary-fixed" />
            <InsightCard icon={<MessageSquare size={19} />} label="Nhóm văn bản" value={analytics.textCategoryDistributions.length} detail={`${analytics.textCategoryDistributions.reduce((sum, item) => sum + item.totalAnswered, 0)} phản hồi đã tổng hợp`} tone="text-on-secondary-fixed bg-secondary-fixed" />
            <InsightCard icon={<TrendingUp size={19} />} label="Tỷ lệ trả lời" value={`${questionMetrics.length ? Math.round(questionMetrics.reduce((sum, item) => sum + item.rate, 0) / questionMetrics.length) : 0}%`} detail="Trung bình toàn bộ câu hỏi" tone="text-sentiment-neutral bg-sentiment-neutral/10" />
            {selectedSurvey?.isQuiz && analytics.passRate !== undefined && <InsightCard icon={<CheckCircle size={19} />} label="Đạt từ 50%" value={`${analytics.passRate}%`} detail={`Trung vị: ${analytics.medianScore ?? 0} điểm`} tone="text-sentiment-positive bg-sentiment-positive/10" />}
          </section>

          <section className="bg-surface-container-lowest rounded-3xl border border-border-subtle shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-6 py-5 border-b border-border-subtle">
              <div><h3 className="font-display text-lg font-bold text-text-primary">Chất lượng dữ liệu theo câu hỏi</h3><p className="text-xs text-text-secondary mt-1">Hiển thị toàn bộ {selectedSurvey?.questions.length ?? 0} câu hỏi và mức độ được trả lời.</p></div>
              <span className="text-xs font-bold text-primary bg-primary-fixed px-3 py-1.5 rounded-full">{filteredQuestionMetrics.length} mục</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-surface-container-low text-[11px] uppercase tracking-wider text-text-secondary"><tr><th className="px-6 py-3 font-bold">Câu hỏi</th><th className="px-4 py-3 font-bold">Loại</th><th className="px-4 py-3 font-bold">Bắt buộc</th><th className="px-4 py-3 font-bold">Đã trả lời</th><th className="px-6 py-3 font-bold">Độ phủ dữ liệu</th></tr></thead>
                <tbody>{filteredQuestionMetrics.map(({ question, answered, missing, rate }, index) => <tr key={question.id} className="border-t border-border-subtle text-sm"><td className="px-6 py-4"><span className="mr-2 text-text-secondary font-mono text-xs">{index + 1}.</span><span className="font-semibold text-text-primary">{stripHtml(question.text) || question.label || 'Chưa đặt nội dung'}</span></td><td className="px-4 py-4 text-text-secondary">{question.type.replace('_', ' ')}</td><td className="px-4 py-4">{question.required ? <span className="text-sentiment-negative font-bold">Có</span> : <span className="text-text-secondary">Không</span>}</td><td className="px-4 py-4 font-semibold">{answered} <span className="text-text-secondary font-normal">/ {analytics.totalResponses}</span></td><td className="px-6 py-4 min-w-48"><div className="flex items-center gap-3"><div className="h-2 flex-1 bg-surface-container rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${rate}%` }} /></div><span className="w-16 text-right font-bold text-primary">{rate}%</span><span className="text-xs text-text-secondary">thiếu {missing}</span></div></td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-surface-container-lowest rounded-3xl border border-border-subtle shadow-sm p-6">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="font-display text-lg font-bold text-text-primary">Xu hướng phản hồi</h3>
                  <p className="text-xs text-text-secondary mt-1">14 ngày gần nhất có dữ liệu, đọc trực tiếp từ thời gian gửi hiện có.</p>
                </div>
                <TrendingUp size={20} className="text-primary" />
              </div>
              {timelineEntries.length > 0 ? (
                <div className="h-48 flex items-end gap-2 sm:gap-3">
                  {timelineEntries.map(([day, count]) => (
                    <div key={day} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-2">
                      <span className="text-[11px] font-bold text-primary">{count}</span>
                      <div className="w-full max-w-10 rounded-t-lg bg-primary/15 flex items-end h-32">
                        <div className="w-full rounded-t-lg bg-primary transition-all duration-700" style={{ height: `${Math.max((Number(count) / maxTimelineResponses) * 100, 6)}%` }} />
                      </div>
                      <span className="text-[10px] text-text-secondary truncate max-w-full">{day}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-sm text-text-secondary">Chưa có dữ liệu theo thời gian.</div>
              )}
            </div>
            <div className="bg-primary text-white rounded-3xl shadow-lg p-6">
              <div className="flex items-center gap-2 mb-5">
                <Filter size={18} />
                <h3 className="font-display text-lg font-bold">Bộ lọc câu hỏi</h3>
              </div>
              <p className="text-sm text-white/75 mb-5">Chọn nhóm câu hỏi để tập trung vào biểu đồ và chỉ số quan trọng.</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['all', 'Tất cả'],
                  ['choice', 'Lựa chọn'],
                  ['rating', 'Sao'],
                  ['nps', 'NPS'],
                  ['text', 'Văn bản'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setQuestionFilter(value)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors cursor-pointer ${questionFilter === value ? 'bg-white text-primary' : 'bg-white/10 text-white hover:bg-white/20'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-6 pt-5 border-t border-white/20 text-sm text-white/80">
                Đang hiển thị <strong className="text-white">{visibleQuestionMetrics.length}</strong> / {questionMetrics.length} câu hỏi
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-bold text-text-primary">Phân tích từng câu hỏi</h3>
                <p className="text-sm text-text-secondary mt-1">Mỗi câu dùng cách trực quan hóa phù hợp với loại dữ liệu.</p>
              </div>
              <span className="text-xs font-bold text-primary bg-primary-fixed px-3 py-1.5 rounded-full">{visibleQuestionMetrics.length} biểu đồ</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {visibleQuestionMetrics.map(({ question, answered, missing, rate }, index) => {
                const choice = analytics.choiceDistributions.find(item => item.questionId === question.id);
                const rating = analytics.starRatings.find(item => item.questionId === question.id);
                const ratingLevels = rating ? getRatingLevels(rating.distribution) : [];
                const npsQuestion = question.type === 'nps' ? analytics.npsByQuestion.find(item => item.questionId === question.id) : null;
                const text = analytics.textResponses.find(item => item.questionId === question.id);
                const textCategoryDistribution = analytics.textCategoryDistributions.find(item => item.questionId === question.id);
                const textEligibility = question.type === 'text' ? getTextAnalyticsEligibility(question) : null;
                const chartValues = choice?.options || [];
                const maxChoice = Math.max(...chartValues.map(item => item.count), 1);
                return (
                  <article key={question.id} className="bg-surface-container-lowest rounded-3xl border border-border-subtle shadow-sm p-5 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-text-secondary font-bold">Câu {index + 1} · {question.type.replace('_', ' ')}</p>
                        <h4 className="font-display font-bold text-text-primary mt-1 line-clamp-2">{stripHtml(question.text) || question.label || 'Chưa đặt nội dung'}</h4>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-primary bg-primary-fixed px-2.5 py-1 rounded-full">{rate}%</span>
                    </div>
                    <div className="flex gap-4 text-xs text-text-secondary mb-5">
                      <span>Đã trả lời <strong className="text-text-primary">{answered}</strong>/{responses.length}</span>
                      <span>Bỏ qua <strong className="text-sentiment-negative">{missing}</strong></span>
                    </div>
                    {choice && (
                      <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-5 items-center">
                        <DonutChart options={choice.options} />
                        <div className="space-y-3">
                          {choice.options.map((option, optionIndex) => (
                            <div key={option.label} className="space-y-1">
                              <div className="flex justify-between gap-3 text-xs">
                                <span className="truncate text-text-primary">{stripHtml(option.label)}</span>
                                <span className="shrink-0 font-bold text-primary">{option.count} · {option.percent}%</span>
                              </div>
                              <div className="h-2.5 rounded-full bg-surface-container overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${(option.count / maxChoice) * 100}%`,
                                    backgroundColor: QUESTION_CHART_COLORS[optionIndex % QUESTION_CHART_COLORS.length],
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        {question.type === 'multiple_choice' && <p className="text-[11px] text-text-secondary pt-1">Có thể chọn nhiều đáp án; tổng tỷ lệ có thể vượt 100%.</p>}
                      </div>
                    )}
                    {rating && (
                      <div>
                        <div className="flex items-end gap-2 mb-4"><span className="font-display text-4xl font-bold text-primary">{rating.average}</span><span className="text-sm text-text-secondary mb-1">/ 5 sao</span></div>
                        <div className="flex items-end gap-2 h-24">
                          {ratingLevels.map(star => <div key={star} className="flex-1 h-full flex flex-col justify-end items-center gap-1"><div className="w-full rounded-t-md bg-primary" style={{ height: `${Math.max(((rating.distribution[star] || 0) / Math.max(rating.totalAnswered, 1)) * 100, rating.distribution[star] ? 5 : 0)}%` }} /><span className="text-[10px] text-text-secondary">{star}★</span></div>)}
                        </div>
                      </div>
                    )}
                    {npsQuestion && (
                      <div className="flex items-center justify-between rounded-2xl bg-primary-fixed/60 p-4"><div><p className="text-xs text-text-secondary">Điểm NPS</p><p className="font-display text-4xl font-bold text-primary">{npsQuestion.score}</p></div><div className="text-right text-xs text-text-secondary"><p>Ủng hộ {npsQuestion.promoterPercent}%</p><p>Thụ động {npsQuestion.passivePercent}%</p><p>Phản đối {npsQuestion.detractorPercent}%</p></div></div>
                    )}
                    {question.type === 'text' && (
                      textCategoryDistribution ? (
                        <TextCategorySummary distribution={textCategoryDistribution} />
                      ) : (
                        <TextResponsePreview
                          responses={text?.responses || []}
                          reason={textEligibility?.reason}
                        />
                      )
                    )}
                  </article>
                );
              })}
            </div>
          </section>

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
          {filteredChoiceDistributions.length > 0 && (
            <div className={`${analytics.nps ? 'lg:col-span-8' : 'lg:col-span-12'} bg-surface-container-lowest p-6 rounded-3xl border border-border-subtle shadow-sm flex flex-col`}>
              <span className="text-sm font-semibold text-text-primary mb-6">Phân bố câu trả lời</span>
              <div className="flex-1 flex flex-col justify-center space-y-6">
                {filteredChoiceDistributions.map(dist => (
                  <div key={dist.questionId} className="space-y-3">
                    <p className="text-xs font-semibold text-text-secondary">{stripHtml(dist.questionText)}</p>
                    {dist.options.map((opt, i) => (
                      <div key={opt.label}>
                        <ProgressBar
                          label={stripHtml(opt.label)}
                          count={`${opt.count} phản hồi`}
                          percent={opt.percent}
                          color={['bg-primary-container', 'bg-secondary-container', 'bg-primary-fixed-dim', 'bg-surface-container-highest'][i % 4]}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Star Ratings */}
          {filteredRatings.length > 0 && (
            <div className="lg:col-span-5 grid grid-cols-1 gap-4">
              {filteredRatings.map(sr => (
                <div key={sr.questionId} className="bg-surface-container-lowest p-6 rounded-3xl border border-border-subtle shadow-sm">
                  <p className="text-xs font-semibold text-text-secondary mb-2 line-clamp-2">{stripHtml(sr.questionText)}</p>
                  <div className="flex items-end gap-2">
                    <span className="font-display text-4xl font-bold text-primary">{sr.average}</span>
                    <span className="text-text-secondary text-sm mb-1">/ 5 sao</span>
                  </div>
                  <div className="flex gap-1 mt-3">
                    {getRatingLevels(sr.distribution).map(star => (
                      <div key={star} className="flex-1 text-center">
                        <div className="h-16 bg-surface-container rounded-md flex items-end justify-center overflow-hidden">
                          <div
                            className="w-full bg-primary rounded-t-md transition-all duration-700"
                            style={{ height: `${(sr.totalAnswered ?? analytics.totalResponses) > 0 ? (sr.distribution[star] / (sr.totalAnswered || analytics.totalResponses)) * 100 : 0}%`, minHeight: sr.distribution[star] > 0 ? '4px' : '0' }}
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
          <div className={`${filteredRatings.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'} grid grid-cols-2 gap-6`}>
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

            {selectedSurvey?.isQuiz && analytics.scoreDistribution && (
              <div className="col-span-2 bg-surface-container-lowest p-6 rounded-3xl border border-border-subtle shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div><p className="text-xs font-semibold text-text-secondary uppercase tracking-widest">Phân bố kết quả</p><p className="text-sm text-text-primary font-bold mt-1">Điểm trung vị {analytics.medianScore ?? 0} · Đạt từ 50%: {analytics.passRate ?? 0}%</p></div>
                  <BarChart3 className="text-primary" size={22} />
                </div>
                <div className="grid grid-cols-4 gap-3 items-end h-28">
                  {analytics.scoreDistribution.map(bucket => {
                    const max = Math.max(...analytics.scoreDistribution!.map(item => item.count), 1);
                    return <div key={bucket.label} className="h-full flex flex-col justify-end items-center gap-2"><span className="text-xs font-bold text-primary">{bucket.count}</span><div className="w-full max-w-14 rounded-t-lg bg-secondary-container" style={{ height: `${Math.max((bucket.count / max) * 100, bucket.count ? 6 : 0)}%` }} /><span className="text-[10px] text-text-secondary whitespace-nowrap">{bucket.label}</span></div>;
                  })}
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
          {filteredTextResponses.length > 0 && (
            <div className="lg:col-span-7 bg-primary text-white p-8 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-primary-container/40 rounded-full blur-3xl"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <Sparkles className="text-secondary-container" size={24} />
                  <h3 className="font-display text-2xl font-bold">Phản hồi mở</h3>
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                  {filteredTextResponses.flatMap(tr => tr.responses.map((r, i) => (
                    <div key={`${tr.questionText}-${i}`} className="p-4 bg-white/10 rounded-xl border border-white/10 text-sm leading-relaxed">
                      "{r}"
                    </div>
                  )))}
                </div>
              </div>
            </div>
          )}

          {/* Recent Responses */}
          {filteredRecentResponses.length > 0 && (
            <div className={`${filteredTextResponses.length > 0 ? 'lg:col-span-5' : 'lg:col-span-12'} bg-surface-container-lowest p-6 rounded-3xl border border-border-subtle shadow-sm`}>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Tất cả phản hồi</h3>
              <p className="text-xs text-text-secondary mb-4">Hiển thị {filteredRecentResponses.length} phản hồi theo thời gian gửi mới nhất.</p>
              <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                {filteredRecentResponses.map(r => (
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
        </>
      )}

      {showResetConfirm && selectedSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-background/80 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-display text-xl font-bold text-text-primary mb-2">Xóa dữ liệu phản hồi?</h3>
            <p className="text-text-secondary text-sm mb-6">Toàn bộ {analytics?.totalResponses ?? 0} phản hồi của “{stripHtml(selectedSurvey.title)}” sẽ bị xóa vĩnh viễn. Khảo sát vẫn được giữ nguyên để thu thập dữ liệu mới.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded-lg font-semibold text-sm text-text-secondary hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleResetResponses}
                disabled={isResetting}
                className="px-4 py-2 bg-sentiment-negative text-white rounded-lg font-semibold text-sm hover:bg-sentiment-negative/90 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isResetting ? 'Đang xóa...' : 'Xóa dữ liệu'}
              </button>
            </div>
          </div>
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

function DonutChart({ options, totalLabel = 'lượt chọn' }: { options: { label: string; count: number; percent: number }[]; totalLabel?: string }) {
  const totalSelections = options.reduce((sum, option) => sum + option.count, 0);
  let offset = 0;
  const segments = options
    .map((option, index) => {
      if (option.count <= 0) return null;
      const start = offset;
      const end = offset + (option.count / Math.max(totalSelections, 1)) * 100;
      offset = end;
      return `${QUESTION_CHART_COLORS[index % QUESTION_CHART_COLORS.length]} ${start}% ${end}%`;
    })
    .filter((segment): segment is string => segment !== null);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative h-32 w-32 rounded-full"
        style={{ background: segments.length > 0 ? `conic-gradient(${segments.join(', ')})` : '#e4e1eb' }}
        aria-label="Biểu đồ tròn phân bố lựa chọn"
      >
        <div className="absolute inset-5 rounded-full bg-white flex flex-col items-center justify-center">
          <span className="font-display text-xl font-bold text-primary">{totalSelections}</span>
          <span className="text-[10px] text-text-secondary">{totalLabel}</span>
        </div>
      </div>
      <span className="text-[10px] text-text-secondary text-center">
        {options.length} lựa chọn
      </span>
    </div>
  );
}

function TextCategorySummary({ distribution }: { distribution: TextCategoryDistribution }) {
  const showDonut = distribution.options.length <= 6;
  const highestCount = Math.max(...distribution.options.map(option => option.count), 1);

  return (
    <div className="rounded-2xl bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-bold text-primary">Thống kê dữ liệu văn bản</p>
          <p className="text-xs text-text-secondary mt-1">n = {distribution.totalAnswered} · {distribution.uniqueCategories} nhóm · {distribution.source === 'manual' ? 'đã bật thủ công' : 'tự động nhận diện'}</p>
        </div>
      </div>
      <div className={showDonut ? 'grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-5 items-center' : ''}>
        {showDonut && <DonutChart options={distribution.options} totalLabel="phản hồi" />}
        <div className="space-y-3 max-h-56 overflow-y-auto custom-scrollbar pr-1">
          {distribution.options.map((option, optionIndex) => (
            <div key={option.label} className="space-y-1">
              <div className="flex justify-between gap-3 text-xs">
                <span className="truncate text-text-primary" title={option.label}>{option.label}</span>
                <span className="shrink-0 font-bold text-primary">{option.count} · {option.percent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-container overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(option.count / highestCount) * 100}%`,
                    backgroundColor: QUESTION_CHART_COLORS[optionIndex % QUESTION_CHART_COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TextResponsePreview({ responses, reason }: { responses: string[]; reason?: string }) {
  const message = reason === 'personal_data'
    ? 'Câu hỏi nhận diện cá nhân nên không được tổng hợp hoặc hiển thị trong phần phân tích.'
    : reason === 'disabled'
      ? 'Chủ khảo sát đã tắt thống kê theo nhóm cho câu này.'
      : 'Đây là phản hồi mở. Bạn có thể bật “Thống kê theo nhóm” khi chỉnh sửa câu hỏi nếu muốn tổng hợp dữ liệu này.';

  return (
    <div className="rounded-2xl bg-primary/5 p-4">
      <p className="text-2xl font-bold text-primary">{responses.length}</p>
      <p className="text-xs text-text-secondary mt-1">câu trả lời mở có nội dung</p>
      <p className="text-xs text-text-secondary mt-3 leading-relaxed">{message}</p>
      {reason !== 'personal_data' && (
        <div className="mt-3 space-y-2 max-h-24 overflow-y-auto custom-scrollbar">
          {responses.slice(0, 3).map((response, responseIndex) => <p key={responseIndex} className="text-xs text-text-secondary line-clamp-2">“{response}”</p>)}
        </div>
      )}
    </div>
  );
}

function InsightCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string | number; detail: string; tone: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-4 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-4 ${tone}`}>{icon}</div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-text-secondary mb-1">{label}</p>
      <p className="font-display text-2xl font-bold text-text-primary leading-none">{value}</p>
      <p className="text-[11px] text-text-secondary mt-2 truncate" title={detail}>{detail}</p>
    </div>
  );
}
