import { BarChart3, Activity, Sparkles, Trash2, Share2 } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useSurvey } from '../../context/SurveyContext';
import { ShareModal } from '../common/ShareModal';
import type { View, Survey } from '../../types';

export function Dashboard({ onViewChange, userProfile }: { onViewChange?: (view: View) => void; userProfile?: { name: string } }) {
  const { surveys, fetchSurveys, setCurrentSurvey, deleteSurvey, searchQuery } = useSurvey();
  const [shareModal, setShareModal] = useState<{ id: string; title: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => { fetchSurveys(); }, [fetchSurveys]);

  const filteredSurveys = useMemo(() => {
    if (!searchQuery.trim()) return surveys;
    const q = searchQuery.toLowerCase();
    return surveys.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.status.toLowerCase().includes(q)
    );
  }, [surveys, searchQuery]);

  const totalResponses = surveys.reduce((sum, s: any) => sum + (s.responseCount || 0), 0);
  const liveSurveys = surveys.filter(s => s.status === 'live');

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
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Chào mừng trở lại, {userProfile?.name || 'bạn'}</h2>
          <p className="text-text-secondary mt-1 text-sm">Dưới đây là hiệu suất điều phối dữ liệu của bạn hôm nay.</p>
        </div>
        <div className="hidden md:flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Lượt phản hồi</div>
            <div className="text-sm font-semibold text-primary">Tổng cộng {totalResponses}</div>
          </div>
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-secondary text-white flex items-center justify-center shadow-lg shadow-primary/30 relative group">
            <Activity size={20} className="group-hover:animate-bounce" />
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-sentiment-positive rounded-full border-2 border-surface-background animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Stats + AI Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard icon={<BarChart3 size={20} className="text-primary" />} iconBg="bg-primary-fixed" label="Tổng số phản hồi" value={totalResponses > 0 ? totalResponses.toLocaleString() : '0'} />
          <StatCard icon={<Activity size={20} className="text-secondary" />} iconBg="bg-secondary-fixed" label="Khảo sát đang chạy" value={String(liveSurveys.length)} status="Đang hoạt động" />
          <StatCard icon={<Sparkles size={20} className="text-[#511c00]" />} iconBg="bg-[#ffdbcc]" label="Tổng khảo sát" value={String(surveys.length)} status={surveys.length > 0 ? "Có dữ liệu" : "Trống"} statusColor="text-secondary font-bold" glow={surveys.length > 0} />
        </div>
        <div className="lg:col-span-1 bg-primary text-white rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between group shadow-lg">
          <div className="relative z-10">
            <h3 className="font-display text-xl font-bold mb-2 tracking-tight">Trợ lý AI</h3>
            <p className="text-on-primary-container text-sm leading-relaxed opacity-90">Mô tả mục tiêu nghiên cứu của bạn và để AI xây dựng bản nháp khảo sát hoàn hảo trong vài giây.</p>
          </div>
          <div className="relative z-10 mt-6">
            <button onClick={() => onViewChange?.('builder')} className="w-full bg-secondary-container text-[#004666] font-semibold text-sm py-2.5 rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer">
              Tạo khảo sát mới
            </button>
          </div>
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-secondary-container rounded-full blur-[60px] opacity-20"></div>
        </div>
      </div>

      {/* Survey List */}
      <div className="space-y-4 pt-4">
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
            <button onClick={() => onViewChange?.('builder')} className="px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors cursor-pointer">
              Tạo khảo sát mới
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSurveys.map((survey: any) => (
              <div key={survey.id} className="bg-surface-container-lowest rounded-2xl border border-border-subtle p-5 hover:shadow-lg transition-all group flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${survey.status === 'live' ? 'bg-sentiment-positive/10 text-sentiment-positive' : 'bg-surface-container-high text-text-secondary'}`}>
                    {survey.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-sentiment-positive animate-pulse"></span>}
                    {survey.status === 'live' ? 'Trực tiếp' : survey.status === 'draft' ? 'Nháp' : 'Đã đóng'}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setShareModal({ id: survey.id, title: survey.title }); }} className="p-1.5 text-text-secondary hover:text-primary transition-colors cursor-pointer rounded-lg hover:bg-surface-container-low" title="Chia sẻ khảo sát">
                      <Share2 size={16} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: survey.id, title: survey.title }); }} className="p-1.5 text-text-secondary hover:text-sentiment-negative transition-colors cursor-pointer rounded-lg hover:bg-sentiment-negative/10" title="Xóa">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="cursor-pointer" onClick={() => handleSurveyClick(survey)}>
                  <h4 className="font-display text-lg font-bold text-text-primary group-hover:text-primary transition-colors mb-1 leading-tight">{survey.title}</h4>
                  <p className="text-text-secondary text-xs mb-4 line-clamp-2">{survey.description || 'Không có mô tả'}</p>
                </div>
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-border-subtle">
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

      {/* Share Modal */}
      <ShareModal
        isOpen={!!shareModal}
        onClose={() => setShareModal(null)}
        surveyId={shareModal?.id || ''}
        surveyTitle={shareModal?.title || ''}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-background/80 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-display text-xl font-bold text-text-primary mb-2">Xóa khảo sát?</h3>
            <p className="text-text-secondary text-sm mb-6">Bạn có chắc chắn muốn xóa "{deleteConfirm.title}" không? Hành động này không thể hoàn tác.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteConfirm(null)} 
                className="px-4 py-2 rounded-lg font-semibold text-sm text-text-secondary hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button 
                onClick={() => {
                  deleteSurvey(deleteConfirm.id);
                  setDeleteConfirm(null);
                }} 
                className="px-4 py-2 bg-sentiment-negative text-white rounded-lg font-semibold text-sm hover:bg-sentiment-negative/90 transition-colors shadow-sm cursor-pointer"
              >
                Đồng ý xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, iconBg, label, value, trend, status, statusColor = "text-text-secondary", trendUp, glow }: any) {
  return (
    <div className={`bg-surface-container-lowest p-5 rounded-2xl border border-border-subtle shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow ${glow ? 'ring-1 ring-secondary-container/30 shadow-[0_0_15px_rgba(57,184,253,0.1)]' : ''}`}>
      <div className="flex justify-between items-start">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>{icon}</div>
        {trend && (
          <span className={`text-xs font-semibold flex items-center gap-1 ${trendUp ? 'text-sentiment-positive' : 'text-sentiment-negative'}`}>{trend}</span>
        )}
        {status && <span className={`text-xs font-medium ${statusColor}`}>{status}</span>}
      </div>
      <div className="mt-6">
        <div className="text-text-secondary text-sm font-medium">{label}</div>
        <div className="font-display text-3xl font-bold text-text-primary mt-1">{value}</div>
      </div>
    </div>
  );
}
