import {
  AlertCircle,
  CalendarDays,
  Edit3,
  Eye,
  Filter,
  Mail,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useSurvey } from '../../context/SurveyContext';
import type { TeamMember, TeamRole } from '../../types';
import type { ToastType } from '../common/Toast';

const roleOrder: TeamRole[] = ['admin', 'editor', 'viewer'];

const roleDetails: Record<TeamRole, {
  label: string;
  description: string;
  icon: ReactNode;
  badgeClass: string;
  iconClass: string;
}> = {
  admin: {
    label: 'Quản trị',
    description: 'Điều phối cấu hình nhóm',
    icon: <Shield size={15} strokeWidth={2.2} />,
    badgeClass: 'bg-primary-fixed text-primary',
    iconClass: 'bg-primary-fixed/70 text-primary',
  },
  editor: {
    label: 'Biên tập',
    description: 'Biên soạn nội dung khảo sát',
    icon: <Edit3 size={15} strokeWidth={2.2} />,
    badgeClass: 'bg-secondary-fixed text-secondary',
    iconClass: 'bg-secondary-fixed/70 text-secondary',
  },
  viewer: {
    label: 'Theo dõi',
    description: 'Theo dõi dữ liệu và kết quả',
    icon: <Eye size={15} strokeWidth={2.2} />,
    badgeClass: 'bg-surface-container text-text-secondary',
    iconClass: 'bg-surface-container-high text-text-secondary',
  },
};

const avatarClasses = [
  'bg-primary-fixed text-primary',
  'bg-secondary-fixed text-secondary',
  'bg-primary-container/20 text-primary',
  'bg-secondary-container/30 text-secondary',
];

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return initials || '?';
}

function getAvatarClass(id: string) {
  const hash = [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return avatarClasses[hash % avatarClasses.length];
}

function formatJoinedAt(joinedAt: string) {
  const date = new Date(joinedAt);
  if (Number.isNaN(date.getTime())) return 'Đang tham gia nhóm';

  return `Tham gia ${new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)}`;
}

export function Teams({ onFeedback }: { onFeedback?: (message: string, type: ToastType) => void }) {
  const { teamMembers, fetchTeamMembers, inviteTeamMember, updateTeamMember, removeTeamMember } = useSurvey();
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('viewer');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<TeamRole | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  useEffect(() => {
    void fetchTeamMembers().catch(() => {
      setError('Không thể tải danh sách thành viên. Vui lòng làm mới để thử lại.');
    });
  }, [fetchTeamMembers]);

  const roleCounts = useMemo(() => roleOrder.reduce<Record<TeamRole, number>>((counts, currentRole) => {
    counts[currentRole] = teamMembers.filter(member => member.role === currentRole).length;
    return counts;
  }, { admin: 0, editor: 0, viewer: 0 }), [teamMembers]);

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');

    return teamMembers.filter(member => {
      const matchesRole = roleFilter === 'all' || member.role === roleFilter;
      const matchesQuery = !normalizedQuery
        || member.name.toLocaleLowerCase('vi-VN').includes(normalizedQuery)
        || member.email.toLocaleLowerCase('vi-VN').includes(normalizedQuery);

      return matchesRole && matchesQuery;
    });
  }, [query, roleFilter, teamMembers]);

  const clearFilters = () => {
    setQuery('');
    setRoleFilter('all');
  };

  const handleRefresh = async () => {
    setError(null);
    setIsRefreshing(true);
    try {
      await fetchTeamMembers();
      onFeedback?.('Đã làm mới danh sách thành viên.', 'success');
    } catch {
      const message = 'Không thể làm mới danh sách thành viên. Vui lòng thử lại.';
      setError(message);
      onFeedback?.(message, 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setError('Vui lòng nhập tên thành viên.');
      return;
    }

    setError(null);
    setIsInviting(true);
    try {
      await inviteTeamMember(cleanName, cleanEmail, role);
      setName('');
      setEmail('');
      setRole('viewer');
      setShowInvite(false);
      onFeedback?.(`Đã thêm ${cleanEmail} vào nhóm.`, 'success');
    } catch (inviteError) {
      const message = inviteError instanceof Error ? inviteError.message : 'Không thể thêm thành viên.';
      setError(message);
      onFeedback?.(message, 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (member: TeamMember, newRole: TeamRole) => {
    if (member.role === newRole) return;

    setError(null);
    setUpdatingMemberId(member.id);
    try {
      await updateTeamMember(member.id, { role: newRole });
      onFeedback?.(`Đã cập nhật vai trò của ${member.name}.`, 'success');
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Không thể cập nhật vai trò.';
      setError(message);
      onFeedback?.(message, 'error');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    const confirmed = window.confirm(`Xóa ${member.name} khỏi nhóm? Thao tác này không thể hoàn tác.`);
    if (!confirmed) return;

    setError(null);
    setRemovingMemberId(member.id);
    try {
      await removeTeamMember(member.id);
      onFeedback?.(`Đã xóa ${member.name} khỏi nhóm.`, 'success');
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : 'Không thể xóa thành viên. Vui lòng thử lại.';
      setError(message);
      onFeedback?.(message, 'error');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const openInvite = () => {
    setError(null);
    setShowInvite(true);
  };

  const closeInvite = () => {
    if (isInviting) return;
    setShowInvite(false);
  };

  return (
    <div className="mx-auto max-w-7xl animate-in fade-in zoom-in-95 p-4 duration-500 sm:p-7 lg:p-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border-subtle bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary-fixed/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-1/4 h-56 w-56 rounded-full bg-secondary-fixed/30 blur-3xl" />

        <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-fixed bg-primary-fixed/40 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-primary">
              <Sparkles size={14} />
              Không gian cộng tác
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">Nhóm của bạn</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary sm:text-base">
              Tập hợp thành viên, phân công vai trò và cùng vận hành các khảo sát trong một nơi gọn gàng.
            </p>

            <div className="mt-6 flex flex-wrap gap-2.5" aria-label="Tổng quan vai trò nhóm">
              {roleOrder.map(currentRole => {
                const detail = roleDetails[currentRole];
                return (
                  <div key={currentRole} className="flex items-center gap-2 rounded-xl border border-border-subtle bg-white/80 px-3 py-2 shadow-sm">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${detail.iconClass}`}>{detail.icon}</span>
                    <span className="text-xs font-semibold text-text-secondary">{detail.label}</span>
                    <span className="font-display text-sm font-bold text-text-primary">{roleCounts[currentRole]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-white px-4 text-sm font-bold text-text-primary transition-colors hover:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-wait disabled:opacity-70"
            >
              <RefreshCw size={17} className={isRefreshing ? 'animate-spin' : ''} />
              Làm mới
            </button>
            <button
              type="button"
              onClick={openInvite}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
            >
              <UserPlus size={18} />
              Thêm thành viên
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="mt-5 flex items-start justify-between gap-3 rounded-2xl border border-sentiment-negative/30 bg-sentiment-negative/10 px-4 py-3.5 text-sm text-sentiment-negative">
          <span className="flex items-start gap-2.5 font-medium"><AlertCircle className="mt-0.5 shrink-0" size={17} />{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded-lg p-1 transition-colors hover:bg-sentiment-negative/10 focus:outline-none focus:ring-2 focus:ring-sentiment-negative/30"
            aria-label="Đóng thông báo lỗi"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {showInvite && (
        <section aria-labelledby="add-member-heading" className="mt-5 overflow-hidden rounded-2xl border border-secondary-fixed/70 bg-white shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col gap-4 border-b border-border-subtle bg-secondary-fixed/25 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-fixed text-secondary"><UserPlus size={19} /></span>
              <div>
                <h2 id="add-member-heading" className="font-display text-lg font-bold text-text-primary">Thêm thành viên vào nhóm</h2>
                <p className="mt-0.5 text-xs leading-5 text-text-secondary">Thông tin thành viên sẽ được lưu trực tiếp vào không gian làm việc này.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeInvite}
              disabled={isInviting}
              className="self-end rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-white hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 sm:self-auto"
              aria-label="Đóng biểu mẫu thêm thành viên"
            >
              <X size={19} />
            </button>
          </div>

          <form onSubmit={handleInvite} className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem_auto] lg:items-end">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold text-text-primary">Họ và tên</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ví dụ: Nguyễn Minh Anh"
                autoComplete="name"
                required
                disabled={isInviting}
                className="min-h-11 rounded-xl border border-border-subtle bg-surface-background px-3.5 text-sm text-text-primary outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold text-text-primary">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="anh@donvi.edu.vn"
                autoComplete="email"
                required
                disabled={isInviting}
                className="min-h-11 rounded-xl border border-border-subtle bg-surface-background px-3.5 text-sm text-text-primary outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold text-text-primary">Vai trò</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as TeamRole)}
                disabled={isInviting}
                className="min-h-11 cursor-pointer rounded-xl border border-border-subtle bg-surface-background px-3.5 text-sm font-medium text-text-primary outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {roleOrder.map(currentRole => <option key={currentRole} value={currentRole}>{roleDetails[currentRole].label}</option>)}
              </select>
            </label>
            <button
              type="submit"
              disabled={isInviting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
            >
              {isInviting ? <RefreshCw size={17} className="animate-spin" /> : <Mail size={17} />}
              {isInviting ? 'Đang thêm...' : 'Thêm vào nhóm'}
            </button>
          </form>
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.48fr)]">
        <section className="overflow-hidden rounded-2xl border border-border-subtle bg-white shadow-sm">
          <div className="border-b border-border-subtle px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-fixed/70 text-primary"><Users size={17} /></span>
                  <h2 className="font-display text-xl font-bold text-text-primary">Thành viên</h2>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  {teamMembers.length === 0 ? 'Chưa có thành viên nào trong nhóm.' : `${teamMembers.length} thành viên trong không gian làm việc.`}
                </p>
              </div>
              {teamMembers.length > 0 && (
                <span className="self-start rounded-full bg-surface-container-low px-3 py-1.5 text-xs font-bold text-text-secondary">
                  Hiển thị {filteredMembers.length}/{teamMembers.length}
                </span>
              )}
            </div>

            {teamMembers.length > 0 && (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Tìm theo tên hoặc email</span>
                  <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tìm theo tên hoặc email"
                    className="min-h-11 w-full rounded-xl border border-border-subtle bg-surface-background py-2 pl-10 pr-3.5 text-sm text-text-primary outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <label className="relative sm:w-44">
                  <span className="sr-only">Lọc theo vai trò</span>
                  <Filter size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                  <select
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value as TeamRole | 'all')}
                    className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-border-subtle bg-surface-background py-2 pl-10 pr-8 text-sm font-medium text-text-primary outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="all">Mọi vai trò</option>
                    {roleOrder.map(currentRole => <option key={currentRole} value={currentRole}>{roleDetails[currentRole].label}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>

          {teamMembers.length === 0 ? (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-fixed/50 text-primary"><Users size={30} /></div>
              <h3 className="mt-5 font-display text-xl font-bold text-text-primary">Bắt đầu cộng tác</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">Thêm thành viên để tổ chức nhóm nghiên cứu và phân công cách cùng làm việc.</p>
              <button
                type="button"
                onClick={openInvite}
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
              >
                <UserPlus size={17} />
                Thêm thành viên đầu tiên
              </button>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-container text-text-secondary"><Search size={25} /></div>
              <h3 className="mt-4 font-display text-lg font-bold text-text-primary">Không tìm thấy thành viên phù hợp</h3>
              <p className="mt-2 text-sm text-text-secondary">Hãy thử thay đổi từ khóa hoặc bộ lọc vai trò.</p>
              <button type="button" onClick={clearFilters} className="mt-4 text-sm font-bold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/30">Xóa bộ lọc</button>
            </div>
          ) : (
            <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
              {filteredMembers.map(member => {
                const detail = roleDetails[member.role];
                const isUpdating = updatingMemberId === member.id;
                const isRemoving = removingMemberId === member.id;

                return (
                  <article key={member.id} className="group rounded-2xl border border-border-subtle bg-surface-background p-4 transition-all hover:-translate-y-0.5 hover:border-primary-fixed-dim hover:bg-white hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${getAvatarClass(member.id)}`} aria-hidden="true">
                        {getInitials(member.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate font-display font-bold text-text-primary" title={member.name}>{member.name}</h3>
                            <p className="mt-0.5 truncate text-xs text-text-secondary" title={member.email}>{member.email}</p>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${detail.badgeClass}`}>
                            {detail.icon}
                            {detail.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-t border-border-subtle pt-3.5">
                      <label className="grid min-w-0 gap-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-secondary">Vai trò</span>
                        <select
                          value={member.role}
                          onChange={(event) => void handleRoleChange(member, event.target.value as TeamRole)}
                          disabled={isUpdating || isRemoving}
                          aria-label={`Vai trò của ${member.name}`}
                          className="min-h-10 w-full cursor-pointer rounded-lg border border-border-subtle bg-white px-2.5 text-xs font-semibold text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-wait disabled:opacity-60"
                        >
                          {roleOrder.map(currentRole => <option key={currentRole} value={currentRole}>{roleDetails[currentRole].label}</option>)}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleRemove(member)}
                        disabled={isUpdating || isRemoving}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-white text-text-secondary transition-colors hover:border-sentiment-negative/30 hover:bg-sentiment-negative/10 hover:text-sentiment-negative focus:outline-none focus:ring-2 focus:ring-sentiment-negative/20 disabled:cursor-wait disabled:opacity-60"
                        aria-label={`Xóa ${member.name} khỏi nhóm`}
                        title="Xóa thành viên"
                      >
                        {isRemoving ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>

                    <p className="mt-3 flex items-center gap-1.5 text-xs text-text-secondary">
                      <CalendarDays size={14} />
                      {formatJoinedAt(member.joinedAt)}
                      {isUpdating && <RefreshCw size={13} className="ml-auto animate-spin text-primary" aria-label="Đang cập nhật" />}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-border-subtle bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary-fixed/70 text-secondary"><Shield size={17} /></span>
              <h2 className="font-display text-lg font-bold text-text-primary">Phân bố vai trò</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-secondary">Nhìn nhanh cách nhóm đang được tổ chức theo từng vai trò.</p>

            <div className="mt-5 space-y-3">
              {roleOrder.map(currentRole => {
                const detail = roleDetails[currentRole];
                const count = roleCounts[currentRole];
                const percentage = teamMembers.length > 0 ? Math.round((count / teamMembers.length) * 100) : 0;

                return (
                  <div key={currentRole} className="rounded-xl border border-border-subtle bg-surface-background p-3.5">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${detail.iconClass}`}>{detail.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-text-primary">{detail.label}</span>
                          <span className="font-display text-lg font-bold text-text-primary">{count}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-text-secondary">{detail.description}</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-primary-fixed/80 bg-primary-fixed/25 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm"><Users size={19} /></span>
              <div>
                <h2 className="font-display text-base font-bold text-text-primary">Quản lý rõ ràng hơn</h2>
                <p className="mt-1.5 text-sm leading-6 text-text-secondary">Tìm nhanh thành viên, cập nhật vai trò ngay trên từng thẻ và luôn kiểm tra trước khi xóa khỏi nhóm.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
