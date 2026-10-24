import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { Survey, SurveyAnswer, SurveyQuestion, SurveyResponse, SurveyTemplateData, TeamMember, TeamRole, SurveyDisplayMode } from '../types';
import { API_BASE, apiFetch } from '../utils/api';
import { createDraftId, findDraftById, markLocalDraftSynced, mergeDrafts, readLocalDrafts, removeLocalDraft, writeLocalDraft, type SurveyDraft } from '../utils/surveyDrafts';

interface SurveyContextType {
  surveys: Survey[];
  currentSurvey: Survey | null;
  isLoading: boolean;
  pendingTemplate: SurveyTemplateData | null;
  teamMembers: TeamMember[];
  searchQuery: string;
  drafts: SurveyDraft[];

  fetchSurveys: () => Promise<void>;
  fetchSurveyById: (id: string, includeAnswerKey?: boolean) => Promise<Survey | null>;
  createSurvey: (survey: Omit<Survey, 'id' | 'createdAt' | 'status'> & { status?: string; closesAt?: string | null; displayMode?: SurveyDisplayMode }) => Promise<Survey>;
  updateSurvey: (id: string, survey: Omit<Survey, 'id' | 'createdAt' | 'status'> & { status?: string; closesAt?: string | null; displayMode?: SurveyDisplayMode }) => Promise<Survey>;
  deleteSurvey: (id: string) => Promise<void>;
  setCurrentSurvey: (survey: Survey | null) => void;
  /**
   * Opens a clean builder session without deleting or altering saved drafts.
   * The incrementing request id lets an already-mounted builder reset safely.
   */
  startFreshSurvey: () => void;
  freshBuilderRequestId: number | null;
  consumeFreshBuilderRequest: (requestId: number) => void;
  pendingDraft: SurveyDraft | null;
  openDraft: (id: string) => boolean;
  consumePendingDraft: (id: string) => void;
  setSearchQuery: (query: string) => void;
  fetchDrafts: () => Promise<SurveyDraft[]>;
  saveDraft: (draft: Partial<SurveyDraft> & { title?: string; description?: string; questions?: SurveyQuestion[] }) => Promise<SurveyDraft>;
  deleteDraft: (id: string) => Promise<void>;

  submitResponse: (surveyId: string, respondentId: string, answers: Record<string, SurveyAnswer>, surveyRevision?: string) => Promise<SurveyResponse>;
  fetchResponses: (surveyId: string) => Promise<SurveyResponse[]>;
  fetchMyResponse: (surveyId: string, respondentId: string) => Promise<SurveyResponse | null>;
  resetResponses: (surveyId: string) => Promise<number>;

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

// Some older records stored 0 to mean "not limited". The API now represents
// an unset limit as null, so normalize only that legacy sentinel while keeping
// all other values visible to normal validation.
const normalizeLegacyOptionalLimit = (value: unknown): number | null => (
  typeof value === 'number' && value !== 0 ? value : null
);

async function readApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as {
    error?: unknown;
    details?: Array<{ message?: unknown }>;
  } | null;
  const detail = Array.isArray(body?.details)
    ? body.details
      .map(item => typeof item?.message === 'string' ? item.message : '')
      .filter(Boolean)
      .join(' ')
    : '';
  const error = typeof body?.error === 'string' ? body.error : '';
  return [error, detail].filter(Boolean).join(' ') || fallback;
}

export function SurveyProvider({ children }: { children: ReactNode }) {
  const [surveys, setSurveys] = useState<Survey[]>(() => {
    try {
      const saved = localStorage.getItem('surveys');
      if (saved) return JSON.parse(saved);
    } catch (e) {}

    // Seed a demo survey in development when none exist so respondents can try the flow
    try {
      const demo: Survey = {
        id: 'test',
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
      } as Survey;
      try { localStorage.setItem('surveys', JSON.stringify([demo])); } catch (e) {}
      return [demo];
    } catch (e) {
      return [];
    }
  });
  
  useEffect(() => {
    try {
      localStorage.setItem('surveys', JSON.stringify(surveys));
    } catch (e) {}
  }, [surveys]);

  const [currentSurvey, setCurrentSurvey] = useState<Survey | null>(null);
  const [freshBuilderRequestId, setFreshBuilderRequestId] = useState<number | null>(null);
  const [pendingDraft, setPendingDraft] = useState<SurveyDraft | null>(null);
  const freshBuilderSequenceRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<SurveyTemplateData | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [drafts, setDrafts] = useState<SurveyDraft[]>([]);

  const requestFreshBuilder = useCallback(() => {
    freshBuilderSequenceRef.current += 1;
    setFreshBuilderRequestId(freshBuilderSequenceRef.current);
  }, []);

  const consumeFreshBuilderRequest = useCallback((requestId: number) => {
    setFreshBuilderRequestId(current => current === requestId ? null : current);
  }, []);

  const startFreshSurvey = useCallback(() => {
    // This deliberately does not delete an existing draft. It only tells the
    // builder to open a new, blank session instead of restoring the latest one.
    setCurrentSurvey(null);
    setPendingTemplate(null);
    setPendingDraft(null);
    requestFreshBuilder();
  }, [requestFreshBuilder]);

  const openDraft = useCallback((id: string) => {
    const draft = findDraftById(drafts, id);
    if (!draft) return false;
    setCurrentSurvey(null);
    setPendingTemplate(null);
    setFreshBuilderRequestId(null);
    setPendingDraft(draft);
    return true;
  }, [drafts]);

  const consumePendingDraft = useCallback((id: string) => {
    setPendingDraft(current => current?.id === id ? null : current);
  }, []);

  const fetchSurveys = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/surveys`);
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && !contentType.includes('application/json')) {
          console.warn('API returned non-JSON response for surveys:', contentType);
          setSurveys([]);
          return;
        }
        const data = await res.json();
        const normalized = (data || []).map((survey: any) => ({
          ...survey,
          closesAt: survey.closesAt ?? survey.closes_at ?? null,
          displayMode: survey.displayMode ?? survey.display_mode ?? 'single',
          showScore: survey.showScore ?? survey.show_score ?? true,
          maxAttemptsPerDevice: normalizeLegacyOptionalLimit(survey.maxAttemptsPerDevice ?? survey.max_attempts_per_device),
          timeLimitMinutes: normalizeLegacyOptionalLimit(survey.timeLimitMinutes ?? survey.time_limit_minutes),
        }));
        setSurveys(normalized);
      } else {
        setSurveys([]);
      }
    } catch (error) {
      console.error('Error fetching surveys from API:', error);
      // Fallback
      const saved = localStorage.getItem('surveys');
      if (saved) setSurveys(JSON.parse(saved));
    }
  }, []);

  const fetchSurveyById = useCallback(async (id: string, includeAnswerKey = false): Promise<Survey | null> => {
    try {
      const endpoint = includeAnswerKey ? `/admin/surveys/${id}` : `/surveys/${id}`;
      const res = await apiFetch(`${API_BASE}${endpoint}`);
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && !contentType.includes('application/json')) {
          console.warn('API returned non-JSON response for survey by id:', contentType);
          return null;
        }
        const survey = await res.json();
        if (!survey || !survey.id) return null;
        return {
          ...survey,
          closesAt: survey.closesAt ?? survey.closes_at ?? null,
          displayMode: survey.displayMode ?? survey.display_mode ?? 'single',
          showScore: survey.showScore ?? survey.show_score ?? true,
          maxAttemptsPerDevice: normalizeLegacyOptionalLimit(survey.maxAttemptsPerDevice ?? survey.max_attempts_per_device),
          timeLimitMinutes: normalizeLegacyOptionalLimit(survey.timeLimitMinutes ?? survey.time_limit_minutes),
        };
      }
      if (res.status === 404) return null;
      throw new Error(`Failed to fetch survey (${res.status})`);
    } catch (error) {
      console.error('Error fetching survey by id from API:', error);
      if (import.meta.env.PROD) throw error;
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

  const createSurvey = useCallback(async (surveyData: Omit<Survey, 'id' | 'createdAt' | 'status'> & { status?: string; closesAt?: string | null; displayMode?: SurveyDisplayMode }): Promise<Survey> => {
    try {
      const res = await apiFetch(`${API_BASE}/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...surveyData,
          status: (surveyData.status as 'draft' | 'live' | 'closed') || 'live',
          closesAt: surveyData.closesAt || null,
          displayMode: surveyData.displayMode || 'single',
          showScore: surveyData.showScore !== false,
          maxAttemptsPerDevice: normalizeLegacyOptionalLimit(surveyData.maxAttemptsPerDevice),
          timeLimitMinutes: normalizeLegacyOptionalLimit(surveyData.timeLimitMinutes),
        })
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Không thể tạo khảo sát.'));
      const survey = await res.json();
      setSurveys(prev => [survey, ...prev]);
      return survey;
    } catch (error) {
      console.error('Error creating survey via API:', error);
      if (import.meta.env.PROD) throw error;

      const newSurvey: Survey = {
        ...surveyData,
        id: Math.random().toString(36).substring(2, 9),
        createdAt: new Date().toISOString(),
        status: (surveyData.status as 'draft' | 'live' | 'closed') || 'live',
        closesAt: surveyData.closesAt || null,
        displayMode: surveyData.displayMode || 'single',
        showScore: surveyData.showScore !== false,
        maxAttemptsPerDevice: normalizeLegacyOptionalLimit(surveyData.maxAttemptsPerDevice),
        timeLimitMinutes: normalizeLegacyOptionalLimit(surveyData.timeLimitMinutes),
      };
      setSurveys(prev => [newSurvey, ...prev]);
      try {
        localStorage.setItem('surveys', JSON.stringify([newSurvey, ...JSON.parse(localStorage.getItem('surveys') || '[]')]));
      } catch (e) {}
      return newSurvey;
    }
  }, []);

  const updateSurvey = useCallback(async (id: string, surveyData: Omit<Survey, 'id' | 'createdAt' | 'status'> & { status?: string; closesAt?: string | null; displayMode?: SurveyDisplayMode }): Promise<Survey> => {
    const payload = {
      ...surveyData,
      status: (surveyData.status as 'draft' | 'live' | 'closed') || 'live',
      closesAt: surveyData.closesAt || null,
      displayMode: surveyData.displayMode || 'single',
      showScore: surveyData.showScore !== false,
      maxAttemptsPerDevice: normalizeLegacyOptionalLimit(surveyData.maxAttemptsPerDevice),
      timeLimitMinutes: normalizeLegacyOptionalLimit(surveyData.timeLimitMinutes),
    };
    const res = await apiFetch(`${API_BASE}/surveys/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await readApiError(res, 'Không thể cập nhật khảo sát.'));
    const survey = await res.json();
    setSurveys(prev => prev.map(item => item.id === id ? { ...item, ...survey } : item));
    setCurrentSurvey(prev => prev?.id === id ? survey : prev);
    return survey;
  }, []);

  const fetchDrafts = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/surveys/drafts`);
      if (!res.ok) {
        const localDrafts = readLocalDrafts(localStorage);
        setDrafts(localDrafts);
        return localDrafts;
      }
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Dữ liệu bản nháp nhận được không hợp lệ.');
      // A synchronized cache missing from a successful server response was
      // removed elsewhere; only unsynchronized local work should reappear.
      const merged = mergeDrafts(data, readLocalDrafts(localStorage), true);
      setDrafts(merged);
      return merged;
    } catch (error) {
      console.error('Error fetching drafts:', error);
      const localDrafts = readLocalDrafts(localStorage);
      setDrafts(localDrafts);
      return localDrafts;
    }
  }, []);

  const saveDraft = useCallback(async (draft: Partial<SurveyDraft>) => {
    const requestedAt = new Date().toISOString();
    const payload = {
      id: draft.id || createDraftId(),
      title: draft.title || 'Khảo sát nháp',
      description: draft.description || '',
      thankYouMessage: draft.thankYouMessage ?? '',
      questions: draft.questions || [],
      sections: draft.sections || [],
      isQuiz: Boolean(draft.isQuiz),
      showScore: draft.showScore !== false,
      displayMode: draft.displayMode || 'single',
      closesAt: draft.closesAt || null,
      maxAttemptsPerDevice: normalizeLegacyOptionalLimit(draft.maxAttemptsPerDevice),
      timeLimitMinutes: normalizeLegacyOptionalLimit(draft.timeLimitMinutes),
    };

    try {
      const res = await apiFetch(`${API_BASE}/surveys/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Không thể lưu bản nháp.'));
      const saved = await res.json();
      try {
        markLocalDraftSynced(localStorage, payload);
      } catch (error) {
        console.warn('Could not mark local draft as synchronized', error);
      }
      setDrafts(prev => {
        const next = prev.filter(item => item.id !== saved.id);
        return [saved, ...next];
      });
      return saved;
    } catch (error) {
      console.error('Error saving draft:', error);
      if (import.meta.env.PROD) throw error;
      const fallback: SurveyDraft = { ...payload, updatedAt: requestedAt };
      const existing = findDraftById(readLocalDrafts(localStorage), payload.id);
      const latest = existing && Date.parse(existing.updatedAt || '') >= Date.parse(requestedAt) ? existing : fallback;
      if (latest === fallback) writeLocalDraft(localStorage, fallback);
      setDrafts(prev => mergeDrafts([latest], prev.filter(item => item.id !== latest.id)));
      return latest;
    }
  }, []);

  const deleteDraft = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/surveys/drafts/${id}`, { method: 'DELETE', headers: { 'X-Confirm-Action': 'delete-draft' } });
      if (!res.ok && res.status !== 404) throw new Error('Không thể xóa bản nháp trên máy chủ.');
    } catch (error) {
      if (import.meta.env.PROD) throw error;
      console.warn('Draft delete API unavailable; removing local copy', error);
    }

    try {
      removeLocalDraft(localStorage, id);
    } catch (error) {
      console.warn('Failed to synchronize local draft storage', error);
    }
    setDrafts(prev => prev.filter(d => d.id !== id));
  }, []);

  const deleteSurvey = useCallback(async (id: string) => {
    const response = await apiFetch(`${API_BASE}/surveys/${id}`, { method: 'DELETE', headers: { 'X-Confirm-Action': 'delete-survey' } });
    if (!response.ok) throw new Error('Không thể xóa khảo sát.');
    setSurveys(prev => prev.filter(s => s.id !== id));
    if (currentSurvey?.id === id) setCurrentSurvey(null);
  }, [currentSurvey?.id]);

  const submitResponse = useCallback(async (surveyId: string, respondentId: string, answers: Record<string, SurveyAnswer>, surveyRevision?: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/surveys/${surveyId}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respondentId, answers, surveyRevision })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to submit response');
      }
      return await res.json() as SurveyResponse;
    } catch (error) {
      console.error('Error submitting response via API:', error);
      throw error;
    }
  }, []);

  const fetchMyResponse = useCallback(async (surveyId: string, respondentId: string): Promise<SurveyResponse | null> => {
    try {
      const res = await apiFetch(`${API_BASE}/surveys/${surveyId}/responses/my/${respondentId}`);
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && !contentType.includes('application/json')) {
          return null;
        }
        return await res.json();
      }
      return null;
    } catch (error) {
      console.error('Error fetching my response via API:', error);
      return null;
    }
  }, []);

  const fetchResponses = useCallback(async (surveyId: string): Promise<SurveyResponse[]> => {
    try {
      const res = await apiFetch(`${API_BASE}/surveys/${surveyId}/responses`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Không thể tải phản hồi (${res.status}).`);
      }
      const contentType = res.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        throw new Error('Máy chủ trả về dữ liệu không hợp lệ khi tải phản hồi.');
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Dữ liệu phản hồi từ máy chủ không đúng định dạng.');
      }
      return data;
    } catch (error) {
      console.error('Error fetching responses via API:', error);
      throw error;
    }
  }, []);

  const resetResponses = useCallback(async (surveyId: string): Promise<number> => {
    const res = await apiFetch(`${API_BASE}/surveys/${surveyId}/responses`, { method: 'DELETE', headers: { 'X-Confirm-Action': 'reset-responses' } });
    if (!res.ok) throw new Error('Failed to reset survey responses');
    const data = await res.json();
    return data.deletedCount ?? 0;
  }, []);

  const parseDocx = useCallback(async (file: File | null, topic: string) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      if (file) formData.append('file', file);
      formData.append('topic', topic);

      const res = await apiFetch(`${API_BASE}/parse-docx`, { method: 'POST', body: formData });
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
      const res = await apiFetch(`${API_BASE}/chat`, {
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
    setCurrentSurvey(null);
    setPendingDraft(null);
    requestFreshBuilder();
    setPendingTemplate(template);
  }, [requestFreshBuilder]);

  const clearPendingTemplate = useCallback(() => {
    setPendingTemplate(null);
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    const res = await apiFetch(`${API_BASE}/teams`);
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error || 'Không thể tải danh sách thành viên.');
    }
    const members = await res.json();
    setTeamMembers(Array.isArray(members) ? members : []);
  }, []);

  const inviteTeamMember = useCallback(async (name: string, email: string, role: TeamRole): Promise<TeamMember> => {
    const res = await apiFetch(`${API_BASE}/teams`, {
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
    const res = await apiFetch(`${API_BASE}/teams/${id}`, {
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
    const res = await apiFetch(`${API_BASE}/teams/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error || 'Không thể xóa thành viên.');
    }
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
      updateSurvey,
      deleteSurvey,
      setCurrentSurvey,
      startFreshSurvey,
      freshBuilderRequestId,
      consumeFreshBuilderRequest,
      pendingDraft,
      openDraft,
      consumePendingDraft,
      setSearchQuery,
      drafts,
      fetchDrafts,
      saveDraft,
      deleteDraft,
      submitResponse,
      fetchResponses,
      fetchMyResponse,
      resetResponses,
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
