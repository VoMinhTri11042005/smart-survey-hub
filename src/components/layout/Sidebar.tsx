import { LayoutDashboard, FileText, PieChart, Users, Plus, LogOut, Settings } from 'lucide-react';
import { View, UserProfile } from '../../types';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  onLogout: () => void;
  userProfile?: UserProfile;
}

export function Sidebar({ currentView, onViewChange, onLogout, userProfile }: SidebarProps) {
  return (
    <aside className="w-64 bg-surface-container border-r border-border-subtle flex flex-col h-full flex-shrink-0 transition-all">
      <div className="p-6 pb-4">
        <h1 className="font-display text-4xl font-bold text-primary tracking-tight leading-none">SH</h1>
        <div className="mt-6">
          <div className="font-display text-xl font-semibold text-primary">Trung tâm Sáng tạo</div>
          <div className="text-text-secondary text-xs mt-1 font-medium">Điều phối Thông minh</div>
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-2 space-y-2">
        <button 
          onClick={() => onViewChange('dashboard')}
          className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold cursor-pointer group active:scale-[0.98] ${
            currentView === 'dashboard' 
              ? 'bg-primary/10 text-primary' 
              : 'text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
          }`}
        >
          {currentView === 'dashboard' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-primary rounded-r-full animate-in slide-in-from-left-2" />
          )}
          <LayoutDashboard size={18} className={`transition-transform duration-300 ${currentView === 'dashboard' ? 'text-primary scale-110' : 'group-hover:scale-110'}`} />
          Khảo sát của tôi
        </button>

        <button 
          onClick={() => onViewChange('templates')}
          className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold cursor-pointer group active:scale-[0.98] ${
            currentView === 'templates' 
              ? 'bg-primary/10 text-primary' 
              : 'text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
          }`}
        >
          {currentView === 'templates' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-primary rounded-r-full animate-in slide-in-from-left-2" />
          )}
          <FileText size={18} className={`transition-transform duration-300 ${currentView === 'templates' ? 'text-primary scale-110' : 'group-hover:scale-110'}`} />
          Mẫu
        </button>

        <button 
          onClick={() => onViewChange('analytics')}
          className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold cursor-pointer group active:scale-[0.98] ${
            currentView === 'analytics' 
              ? 'bg-primary/10 text-primary' 
              : 'text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
          }`}
        >
          {currentView === 'analytics' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-primary rounded-r-full animate-in slide-in-from-left-2" />
          )}
          <PieChart size={18} className={`transition-transform duration-300 ${currentView === 'analytics' ? 'text-primary scale-110' : 'group-hover:scale-110'}`} />
          Phân tích
        </button>

        <button 
          onClick={() => onViewChange('teams')}
          className={`relative w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold cursor-pointer group active:scale-[0.98] ${
            currentView === 'teams' 
              ? 'bg-primary/10 text-primary' 
              : 'text-text-secondary hover:bg-surface-container-high hover:text-text-primary'
          }`}
        >
          {currentView === 'teams' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1/2 bg-primary rounded-r-full animate-in slide-in-from-left-2" />
          )}
          <Users size={18} className={`transition-transform duration-300 ${currentView === 'teams' ? 'text-primary scale-110' : 'group-hover:scale-110'}`} />
          Nhóm
        </button>
      </nav>

      <div className="p-4 space-y-4 mt-auto">
         <button onClick={() => onViewChange('builder')} className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm cursor-pointer">
            <Plus size={18} />
            Khảo sát mới
         </button>
         
         {userProfile && (
           <div className="flex flex-col rounded-xl bg-surface-container-low border border-border-subtle/50 group overflow-hidden">
             <div className="flex items-center gap-3 px-3 py-3">
               <img 
                 src={userProfile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.name)}`} 
                 alt={userProfile.name} 
                 className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover"
               />
               <div className="flex flex-col flex-1 truncate">
                 <span className="text-sm font-semibold text-text-primary truncate">{userProfile.name}</span>
                 <span className="text-[10px] text-text-secondary uppercase tracking-wider font-bold truncate">{userProfile.tagline}</span>
               </div>
             </div>
             
             <div className="flex items-center border-t border-border-subtle/50 bg-white/50">
               <button 
                 onClick={() => onViewChange('settings')} 
                 className={`flex-1 p-2.5 flex items-center justify-center gap-2 text-xs font-semibold hover:bg-surface-container transition-colors cursor-pointer ${currentView === 'settings' ? 'text-primary' : 'text-text-secondary'}`}
                 title="Cài đặt tài khoản"
               >
                 <Settings size={14} />
                 Cài đặt
               </button>
               <div className="w-px h-4 bg-border-subtle"></div>
               <button 
                 onClick={onLogout} 
                 className="flex-1 p-2.5 flex items-center justify-center gap-2 text-xs font-semibold text-sentiment-negative hover:bg-sentiment-negative/5 transition-colors cursor-pointer"
                 title="Đăng xuất"
               >
                 <LogOut size={14} />
                 Đăng xuất
               </button>
             </div>
           </div>
         )}
      </div>
    </aside>
  );
}
