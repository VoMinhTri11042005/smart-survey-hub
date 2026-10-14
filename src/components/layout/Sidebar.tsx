import { LayoutDashboard, FileText, PieChart, Users, Plus, LogOut, Settings, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { View, UserProfile } from '../../types';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  onLogout: () => void;
  userProfile?: UserProfile;
  isOpen?: boolean;
  isCollapsed?: boolean;
  onCollapseToggle?: () => void;
  onClose?: () => void;
  onNewSurvey?: () => void;
}

export function Sidebar({ currentView, onViewChange, onLogout, userProfile, isOpen, isCollapsed = false, onCollapseToggle, onClose, onNewSurvey }: SidebarProps) {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="absolute inset-0 bg-surface-background/80 backdrop-blur-sm z-[90] md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Content */}
      <aside
        id="app-sidebar"
        aria-label="Điều hướng chính"
        className={`absolute md:relative inset-y-0 w-64 bg-surface-container border-r border-border-subtle flex flex-col h-full flex-shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out z-[100] ${isOpen ? 'left-0' : '-left-64 md:left-0'} ${isCollapsed ? 'md:w-20' : 'md:w-64'}`}
      >
        <div className={`p-6 pb-4 flex items-center justify-between ${isCollapsed ? 'md:p-3 md:pb-2 md:justify-center' : ''}`}>
          <div>
            <h1 className={`font-display text-4xl font-bold text-primary tracking-tight leading-none ${isCollapsed ? 'md:hidden' : ''}`}>SH</h1>
            <div className={`mt-6 ${isCollapsed ? 'md:hidden' : ''}`}>
              <div className="font-display text-xl font-semibold text-primary">Trung tâm Sáng tạo</div>
              <div className="text-text-secondary text-xs mt-1 font-medium">Điều phối Thông minh</div>
            </div>
          </div>
          {onCollapseToggle && (
            <button
              type="button"
              onClick={onCollapseToggle}
              className="hidden md:inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-text-secondary transition-colors hover:bg-surface-container-high hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
              aria-label={isCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
              aria-controls="app-sidebar"
              aria-expanded={!isCollapsed}
              title={isCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            >
              {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
          )}
          {/* Close button for mobile */}
          <button 
            onClick={onClose}
            className="md:hidden p-2 text-text-secondary hover:text-text-primary hover:bg-surface-container-high rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      
      <nav className={`flex-1 px-4 py-2 space-y-2 ${isCollapsed ? 'md:px-2' : ''}`}>
        <button 
          onClick={() => { onViewChange('dashboard'); onClose?.(); }}
          aria-label="Khảo sát của tôi"
          title="Khảo sát của tôi"
          className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold cursor-pointer group active:scale-[0.98] ${isCollapsed ? 'md:justify-center md:px-2' : ''} ${
            currentView === 'dashboard' 
              ? 'bg-primary/10 text-primary' 
              : 'text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
          }`}
        >
          {currentView === 'dashboard' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-primary rounded-r-full animate-in slide-in-from-left-2" />
          )}
          <LayoutDashboard size={18} className={`transition-transform duration-300 ${currentView === 'dashboard' ? 'text-primary scale-110' : 'group-hover:scale-110'}`} />
          <span className={isCollapsed ? 'md:hidden' : ''}>Khảo sát của tôi</span>
        </button>

        <button 
          onClick={() => { onViewChange('templates'); onClose?.(); }}
          aria-label="Mẫu"
          title="Mẫu"
          className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold cursor-pointer group active:scale-[0.98] ${isCollapsed ? 'md:justify-center md:px-2' : ''} ${
            currentView === 'templates' 
              ? 'bg-primary/10 text-primary' 
              : 'text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
          }`}
        >
          {currentView === 'templates' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-primary rounded-r-full animate-in slide-in-from-left-2" />
          )}
          <FileText size={18} className={`transition-transform duration-300 ${currentView === 'templates' ? 'text-primary scale-110' : 'group-hover:scale-110'}`} />
          <span className={isCollapsed ? 'md:hidden' : ''}>Mẫu</span>
        </button>

        <button 
          onClick={() => { onViewChange('analytics'); onClose?.(); }}
          aria-label="Phân tích"
          title="Phân tích"
          className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold cursor-pointer group active:scale-[0.98] ${isCollapsed ? 'md:justify-center md:px-2' : ''} ${
            currentView === 'analytics' 
              ? 'bg-primary/10 text-primary' 
              : 'text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
          }`}
        >
          {currentView === 'analytics' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-primary rounded-r-full animate-in slide-in-from-left-2" />
          )}
          <PieChart size={18} className={`transition-transform duration-300 ${currentView === 'analytics' ? 'text-primary scale-110' : 'group-hover:scale-110'}`} />
          <span className={isCollapsed ? 'md:hidden' : ''}>Phân tích</span>
        </button>

        <button 
          onClick={() => { onViewChange('teams'); onClose?.(); }}
          aria-label="Nhóm"
          title="Nhóm"
          className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold cursor-pointer group active:scale-[0.98] ${isCollapsed ? 'md:justify-center md:px-2' : ''} ${
            currentView === 'teams' 
              ? 'bg-primary/10 text-primary' 
              : 'text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
          }`}
        >
          {currentView === 'teams' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-primary rounded-r-full animate-in slide-in-from-left-2" />
          )}
          <Users size={18} className={`transition-transform duration-300 ${currentView === 'teams' ? 'text-primary scale-110' : 'group-hover:scale-110'}`} />
          <span className={isCollapsed ? 'md:hidden' : ''}>Nhóm</span>
        </button>
      </nav>

      <div className={`p-4 space-y-4 mt-auto ${isCollapsed ? 'md:p-2 md:space-y-3' : ''}`}>
         <button
           onClick={() => { onNewSurvey?.(); onViewChange('builder'); onClose?.(); }}
           aria-label="Khảo sát mới"
           title="Khảo sát mới"
           className={`w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm cursor-pointer ${isCollapsed ? 'md:px-2' : ''}`}
         >
            <Plus size={18} />
            <span className={isCollapsed ? 'md:hidden' : ''}>Khảo sát mới</span>
         </button>
         
         {userProfile && (
           <div className={`flex flex-col rounded-xl bg-surface-container-low border border-border-subtle/50 group overflow-hidden ${isCollapsed ? 'md:bg-transparent md:border-0 md:overflow-visible' : ''}`}>
             <div className={`flex items-center gap-3 px-3 py-3 ${isCollapsed ? 'md:justify-center md:px-0' : ''}`}>
               <img 
                 src={userProfile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.name)}`} 
                 alt={userProfile.name} 
                 className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover"
               />
               <div className={`flex flex-col flex-1 truncate ${isCollapsed ? 'md:hidden' : ''}`}>
                 <span className="text-sm font-semibold text-text-primary truncate">{userProfile.name}</span>
                 <span className="text-[10px] text-text-secondary uppercase tracking-wider font-bold truncate">{userProfile.tagline}</span>
               </div>
             </div>
             
             <div className={`flex items-center border-t border-border-subtle/50 bg-white/50 ${isCollapsed ? 'md:flex-col md:gap-1 md:border-t-0 md:bg-transparent' : ''}`}>
               <button 
                 onClick={() => { onViewChange('settings'); onClose?.(); }} 
                 className={`flex-1 p-2.5 flex items-center justify-center gap-2 text-xs font-semibold hover:bg-surface-container transition-colors cursor-pointer ${isCollapsed ? 'md:flex-none md:w-10 md:p-2' : ''} ${currentView === 'settings' ? 'text-primary' : 'text-text-secondary'}`}
                 title="Cài đặt tài khoản"
                 aria-label="Cài đặt tài khoản"
               >
                 <Settings size={14} />
                 <span className={isCollapsed ? 'md:hidden' : ''}>Cài đặt</span>
               </button>
               <div className={`w-px h-4 bg-border-subtle ${isCollapsed ? 'md:hidden' : ''}`}></div>
               <button 
                 onClick={onLogout} 
                 className={`flex-1 p-2.5 flex items-center justify-center gap-2 text-xs font-semibold text-sentiment-negative hover:bg-sentiment-negative/5 transition-colors cursor-pointer ${isCollapsed ? 'md:flex-none md:w-10 md:p-2' : ''}`}
                 title="Đăng xuất"
                 aria-label="Đăng xuất"
               >
                 <LogOut size={14} />
                 <span className={isCollapsed ? 'md:hidden' : ''}>Đăng xuất</span>
               </button>
             </div>
           </div>
         )}
      </div>
    </aside>
    </>
  );
}
