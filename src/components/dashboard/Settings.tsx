import { useState } from 'react';
import { Camera, Save, User, Mail, Briefcase, RefreshCw, X } from 'lucide-react';
import type { UserProfile } from '../../types';
import { ToastType } from '../common/Toast';

interface SettingsProps {
  profile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onClose?: () => void;
  onShowToast?: (message: string, type: ToastType) => void;
  onAddNotification?: (msg: string) => void;
}

export function Settings({ profile, onUpdateProfile, onClose, onShowToast, onAddNotification }: SettingsProps) {
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    // Simulate API call
    setTimeout(() => {
      onUpdateProfile(formData);
      setIsSaving(false);
      if (onShowToast) onShowToast('Cập nhật thông tin thành công!', 'success');
      if (onAddNotification) onAddNotification('Bạn vừa cập nhật thông tin cá nhân');
      if (onClose) onClose();
    }, 800);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 256;
          const MAX_HEIGHT = 256;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          setFormData(prev => ({ ...prev, photoURL: compressedBase64 }));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-in fade-in zoom-in-95 duration-500 relative">
      {onClose && (
        <button onClick={onClose} className="absolute right-2 md:right-4 top-2 md:top-4 p-2 text-text-secondary hover:text-text-primary rounded-full hover:bg-surface-container transition-colors">
          <X size={24} />
        </button>
      )}

      <div className="mb-6 md:mb-8">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-text-primary">Cài đặt tài khoản</h1>
        <p className="text-sm text-text-secondary mt-1">Cập nhật thông tin cá nhân và quản lý hồ sơ của bạn.</p>
      </div>

      <div className="bg-white rounded-3xl border border-border-subtle shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 md:p-8">
          {/* Avatar Section */}
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-center mb-10 pb-10 border-b border-border-subtle">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-surface-background shadow-md">
                <img 
                  src={formData.photoURL || "https://ui-avatars.com/api/?name=" + encodeURIComponent(formData.name)} 
                  alt="Profile" 
                  className="w-full h-full object-cover"
                />
              </div>
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Camera size={24} />
                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
              </label>
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary mb-1">Ảnh đại diện</h3>
              <p className="text-sm text-text-secondary max-w-sm">
                Nên sử dụng ảnh vuông, kích thước tối thiểu 256x256px. Định dạng JPG, PNG hoặc GIF.
              </p>
              <div className="mt-3 flex gap-3">
                <label className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-text-primary text-sm font-semibold rounded-lg cursor-pointer transition-colors">
                  Thay đổi ảnh
                  <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                </label>
              </div>
            </div>
          </div>

          {/* User Info Form */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                  <User size={16} className="text-text-secondary" />
                  Họ và tên
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                  className="w-full px-4 py-3 bg-surface-container-low border border-border-subtle rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  placeholder="Nhập họ và tên của bạn"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                  <Mail size={16} className="text-text-secondary" />
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  disabled
                  className="w-full px-4 py-3 bg-surface-container/50 border border-border-subtle rounded-xl text-text-secondary opacity-70 cursor-not-allowed"
                  placeholder="email@example.com"
                />
                <p className="text-xs text-text-secondary mt-1.5">Email không thể thay đổi vì được liên kết với tài khoản đăng nhập.</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                <Briefcase size={16} className="text-text-secondary" />
                Chức danh / Cấp bậc
              </label>
              <input
                type="text"
                value={formData.tagline}
                onChange={e => setFormData(prev => ({ ...prev, tagline: e.target.value }))}
                className="w-full px-4 py-3 bg-surface-container-low border border-border-subtle rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                placeholder="VD: Nhà sáng tạo Cấp 3, Quản lý dự án, v.v."
              />
            </div>
          </div>

          <div className="mt-10 flex justify-end">
            <button
              type="submit"
              disabled={isSaving || JSON.stringify(formData) === JSON.stringify(profile)}
              className="px-6 py-3 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? <RefreshCw size={20} className="animate-spin" /> : <Save size={20} />}
              Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
