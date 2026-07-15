import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Survey, SurveyQuestion, SurveyResponse, SurveyTemplateData, TeamMember, TeamRole } from '../types';

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
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [currentSurvey, setCurrentSurvey] = useState<Survey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<SurveyTemplateData | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSurveys = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/surveys`);
      if (res.ok) {
        const data = await res.json();
        setSurveys(data);
      }
    } catch (error) {
      console.error('Error fetching surveys:', error);
    }
  }, []);

  const fetchSurveyById = useCallback(async (id: string): Promise<Survey | null> => {
    try {
      const res = await fetch(`${API_BASE}/surveys/${id}`);
      if (res.ok) return await res.json();
      return null;
    } catch (error) {
      console.error('Error fetching survey:', error);
      return null;
    }
  }, []);

  const createSurvey = useCallback(async (surveyData: Omit<Survey, 'id' | 'createdAt' | 'status'> & { status?: string }): Promise<Survey> => {
    const res = await fetch(`${API_BASE}/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(surveyData),
    });
    const survey = await res.json();
    setSurveys(prev => [survey, ...prev]);
    return survey;
  }, []);

  const deleteSurvey = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/surveys/${id}`, { method: 'DELETE' });
    setSurveys(prev => prev.filter(s => s.id !== id));
    if (currentSurvey?.id === id) setCurrentSurvey(null);
  }, [currentSurvey?.id]);

  const submitResponse = useCallback(async (surveyId: string, answers: Record<string, string | string[] | number>) => {
    await fetch(`${API_BASE}/surveys/${surveyId}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
  }, []);

  const fetchResponses = useCallback(async (surveyId: string): Promise<SurveyResponse[]> => {
    try {
      const res = await fetch(`${API_BASE}/surveys/${surveyId}/responses`);
      if (res.ok) return await res.json();
      return [];
    } catch {
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
      return data.reply;
    } catch {
      return 'Xin lỗi, không thể kết nối với AI. Vui lòng thử lại.';
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
