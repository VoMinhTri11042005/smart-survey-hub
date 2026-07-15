import { useState } from 'react';
import { Search, Bell, Eye, Check } from 'lucide-react';
import { View, UserProfile } from '../../types';
import { useSurvey } from '../../context/SurveyContext';

export interface Notification {
  id: string;
  message: string;
  time: string;
  read: boolean;
}

interface TopBarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  onPublish?: () => void;
  userProfile?: UserProfile;
  notifications?: Notification[];
  onMarkAllRead?: () => void;
}

export function TopBar({ currentView, onViewChange, onPublish, userProfile, notifications = [], onMarkAllRead }: TopBarProps) {
  const { searchQuery, setSearchQuery } = useSurvey();
  const [showNotifications, setShowNotifications] = useState(false);
  
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="flex justify-between items-center px-6 py-4 bg-surface-background/90 backdrop-blur-md border-b border-border-subtle sticky top-0 z-10">
      <div className="flex items-center gap-4 w-1/2">
        {currentView === 'analytics' && (
          <>
            <span className="font-display text-xl font-bold text-primary tracking-tight">Smart Survey</span>
            <div className="h-6 w-px bg-border-subtle mx-2"></div>
            <span className="text-sm font-medium text-text-secondary">Trung tâm phân tích</span>
          </>
        )}
        {currentView === 'builder' && (
          <>
            <span className="font-display text-xl font-bold text-primary tracking-tight">Smart Survey</span>
            <div className="h-6 w-px bg-border-subtle mx-2"></div>
            <span className="text-sm font-medium text-text-secondary">Trình tạo khảo sát</span>
          </>
        )}
        {currentView === 'dashboard' && (
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
            <input 
              type="text" 
              placeholder="Tìm kiếm khảo sát, người phản hồi hoặc thông tin..." 
              className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low border border-transparent rounded-xl text-sm focus:bg-white focus:border-border-subtle focus:ring-2 focus:ring-secondary-container/20 outline-none transition-all"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {currentView === 'builder' && (
          <div className="flex items-center gap-3 mr-2">
             <button 
                onClick={() => onViewChange('respondent')}
                className="flex items-center gap-2 px-4 py-2 text-primary font-semibold text-sm hover:bg-surface-container-low transition-colors rounded-lg cursor-pointer"
             >
                <Eye size={18} />
                Xem trước
             </button>
             <button onClick={onPublish} className="px-6 py-2 bg-primary text-white font-semibold text-sm rounded-lg shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer">
                Xuất bản
             </button>
          </div>
        )}
        {currentView === 'analytics' && (
          <div className="hidden md:flex bg-surface-container-low rounded-full px-4 py-2 items-center gap-2 border border-border-subtle focus-within:border-primary/30 transition-colors mr-2">
            <Search className="text-text-secondary" size={16} />
            <input 
              type="text" 
              placeholder="Tìm kiếm thông tin..." 
              className="bg-transparent border-none focus:ring-0 text-sm w-48 outline-none"
            />
          </div>
        )}
        <div className="relative">
          <button onClick={() => setShowNotifications(!showNotifications)} className="relative text-text-secondary hover:text-text-primary transition-colors p-2 rounded-full hover:bg-surface-container-high/50 cursor-pointer">
            <Bell size={20} />
            {unreadCount > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-sentiment-negative rounded-full border-2 border-surface-background"></span>}
          </button>
          
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-border-subtle overflow-hidden z-50 animate-in fade-in slide-in-from-top-4 duration-200">
              <div className="p-4 border-b border-border-subtle flex justify-between items-center bg-surface-background/50">
                <h3 className="font-bold text-text-primary">Thông báo</h3>
                {unreadCount > 0 && (
                  <button onClick={onMarkAllRead} className="text-xs text-secondary font-medium hover:underline flex items-center gap-1 cursor-pointer">
                    <Check size={12} /> Đánh dấu đã đọc
                  </button>
                )}
              </div>
              <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-text-secondary text-sm">
                    Bạn không có thông báo nào.
                  </div>
                ) : (
                  notifications.map(notif => (
                    <div key={notif.id} className={`p-4 border-b border-border-subtle hover:bg-surface-container-low transition-colors cursor-pointer ${notif.read ? 'opacity-60' : 'bg-primary-fixed/10'}`}>
                      <p className="text-sm text-text-primary font-medium">{notif.message}</p>
                      <p className="text-[10px] text-text-secondary mt-1">{notif.time}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {currentView === 'dashboard' && (
          <>
            <div className="h-6 w-px bg-border-subtle mx-1"></div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-primary">Smart Survey</span>
              <span className="bg-secondary-container/20 text-secondary px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest">Enterprise</span>
            </div>
          </>
        )}
        {(currentView === 'analytics' || currentView === 'builder') && userProfile && (
           <img 
              src={userProfile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.name)}`} 
              alt={userProfile.name} 
              className="w-9 h-9 rounded-full border border-border-subtle shadow-sm ml-2 object-cover"
            />
        )}
      </div>
    </header>
  );
}
