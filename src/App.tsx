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
    return localStorage.getItem('isAuthenticated') === 'true';
  });
  const [userRole, setUserRole] = useState<Role | null>(() => {
    return (localStorage.getItem('userRole') as Role) || null;
  });

  useEffect(() => {
    localStorage.setItem('isAuthenticated', isAuthenticated.toString());
    if (userRole) {
      localStorage.setItem('userRole', userRole);
    } else {
      localStorage.removeItem('userRole');
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
          const data = await response.json();
          setUserProfile(data);
          localStorage.setItem('userProfile', JSON.stringify(data));
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
  const [shareSurveyId, setShareSurveyId] = useState<string | null>(null);
  const [shareSurvey, setShareSurvey] = useState<Survey | null>(null);

  const { fetchSurveyById, currentSurvey, setCurrentSurvey } = useSurvey();

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/survey\/(.+)$/);
    if (match) setShareSurveyId(match[1]);
    const params = new URLSearchParams(window.location.search);
    const surveyParam = params.get('survey');
    if (surveyParam) setShareSurveyId(surveyParam);
  }, []);

  useEffect(() => {
    if (shareSurveyId) {
      fetchSurveyById(shareSurveyId).then(survey => {
        if (survey) { setShareSurvey(survey); setCurrentSurvey(survey); }
      });
    }
  }, [shareSurveyId, fetchSurveyById, setCurrentSurvey]);

  const showToast = (message: string, type: ToastType) => setToast({ message, type });

  const addNotification = (msg: string) => {
    setNotifications(prev => [{ id: Date.now().toString(), message: msg, time: 'Vừa xong', read: false }, ...prev]);
  };

  if (shareSurveyId && shareSurvey) {
    return (
      <Suspense fallback={<AppFallback />}>
        <>
          <Respondent survey={shareSurvey} isPublic={true} onExit={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              window.location.href = '/';
            }
          }} />
          <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
        </>
      </Suspense>
    );
  }

  return (
    <>
      {(!isAuthenticated || !userRole) ? (
        <Auth onLogin={(role) => { setIsAuthenticated(true); setUserRole(role); }} />
      ) : (userRole === 'user' || currentView === 'respondent') ? (
        <Suspense fallback={<AppFallback />}>
          <>
            <Respondent survey={currentSurvey} onExit={() => { if (userRole === 'user') { setIsAuthenticated(false); setUserRole(null); } else { setCurrentView('dashboard'); } }} />
            <Chatbot survey={currentSurvey} />
          </>
        </Suspense>
      ) : (
        <div className="flex h-screen bg-surface-background text-text-primary font-sans overflow-hidden selection:bg-secondary-fixed selection:text-on-secondary-fixed relative">
          <Sidebar currentView={currentView} onViewChange={setCurrentView} onLogout={() => { setIsAuthenticated(false); setUserRole(null); }} userProfile={userProfile} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
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
                {currentView === 'builder' && <Builder onPublished={() => { showToast('Khảo sát đã được xuất bản thành công!', 'success'); addNotification('Bạn vừa xuất bản một khảo sát mới'); setCurrentView('dashboard'); }} onError={(msg) => showToast(msg, 'error')} />}
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
