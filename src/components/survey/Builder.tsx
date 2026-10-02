import React from 'react';
import { CircleDot, CheckSquare, Star, AlignLeft, Minus, GripVertical, Copy, Trash2, Plus, GitBranch, Sparkles, RefreshCw, Send, CheckCircle2, Check, Info, UploadCloud, ChevronDown, X, FileText, CalendarDays, SlidersHorizontal } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useSurvey } from '../../context/SurveyContext';
import { ShareModal } from '../common/ShareModal';
import ReactMarkdown from 'react-markdown';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import type { SurveyQuestion, QuestionType, SurveyDisplayMode, SurveySection } from '../../types';
import { cleanHtmlWhitespace, sanitizeHtml, stripHtml } from '../../utils/stringUtils';

const questionTypeLabels: Record<QuestionType, { label: string; icon: React.ReactNode }> = {
  single_choice: { label: 'Một lựa chọn', icon: <CircleDot size={16} className="text-primary" /> },
  multiple_choice: { label: 'Nhiều lựa chọn', icon: <CheckSquare size={16} className="text-primary" /> },
  dropdown: { label: 'Menu thả xuống', icon: <ChevronDown size={16} className="text-primary" /> },
  date: { label: 'Ngày', icon: <CalendarDays size={16} className="text-primary" /> },
  linear_scale: { label: 'Thang tuyến tính', icon: <SlidersHorizontal size={16} className="text-primary" /> },
  multiple_choice_grid: { label: 'Lưới trắc nghiệm', icon: <CircleDot size={16} className="text-primary" /> },
  checkbox_grid: { label: 'Lưới hộp kiểm', icon: <CheckSquare size={16} className="text-primary" /> },
  star_rating: { label: 'Thang điểm sao', icon: <Star size={16} className="text-primary" /> },
  text: { label: 'Văn bản tự do', icon: <AlignLeft size={16} className="text-primary" /> },
  nps: { label: 'Điểm NPS', icon: <Minus size={16} className="text-primary" /> },
};

const quillModules = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    ['clean']
  ]
};

const toDateTimeLocalValue = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 16);
};

const roundScore = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function Builder({ onPublished, onUpdated, onDraftSaved, onError, onActivity }: { onPublished?: () => void; onUpdated?: () => void; onDraftSaved?: () => void; onError?: (msg: string) => void; onActivity?: (message: string) => void }) {
  const { parseDocx, createSurvey, updateSurvey, currentSurvey, setCurrentSurvey, isLoading, pendingTemplate, clearPendingTemplate, chatWithAI, fetchDrafts, saveDraft, deleteDraft } = useSurvey();
  const DRAFT_STORAGE_KEY = 'smart-survey-hub-builder-draft';
  const LEGACY_DRAFT_STORAGE_KEY = 'smart-survey-hub-drafts';

  const readDraftsFromStorage = () => {
    const candidates = [DRAFT_STORAGE_KEY, LEGACY_DRAFT_STORAGE_KEY];
    const collected: any[] = [];

    for (const key of candidates) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const value = JSON.parse(raw);
        if (Array.isArray(value)) {
          collected.push(...value);
        } else if (value) {
          collected.push(value);
        }
      } catch (error) {
        console.error('Failed to read draft storage', error);
      }
    }

    const seen = new Set<string>();
    return collected.filter((draft) => {
      if (!draft) return false;
      if (!draft.id) return true;
      if (seen.has(draft.id)) return false;
      seen.add(draft.id);
      return true;
    });
  };
  
  const [showSurvey, setShowSurvey] = useState(false);
  const [topic, setTopic] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [surveyTitle, setSurveyTitle] = useState('');
  const [surveyDescription, setSurveyDescription] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [sections, setSections] = useState<SurveySection[]>([{ id: 'section-1', title: 'Phần 1' }]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isQuiz, setIsQuiz] = useState(false);
  const [showScore, setShowScore] = useState(true);
  const [displayMode, setDisplayMode] = useState<SurveyDisplayMode>('single');
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [publishedSurvey, setPublishedSurvey] = useState<{ id: string; title: string } | null>(null);
  const [maxAttemptsPerDevice, setMaxAttemptsPerDevice] = useState<number | null>(1);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const draftSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag state for question reordering
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragOverRef = useRef<string | null>(null);
  const [draggedOption, setDraggedOption] = useState<{ questionId: string; index: number } | null>(null);
  const [dragOverOption, setDragOverOption] = useState<{ questionId: string; index: number } | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    try {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
    } catch (err) {
      // ignore
    }
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverRef.current = id;
    setDragOverId(id);
  };

  const handleDragLeave = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (dragOverRef.current === id) {
      dragOverRef.current = null;
      setDragOverId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) {
      setDragOverId(null);
      return;
    }
    setQuestions(prev => {
      const srcIdx = prev.findIndex(p => p.id === sourceId);
      const tgtIdx = prev.findIndex(p => p.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      const copy = [...prev];
      const [item] = copy.splice(srcIdx, 1);
      copy.splice(tgtIdx, 0, item);
      return copy;
    });
    dragOverRef.current = null;
    setDragOverId(null);
  };

  const handleOptionDragStart = (e: React.DragEvent, questionId: string, index: number) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/x-survey-option', JSON.stringify({ questionId, index }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedOption({ questionId, index });
  };

  const handleOptionDragOver = (e: React.DragEvent, questionId: string, index: number) => {
    const source = draggedOption;
    if (!source || source.questionId !== questionId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverOption({ questionId, index });
  };

  const handleOptionDrop = (e: React.DragEvent, questionId: string, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    let source: { questionId: string; index: number } | null = draggedOption;
    try {
      const encoded = e.dataTransfer.getData('application/x-survey-option');
      if (encoded) source = JSON.parse(encoded) as { questionId: string; index: number };
    } catch {
      // Keep the in-memory drag state as a fallback for browsers that strip custom data.
    }
    if (!source || source.questionId !== questionId || source.index === targetIndex) {
      setDraggedOption(null);
      setDragOverOption(null);
      return;
    }
    setQuestions(prev => prev.map(question => {
      if (question.id !== questionId || !question.options) return question;
      const options = [...question.options];
      if (source!.index < 0 || source!.index >= options.length || targetIndex < 0 || targetIndex >= options.length) return question;
      const [moved] = options.splice(source!.index, 1);
      options.splice(targetIndex, 0, moved);
      return { ...question, options };
    }));
    setDraggedOption(null);
    setDragOverOption(null);
  };

  const handleOptionDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedOption(null);
    setDragOverOption(null);
  };

  // AI Chat state
  const [aiMessages, setAiMessages] = useState<{type: 'user'|'bot', text: string}[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [aiMessages, isAiTyping]);

  const handleAiChatSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!aiInput.trim() || isAiTyping) return;

    const message = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { type: 'user', text: message }]);
    setIsAiTyping(true);

    try {
      const response = await chatWithAI(message, surveyTitle, surveyDescription, questions);
      setAiMessages(prev => [...prev, { type: 'bot', text: response }]);
    } catch (error) {
      setAiMessages(prev => [...prev, { type: 'bot', text: 'Xin lỗi, đã có lỗi xảy ra khi kết nối với AI.' }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendingTemplate) {
      setSurveyTitle(pendingTemplate.title);
      setSurveyDescription(pendingTemplate.description);
      setQuestions(pendingTemplate.questions.map((q, i) => ({ ...q, id: `q${i + 1}` })));
      setSections(pendingTemplate.sections?.length ? pendingTemplate.sections : [{ id: 'section-1', title: 'Phần 1' }]);
      setShowSurvey(true);
      if (pendingTemplate.questions.length > 0) {
        setActiveQuestionId('q1');
      }
      clearPendingTemplate();
    }
  }, [pendingTemplate, clearPendingTemplate]);

  useEffect(() => {
    if (!currentSurvey) return;

    setSurveyTitle(currentSurvey.title || '');
    setSurveyDescription(currentSurvey.description || '');
    setQuestions(currentSurvey.questions || []);
    setIsQuiz(Boolean(currentSurvey.isQuiz));
    setShowScore(currentSurvey.showScore !== false);
    setDisplayMode(currentSurvey.displayMode || 'single');
    setClosesAt(currentSurvey.closesAt || null);
    setMaxAttemptsPerDevice(currentSurvey.maxAttemptsPerDevice ?? 1);
    setTimeLimitMinutes(currentSurvey.timeLimitMinutes ?? null);
    setShowSurvey(true);
    setActiveQuestionId(currentSurvey.questions?.[0]?.id || null);
    setDraftId(null);
  }, [currentSurvey]);

  useEffect(() => {
    const loadDrafts = async () => {
      if (currentSurvey) return;
      const drafts = await fetchDrafts();
      if (!drafts || drafts.length === 0) {
        const savedDrafts = readDraftsFromStorage();
        const saved = savedDrafts[0];
        if (!saved) return;

        try {
          const draft = saved as {
            surveyTitle?: string;
            surveyDescription?: string;
            questions?: SurveyQuestion[];
            sections?: SurveySection[];
            isQuiz?: boolean;
            showScore?: boolean;
            displayMode?: SurveyDisplayMode;
            closesAt?: string | null;
            timeLimitMinutes?: number | null;
            title?: string;
            description?: string;
            id?: string;
          };

          const extractedQuestions = draft.questions || [];
          const title = draft.surveyTitle ?? draft.title ?? '';
          const description = draft.surveyDescription ?? draft.description ?? '';

          if (title || description || extractedQuestions.length) {
            setSurveyTitle(title);
            setSurveyDescription(description);
            setQuestions(extractedQuestions);
            setSections(draft.sections?.length ? draft.sections : [{ id: 'section-1', title: 'Phần 1' }]);
            setIsQuiz(Boolean(draft.isQuiz));
            setShowScore(draft.showScore !== false);
            setDisplayMode(draft.displayMode || 'single');
            setClosesAt(draft.closesAt || null);
            setTimeLimitMinutes(draft.timeLimitMinutes ?? null);
            setShowSurvey(true);
            setActiveQuestionId(extractedQuestions[0]?.id || null);
          }
        } catch (error) {
          console.error('Failed to restore saved survey draft', error);
        }
        return;
      }

      const latest = drafts[0];
      setDraftId(latest.id);
      setSurveyTitle(latest.title || '');
      setSurveyDescription(latest.description || '');
      setQuestions(latest.questions || []);
      setSections(latest.sections?.length ? latest.sections : [{ id: 'section-1', title: 'Phần 1' }]);
      setIsQuiz(Boolean(latest.isQuiz));
      setShowScore(latest.showScore !== false);
      setDisplayMode(latest.displayMode || 'single');
      setClosesAt(latest.closesAt || null);
      setTimeLimitMinutes(latest.timeLimitMinutes ?? null);
      setShowSurvey(true);
      setActiveQuestionId((latest.questions || [])[0]?.id || null);
      setDraftSavedAt(latest.updatedAt ? new Date(latest.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null);
    };

    void loadDrafts();
  }, [fetchDrafts, currentSurvey]);

  useEffect(() => {
    if (!showSurvey) return;

    const draft = {
      id: draftId || undefined,
      surveyTitle,
      surveyDescription,
      questions,
      sections,
      isQuiz,
      showScore,
      displayMode,
      closesAt,
      maxAttemptsPerDevice,
      timeLimitMinutes,
    };

    try {

      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setDraftSavedAt(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    } catch (error) {
      console.error('Failed to save draft', error);
    }
    if (draftSyncTimer.current) clearTimeout(draftSyncTimer.current);
    if (!currentSurvey && (surveyTitle.trim() || questions.length > 0)) {
      draftSyncTimer.current = setTimeout(() => {
        void saveDraft({ id: draftId || undefined, title: surveyTitle || 'Khảo sát nháp', description: surveyDescription, questions, sections, isQuiz, showScore, displayMode, closesAt, maxAttemptsPerDevice, timeLimitMinutes }).then(saved => {
          if (!draftId && saved?.id) setDraftId(saved.id);
        }).catch(error => console.warn('Background draft sync failed', error));
      }, 700);
    }
    return () => { if (draftSyncTimer.current) clearTimeout(draftSyncTimer.current); };
  }, [showSurvey, surveyTitle, surveyDescription, questions, sections, isQuiz, showScore, displayMode, closesAt, maxAttemptsPerDevice, timeLimitMinutes, currentSurvey, draftId, saveDraft]);

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
    if (draftId) {
      void deleteDraft(draftId);
    }
    setDraftId(null);
    setDraftSavedAt(null);
  };

  const totalPossibleScore = useMemo(() => {
    return roundScore(questions.reduce((sum, question) => {
      if (question.type === 'single_choice') {
        const hasCorrect = typeof question.correctAnswer === 'string' && question.correctAnswer.trim().length > 0;
        if (hasCorrect) {
          const pts = typeof question.points === 'number' && question.points > 0 ? question.points : 1;
          return sum + pts;
        }
      } else if (question.type === 'multiple_choice') {
        const hasCorrect = Array.isArray(question.correctAnswer) && question.correctAnswer.length > 0;
        if (hasCorrect) {
          const pts = typeof question.points === 'number' && question.points > 0 ? question.points : 1;
          return sum + pts;
        }
      }
      return sum;
    }, 0));
  }, [questions]);

  const saveSurveyDraft = async () => {
    if (isSavingDraft) return;

    setIsSavingDraft(true);
    const draft = {
      id: draftId || `draft-${Date.now()}`,
      title: surveyTitle || 'Khảo sát nháp',
      description: surveyDescription,
      questions,
      sections,
      isQuiz,
      showScore,
      displayMode,
      closesAt,
      maxAttemptsPerDevice,
      timeLimitMinutes,
    };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      // The legacy key stored the same draft a second time, causing duplicate cards.
      localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
      const saved = await saveDraft(draft);
      setDraftId(saved.id || draft.id);
      setDraftSavedAt(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
      onDraftSaved?.();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Không thể lưu bản nháp. Vui lòng thử lại.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleGenerate = async () => {
    try {
      const result = await parseDocx(selectedFile, topic);
      setSurveyTitle(result.title);
      setSurveyDescription(topic);
      setQuestions(result.questions);
      setSections([{ id: 'section-1', title: 'Phần 1' }]);
      setShowSurvey(true);
      if (result.questions.length > 0) {
        setActiveQuestionId(result.questions[0].id);
      }
      onActivity?.(`AI đã tạo ${result.questions.length} câu hỏi cho khảo sát.`);
    } catch (err: any) {
      if (onError) onError(err.message || 'Đã xảy ra lỗi khi phân tích. Vui lòng thử lại.');
    }
  };

  const handlePublish = async () => {
    if (questions.length === 0) return;
    setIsPublishing(true);
    try {
      const surveyData = {
        title: surveyTitle,
        description: surveyDescription,
        questions,
        sections,
        isQuiz,
        showScore,
        displayMode,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
        maxAttemptsPerDevice,
        timeLimitMinutes,
      };
      const survey = currentSurvey
        ? await updateSurvey(currentSurvey.id, { ...surveyData, status: currentSurvey.status })
        : await createSurvey(surveyData);
      setCurrentSurvey(survey);
      clearDraft();
      setPublishedSurvey({ id: survey.id, title: survey.title });
      if (currentSurvey) onUpdated?.();
      else onPublished?.();
    } catch (err) {
      if (onError) onError('Lỗi khi xuất bản khảo sát.');
    } finally {
      setIsPublishing(false);
    }
  };

  const updateQuestion = (id: string, updates: Partial<SurveyQuestion>) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const deleteQuestion = (id: string) => {
    const question = questions.find(item => item.id === id);
    const sectionId = question?.sectionId || sections[0]?.id;
    if (sections.length > 1 && question && questions.filter(item => (item.sectionId || sections[0]?.id) === sectionId).length === 1) {
      setSections(previous => previous.filter(section => section.id !== sectionId));
    }
    setQuestions(prev => prev.filter(q => q.id !== id));
    if (activeQuestionId === id) {
      setActiveQuestionId(questions.find(q => q.id !== id)?.id || null);
    }
  };

  const duplicateQuestion = (id: string) => {
    const q = questions.find(q => q.id === id);
    if (!q) return;
    const newQ: SurveyQuestion = { ...q, id: `q${Date.now()}` };
    const idx = questions.findIndex(q => q.id === id);
    const newQuestions = [...questions];
    newQuestions.splice(idx + 1, 0, newQ);
    setQuestions(newQuestions);
  };

  const getQuestionLabel = (question: SurveyQuestion, idx: number) => {
    const value = question.label?.trim();
    return value && value.length > 0 ? value : '';
  };

  const addQuestion = () => {
    const activeQuestion = questions.find(question => question.id === activeQuestionId);
    const newQ: SurveyQuestion = {
      id: `q${Date.now()}`,
      type: 'single_choice',
      text: '',
      ...(sections.length > 1 ? { sectionId: activeQuestion?.sectionId || sections[0].id } : {}),
      options: ['Lựa chọn 1', 'Lựa chọn 2'],
      required: true,
      label: ''
    };
    setQuestions(prev => [...prev, newQ]);
    setActiveQuestionId(newQ.id);
  };

  const supportsOptions = (type: QuestionType) =>
    type === 'single_choice'
    || type === 'multiple_choice'
    || type === 'dropdown'
    || type === 'multiple_choice_grid'
    || type === 'checkbox_grid';
  const isGridQuestion = (type: QuestionType) =>
    type === 'multiple_choice_grid' || type === 'checkbox_grid';

  const addSection = () => {
    const existingSections = sections.length ? sections : [{ id: 'section-1', title: 'Phần 1' }];
    const defaultSectionId = existingSections[0].id;
    const normalizedQuestions: SurveyQuestion[] = questions.map(question => ({
      ...question,
      sectionId: question.sectionId && existingSections.some(section => section.id === question.sectionId)
        ? question.sectionId
        : defaultSectionId,
    }));
    const activeIndex = normalizedQuestions.findIndex(question => question.id === activeQuestionId);
    const activeSectionId = activeIndex >= 0
      ? normalizedQuestions[activeIndex].sectionId!
      : normalizedQuestions[normalizedQuestions.length - 1]?.sectionId || defaultSectionId;
    const sectionIndex = Math.max(0, existingSections.findIndex(section => section.id === activeSectionId));
    const nextSection: SurveySection = {
      id: `section-${Date.now()}`,
      title: `Phần ${existingSections.length + 1}`,
    };
    const insertionIndex = activeIndex >= 0 ? activeIndex + 1 : normalizedQuestions.length;
    const updatedQuestions = normalizedQuestions.map((question, index) =>
      index >= insertionIndex && question.sectionId === activeSectionId
        ? { ...question, sectionId: nextSection.id }
        : question
    );
    const newQuestion: SurveyQuestion = {
      id: `q${Date.now() + 1}`,
      type: 'single_choice',
      text: '',
      sectionId: nextSection.id,
      options: ['Lựa chọn 1', 'Lựa chọn 2'],
      required: true,
    };
    updatedQuestions.splice(insertionIndex, 0, newQuestion);
    setQuestions(updatedQuestions);
    setSections([
      ...existingSections.slice(0, sectionIndex + 1),
      nextSection,
      ...existingSections.slice(sectionIndex + 1),
    ]);
    setActiveQuestionId(newQuestion.id);
  };

  const addOption = (questionId: string) => {
    const q = questions.find(q => q.id === questionId);
    if (!q || !q.options) return;
    updateQuestion(questionId, { options: [...q.options, `Lựa chọn ${q.options.length + 1}`] });
  };

  const updateGridColumn = (questionId: string, index: number, value: string) => {
    const question = questions.find(item => item.id === questionId);
    if (!question?.gridColumns) return;
    const gridColumns = [...question.gridColumns];
    gridColumns[index] = value;
    updateQuestion(questionId, { gridColumns });
  };

  const addGridColumn = (questionId: string) => {
    const question = questions.find(item => item.id === questionId);
    if (!question?.gridColumns) return;
    updateQuestion(questionId, { gridColumns: [...question.gridColumns, `Cột ${question.gridColumns.length + 1}`] });
  };

  const removeGridColumn = (questionId: string, index: number) => {
    const question = questions.find(item => item.id === questionId);
    if (!question?.gridColumns || question.gridColumns.length <= 2) return;
    updateQuestion(questionId, { gridColumns: question.gridColumns.filter((_, columnIndex) => columnIndex !== index) });
  };

  const updateOption = (questionId: string, optionIdx: number, value: string) => {
    const q = questions.find(q => q.id === questionId);
    if (!q || !q.options) return;
    const newOptions = [...q.options];
    newOptions[optionIdx] = value;
    updateQuestion(questionId, {
      options: newOptions,
      ...(q.screenOutAnswer === q.options[optionIdx] ? { screenOutAnswer: value } : {}),
    });
  };

  const removeOption = (questionId: string, optionIdx: number) => {
    const q = questions.find(q => q.id === questionId);
    if (!q || !q.options || q.options.length <= 2) return;
    const options = q.options.filter((_, i) => i !== optionIdx);
    updateQuestion(questionId, {
      options,
      ...(q.maxSelections && q.maxSelections > options.length ? { maxSelections: options.length } : {}),
      ...(q.screenOutAnswer === q.options[optionIdx] ? { screenOutAnswer: undefined } : {}),
    });
  };

  const changeQuestionType = (questionId: string, newType: QuestionType) => {
    const question = questions.find(item => item.id === questionId);
    const updates: Partial<SurveyQuestion> = {
      type: newType,
      correctAnswer: undefined,
      ...(newType !== 'multiple_choice' ? { maxSelections: undefined } : {}),
      ...(newType !== 'single_choice' ? { screenOutAnswer: undefined, screenOutMessage: undefined } : {}),
      ...(isGridQuestion(newType)
        ? { gridColumns: question?.gridColumns?.length ? question.gridColumns : ['Cột 1', 'Cột 2'] }
        : { gridColumns: undefined }),
      ...(newType === 'linear_scale'
        ? { scaleMin: question?.scaleMin ?? 1, scaleMax: question?.scaleMax ?? 5 }
        : { scaleMin: undefined, scaleMax: undefined, scaleMinLabel: undefined, scaleMaxLabel: undefined }),
    };
    if (supportsOptions(newType)) {
      if (!question?.options || question.options.length === 0) {
        updates.options = ['Lựa chọn 1', 'Lựa chọn 2'];
      }
    } else {
      updates.options = undefined;
    }
    updateQuestion(questionId, updates);
  };

  const toggleCorrectAnswer = (questionId: string, optionValue: string) => {
    const q = questions.find(q => q.id === questionId);
    if (!q) return;
    if (q.type === 'single_choice' || q.type === 'dropdown') {
      updateQuestion(questionId, { correctAnswer: optionValue });
    } else if (q.type === 'multiple_choice') {
      let current = q.correctAnswer;
      if (!Array.isArray(current)) current = current ? [current] : [];
      if (current.includes(optionValue)) {
        updateQuestion(questionId, { correctAnswer: current.filter(val => val !== optionValue) });
      } else {
        updateQuestion(questionId, { correctAnswer: [...current, optionValue] });
      }
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-full md:h-full w-full overflow-x-hidden md:overflow-hidden animate-in fade-in duration-500">
      


      {/* Center Canvas */}
      <section className="flex-1 min-h-[600px] md:min-h-0 md:overflow-y-auto bg-surface-background p-4 md:p-8 relative">
        <div className="max-w-[720px] mx-auto space-y-8 pb-32">

           {!showSurvey ? (
             <>
             <div className="bg-white rounded-2xl border border-border-subtle shadow-sm p-8 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex items-center gap-3 border-b border-border-subtle pb-4">
                  <div className="p-2 bg-secondary-container/20 rounded-xl">
                    <Sparkles size={24} className="text-secondary-container" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-text-primary">Tạo khảo sát bằng AI</h2>
                    <p className="text-sm text-text-secondary mt-1">Tải lên file câu hỏi và nhập chủ đề để AI tự động xây dựng khảo sát.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">Tải lên tài liệu (.docx, .doc, .txt)</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".docx,.doc,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setSelectedFile(file);
                      }}
                    />
                    {selectedFile ? (
                      <div className="border-2 border-primary/30 bg-primary-fixed/20 rounded-xl p-4 flex items-center gap-3">
                        <FileText size={24} className="text-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate" title={selectedFile.name}>{selectedFile.name}</p>
                          <p className="text-xs text-text-secondary">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button
                          onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          className="p-1 text-text-secondary hover:text-sentiment-negative transition-colors cursor-pointer"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <label
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-border-subtle rounded-xl p-8 flex flex-col items-center justify-center text-text-secondary hover:border-primary hover:bg-primary-fixed/20 transition-all cursor-pointer group"
                      >
                        <UploadCloud size={32} className="mb-3 text-text-secondary group-hover:text-primary transition-colors" />
                        <span className="text-sm font-medium group-hover:text-primary">Kéo thả file hoặc <span className="font-bold underline">chọn từ máy tính</span></span>
                        <span className="text-xs mt-2 opacity-75">Hỗ trợ trích xuất câu hỏi tự động bằng AI</span>
                      </label>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">Chủ đề khái quát</label>
                    <textarea 
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="Ví dụ: Khảo sát mức độ hài lòng của khách hàng về dịch vụ giao hàng quý 3..."
                      className="w-full bg-surface-background border border-border-subtle rounded-xl p-4 text-sm focus:ring-2 focus:ring-secondary/50 outline-none transition-all resize-none h-24"
                    ></textarea>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button 
                    onClick={handleGenerate}
                    disabled={isLoading || (!selectedFile && !topic.trim())}
                    className="px-6 py-3 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Đang phân tích & tạo...
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} />
                        Bắt đầu tạo
                      </>
                    )}
                  </button>
                </div>
             </div>
             
             {/* Manual Creation Option */}
             <div className="mt-8 flex flex-col items-center gap-4 animate-in fade-in duration-700 delay-150">
                <div className="flex items-center gap-4 w-full max-w-md opacity-50">
                   <div className="h-px bg-border-subtle flex-1"></div>
                   <span className="text-xs font-bold text-text-secondary uppercase tracking-widest">Hoặc</span>
                   <div className="h-px bg-border-subtle flex-1"></div>
                </div>
                <button 
                  onClick={() => {
                    setSurveyTitle('Khảo sát mới');
                    setSurveyDescription('');
                    setQuestions([{
                      id: `q${Date.now()}`,
                      type: 'single_choice',
                      text: '',
                      options: ['Lựa chọn 1', 'Lựa chọn 2'],
                      required: true,
                    }]);
                    setSections([{ id: 'section-1', title: 'Phần 1' }]);
                    setShowSurvey(true);
                  }}
                  className="px-6 py-3 bg-surface-background border border-border-subtle text-text-secondary font-bold rounded-xl shadow-sm hover:border-primary hover:text-primary hover:bg-white transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={18} />
                  Tạo khảo sát thủ công từ đầu
                </button>
             </div>
             </>
           ) : (
             <>
               {/* Survey Title */}
               <div className="bg-white rounded-2xl border border-border-subtle shadow-sm p-6 md:p-8">
                 <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2 block">Tiêu đề khảo sát</label>
                 <div className="quill-title quill-smart-toolbar w-full">
                   <ReactQuill
                     theme="snow"
                     value={surveyTitle}
                     onChange={(val) => { if (val !== surveyTitle) setSurveyTitle(val); }}
                     placeholder="Nhập tiêu đề khảo sát..."
                     modules={quillModules}
                   />
                 </div>
                 <div className="quill-desc quill-smart-toolbar w-full mt-4">
                   <ReactQuill
                     theme="snow"
                     value={surveyDescription}
                     onChange={(val) => { if (val !== surveyDescription) setSurveyDescription(val); }}
                     placeholder="Mô tả ngắn gọn về khảo sát..."
                     modules={quillModules}
                   />
                 </div>
               </div>

               {/* Question Cards */}
               {questions.map((q, idx) => {
                 const isActive = q.id === activeQuestionId;
                 const sectionId = sections.some(item => item.id === q.sectionId) ? q.sectionId : sections[0]?.id;
                 const section = sections.find(item => item.id === sectionId);
                 const startsSection = section && !questions.slice(0, idx).some(question =>
                   (sections.some(item => item.id === question.sectionId) ? question.sectionId : sections[0]?.id) === sectionId
                 );
                 return (
                   <React.Fragment key={q.id}>
                     {sections.length > 1 && startsSection && section && (
                       <section className="bg-white rounded-2xl border-l-4 border-primary border border-border-subtle shadow-sm p-5 md:p-6">
                         <label className="block text-xs font-bold uppercase tracking-wide text-primary mb-2">{section.title}</label>
                         <input
                           value={section.title}
                           onChange={event => setSections(previous => previous.map(item => item.id === section.id ? { ...item, title: event.target.value } : item))}
                           onClick={event => event.stopPropagation()}
                           placeholder="Tên phần"
                           aria-label="Tên phần khảo sát"
                           className="w-full text-xl font-bold text-text-primary outline-none border-b border-transparent focus:border-primary pb-2"
                         />
                         <textarea
                           value={section.description || ''}
                           onChange={event => setSections(previous => previous.map(item => item.id === section.id ? { ...item, description: event.target.value } : item))}
                           onClick={event => event.stopPropagation()}
                           placeholder="Mô tả phần (không bắt buộc)"
                           aria-label="Mô tả phần khảo sát"
                           rows={2}
                           className="mt-3 w-full resize-y text-sm text-text-secondary outline-none border-b border-transparent focus:border-primary py-2"
                         />
                       </section>
                     )}
                     <div
                         draggable
                         onDragStart={(e) => handleDragStart(e, q.id)}
                         onDragOver={(e) => handleDragOver(e, q.id)}
                         onDragLeave={(e) => handleDragLeave(e, q.id)}
                         onDrop={(e) => handleDrop(e, q.id)}
                         onClick={() => setActiveQuestionId(q.id)}
                         className={`bg-white rounded-2xl p-6 transition-all cursor-pointer ${
                           isActive
                             ? 'border-2 border-primary shadow-lg ring-4 ring-primary/5 scale-[1.01]'
                             : 'border border-border-subtle shadow-sm hover:shadow-md opacity-80 hover:opacity-100'
                         } ${dragOverId === q.id ? 'ring-2 ring-dashed ring-primary/40' : ''}`}
                       >
                     {/* Question Header */}
                     <div className="flex justify-between items-center mb-4">
                       <div className="flex items-center gap-3">
                         <span className={`text-xs font-bold px-2.5 py-1 rounded ${isActive ? 'bg-primary-fixed text-primary' : 'bg-surface-container text-text-secondary'}`}>
                           {isActive ? (
                             <input
                               value={q.label ?? ''}
                               onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                               placeholder="Nhãn câu (tùy chọn)"
                               className="w-44 bg-transparent text-xs font-bold outline-none placeholder:text-text-secondary/70"
                             />
                           ) : (
                             getQuestionLabel(q, idx) || 'Không có nhãn'
                           )} • {questionTypeLabels[q.type]?.label}
                         </span>
                         {q.required && <CheckCircle2 size={16} className="text-sentiment-positive" />}
                       </div>
                       <div className="flex items-center gap-2">
                         {isActive && (
                           <>
                             <button onClick={(e) => { e.stopPropagation(); duplicateQuestion(q.id); }} className="text-text-secondary hover:text-primary transition-colors cursor-pointer p-1"><Copy size={16} /></button>
                             <button onClick={(e) => { e.stopPropagation(); deleteQuestion(q.id); }} className="text-text-secondary hover:text-sentiment-negative transition-colors cursor-pointer p-1"><Trash2 size={16} /></button>
                           </>
                         )}
                         <GripVertical size={18} className={`${isActive ? 'text-primary' : 'text-text-secondary'} cursor-grab`} />
                       </div>
                     </div>

                     {/* Question Text */}
                     {isActive ? (
                       <div className="mb-4 builder-quill">
                         <ReactQuill
                           theme="snow"
                           value={q.text}
                           onChange={(val) => { if (val !== q.text) updateQuestion(q.id, { text: val }); }}
                           placeholder="Nhập nội dung câu hỏi..."
                           modules={quillModules}
                         />
                       </div>
                     ) : (
                       <div 
                         className="font-display text-xl font-semibold text-text-primary mb-4" 
                         dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.text) || 'Nhập nội dung câu hỏi...' }}
                       />
                     )}

                     {/* Question Type Selector (active only) */}
                     {isActive && (
                       <div className="mb-4 max-w-xs">
                         <label htmlFor={`question-type-${q.id}`} className="text-xs font-semibold text-text-secondary mb-2 block">Loại câu hỏi</label>
                         <select
                           id={`question-type-${q.id}`}
                           value={q.type}
                           onClick={event => event.stopPropagation()}
                           onChange={event => changeQuestionType(q.id, event.target.value as QuestionType)}
                           className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm font-semibold text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                         >
                           {(Object.keys(questionTypeLabels) as QuestionType[]).map(type => (
                             <option key={type} value={type}>{questionTypeLabels[type].label}</option>
                           ))}
                         </select>
                       </div>
                     )}

                     {/* Choices or row labels */}
                     {supportsOptions(q.type) && q.options && (
                       <div className="space-y-2 mt-3">
                         {q.options.map((opt, optIdx) => (
                            <div
                              key={optIdx}
                              draggable
                              onDragStart={(e) => handleOptionDragStart(e, q.id, optIdx)}
                              onDragOver={(e) => handleOptionDragOver(e, q.id, optIdx)}
                              onDrop={(e) => handleOptionDrop(e, q.id, optIdx)}
                              onDragEnd={handleOptionDragEnd}
                              className={`flex items-center gap-3 p-3 bg-surface-background rounded-xl border group transition-colors ${isQuiz && ((q.type === 'single_choice' && q.correctAnswer === opt) || (q.type === 'multiple_choice' && Array.isArray(q.correctAnswer) && q.correctAnswer.includes(opt))) ? 'border-sentiment-positive bg-sentiment-positive/5' : 'border-border-subtle'} ${dragOverOption?.questionId === q.id && dragOverOption.index === optIdx ? 'ring-2 ring-primary/40 border-primary' : ''} ${draggedOption?.questionId === q.id && draggedOption.index === optIdx ? 'opacity-50' : ''}`}
                            >
                              <span
                                draggable
                                onDragStart={(e) => handleOptionDragStart(e, q.id, optIdx)}
                                onDragEnd={handleOptionDragEnd}
                                className="flex-shrink-0 p-1 -ml-1 text-text-secondary/60 hover:text-primary cursor-grab active:cursor-grabbing"
                                title="Nhấn giữ và kéo để sắp xếp đáp án"
                                aria-label={`Kéo đáp án ${optIdx + 1} để sắp xếp`}
                              >
                                <GripVertical size={16} />
                              </span>
                              {q.type === 'dropdown' && (
                                <span className="flex-shrink-0 w-5 text-center text-sm font-medium text-text-secondary" aria-label={`Lựa chọn ${optIdx + 1}`}>
                                  {optIdx + 1}.
                                </span>
                              )}
                              {isQuiz && (q.type === 'single_choice' || q.type === 'multiple_choice' || q.type === 'dropdown') ? (
                               <button
                                 onClick={(e) => { e.stopPropagation(); toggleCorrectAnswer(q.id, opt); }}
                                 className={`flex-shrink-0 w-5 h-5 ${q.type === 'multiple_choice' || q.type === 'dropdown' ? 'rounded-md' : 'rounded-full'} border-2 flex items-center justify-center transition-colors cursor-pointer ${
                                   ((q.type === 'single_choice' || q.type === 'dropdown') && q.correctAnswer === opt) || (q.type === 'multiple_choice' && Array.isArray(q.correctAnswer) && q.correctAnswer.includes(opt))
                                     ? 'border-sentiment-positive bg-sentiment-positive text-white' 
                                     : 'border-text-secondary hover:border-sentiment-positive'
                                 }`}
                                 title="Đánh dấu là đáp án đúng"
                               >
                                 {(((q.type === 'single_choice' || q.type === 'dropdown') && q.correctAnswer === opt) || (q.type === 'multiple_choice' && Array.isArray(q.correctAnswer) && q.correctAnswer.includes(opt))) && (
                                    q.type === 'multiple_choice' ? <Check size={14} strokeWidth={3} /> : <CheckCircle2 size={12} />
                                 )}
                               </button>
                             ) : (
                               q.type === 'dropdown'
                                 ? null
                                 : q.type === 'multiple_choice' || q.type === 'checkbox_grid'
                                   ? <CheckSquare size={18} className="text-text-secondary flex-shrink-0" />
                                   : <CircleDot size={18} className="text-text-secondary flex-shrink-0" />
                             )}
                             <div className="flex-1 min-w-0 quill-option quill-smart-toolbar">
                               <ReactQuill
                                 theme="snow"
                                 value={opt}
                                 onChange={(val) => { if (val !== opt) updateOption(q.id, optIdx, val); }}
                                 placeholder={isGridQuestion(q.type) ? `Hàng ${optIdx + 1}` : `Lựa chọn ${optIdx + 1}`}
                                 modules={quillModules}
                               />
                             </div>
                             {isActive && q.options && q.options.length > 2 && (
                               <button onClick={(e) => { e.stopPropagation(); removeOption(q.id, optIdx); }} className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-sentiment-negative transition-all cursor-pointer">
                                 <X size={16} />
                               </button>
                             )}
                           </div>
                         ))}
                         {isActive && (
                           <button
                             onClick={(e) => { e.stopPropagation(); addOption(q.id); }}
                             className="text-primary text-sm font-semibold flex items-center gap-2 mt-2 px-3 py-1.5 hover:bg-primary-fixed rounded-lg transition-colors cursor-pointer"
                           >
                             <Plus size={16} /> {isGridQuestion(q.type) ? 'Thêm hàng' : 'Thêm lựa chọn'}
                           </button>
                         )}
                       </div>
                     )}

                     {isActive && isGridQuestion(q.type) && (
                       <div className="mt-5 rounded-xl border border-border-subtle bg-surface-background p-4">
                         <p className="mb-3 text-sm font-semibold text-text-primary">Các cột trả lời</p>
                         <div className="space-y-2">
                           {(q.gridColumns ?? []).map((column, columnIndex) => (
                             <div key={`${q.id}-column-${columnIndex}`} className="flex items-center gap-2">
                               <input
                                 value={column}
                                 onChange={event => updateGridColumn(q.id, columnIndex, event.target.value)}
                                 aria-label={`Tên cột ${columnIndex + 1}`}
                                 className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-primary/30"
                               />
                               {(q.gridColumns?.length ?? 0) > 2 && (
                                 <button
                                   type="button"
                                   onClick={() => removeGridColumn(q.id, columnIndex)}
                                   aria-label={`Xóa cột ${columnIndex + 1}`}
                                   className="rounded-lg p-2 text-text-secondary hover:bg-sentiment-negative/10 hover:text-sentiment-negative"
                                 >
                                   <X size={16} />
                                 </button>
                               )}
                             </div>
                           ))}
                         </div>
                         <button
                           type="button"
                           onClick={() => addGridColumn(q.id)}
                           className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-fixed"
                         >
                           <Plus size={16} /> Thêm cột
                         </button>
                         <p className="mt-2 text-xs text-text-secondary">Mỗi hàng là một ý cần đánh giá; các cột là lựa chọn trả lời.</p>
                       </div>
                     )}

                     {/* Preview for other types */}
                     {q.type === 'star_rating' && (
                       <div className="flex gap-1 mt-2 opacity-50">
                         {[1,2,3,4,5].map(s => (
                           <Star key={s} size={24} className="text-surface-container-highest" />
                         ))}
                       </div>
                     )}
                     {q.type === 'text' && (
                       <div className="mt-2 bg-surface-background border border-border-subtle rounded-xl p-4 text-sm text-text-secondary italic opacity-50">
                         Người trả lời sẽ nhập văn bản tại đây...
                       </div>
                     )}
                     {q.type === 'nps' && (
                       <div className="flex gap-1 mt-2 opacity-50">
                         {Array.from({length: 11}, (_, i) => (
                           <div key={i} className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-xs font-bold text-text-secondary">{i}</div>
                         ))}
                       </div>
                     )}
                     {q.type === 'dropdown' && (
                       <div className="mt-2 flex items-center justify-between rounded-xl border border-border-subtle bg-white px-4 py-3 text-sm text-text-secondary opacity-70">
                         <span>Chọn một lựa chọn</span><ChevronDown size={18} />
                       </div>
                     )}
                     {q.type === 'date' && (
                       <div className="mt-2 flex items-center gap-3 rounded-xl border border-border-subtle bg-white px-4 py-3 text-sm text-text-secondary opacity-70">
                         <CalendarDays size={18} /> Ngày / tháng / năm
                       </div>
                     )}
                     {q.type === 'linear_scale' && (
                       <div className="mt-3 space-y-2 opacity-70">
                         <div className="flex flex-wrap gap-2">
                           {Array.from({ length: (q.scaleMax ?? 5) - (q.scaleMin ?? 1) + 1 }, (_, index) => (q.scaleMin ?? 1) + index).map(value => (
                             <span key={value} className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-border-subtle bg-white px-2 text-sm">{value}</span>
                           ))}
                         </div>
                         <div className="flex justify-between text-xs text-text-secondary"><span>{q.scaleMinLabel || ' '}</span><span>{q.scaleMaxLabel || ' '}</span></div>
                       </div>
                     )}
                     {isGridQuestion(q.type) && (
                       <p className="mt-2 rounded-xl border border-border-subtle bg-surface-background p-4 text-sm text-text-secondary">
                         Bảng trả lời gồm {(q.options ?? []).length} hàng và {(q.gridColumns ?? []).length} cột.
                       </p>
                     )}

                      {/* Footer Settings */}
                      {isActive && (
                        <div className="mt-4 pt-4 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-end gap-4">
                          {q.type === 'multiple_choice' && (
                            <label className="flex flex-col gap-1.5 sm:mr-auto">
                              <span className="text-sm font-medium text-text-secondary">Giới hạn số đáp án được chọn</span>
                              <select
                                value={q.maxSelections ?? ''}
                                onChange={(e) => updateQuestion(q.id, { maxSelections: e.target.value ? Number(e.target.value) : undefined })}
                                className="min-w-56 bg-surface-background border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-primary/30"
                              >
                                <option value="">Không giới hạn</option>
                                {Array.from({ length: q.options?.length ?? 0 }, (_, index) => index + 1).map(limit => (
                                  <option key={limit} value={limit}>Tối đa {limit} {limit === 1 ? 'đáp án' : 'đáp án'}</option>
                                ))}
                              </select>
                              <span className="text-[11px] text-text-secondary">Người trả lời sẽ không thể chọn quá số này.</span>
                            </label>
                          )}
                          {q.type === 'single_choice' && (
                            <label className="flex flex-col gap-1.5 sm:mr-auto">
                              <span className="text-sm font-medium text-text-secondary">Kết thúc khảo sát nếu chọn</span>
                              <select
                                value={q.screenOutAnswer ?? ''}
                                onChange={(e) => updateQuestion(q.id, { screenOutAnswer: e.target.value || undefined })}
                                className="min-w-56 bg-surface-background border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-primary/30"
                              >
                                <option value="">Không lọc</option>
                                {(q.options ?? []).map((option, index) => (
                                  <option key={index} value={option}>{stripHtml(cleanHtmlWhitespace(option)) || `Lựa chọn ${index + 1}`}</option>
                                ))}
                              </select>
                              {q.screenOutAnswer && (
                                <>
                                  <span className="text-[11px] text-text-secondary">Người chọn đáp án này sẽ dừng và được ghi nhận riêng.</span>
                                  <textarea
                                    value={q.screenOutMessage ?? ''}
                                    onChange={(e) => updateQuestion(q.id, { screenOutMessage: e.target.value })}
                                    maxLength={500}
                                    rows={2}
                                    placeholder="Cảm ơn bạn. Dựa trên câu trả lời, bạn không thuộc đối tượng khảo sát này."
                                    className="min-w-56 resize-y bg-surface-background border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                  <span className="text-[11px] text-text-secondary">Có thể nhập thông báo riêng hoặc để trống để dùng thông báo mặc định.</span>
                                </>
                              )}
                            </label>
                          )}
                          {q.type === 'linear_scale' && (
                            <div className="grid w-full grid-cols-2 gap-3 sm:mr-auto sm:max-w-xl">
                              <label className="flex flex-col gap-1.5">
                                <span className="text-sm font-medium text-text-secondary">Mức thấp nhất</span>
                                <select
                                  value={q.scaleMin ?? 1}
                                  onChange={event => {
                                    const scaleMin = Number(event.target.value);
                                    updateQuestion(q.id, { scaleMin, ...(scaleMin >= (q.scaleMax ?? 5) ? { scaleMax: scaleMin + 1 } : {}) });
                                  }}
                                  className="rounded-lg border border-border-subtle bg-surface-background px-3 py-2 text-sm"
                                >
                                  {[0, 1].map(value => <option key={value} value={value}>{value}</option>)}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-sm font-medium text-text-secondary">Mức cao nhất</span>
                                <select
                                  value={q.scaleMax ?? 5}
                                  onChange={event => updateQuestion(q.id, { scaleMax: Number(event.target.value) })}
                                  className="rounded-lg border border-border-subtle bg-surface-background px-3 py-2 text-sm"
                                >
                                  {Array.from({ length: 10 - (q.scaleMin ?? 1) }, (_, index) => (q.scaleMin ?? 1) + index + 1).map(value => <option key={value} value={value}>{value}</option>)}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-sm font-medium text-text-secondary">Nhãn mức thấp (không bắt buộc)</span>
                                <input value={q.scaleMinLabel ?? ''} maxLength={100} onChange={event => updateQuestion(q.id, { scaleMinLabel: event.target.value })} className="rounded-lg border border-border-subtle bg-surface-background px-3 py-2 text-sm" />
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-sm font-medium text-text-secondary">Nhãn mức cao (không bắt buộc)</span>
                                <input value={q.scaleMaxLabel ?? ''} maxLength={100} onChange={event => updateQuestion(q.id, { scaleMaxLabel: event.target.value })} className="rounded-lg border border-border-subtle bg-surface-background px-3 py-2 text-sm" />
                              </label>
                            </div>
                          )}
                          {q.type === 'text' && (
                            <label className="flex flex-col gap-1.5 sm:mr-auto">
                              <span className="text-sm font-medium text-text-secondary">Thống kê theo nhóm</span>
                              <select
                                value={q.textAnalysisMode ?? 'auto'}
                                onChange={(e) => updateQuestion(q.id, { textAnalysisMode: e.target.value as 'auto' | 'include' | 'exclude' })}
                                className="min-w-56 bg-surface-background border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-primary/30"
                              >
                                <option value="auto">Tự động (trường, ngành, khoa...)</option>
                                <option value="include">Luôn thống kê câu này</option>
                                <option value="exclude">Chỉ giữ phản hồi mở</option>
                              </select>
                              <span className="text-[11px] text-text-secondary">Họ tên, email, SĐT và mã số cá nhân luôn không được tổng hợp.</span>
                            </label>
                          )}
                          {isQuiz && (q.type === 'single_choice' || q.type === 'multiple_choice' || q.type === 'dropdown') && (
                           <div className="flex items-center gap-2">
                             <span className="text-sm font-medium text-text-secondary">Điểm:</span>
                             <input
                               type="number"
                               step="0.5"
                               min="0"
                               value={q.points !== undefined ? q.points : 1}
                               onChange={(e) => updateQuestion(q.id, { points: parseFloat(e.target.value) || 0 })}
                               className="w-20 px-2 py-1 bg-surface-background border border-border-subtle rounded-md text-sm text-center focus:ring-2 focus:ring-primary/50 outline-none"
                             />
                           </div>
                         )}
                         <div className="flex items-center gap-3">
                           <span className="text-sm font-medium text-text-secondary">Bắt buộc trả lời</span>
                           <label className="relative inline-flex items-center cursor-pointer">
                             <input type="checkbox" className="sr-only peer" checked={q.required} onChange={(e) => updateQuestion(q.id, { required: e.target.checked })} />
                             <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-subtle after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                           </label>
                         </div>
                       </div>
                     )}
                     </div>
                   </React.Fragment>
                 );
               })}

               {/* Add New Question */}
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 <button
                   type="button"
                   onClick={addQuestion}
                   className="border-2 border-dashed border-border-subtle p-5 rounded-2xl flex items-center justify-center gap-2 text-text-secondary hover:border-primary hover:text-primary hover:bg-primary-fixed/30 transition-all cursor-pointer group"
                 >
                   <Plus size={20} className="group-hover:scale-110 transition-transform" />
                   <span className="text-sm font-semibold">Thêm câu hỏi</span>
                 </button>
                 <button
                   type="button"
                   onClick={addSection}
                   className="border-2 border-dashed border-primary/40 p-5 rounded-2xl flex items-center justify-center gap-2 text-primary hover:border-primary hover:bg-primary-fixed/30 transition-all cursor-pointer group"
                 >
                   <Plus size={20} className="group-hover:scale-110 transition-transform" />
                   <span className="text-sm font-semibold">Thêm phần</span>
                 </button>
               </div>

               {/* Publish Bar */}
               <div className="fixed bottom-0 left-0 md:left-64 right-0 md:right-80 bg-white/95 backdrop-blur-md border-t border-border-subtle p-2 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between z-20 gap-2">
                 <div className="w-full min-w-0 flex flex-nowrap sm:flex-wrap items-center gap-2 md:gap-4 overflow-x-auto whitespace-nowrap pb-1 sm:pb-0 [&>*]:shrink-0">
                   <span className="text-xs md:text-sm font-medium text-text-secondary">{questions.length} câu hỏi</span>
                   <span className="hidden md:inline text-text-secondary">•</span>
                   <label className="flex items-center gap-2 cursor-pointer group">
                     <div className="relative">
                       <input type="checkbox" className="sr-only" checked={isQuiz} onChange={(e) => setIsQuiz(e.target.checked)} />
                       <div className={`block w-10 h-6 rounded-full transition-colors ${isQuiz ? 'bg-sentiment-positive' : 'bg-surface-container-highest'}`}></div>
                       <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isQuiz ? 'translate-x-4' : ''}`}></div>
                     </div>
                     <span className={`text-xs md:text-sm font-semibold transition-colors ${isQuiz ? 'text-sentiment-positive' : 'text-text-secondary group-hover:text-text-primary'}`}>
                       Chế độ chấm điểm
                     </span>
                   </label>
                   {isQuiz && (
                     <>
                       <span className="hidden md:inline text-text-secondary">•</span>
                       <label className="flex items-center gap-2 cursor-pointer group">
                         <div className="relative">
                           <input type="checkbox" className="sr-only" checked={showScore} onChange={(e) => setShowScore(e.target.checked)} />
                           <div className={`block w-8 h-5 rounded-full transition-colors ${showScore ? 'bg-primary' : 'bg-surface-container-highest'}`}></div>
                           <div className={`absolute left-[3px] top-[3px] bg-white w-3.5 h-3.5 rounded-full transition-transform ${showScore ? 'translate-x-3' : ''}`}></div>
                         </div>
                         <span className="text-xs md:text-sm font-semibold text-text-secondary group-hover:text-text-primary transition-colors">
                           Hiện điểm cuối bài
                         </span>
                       </label>
                     </>
                   )}
                   <span className="hidden md:inline text-text-secondary">•</span>
                   <div className="flex items-center gap-2 rounded-lg bg-surface-container-low px-2 py-1.5">
                     <span className="text-[10px] md:text-xs font-bold uppercase tracking-wide text-text-secondary">Trình bày</span>
                     <div className="flex rounded-md border border-border-subtle bg-white p-0.5">
                       <button
                         type="button"
                         onClick={() => setDisplayMode('single')}
                         className={`px-2 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors cursor-pointer ${displayMode === 'single' ? 'bg-primary text-white' : 'text-text-secondary hover:text-primary'}`}
                       >
                         1 câu / trang
                       </button>
                       <button
                         type="button"
                         onClick={() => setDisplayMode('all')}
                         className={`px-2 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors cursor-pointer ${displayMode === 'all' ? 'bg-primary text-white' : 'text-text-secondary hover:text-primary'}`}
                       >
                         Nhiều câu / trang
                       </button>
                     </div>
                   </div>
                   <span className="hidden md:inline text-text-secondary">•</span>
                   <label className="flex items-center gap-2 rounded-lg bg-surface-container-low px-2 py-1.5 text-[10px] md:text-xs font-medium text-text-secondary">
                     <span>Mỗi thiết bị</span>
                     <input
                       type="number"
                       min="1"
                       step="1"
                       value={maxAttemptsPerDevice ?? 1}
                       onChange={(e) => setMaxAttemptsPerDevice(Math.max(1, Number(e.target.value) || 1))}
                       className="w-16 rounded-md border border-border-subtle bg-white px-2 py-1 text-[10px] md:text-xs text-text-primary focus:ring-2 focus:ring-primary/30 outline-none"
                     />
                     <span>lần</span>
                   </label>
                   <span className="hidden md:inline text-text-secondary">•</span>
                   <label className="flex items-center gap-2 rounded-lg bg-surface-container-low px-2 py-1.5 text-[10px] md:text-xs font-medium text-text-secondary">
                     <span>Thời gian làm</span>
                     <input
                       type="number"
                       min="1"
                       step="1"
                       value={timeLimitMinutes ?? ''}
                       onChange={(e) => setTimeLimitMinutes(e.target.value ? Math.max(1, Number(e.target.value)) : null)}
                       placeholder="Không giới hạn"
                       className="w-24 rounded-md border border-border-subtle bg-white px-2 py-1 text-[10px] md:text-xs text-text-primary focus:ring-2 focus:ring-primary/30 outline-none"
                     />
                     <span>phút</span>
                   </label>
                   <span className="hidden md:inline text-text-secondary">•</span>
                   <label className="flex items-center gap-2 rounded-lg bg-surface-container-low px-2 py-1.5 text-xs font-medium text-text-secondary">
                     <span>Khóa tới</span>
                     <input
                       type="datetime-local"
                       value={toDateTimeLocalValue(closesAt)}
                       onChange={(e) => setClosesAt(e.target.value ? new Date(e.target.value).toISOString() : null)}
                       className="rounded-md border border-border-subtle bg-white px-2 py-1 text-[10px] md:text-xs text-text-primary focus:ring-2 focus:ring-primary/30 outline-none"
                     />
                   </label>
                   <span className="hidden md:inline text-text-secondary">•</span>
                  <button
                    onClick={saveSurveyDraft}
                    disabled={isSavingDraft}
                    className="text-xs md:text-sm font-semibold text-text-secondary hover:text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingDraft ? 'Đang lưu...' : 'Lưu nháp'}
                   </button>
                   <span className="text-[10px] md:text-xs text-text-secondary">{draftSavedAt ? `Đã lưu ${draftSavedAt}` : 'Chưa lưu'}</span>
                   <button
                     onClick={() => { setShowSurvey(false); setQuestions([]); setSections([{ id: 'section-1', title: 'Phần 1' }]); setSurveyTitle(''); setSurveyDescription(''); setActiveQuestionId(null); setIsQuiz(false); setShowScore(true); setDisplayMode('single'); setClosesAt(null); setTimeLimitMinutes(null); clearDraft(); }}
                     className="text-xs md:text-sm font-semibold text-text-secondary hover:text-sentiment-negative transition-colors cursor-pointer"
                   >
                     Tạo lại
                   </button>
                 </div>
                 <button
                   onClick={handlePublish}
                   disabled={isPublishing || questions.length === 0}
                   className="w-full sm:w-auto justify-center shrink-0 px-4 md:px-8 py-2 md:py-2.5 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-xs md:text-sm"
                 >
                  {isPublishing ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
                  {currentSurvey ? 'Cập nhật' : 'Xuất bản'}
                 </button>
               </div>
             </>
           )}

        </div>
      </section>

      {/* Right Sidebar: AI Orchestrator */}
      <aside className="w-full md:w-80 bg-white border-t md:border-t-0 md:border-l border-border-subtle md:h-full flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-2 border-b border-border-subtle bg-white">
           <Sparkles size={20} className="text-secondary-container" />
           <h2 className="font-display text-lg font-bold">Bộ điều phối AI</h2>
        </div>
        
        <div className="flex-1 p-6 space-y-8 overflow-y-auto">
           {/* Stats */}
           {showSurvey && questions.length > 0 && (
             <div className="rounded-2xl p-5 bg-white border border-secondary-container/30 shadow-[0_0_15px_rgba(57,184,253,0.1)]">
                <div className="flex items-center justify-between mb-3">
                   <span className="text-sm font-bold text-secondary">Tổng quan khảo sát</span>
                   <span className="text-[10px] uppercase font-bold text-sentiment-positive bg-sentiment-positive/10 px-1.5 py-0.5 rounded">Sẵn sàng</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="bg-white p-3 rounded-xl text-center">
                    <div className="font-display text-2xl font-bold text-primary">{questions.length}</div>
                    <div className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Câu hỏi</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl text-center">
                    <div className="font-display text-2xl font-bold text-secondary">{new Set(questions.map(q => q.type)).size}</div>
                    <div className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Loại</div>
                  </div>
                </div>
                {isQuiz && (
                  <div className="mt-4 rounded-xl bg-white p-3">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-text-secondary">Tổng điểm</div>
                    <div className="mt-1 font-display text-2xl font-bold text-sentiment-positive">{totalPossibleScore}</div>
                  </div>
                )}
             </div>
           )}

           {/* Question type breakdown */}
           {showSurvey && questions.length > 0 && (
             <div className="space-y-3">
                <h3 className="text-sm font-bold text-text-primary px-1">Phân bố câu hỏi</h3>
                <div className="space-y-2">
                  {(Object.keys(questionTypeLabels) as QuestionType[]).map(type => {
                    const count = questions.filter(q => q.type === type).length;
                    if (count === 0) return null;
                    return (
                      <div key={type} className="flex items-center gap-3 p-3 bg-surface-container-low rounded-xl">
                        {questionTypeLabels[type].icon}
                        <span className="text-xs font-semibold text-text-primary flex-1">{questionTypeLabels[type].label}</span>
                        <span className="text-xs font-bold text-primary bg-primary-fixed px-2 py-0.5 rounded">{count}</span>
                      </div>
                    );
                  })}
                </div>
             </div>
           )}

           {/* Contextual Tip */}
           <div className="p-5 bg-primary-fixed rounded-2xl border border-primary-fixed-dim/50">
              <h3 className="text-xs font-bold text-primary mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                 <Sparkles size={14} /> Mẹo theo ngữ cảnh
              </h3>
              <p className="text-xs leading-relaxed text-text-secondary font-medium">
                 Khảo sát có <span className="font-bold text-primary">5-8 câu hỏi</span> thường có tỷ lệ hoàn thành cao hơn 40% trong ngành của bạn.
              </p>
           </div>

           {/* AI Chat History */}
           {aiMessages.length > 0 && (
             <div className="space-y-4 pt-4 border-t border-border-subtle">
               {aiMessages.map((msg, idx) => (
                 <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[90%] p-3 text-sm rounded-2xl ${msg.type === 'user' ? 'bg-primary text-white rounded-tr-sm' : 'bg-surface-container-low text-text-primary rounded-tl-sm'}`}>
                     {msg.type === 'user' ? (
                       msg.text
                     ) : (
                       <div className="prose prose-sm prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                         <ReactMarkdown>{msg.text}</ReactMarkdown>
                       </div>
                     )}
                   </div>
                 </div>
               ))}
               {isAiTyping && (
                 <div className="flex justify-start">
                   <div className="bg-surface-container-low text-text-primary rounded-2xl rounded-tl-sm p-3 flex gap-1">
                     <span className="w-1.5 h-1.5 bg-text-secondary/50 rounded-full animate-bounce"></span>
                     <span className="w-1.5 h-1.5 bg-text-secondary/50 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                     <span className="w-1.5 h-1.5 bg-text-secondary/50 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                   </div>
                 </div>
               )}
               <div ref={messagesEndRef} />
             </div>
           )}
        </div>

        {/* AI Chat Input */}
        <div className="p-6 border-t border-border-subtle bg-white">
           <form onSubmit={handleAiChatSubmit} className="relative">
              <input 
                 type="text" 
                 value={aiInput}
                 onChange={(e) => setAiInput(e.target.value)}
                 placeholder="Hỏi AI để được trợ giúp..." 
                 className="w-full bg-white border border-border-subtle rounded-full py-2.5 pl-4 pr-10 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none shadow-sm transition-all"
              />
              <button 
                 type="submit"
                 disabled={!aiInput.trim() || isAiTyping}
                 className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                 <Send size={18} />
              </button>
           </form>
        </div>
      </aside>

      {/* Share Modal */}
      <ShareModal
        isOpen={!!publishedSurvey}
        onClose={() => setPublishedSurvey(null)}
        surveyId={publishedSurvey?.id || ''}
        surveyTitle={publishedSurvey?.title || ''}
      />

    </div>
  );
}
