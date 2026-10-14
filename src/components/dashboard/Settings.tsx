import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  Download,
  FileUp,
  HardDriveDownload,
  ImagePlus,
  Info,
  Mail,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import type { UserProfile } from '../../types';
import { ToastType } from '../common/Toast';
import { API_BASE, apiFetch } from '../../utils/api';

interface SettingsProps {
  profile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onClose?: () => void;
  onShowToast?: (message: string, type: ToastType) => void;
  onAddNotification?: (msg: string) => void;
}

type BackupStatus = { message: string; type: ToastType } | null;

const MAX_BACKUP_SIZE = 10 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const SUPPORTED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const profileIsEqual = (left: UserProfile, right: UserProfile) => (
  left.name === right.name
  && left.email === right.email
  && left.photoURL === right.photoURL
  && left.tagline === right.tagline
);

const formatFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function Settings({ profile, onUpdateProfile, onClose, onShowToast, onAddNotification }: SettingsProps) {
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [photoMessage, setPhotoMessage] = useState('');
  const backupInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const previousProfileRef = useRef(profile);

  const hasChanges = useMemo(() => !profileIsEqual(formData, profile), [formData, profile]);
  const displayName = formData.name.trim() || 'Chủ tài khoản';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'SH';

  useEffect(() => {
    // The authenticated profile can finish loading after this page mounts.
    // Only replace the form when it still represents the previously loaded
    // profile, so edits made in this page are never overwritten in transit.
    if (profileIsEqual(formData, previousProfileRef.current)) setFormData(profile);
    previousProfileRef.current = profile;
  }, [formData, profile]);

  const reportActivity = (message: string, type: ToastType) => {
    onShowToast?.(message, type);
    onAddNotification?.(message);
  };

  const updateForm = (updates: Partial<UserProfile>) => {
    setFormData(previous => ({ ...previous, ...updates }));
  };

  const resetProfileChanges = () => {
    setFormData(profile);
    setPhotoMessage('Đã hoàn tác các thay đổi chưa lưu.');
  };

  const closeSettings = () => {
    if (hasChanges && !window.confirm('Bạn có thay đổi hồ sơ chưa lưu. Bạn có muốn rời khỏi trang Cài đặt?')) return;
    onClose?.();
  };

  const downloadBackup = async () => {
    setIsBackupBusy(true);
    setBackupStatus(null);
    try {
      const response = await apiFetch(`${API_BASE}/backup/export`);
      if (!response.ok) throw new Error('Không thể tải bản sao lưu từ máy chủ.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smart-survey-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const message = 'Đã tải bản sao lưu. Hãy lưu tệp an toàn vì tệp có thể chứa dữ liệu khảo sát và phản hồi.';
      setBackupStatus({ message, type: 'success' });
      reportActivity('Đã tải bản sao lưu dữ liệu.', 'success');
    } catch (error) {
      console.error('Backup download failed:', error);
      const message = error instanceof Error ? error.message : 'Không thể tải bản sao lưu.';
      setBackupStatus({ message, type: 'error' });
      reportActivity(message, 'error');
    } finally {
      setIsBackupBusy(false);
    }
  };

  const selectBackupFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      const message = 'Vui lòng chọn tệp sao lưu định dạng JSON.';
      setRestoreFile(null);
      setBackupStatus({ message, type: 'error' });
      reportActivity(message, 'error');
      return;
    }
    if (file.size > MAX_BACKUP_SIZE) {
      const message = 'Tệp sao lưu vượt quá giới hạn 10 MB.';
      setRestoreFile(null);
      setBackupStatus({ message, type: 'error' });
      reportActivity(message, 'error');
      return;
    }

    setRestoreFile(file);
    setBackupStatus({
      message: `Đã chọn “${file.name}”. Kiểm tra thông tin rồi xác nhận khôi phục khi sẵn sàng.`,
      type: 'info',
    });
  };

  const importBackupFile = async () => {
    if (!restoreFile) return;
    const unsavedProfileWarning = hasChanges
      ? '\n\nLưu ý: Bạn có thay đổi hồ sơ chưa lưu. Trang sẽ tải lại sau khi khôi phục nên các thay đổi này sẽ bị mất.'
      : '';
    if (!window.confirm(`Khôi phục từ “${restoreFile.name}” bằng cách gộp các bản ghi còn thiếu? Dữ liệu hiện tại sẽ không bị ghi đè.${unsavedProfileWarning}`)) return;

    setIsBackupBusy(true);
    setBackupStatus(null);
    try {
      const parsed: unknown = JSON.parse(await restoreFile.text());
      if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { surveys?: unknown }).surveys)
        || !Array.isArray((parsed as { responses?: unknown }).responses)) {
        throw new Error('Tệp không phải bản sao lưu Smart Survey Hub hợp lệ.');
      }
      const response = await apiFetch(`${API_BASE}/backup/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Confirm-Action': 'import-backup' },
        body: JSON.stringify(parsed),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Không thể khôi phục bản sao lưu.');
      setRestoreFile(null);
      setBackupStatus({ message: 'Khôi phục thành công. Dữ liệu mới sẽ được tải lại ngay bây giờ.', type: 'success' });
      reportActivity('Đã khôi phục dữ liệu từ bản sao lưu.', 'success');
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      console.error('Backup restore failed:', error);
      const message = error instanceof Error ? error.message : 'Không thể khôi phục bản sao lưu.';
      setBackupStatus({ message, type: 'error' });
      reportActivity(message, 'error');
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasChanges) return;
    setIsSaving(true);

    try {
      const response = await apiFetch(`${API_BASE}/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'admin', ...formData }),
      });

      if (!response.ok) throw new Error('Không thể đồng bộ thông tin tài khoản.');
      onUpdateProfile(formData);
      reportActivity('Đã cập nhật thông tin tài khoản.', 'success');
      onClose?.();
    } catch (error) {
      console.error('Profile update failed:', error);
      reportActivity(error instanceof Error ? error.message : 'Lỗi kết nối mạng!', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!SUPPORTED_AVATAR_TYPES.has(file.type)) {
      setPhotoMessage('Vui lòng chọn ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setPhotoMessage('Ảnh đại diện vượt quá giới hạn 5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setPhotoMessage('Không thể đọc tệp ảnh. Vui lòng thử lại.');
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => setPhotoMessage('Tệp đã chọn không thể dùng làm ảnh đại diện.');
      image.onload = () => {
        const maxSize = 256;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          setPhotoMessage('Không thể tối ưu ảnh đại diện. Vui lòng thử lại.');
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        updateForm({ photoURL: canvas.toDataURL('image/jpeg', 0.8) });
        setPhotoMessage('Ảnh đã được tối ưu để lưu nhanh hơn. Nhấn “Lưu thay đổi” để đồng bộ.');
      };
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const backupStatusClasses = backupStatus?.type === 'error'
    ? 'border-sentiment-negative/25 bg-sentiment-negative/10 text-sentiment-negative'
    : backupStatus?.type === 'success'
      ? 'border-sentiment-positive/25 bg-sentiment-positive/10 text-sentiment-positive'
      : 'border-secondary/20 bg-secondary-fixed/40 text-on-secondary-fixed-variant';

  return (
    <div className="mx-auto max-w-6xl animate-in fade-in zoom-in-95 p-4 duration-500 md:p-8">
      <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-gradient-to-br from-surface-container-lowest via-surface-container-lowest to-primary-fixed/45 p-5 shadow-sm md:p-7">
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-secondary-container/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-primary-fixed-dim/30 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-primary text-lg font-bold text-white shadow-lg shadow-primary/20 sm:h-20 sm:w-20">
                {formData.photoURL ? (
                  <img src={formData.photoURL} alt={`Ảnh đại diện của ${displayName}`} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-sentiment-positive text-white" title="Hồ sơ sẵn sàng">
                <BadgeCheck size={12} aria-hidden="true" />
              </span>
            </div>
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary-fixed/75 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                <ShieldCheck size={13} /> Khu vực tài khoản
              </div>
              <h1 className="truncate font-display text-2xl font-bold tracking-tight text-text-primary md:text-3xl">Cài đặt & dữ liệu</h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">Quản lý hồ sơ cá nhân và tạo bản sao dữ liệu khảo sát một cách an toàn.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${hasChanges ? 'bg-sentiment-neutral/10 text-sentiment-neutral' : 'bg-sentiment-positive/10 text-sentiment-positive'}`}>
              {hasChanges ? <Info size={15} /> : <CheckCircle2 size={15} />}
              {hasChanges ? 'Có thay đổi chưa lưu' : 'Thông tin đã đồng bộ'}
            </span>
            {onClose && (
              <button
                type="button"
                onClick={closeSettings}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-white/80 text-text-secondary transition-colors hover:border-primary/25 hover:bg-surface-container-low hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="Quay lại trang khảo sát"
                title="Quay lại"
              >
                <X size={19} />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-3xl border border-border-subtle bg-surface-container-lowest shadow-sm xl:col-span-7">
          <div className="border-b border-border-subtle p-5 md:p-7">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary">
                <User size={21} />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-text-primary">Hồ sơ cá nhân</h2>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">Thông tin này xuất hiện trên thanh điều hướng và trong không gian làm việc của bạn.</p>
              </div>
            </div>
          </div>

          <div className="space-y-7 p-5 md:p-7">
            <div className="flex flex-col gap-5 rounded-2xl border border-border-subtle bg-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-primary text-base font-bold text-white shadow-sm">
                  {formData.photoURL ? (
                    <img src={formData.photoURL} alt={`Ảnh đại diện xem trước của ${displayName}`} className="h-full w-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-text-primary">Ảnh đại diện</h3>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">JPG, PNG hoặc WebP; tối đa 5 MB. Ảnh được tối ưu về kích thước 256 px trước khi lưu.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => avatarInput.current?.click()}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-white px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:border-primary/30 hover:bg-primary-fixed/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <ImagePlus size={17} /> Thay ảnh
              </button>
              <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePhotoUpload} />
            </div>
            {photoMessage && <p role="status" className="rounded-xl bg-surface-container-low px-3 py-2 text-xs leading-relaxed text-text-secondary">{photoMessage}</p>}

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="settings-name" className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <User size={16} className="text-text-secondary" /> Họ và tên
                </label>
                <input
                  id="settings-name"
                  type="text"
                  value={formData.name}
                  onChange={event => updateForm({ name: event.target.value })}
                  required
                  className="w-full rounded-xl border border-border-subtle bg-surface-container-low px-4 py-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 focus:border-primary/30 focus:bg-white focus:ring-2 focus:ring-primary/20"
                  placeholder="Nhập họ và tên của bạn"
                />
              </div>
              <div>
                <label htmlFor="settings-email" className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Mail size={16} className="text-text-secondary" /> Email hiển thị
                </label>
                <input
                  id="settings-email"
                  type="email"
                  value={formData.email}
                  onChange={event => updateForm({ email: event.target.value })}
                  required
                  className="w-full rounded-xl border border-border-subtle bg-surface-container-low px-4 py-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 focus:border-primary/30 focus:bg-white focus:ring-2 focus:ring-primary/20"
                  placeholder="Nhập địa chỉ email của bạn"
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-text-secondary">Chỉ cập nhật hồ sơ Smart Survey, không thay đổi email đăng nhập.</p>
              </div>
            </div>

            <div>
              <label htmlFor="settings-tagline" className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Briefcase size={16} className="text-text-secondary" /> Chức danh / cấp bậc
              </label>
              <input
                id="settings-tagline"
                type="text"
                value={formData.tagline}
                onChange={event => updateForm({ tagline: event.target.value })}
                className="w-full rounded-xl border border-border-subtle bg-surface-container-low px-4 py-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-secondary/70 focus:border-primary/30 focus:bg-white focus:ring-2 focus:ring-primary/20"
                placeholder="Ví dụ: Nhà sáng tạo Cấp 3, Quản lý dự án"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border-subtle bg-surface-container-low/65 p-5 sm:flex-row sm:items-center sm:justify-between md:px-7">
            <p className="text-xs leading-relaxed text-text-secondary">{hasChanges ? 'Bạn có thay đổi chưa được đồng bộ.' : 'Mọi thay đổi hồ sơ đã được đồng bộ.'}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resetProfileChanges}
                disabled={!hasChanges || isSaving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-white hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RotateCcw size={16} /> Hoàn tác
              </button>
              <button
                type="submit"
                disabled={isSaving || !hasChanges}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? <RefreshCw size={17} className="animate-spin" /> : <Save size={17} />}
                {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-6 xl:col-span-5">
          <section className="overflow-hidden rounded-3xl border border-border-subtle bg-surface-container-lowest shadow-sm">
            <div className="border-b border-border-subtle p-5 md:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary-fixed text-on-secondary-fixed-variant">
                  <HardDriveDownload size={21} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-text-primary">Sao lưu dữ liệu</h2>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">Xuất hoặc khôi phục dữ liệu khảo sát và phản hồi bằng tệp JSON.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5 md:p-6">
              <div className="rounded-2xl border border-sentiment-neutral/25 bg-sentiment-neutral/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-sentiment-neutral" />
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Lưu ý trước khi khôi phục</h3>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">Hệ thống chỉ gộp các bản ghi còn thiếu từ bản sao lưu. Dữ liệu đang có không bị ghi đè hoặc xóa.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-surface-container-low p-3">
                  <p className="font-bold uppercase tracking-wider text-text-secondary">Định dạng</p>
                  <p className="mt-1 font-semibold text-text-primary">JSON</p>
                </div>
                <div className="rounded-xl bg-surface-container-low p-3">
                  <p className="font-bold uppercase tracking-wider text-text-secondary">Giới hạn tệp</p>
                  <p className="mt-1 font-semibold text-text-primary">Tối đa 10 MB</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void downloadBackup()}
                disabled={isBackupBusy}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-sm shadow-primary/15 transition-colors hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBackupBusy && !restoreFile ? <RefreshCw size={17} className="animate-spin" /> : <Download size={17} />}
                Tải bản sao lưu
              </button>

              <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-container-low/55 p-4">
                <p className="text-sm font-semibold text-text-primary">Khôi phục từ bản sao lưu</p>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">Chọn một tệp JSON đã tải từ Smart Survey Hub để kiểm tra trước khi nhập.</p>
                <div className="mt-3 flex flex-col gap-2 2xl:flex-row">
                  <button
                    type="button"
                    onClick={() => backupInput.current?.click()}
                    disabled={isBackupBusy}
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border-subtle bg-white px-4 text-sm font-semibold text-text-primary transition-colors hover:border-primary/30 hover:bg-primary-fixed/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FileUp size={16} /> Chọn tệp JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => void importBackupFile()}
                    disabled={isBackupBusy || !restoreFile}
                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary-fixed px-4 text-sm font-bold text-primary transition-colors hover:bg-primary-fixed-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBackupBusy && restoreFile ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    Xác nhận khôi phục
                  </button>
                  <input ref={backupInput} type="file" accept="application/json,.json" className="hidden" onChange={selectBackupFile} />
                </div>
                {restoreFile && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-secondary/15 bg-secondary-fixed/35 px-3 py-2 text-xs">
                    <span className="min-w-0 truncate font-semibold text-text-primary" title={restoreFile.name}>{restoreFile.name}</span>
                    <span className="shrink-0 text-text-secondary">{formatFileSize(restoreFile.size)}</span>
                  </div>
                )}
              </div>

              {backupStatus && (
                <p
                  role={backupStatus.type === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                  className={`rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${backupStatusClasses}`}
                >
                  {backupStatus.message}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-border-subtle bg-surface-container-low p-5 md:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sentiment-positive/10 text-sentiment-positive">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-text-primary">An toàn dữ liệu</h2>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-text-secondary">
                  <li>• Bản sao lưu có thể chứa câu trả lời của người tham gia.</li>
                  <li>• Chỉ khôi phục tệp từ nguồn tin cậy.</li>
                  <li>• Tải một bản sao lưu trước khi thực hiện thay đổi lớn.</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
