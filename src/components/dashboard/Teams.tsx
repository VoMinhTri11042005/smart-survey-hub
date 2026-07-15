import { Users, UserPlus, Mail, Shield, Edit3, Eye, Trash2, X, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSurvey } from '../../context/SurveyContext';
import type { TeamRole } from '../../types';

const roleLabels: Record<TeamRole, { label: string; icon: React.ReactNode; color: string }> = {
  admin: { label: 'Quản trị', icon: <Shield size={14} />, color: 'bg-primary-fixed text-primary' },
  editor: { label: 'Biên tập', icon: <Edit3 size={14} />, color: 'bg-secondary-fixed text-secondary' },
  viewer: { label: 'Xem', icon: <Eye size={14} />, color: 'bg-surface-container text-text-secondary' },
};

export function Teams() {
  const { teamMembers, fetchTeamMembers, inviteTeamMember, updateTeamMember, removeTeamMember } = useSurvey();
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => { fetchTeamMembers(); }, [fetchTeamMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsInviting(true);
    try {
      await inviteTeamMember(name, email, role);
      setName('');
      setEmail('');
      setRole('viewer');
      setShowInvite(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (id: string, newRole: TeamRole) => {
    try {
      await updateTeamMember(id, { role: newRole });
    } catch {
      setError('Không thể cập nhật vai trò.');
    }
  };

  const handleRemove = async (id: string) => {
    if (confirm('Bạn có chắc muốn xóa thành viên này?')) {
      await removeTeamMember(id);
    }
  };

  const initials = (n: string) => n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-text-primary">Quản lý Nhóm</h1>
          <p className="text-sm text-text-secondary mt-1">
            {teamMembers.length > 0 ? `${teamMembers.length} thành viên trong nhóm` : 'Mời đồng nghiệp cùng thiết kế và phân tích khảo sát.'}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="px-5 py-2.5 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary/90 transition-all flex items-center gap-2 cursor-pointer"
        >
          <UserPlus size={18} />
          Mời thành viên
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-xl text-sm text-sentiment-negative font-medium flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="cursor-pointer"><X size={16} /></button>
        </div>
      )}

      {/* Invite Form */}
      {showInvite && (
        <div className="mb-8 bg-white rounded-2xl border border-border-subtle p-6 shadow-sm animate-in slide-in-from-top-2 fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold text-text-primary">Mời thành viên mới</h3>
            <button onClick={() => setShowInvite(false)} className="p-1 text-text-secondary hover:text-text-primary cursor-pointer"><X size={20} /></button>
          </div>
          <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Họ và tên"
              required
              className="px-4 py-2.5 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-secondary/30 outline-none"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@company.com"
              required
              className="px-4 py-2.5 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-secondary/30 outline-none"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as TeamRole)}
              className="px-4 py-2.5 border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-secondary/30 outline-none bg-white cursor-pointer"
            >
              <option value="admin">Quản trị</option>
              <option value="editor">Biên tập</option>
              <option value="viewer">Chỉ xem</option>
            </select>
            <button
              type="submit"
              disabled={isInviting}
              className="md:col-span-3 py-2.5 bg-primary text-white font-bold rounded-xl text-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
            >
              {isInviting ? <RefreshCw size={16} className="animate-spin" /> : <Mail size={16} />}
              Gửi lời mời
            </button>
          </form>
        </div>
      )}

      {/* Members List */}
      {teamMembers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-border-subtle shadow-sm">
          <div className="w-20 h-20 bg-primary-fixed/30 rounded-2xl flex items-center justify-center mb-6">
            <Users size={40} className="text-primary" />
          </div>
          <h2 className="font-display text-2xl font-bold text-text-primary mb-2">Chưa có thành viên</h2>
          <p className="text-text-secondary text-sm max-w-md text-center mb-8">
            Mời đồng nghiệp tham gia để cùng thiết kế khảo sát, xem phân tích và chia sẻ kết quả.
          </p>
          <button
            onClick={() => setShowInvite(true)}
            className="px-6 py-3 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary/90 transition-all flex items-center gap-2 cursor-pointer"
          >
            <UserPlus size={18} />
            Mời thành viên đầu tiên
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border-subtle overflow-hidden shadow-sm">
          <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-6 py-3 bg-surface-container-low text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border-subtle">
            <span>Thành viên</span>
            <span>Email</span>
            <span>Vai trò</span>
            <span></span>
          </div>
          {teamMembers.map(member => (
            <div key={member.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-6 py-4 items-center border-b border-border-subtle last:border-0 hover:bg-surface-container-low/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-sm font-bold text-primary">
                  {initials(member.name)}
                </div>
                <span className="font-semibold text-text-primary text-sm">{member.name}</span>
              </div>
              <span className="text-text-secondary text-sm">{member.email}</span>
              <select
                value={member.role}
                onChange={(e) => handleRoleChange(member.id, e.target.value as TeamRole)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border-0 outline-none ${roleLabels[member.role].color}`}
              >
                <option value="admin">Quản trị</option>
                <option value="editor">Biên tập</option>
                <option value="viewer">Chỉ xem</option>
              </select>
              <button
                onClick={() => handleRemove(member.id)}
                className="p-2 text-text-secondary hover:text-sentiment-negative hover:bg-sentiment-negative/10 rounded-lg transition-colors cursor-pointer"
                title="Xóa thành viên"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Role Legend */}
      {teamMembers.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-text-secondary">
          <span className="flex items-center gap-1.5"><Shield size={14} className="text-primary" /> <strong>Quản trị</strong> — Toàn quyền</span>
          <span className="flex items-center gap-1.5"><Edit3 size={14} className="text-secondary" /> <strong>Biên tập</strong> — Tạo & sửa khảo sát</span>
          <span className="flex items-center gap-1.5"><Eye size={14} /> <strong>Chỉ xem</strong> — Xem kết quả</span>
        </div>
      )}
    </div>
  );
}
