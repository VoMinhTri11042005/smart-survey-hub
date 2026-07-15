import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Survey, SurveyQuestion, SurveyResponse, SurveyTemplateData, TeamMember, TeamRole } from '../types';
import { db } from '../services/firebase';
import { ref, get, set, push, remove, query, orderByChild } from 'firebase/database';

interface SurveyContextType {
  surveys: Survey[];
  currentSurvey: Survey | null;
  isLoading: boolean;
  pendingTemplate: SurveyTemplateData | null;
  teamMembers: TeamMember[];
  searchQuery: string;

  fetchSurveys: () => Promise<void>;
  fetchSurveyById: (id: string) => Promise<Survey | null>;
  createSurvey: (survey: Omit<Survey, 'id' | 'createdAt' | 'status'> & { status?: string }) => Promise<Survey>;
  deleteSurvey: (id: string) => Promise<void>;
  setCurrentSurvey: (survey: Survey | null) => void;
  setSearchQuery: (query: string) => void;

  submitResponse: (surveyId: string, answers: Record<string, string | string[] | number>) => Promise<void>;
  fetchResponses: (surveyId: string) => Promise<SurveyResponse[]>;

  parseDocx: (file: File | null, topic: string) => Promise<{ title: string; questions: SurveyQuestion[] }>;
  chatWithAI: (message: string, surveyTitle: string, surveyDescription: string, questions: SurveyQuestion[], currentQuestionIndex?: number) => Promise<string>;

  loadTemplate: (template: SurveyTemplateData) => void;
  clearPendingTemplate: () => void;

  fetchTeamMembers: () => Promise<void>;
  inviteTeamMember: (name: string, email: string, role: TeamRole) => Promise<TeamMember>;
  updateTeamMember: (id: string, updates: { name?: string; role?: TeamRole }) => Promise<TeamMember>;
  removeTeamMember: (id: string) => Promise<void>;
}

const SurveyContext = createContext<SurveyContextType | null>(null);

let envApi = (import.meta as any).env.VITE_API_URL;
if (envApi && !envApi.endsWith('/api')) {
  envApi = envApi.endsWith('/') ? envApi + 'api' : envApi + '/api';
}
const API_BASE = envApi || '/api';

export function SurveyProvider({ children }: { children: ReactNode }) {
  const [surveys, setSurveys] = useState<Survey[]>(() => {
    try {
      const saved = localStorage.getItem('surveys');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });
  
  useEffect(() => {
    try {
      localStorage.setItem('surveys', JSON.stringify(surveys));
    } catch (e) {}
  }, [surveys]);

  const [currentSurvey, setCurrentSurvey] = useState<Survey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<SurveyTemplateData | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSurveys = useCallback(async () => {
    try {
      const surveysRef = query(ref(db, 'surveys'), orderByChild('createdAt'));
      const snapshot = await get(surveysRef);
      if (snapshot.exists()) {
        const data: Survey[] = [];
        snapshot.forEach((childSnapshot) => {
          data.push({ id: childSnapshot.key as string, ...childSnapshot.val() });
        });
        setSurveys(data.reverse());
      } else {
        setSurveys([]);
      }
    } catch (error) {
      console.error('Error fetching surveys from Database:', error);
      // Fallback
      const saved = localStorage.getItem('surveys');
      if (saved) setSurveys(JSON.parse(saved));
    }
  }, []);

  const fetchSurveyById = useCallback(async (id: string): Promise<Survey | null> => {
    try {
      const snapshot = await get(ref(db, `surveys/${id}`));
      if (snapshot.exists()) {
        return { id, ...snapshot.val() } as Survey;
      }
      return null;
    } catch (error) {
      console.error('Error fetching survey by id from Database:', error);
      // Fallback
      const saved = localStorage.getItem('surveys');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const found = parsed.find((s: Survey) => s.id === id);
          if (found) return found;
        } catch (e) {}
      }
      return null;
    }
  }, []);

  const createSurvey = useCallback(async (surveyData: Omit<Survey, 'id' | 'createdAt' | 'status'> & { status?: string }): Promise<Survey> => {
    try {
      const newRef = push(ref(db, 'surveys'));
      const survey: Survey = {
        ...surveyData,
        id: newRef.key as string,
        createdAt: new Date().toISOString(),
        status: (surveyData.status as 'draft' | 'live' | 'closed') || 'draft'
      };
      await set(newRef, survey);
      setSurveys(prev => [survey, ...prev]);
      return survey;
    } catch (error) {
      console.error('Error creating survey in Database:', error);
      
      // Fallback to local storage if API is unavailable
      const newSurvey: Survey = {
        ...surveyData,
        id: Math.random().toString(36).substring(2, 9),
        createdAt: new Date().toISOString(),
        status: (surveyData.status as 'draft' | 'live' | 'closed') || 'draft'
      };
      setSurveys(prev => [newSurvey, ...prev]);
      return newSurvey;
    }
  }, []);

  const deleteSurvey = useCallback(async (id: string) => {
    try {
      await remove(ref(db, `surveys/${id}`));
    } catch (e) {
      console.error('Error deleting survey from Database:', e);
    }
    setSurveys(prev => prev.filter(s => s.id !== id));
    if (currentSurvey?.id === id) setCurrentSurvey(null);
  }, [currentSurvey?.id]);

  const submitResponse = useCallback(async (surveyId: string, answers: Record<string, string | string[] | number>) => {
    try {
      const responsesRef = push(ref(db, `responses/${surveyId}`));
      await set(responsesRef, {
        surveyId,
        answers,
        submittedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error submitting response to Database:', error);
      throw error;
    }
  }, []);

  const fetchResponses = useCallback(async (surveyId: string): Promise<SurveyResponse[]> => {
    try {
      const q = query(ref(db, `responses/${surveyId}`), orderByChild('submittedAt'));
      const snapshot = await get(q);
      if (snapshot.exists()) {
        const data: SurveyResponse[] = [];
        snapshot.forEach((childSnapshot) => {
          data.push({ id: childSnapshot.key as string, ...childSnapshot.val() });
        });
        return data.reverse();
      }
      return [];
    } catch (error) {
      console.error('Error fetching responses from Database:', error);
      return [];
    }
  }, []);

  const parseDocx = useCallback(async (file: File | null, topic: string) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      if (file) formData.append('file', file);
      formData.append('topic', topic);

      const res = await fetch(`${API_BASE}/parse-docx`, { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        let errorMsg = err.error || 'Lỗi khi phân tích file';
        
        // Handle Gemini Quota / AI JSON errors
        try {
          if (typeof errorMsg === 'string' && errorMsg.includes('"error"')) {
            const parsed = JSON.parse(errorMsg);
            if (parsed.error?.code === 429) {
              errorMsg = 'Hệ thống AI đang quá tải hoặc hết hạn mức. Vui lòng thử lại sau.';
            } else if (parsed.error?.message) {
              errorMsg = parsed.error.message;
            }
          }
        } catch (e) {}

        throw new Error(errorMsg);
      }
      return await res.json();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const chatWithAI = useCallback(async (
    message: string,
    surveyTitle: string,
    surveyDescription: string,
    questions: SurveyQuestion[],
    currentQuestionIndex?: number
  ): Promise<string> => {
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, surveyTitle, surveyDescription, questions, currentQuestionIndex }),
      });
      const data = await res.json();
      let reply = data.reply;
      
      // Handle raw error messages from backend
      if (typeof reply === 'string' && reply.includes('"error"') && reply.includes('429')) {
        return 'Xin lỗi, hệ thống AI đang quá tải hoặc đã hết hạn mức sử dụng miễn phí hôm nay. Bạn vui lòng thử lại sau nhé!';
      }
      
      return reply || 'Xin lỗi, không có phản hồi từ AI.';
    } catch {
      return 'Xin lỗi, không thể kết nối với hệ thống AI. Vui lòng kiểm tra lại mạng.';
    }
  }, []);

  const loadTemplate = useCallback((template: SurveyTemplateData) => {
    setPendingTemplate(template);
  }, []);

  const clearPendingTemplate = useCallback(() => {
    setPendingTemplate(null);
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/teams`);
      if (res.ok) setTeamMembers(await res.json());
    } catch (error) {
      console.error('Error fetching team:', error);
    }
  }, []);

  const inviteTeamMember = useCallback(async (name: string, email: string, role: TeamRole): Promise<TeamMember> => {
    const res = await fetch(`${API_BASE}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Không thể mời thành viên.');
    }
    const member = await res.json();
    setTeamMembers(prev => [...prev, member]);
    return member;
  }, []);

  const updateTeamMember = useCallback(async (id: string, updates: { name?: string; role?: TeamRole }): Promise<TeamMember> => {
    const res = await fetch(`${API_BASE}/teams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Không thể cập nhật thành viên.');
    const member = await res.json();
    setTeamMembers(prev => prev.map(m => m.id === id ? member : m));
    return member;
  }, []);

  const removeTeamMember = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/teams/${id}`, { method: 'DELETE' });
    setTeamMembers(prev => prev.filter(m => m.id !== id));
  }, []);

  return (
    <SurveyContext.Provider value={{
      surveys,
      currentSurvey,
      isLoading,
      pendingTemplate,
      teamMembers,
      searchQuery,
      fetchSurveys,
      fetchSurveyById,
      createSurvey,
      deleteSurvey,
      setCurrentSurvey,
      setSearchQuery,
      submitResponse,
      fetchResponses,
      parseDocx,
      chatWithAI,
      loadTemplate,
      clearPendingTemplate,
      fetchTeamMembers,
      inviteTeamMember,
      updateTeamMember,
      removeTeamMember,
    }}>
      {children}
    </SurveyContext.Provider>
  );
}

export function useSurvey() {
  const context = useContext(SurveyContext);
  if (!context) {
    throw new Error('useSurvey must be used within SurveyProvider');
  }
  return context;
}
