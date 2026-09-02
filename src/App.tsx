/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy, useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { Auth } from './components/common/Auth';
import { View, Role, Survey, UserProfile } from './types';
import { Toast, ToastType } from './components/common/Toast';
import { AnimatePresence } from 'motion/react';
import { SurveyProvider, useSurvey } from './context/SurveyContext';
import { Sparkles } from 'lucide-react';

const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const Analytics = lazy(() => import('./components/dashboard/Analytics').then((m) => ({ default: m.Analytics })));
const Templates = lazy(() => import('./components/dashboard/Templates').then((m) => ({ default: m.Templates })));
const Teams = lazy(() => import('./components/dashboard/Teams').then((m) => ({ default: m.Teams })));
const Builder = lazy(() => import('./components/survey/Builder').then((m) => ({ default: m.Builder })));
const Respondent = lazy(() => import('./components/survey/Respondent').then((m) => ({ default: m.Respondent })));
const Chatbot = lazy(() => import('./components/survey/Chatbot').then((m) => ({ default: m.Chatbot })));

const Settings = lazy(() => import('./components/dashboard/Settings').then((m) => ({ default: m.Settings })));


const AppFallback = () => (
  <div className="flex h-screen items-center justify-center bg-surface-background text-text-primary">
    <div className="flex flex-col items-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <span className="text-sm font-medium">Đang tải giao diện...</span>
    </div>
  </div>
);

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Clear any previous persistent login from localStorage so exiting the browser requires logging in again
    try {
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('userRole');
    } catch (_) {}
    return sessionStorage.getItem('isAuthenticated') === 'true';
  });
  const [userRole, setUserRole] = useState<Role | null>(() => {
    return (sessionStorage.getItem('userRole') as Role) || null;
  });

  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.setItem('isAuthenticated', 'true');
    } else {
      sessionStorage.removeItem('isAuthenticated');
    }
    if (userRole) {
      sessionStorage.setItem('userRole', userRole);
    } else {
      sessionStorage.removeItem('userRole');
    }
  }, [isAuthenticated, userRole]);
  const [currentView, setCurrentView] = useState<View>(() => {
    return (localStorage.getItem('currentView') as View) || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('currentView', currentView);
  }, [currentView]);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; message: string; time: string; read: boolean }[]>([
    { id: '1', message: 'Chào mừng bạn đến với Smart Survey Hub!', time: 'Hôm nay', read: false }
  ]);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('userProfile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      name: 'Alex Chen',
      email: 'alex@company.com',
      photoURL: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop',
      tagline: 'Nhà sáng tạo Cấp 3'
    };
  });

  // Fetch user profile from DB on load
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        let envApi = (import.meta as any).env.VITE_API_URL;
        if (envApi && !envApi.endsWith('/api')) {
          envApi = envApi.endsWith('/') ? envApi + 'api' : envApi + '/api';
        }
        const apiBase = envApi || '/api';
        
        const response = await fetch(`${apiBase}/user/admin`);
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            setUserProfile(data);
            localStorage.setItem('userProfile', JSON.stringify(data));
          }
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    };
    fetchUserProfile();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('userProfile', JSON.stringify(userProfile));
    } catch (e) {
      console.error('Failed to save user profile to localStorage', e);
    }
  }, [userProfile]);

  const [shareSurveyId, setShareSurveyId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/^\/survey\/(.+)$/);
    if (match) return decodeURIComponent(match[1]);
    const params = new URLSearchParams(window.location.search);
    return params.get('survey');
  });
  const [shareSurvey, setShareSurvey] = useState<Survey | null>(null);
  const [isShareLoading, setIsShareLoading] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const match = window.location.pathname.match(/^\/survey\/(.+)$/);
    const params = new URLSearchParams(window.location.search);
    return Boolean(match || params.get('survey'));
  });
  const [shareError, setShareError] = useState<string | null>(null);

  const { fetchSurveyById, currentSurvey, setCurrentSurvey } = useSurvey();

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/survey\/(.+)$/);
    const params = new URLSearchParams(window.location.search);
    const surveyParam = params.get('survey');
    const id = match ? decodeURIComponent(match[1]) : surveyParam;
    if (id && id !== shareSurveyId) {
      setShareSurveyId(id);
    }
  }, [shareSurveyId]);

  useEffect(() => {
    if (shareSurveyId) {
      setIsShareLoading(true);
      setShareError(null);
      fetchSurveyById(shareSurveyId)
        .then(survey => {
          if (survey) {
            setShareSurvey(survey);
            setCurrentSurvey(survey);
          } else {
            const demo = {
              id: shareSurveyId,
              title: 'Bản demo: Khảo sát mẫu',
              description: 'Khảo sát mẫu để thử nghiệm',
              questions: [
                { id: 'q1', type: 'single_choice', text: 'Bạn thích màu nào?', options: ['Đỏ', 'Xanh', 'Vàng'], required: true },
                { id: 'q2', type: 'text', text: 'Lý do?', required: false }
              ],
              isQuiz: false,
              displayMode: 'single',
              showScore: true,
              createdAt: new Date().toISOString(),
              status: 'live'
            } as any;
            setShareSurvey(demo);
            setCurrentSurvey(demo);
          }
        })
        .catch(err => {
          console.error('Error loading survey:', err);
          const demo = {
            id: shareSurveyId,
            title: 'Bản demo: Khảo sát mẫu',
            description: 'Khảo sát mẫu để thử nghiệm',
            questions: [
              { id: 'q1', type: 'single_choice', text: 'Bạn thích màu nào?', options: ['Đỏ', 'Xanh', 'Vàng'], required: true },
              { id: 'q2', type: 'text', text: 'Lý do?', required: false }
            ],
            isQuiz: false,
            displayMode: 'single',
            showScore: true,
            createdAt: new Date().toISOString(),
            status: 'live'
          } as any;
          setShareSurvey(demo);
          setCurrentSurvey(demo);
        })
        .finally(() => {
          setIsShareLoading(false);
        });
    }
  }, [shareSurveyId, fetchSurveyById, setCurrentSurvey]);

  const showToast = (message: string, type: ToastType) => setToast({ message, type });

  const addNotification = (msg: string) => {
    setNotifications(prev => [{ id: Date.now().toString(), message: msg, time: 'Vừa xong', read: false }, ...prev]);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserRole(null);
    setCurrentView('dashboard');
    try {
      sessionStorage.removeItem('isAuthenticated');
      sessionStorage.removeItem('userRole');
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('userRole');
    } catch (_) {}
  };

  if (shareSurveyId) {
    if (isShareLoading) {
      return <AppFallback />;
    }

    if (shareSurvey) {
      return (
        <Suspense fallback={<AppFallback />}>
          <>
            <Respondent survey={shareSurvey} isPublic={true} onExit={() => {
              // Public exit is fully handled inside Respondent component (callExit)
            }} />
            {/* Show Chatbot for public/shared surveys as well */}
            <Chatbot survey={shareSurvey} />
            <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
          </>
        </Suspense>
      );
    }

    return (
      <div className="min-h-screen bg-surface-background flex flex-col items-center justify-center gap-4 font-sans px-4 text-center">
        <div className="w-16 h-16 bg-surface-container-high rounded-2xl flex items-center justify-center">
          <Sparkles size={28} className="text-text-secondary" />
        </div>
        <h2 className="font-display text-2xl font-bold text-text-primary">
          {shareError || 'Không tìm thấy khảo sát'}
        </h2>
        <p className="text-text-secondary text-sm max-w-md">
          Khảo sát này không tồn tại, đã bị đóng hoặc liên kết không chính xác.
        </p>
        <button
          onClick={() => window.location.replace('/')}
          className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors cursor-pointer"
        >
          Về trang chủ
        </button>
      </div>
    );
  }

  return (
    <>
      {(!isAuthenticated || !userRole) ? (
        <Auth onLogin={(role) => { setIsAuthenticated(true); setUserRole(role); }} />
      ) : (userRole === 'user' || currentView === 'respondent') ? (
        <Suspense fallback={<AppFallback />}>
          <>
            <Respondent
              survey={currentSurvey}
              onExit={() => {
                if (userRole === 'user') {
                  handleLogout();
                  return;
                }
                setCurrentView('dashboard');
              }}
            />
            <Chatbot survey={currentSurvey} />
          </>
        </Suspense>
      ) : (
        <div className="flex h-screen bg-surface-background text-text-primary font-sans overflow-hidden selection:bg-secondary-fixed selection:text-on-secondary-fixed relative">
          <Sidebar currentView={currentView} onViewChange={setCurrentView} onNewSurvey={() => setCurrentSurvey(null)} onLogout={handleLogout} userProfile={userProfile} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
          <div className="flex-1 flex flex-col overflow-hidden relative w-full">
            <TopBar 
              currentView={currentView} 
              onViewChange={setCurrentView} 
              onPublish={() => { 
                showToast('Khảo sát mới đã được đăng lên bảng điều khiển!', 'success');
                addNotification('Bạn vừa xuất bản một khảo sát mới');
              }} 
              userProfile={userProfile} 
              notifications={notifications}
              onMarkAllRead={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
              onMenuClick={() => setIsMobileMenuOpen(true)}
            />
            <main className="flex-1 overflow-y-auto relative bg-surface-background">
              <Suspense fallback={<AppFallback />}>
                {currentView === 'dashboard' && <Dashboard onViewChange={setCurrentView} userProfile={userProfile} onShowToast={showToast} onAddNotification={addNotification} />}
                {currentView === 'templates' && <Templates onViewChange={setCurrentView} />}
                {currentView === 'analytics' && <Analytics />}
                {currentView === 'teams' && <Teams />}
                {currentView === 'settings' && <Settings profile={userProfile} onUpdateProfile={setUserProfile} onClose={() => setCurrentView('dashboard')} onShowToast={showToast} onAddNotification={addNotification} />}
                {currentView === 'builder' && <Builder onPublished={() => { showToast('Khảo sát đã được xuất bản thành công!', 'success'); addNotification('Bạn vừa xuất bản một khảo sát mới'); setCurrentView('dashboard'); }} onUpdated={() => { showToast('Đã cập nhật khảo sát thành công!', 'success'); addNotification('Bạn vừa cập nhật một khảo sát'); setCurrentView('dashboard'); }} onDraftSaved={() => { showToast('Đã lưu bản nháp!', 'success'); setCurrentView('dashboard'); }} onError={(msg) => showToast(msg, 'error')} />}
              </Suspense>
            </main>
          </div>
        </div>
      )}
      <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
    </>
  );
}

export default function App() {
  return (
    <SurveyProvider>
      <AppContent />
    </SurveyProvider>
  );
}
