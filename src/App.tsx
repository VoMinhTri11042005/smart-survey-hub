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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
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

  if (shareSurveyId && shareSurvey) {
    return (
      <>
        <Respondent survey={shareSurvey} onExit={() => { window.location.href = '/'; }} onComplete={() => { showToast('Cảm ơn bạn! Đã gửi khảo sát thành công.', 'success'); setTimeout(() => { window.location.href = '/'; }, 2000); }} />
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
          <Respondent survey={currentSurvey} onExit={() => { if (userRole === 'user') { setIsAuthenticated(false); setUserRole(null); } else { setCurrentView('builder'); } }} onComplete={() => { showToast('Cảm ơn bạn! Đã gửi khảo sát thành công.', 'success'); if (userRole === 'user') { setIsAuthenticated(false); setUserRole(null); } else { setCurrentView('dashboard'); } }} />
          <Chatbot survey={currentSurvey} />
        </>
      ) : (
        <div className="flex h-screen bg-surface-background text-text-primary font-sans overflow-hidden selection:bg-secondary-fixed selection:text-on-secondary-fixed">
          <Sidebar currentView={currentView} onViewChange={setCurrentView} onLogout={() => { setIsAuthenticated(false); setUserRole(null); }} userProfile={userProfile} />
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <TopBar currentView={currentView} onViewChange={setCurrentView} onPublish={() => showToast('Khảo sát mới đã được đăng lên bảng điều khiển!', 'success')} userProfile={userProfile} onNotificationClick={() => showToast('Bạn không có thông báo nào mới', 'info')} />
            <main className="flex-1 overflow-y-auto relative bg-surface-background">
              {currentView === 'dashboard' && <Dashboard onViewChange={setCurrentView} userProfile={userProfile} />}
              {currentView === 'templates' && <Templates onViewChange={setCurrentView} />}
              {currentView === 'analytics' && <Analytics />}
              {currentView === 'teams' && <Teams />}
              {currentView === 'settings' && <Settings profile={userProfile} onUpdateProfile={setUserProfile} onClose={() => setCurrentView('dashboard')} onShowToast={showToast} />}
              {currentView === 'builder' && <Builder onPublished={() => { showToast('Khảo sát đã được xuất bản thành công!', 'success'); setCurrentView('dashboard'); }} onError={(msg) => showToast(msg, 'error')} />}
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
