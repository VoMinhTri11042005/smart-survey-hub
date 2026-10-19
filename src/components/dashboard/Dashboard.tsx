import { ArrowRight, BarChart3, Activity, Sparkles, Trash2, Share2, Edit3, FileText, ListChecks, Plus } from 'lucide-react';
import { useEffect, useState, useMemo, type ReactNode } from 'react';
import { useSurvey } from '../../context/SurveyContext';
import { ShareModal } from '../common/ShareModal';
import { stripHtml } from '../../utils/stringUtils';
import type { View, Survey } from '../../types';

export function Dashboard({ 
  onViewChange, 
  userProfile,
  onShowToast,
  onAddNotification
}: { 
  onViewChange?: (view: View) => void; 
  userProfile?: { name: string };
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onAddNotification?: (msg: string) => void;
}) {
  const { surveys, drafts, fetchSurveys, fetchDrafts, setCurrentSurvey, startFreshSurvey, openDraft, deleteSurvey, deleteDraft, searchQuery } = useSurvey();
  const [shareModal, setShareModal] = useState<{ id: string; title: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [deleteDraftConfirm, setDeleteDraftConfirm] = useState<{ id: string; title: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const reportActivity = (message: string, type: 'success' | 'error' | 'info') => {
    onShowToast?.(message, type);
    onAddNotification?.(message);
  };

  useEffect(() => {
    void fetchSurveys();
    void fetchDrafts();
  }, [fetchSurveys, fetchDrafts]);

  const filteredSurveys = useMemo(() => {
    if (!searchQuery.trim()) return surveys;
    const q = searchQuery.toLowerCase();
    return surveys.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.status.toLowerCase().includes(q)
    );
  }, [surveys, searchQuery]);

  const draftCards = useMemo(() => drafts.map(draft => ({
    id: draft.id,
    title: draft.title || 'Bản nháp chưa có tiêu đề',
    description: draft.description || 'Chưa có mô tả',
    questions: draft.questions || [],
    createdAt: draft.updatedAt || new Date().toISOString(),
    responseCount: 0,
    status: 'draft'
  })), [drafts]);

  const totalResponses = surveys.reduce((sum, survey) => sum + (survey.responseCount || 0), 0);
  const liveSurveys = surveys.filter(s => s.status === 'live');
  const totalQuestions = surveys.reduce((sum, survey) => sum + (survey.questions?.length || 0), 0);
  const liveSurveysWithoutResponses = liveSurveys.filter(survey => (survey.responseCount || 0) === 0).length;
  const featuredSurvey = useMemo(() => surveys
    .filter(survey => survey.status !== 'draft' && (survey.responseCount || 0) > 0)
    .reduce<Survey | null>((leading, survey) => (
    !leading || (survey.responseCount || 0) > (leading.responseCount || 0) ? survey : leading
    ), null), [surveys]);

  const startNewSurvey = () => {
    startFreshSurvey();
    onViewChange?.('builder');
  };

  const handleSurveyClick = (survey: Survey) => {
    setCurrentSurvey(survey);
    if (onViewChange) onViewChange('analytics');
  };

  const timeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa tạo';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500">
      {/* Workspace overview */}
      <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-gradient-to-br from-surface-container-lowest via-surface-container-lowest to-primary-fixed/40 p-5 shadow-sm md:p-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-secondary-container/15 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 right-1/4 h-40 w-40 rounded-full bg-primary-fixed-dim/25 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary-fixed/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-sentiment-positive" /> Không gian điều phối
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-text-primary md:text-4xl">Chào mừng trở lại, {userProfile?.name || 'bạn'}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary md:text-base">Theo dõi các khảo sát đang hoạt động, phản hồi thu thập được và tiếp tục xây dựng nghiên cứu tiếp theo của bạn.</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-[190px] items-center gap-3 rounded-2xl border border-border-subtle bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/20">
                <Activity size={19} />
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-sentiment-positive" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Phản hồi đã thu thập</p>
                <p className="font-display text-lg font-bold text-primary">{totalResponses.toLocaleString('vi-VN')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {featuredSurvey && (
                <button
                  type="button"
                  onClick={() => handleSurveyClick(featuredSurvey)}
                  className="inline-flex min-h-11 min-w-36 flex-1 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-white/85 px-4 text-sm font-semibold text-text-primary transition-colors hover:border-primary/30 hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:flex-none"
                >
                  Xem phân tích <ArrowRight size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={startNewSurvey}
                className="inline-flex min-h-11 min-w-36 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-md shadow-primary/20 transition-all hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] sm:flex-none"
              >
                <Plus size={17} /> Khảo sát mới
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Operational metrics + creation shortcut */}
      <section className="grid grid-cols-1 gap-5 2xl:grid-cols-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:col-span-8 2xl:grid-cols-4">
          <StatCard
            icon={<BarChart3 size={20} className="text-primary" />}
            iconBg="bg-primary-fixed"
            label="Phản hồi đã thu thập"
            value={totalResponses.toLocaleString('vi-VN')}
            detail={surveys.length > 0 ? `Từ ${surveys.length} khảo sát đã tạo` : 'Sẵn sàng thu thập dữ liệu'}
            badge="Tổng quan"
          />
          <StatCard
            icon={<Activity size={20} className="text-secondary" />}
            iconBg="bg-secondary-fixed"
            label="Đang thu thập"
            value={String(liveSurveys.length)}
            detail={liveSurveys.length === 0 ? 'Chưa có khảo sát trực tiếp' : liveSurveysWithoutResponses > 0 ? `${liveSurveysWithoutResponses} khảo sát chưa có phản hồi` : 'Tất cả đang có dữ liệu'}
            badge="Trực tiếp"
            badgeTone="bg-sentiment-positive/10 text-sentiment-positive"
          />
          <StatCard
            icon={<FileText size={20} className="text-sentiment-neutral" />}
            iconBg="bg-sentiment-neutral/10"
            label="Bản nháp"
            value={String(draftCards.length)}
            detail={draftCards.length > 0 ? 'Có thể tiếp tục chỉnh sửa' : 'Chưa có bản nháp nào'}
            badge="Cần hoàn thiện"
            badgeTone="bg-sentiment-neutral/10 text-sentiment-neutral"
          />
          <StatCard
            icon={<ListChecks size={20} className="text-on-secondary-fixed-variant" />}
            iconBg="bg-secondary-fixed"
            label="Câu hỏi đã xuất bản"
            value={String(totalQuestions)}
            detail={surveys.length > 0 ? `Trên ${surveys.length} khảo sát đã xuất bản` : 'Xuất bản khảo sát để thống kê'}
            badge="Nội dung"
          />
        </div>

        <aside className="relative min-h-[196px] overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary-container to-secondary p-6 text-white shadow-lg shadow-primary/15 2xl:col-span-4">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border border-white/15" aria-hidden="true" />
          <div className="absolute -bottom-16 right-8 h-44 w-44 rounded-full bg-secondary-container/30 blur-3xl" aria-hidden="true" />
          <div className="relative z-10 flex h-full flex-col justify-between gap-5">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/85">
                <Sparkles size={13} /> Trợ lý khảo sát
              </div>
              <h3 className="font-display text-xl font-bold tracking-tight">Khởi tạo nghiên cứu nhanh hơn</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/75">Bắt đầu từ mục tiêu, tệp Word hoặc một mẫu có sẵn; AI sẽ hỗ trợ bạn soạn bản nháp phù hợp.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={startNewSurvey}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-secondary-container px-4 text-sm font-semibold text-on-secondary-fixed shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.98]"
              >
                <Sparkles size={16} /> Tạo với AI
              </button>
              <button
                type="button"
                onClick={() => onViewChange?.('templates')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <FileText size={16} /> Chọn mẫu
              </button>
            </div>
          </div>
        </aside>
      </section>

      {/* Survey List */}
      <div className="space-y-6 pt-4">
        {draftCards.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold text-text-primary tracking-tight">Bản nháp của bạn</h3>
              <span className="text-text-secondary text-sm font-medium">{draftCards.length} bản nháp</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {draftCards.map(draft => (
                <div key={draft.id} className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-5 hover:shadow-lg transition-all group flex flex-col min-w-0">
                  <div className="flex justify-between items-start mb-4">
                    <div className="px-2.5 py-1 rounded-md flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide bg-surface-container-high text-text-secondary">
                      <span className="w-1.5 h-1.5 rounded-full bg-sentiment-neutral animate-pulse"></span>
                      Nháp
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteDraftConfirm({ id: draft.id, title: draft.title })}
                      className="p-1.5 text-text-secondary hover:text-sentiment-negative transition-colors cursor-pointer rounded-lg hover:bg-sentiment-negative/10"
                      title="Xóa bản nháp"
                      aria-label={`Xóa bản nháp ${stripHtml(draft.title)}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <button type="button" onClick={() => {
                    if (openDraft(draft.id)) onViewChange?.('builder');
                    else reportActivity('Không tìm thấy bản nháp. Vui lòng tải lại danh sách.', 'error');
                  }} className="text-left cursor-pointer min-w-0">
                    <h4 className="font-display text-lg font-bold text-text-primary group-hover:text-primary transition-colors mb-1 leading-tight line-clamp-2 break-all" title={stripHtml(draft.title)}>{stripHtml(draft.title)}</h4>
                    <p className="text-text-secondary text-xs mb-4 line-clamp-2 break-all">{stripHtml(draft.description) || 'Chưa có mô tả'}</p>
                  </button>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-border-subtle min-w-0">
                    <div>
                      <div className="text-xl font-bold text-text-primary">0</div>
                      <div className="text-[10px] text-text-secondary uppercase font-bold tracking-widest">Phản hồi</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-text-secondary">{draft.questions?.length || 0} câu hỏi</div>
                      <div className="text-xs text-text-secondary">{timeSince(draft.createdAt)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-text-primary tracking-tight">
              {surveys.length > 0 ? 'Khảo sát của bạn' : 'Chưa có khảo sát nào'}
            </h3>
            {surveys.length > 0 && (
              <span className="text-text-secondary text-sm font-medium">{surveys.length} khảo sát</span>
            )}
          </div>

          {surveys.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-12 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-surface-container-high rounded-2xl flex items-center justify-center mb-4">
                <Sparkles size={28} className="text-text-secondary" />
              </div>
              <h4 className="font-display text-lg font-bold text-text-primary mb-2">Bắt đầu tạo khảo sát đầu tiên</h4>
              <p className="text-text-secondary text-sm mb-6 max-w-md">Upload file Word câu hỏi hoặc nhập chủ đề để AI tự động tạo khảo sát cho bạn.</p>
              <button onClick={startNewSurvey} className="px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors cursor-pointer">
                Tạo khảo sát mới
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSurveys.map((survey: any) => (
                <div key={survey.id} className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-5 hover:shadow-lg transition-all group flex flex-col min-w-0">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${survey.status === 'live' ? 'bg-sentiment-positive/10 text-sentiment-positive' : 'bg-surface-container-high text-text-secondary'}`}>
                      {survey.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-sentiment-positive animate-pulse"></span>}
                      {survey.status === 'live' ? 'Trực tiếp' : survey.status === 'draft' ? 'Nháp' : 'Đã đóng'}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setShareModal({ id: survey.id, title: survey.title }); }} className="p-1.5 text-text-secondary hover:text-primary transition-colors cursor-pointer rounded-lg hover:bg-surface-container-low" title="Chia sẻ khảo sát">
                        <Share2 size={16} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setCurrentSurvey(survey); onViewChange?.('builder'); }} className="p-1.5 text-text-secondary hover:text-primary transition-colors cursor-pointer rounded-lg hover:bg-surface-container-low" title="Chỉnh sửa khảo sát">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: survey.id, title: survey.title }); }} className="p-1.5 text-text-secondary hover:text-sentiment-negative transition-colors cursor-pointer rounded-lg hover:bg-sentiment-negative/10" title="Xóa">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="cursor-pointer min-w-0" onClick={() => handleSurveyClick(survey)}>
                    <h4 className="font-display text-lg font-bold text-text-primary group-hover:text-primary transition-colors mb-1 leading-tight line-clamp-2 break-all" title={stripHtml(survey.title)}>{stripHtml(survey.title)}</h4>
                    <p className="text-text-secondary text-xs mb-4 line-clamp-2 break-all">{stripHtml(survey.description) || 'Không có mô tả'}</p>
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-border-subtle min-w-0">
                    <div>
                      <div className="text-xl font-bold text-text-primary">{survey.responseCount || 0}</div>
                      <div className="text-[10px] text-text-secondary uppercase font-bold tracking-widest">Phản hồi</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-text-secondary">{survey.questions?.length || 0} câu hỏi</div>
                      <div className="text-xs text-text-secondary">{timeSince(survey.createdAt)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      <ShareModal
        isOpen={!!shareModal}
        onClose={() => setShareModal(null)}
        surveyId={shareModal?.id || ''}
        surveyTitle={stripHtml(shareModal?.title) || ''}
        onFeedback={reportActivity}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-background/80 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-display text-xl font-bold text-text-primary mb-2">Xóa khảo sát?</h3>
            <p className="text-text-secondary text-sm mb-6">Bạn có chắc chắn muốn xóa "{stripHtml(deleteConfirm.title)}" không? Hành động này không thể hoàn tác.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteConfirm(null)} 
                className="px-4 py-2 rounded-lg font-semibold text-sm text-text-secondary hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button 
                onClick={async () => {
                  if (deletingId) return;
                  setDeletingId(deleteConfirm.id);
                  try {
                    await deleteSurvey(deleteConfirm.id);
                    reportActivity(`Đã xóa khảo sát "${stripHtml(deleteConfirm.title)}".`, 'success');
                  } catch (error) {
                    console.error('Failed to delete survey:', error);
                    reportActivity(error instanceof Error ? error.message : 'Không thể xóa khảo sát. Vui lòng thử lại.', 'error');
                  } finally {
                    setDeleteConfirm(null);
                    setDeletingId(null);
                  }
                }} 
                disabled={deletingId === deleteConfirm.id}
                className="px-4 py-2 bg-sentiment-negative text-white rounded-lg font-semibold text-sm hover:bg-sentiment-negative/90 transition-colors shadow-sm cursor-pointer"
              >
                {deletingId === deleteConfirm.id ? 'Đang xóa...' : 'Đồng ý xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDraftConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-background/80 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-display text-xl font-bold text-text-primary mb-2">Xóa bản nháp?</h3>
            <p className="text-text-secondary text-sm mb-6">Bạn có chắc chắn muốn xóa bản nháp “{stripHtml(deleteDraftConfirm.title)}” không? Thao tác này không thể hoàn tác.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteDraftConfirm(null)} className="px-4 py-2 rounded-lg font-semibold text-sm text-text-secondary hover:bg-surface-container-high transition-colors cursor-pointer">Hủy</button>
              <button
                onClick={async () => {
                  if (deletingId) return;
                  setDeletingId(deleteDraftConfirm.id);
                  try {
                    await deleteDraft(deleteDraftConfirm.id);
                    reportActivity(`Đã xóa bản nháp "${stripHtml(deleteDraftConfirm.title)}".`, 'success');
                  } catch (error) {
                    console.error('Failed to delete survey draft:', error);
                    reportActivity(error instanceof Error ? error.message : 'Không thể xóa bản nháp. Vui lòng thử lại.', 'error');
                  } finally {
                    setDeleteDraftConfirm(null);
                    setDeletingId(null);
                  }
                }}
                disabled={deletingId === deleteDraftConfirm.id}
                className="px-4 py-2 bg-sentiment-negative text-white rounded-lg font-semibold text-sm hover:bg-sentiment-negative/90 transition-colors shadow-sm cursor-pointer"
              >
                {deletingId === deleteDraftConfirm.id ? 'Đang xóa...' : 'Đồng ý xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  icon: ReactNode;
  iconBg: string;
  label: string;
  value: string;
  detail: string;
  badge: string;
  badgeTone?: string;
}

function StatCard({ icon, iconBg, label, value, detail, badge, badgeTone = 'bg-surface-container-low text-text-secondary' }: StatCardProps) {
  return (
    <div className="group flex min-h-[172px] flex-col justify-between rounded-2xl border border-border-subtle bg-surface-container-lowest p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/15 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>{icon}</div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${badgeTone}`}>{badge}</span>
      </div>
      <div className="mt-5 min-w-0">
        <p className="text-sm font-semibold text-text-secondary">{label}</p>
        <p className="mt-1 font-display text-3xl font-bold tracking-tight text-text-primary">{value}</p>
        <p className="mt-2 truncate text-xs text-text-secondary" title={detail}>{detail}</p>
      </div>
    </div>
  );
}
