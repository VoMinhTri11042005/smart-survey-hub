/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { Dashboard } from './components/dashboard/Dashboard';
import { Analytics } from './components/dashboard/Analytics';
import { Templates } from './components/dashboard/Templates';
import { Teams } from './components/dashboard/Teams';
import { Builder } from './components/survey/Builder';
import { Respondent } from './components/survey/Respondent';
import { Auth } from './components/common/Auth';
import { Chatbot } from './components/survey/Chatbot';
import { Settings } from './components/dashboard/Settings';
import { View, Role, Survey, UserProfile } from './types';
import { Toast, ToastType } from './components/common/Toast';
import { AnimatePresence } from 'motion/react';
import { SurveyProvider, useSurvey } from './context/SurveyContext';
import { SURVEY_TEMPLATES } from './data/templates';

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
  const [currentView, setCurrentView] = useState<View>('dashboard');
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
      <>
        <Respondent survey={shareSurvey} isPublic={true} onExit={() => { window.location.href = '/'; }} />
        <Chatbot survey={shareSurvey} />
        <AnimatePresence>{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>
      </>
    );
  }

  return (
    <>
      {(!isAuthenticated || !userRole) ? (
        <Auth onLogin={(role) => { setIsAuthenticated(true); setUserRole(role); }} />
      ) : (userRole === 'user' || currentView === 'respondent') ? (
        <>
          <Respondent survey={currentSurvey} onExit={() => { if (userRole === 'user') { setIsAuthenticated(false); setUserRole(null); } else { setCurrentView('dashboard'); } }} />
          <Chatbot survey={currentSurvey} />
        </>
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
              {currentView === 'dashboard' && <Dashboard onViewChange={setCurrentView} userProfile={userProfile} />}
              {currentView === 'templates' && <Templates onViewChange={setCurrentView} />}
              {currentView === 'analytics' && <Analytics />}
              {currentView === 'teams' && <Teams />}
              {currentView === 'settings' && <Settings profile={userProfile} onUpdateProfile={setUserProfile} onClose={() => setCurrentView('dashboard')} onShowToast={showToast} onAddNotification={addNotification} />}
              {currentView === 'builder' && <Builder onPublished={() => { showToast('Khảo sát đã được xuất bản thành công!', 'success'); addNotification('Bạn vừa xuất bản một khảo sát mới'); setCurrentView('dashboard'); }} onError={(msg) => showToast(msg, 'error')} />}
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
