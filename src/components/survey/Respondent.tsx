import { Timer, Undo2, Sparkles, CircleDot, CheckSquare, CheckCircle2, Home, Edit3, LogOut, X, Trash2, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useSurvey } from '../../context/SurveyContext';
import { stripHtml, cleanHtmlWhitespace, sanitizeHtml } from '../../utils/stringUtils';
import type { Survey, SurveyQuestion } from '../../types';
import { roundLegacyStarRating } from '../../../shared/starRating';

interface RespondentProps {
  survey: Survey | null;
  onExit: () => void;
  onComplete?: () => void;
  isPublic?: boolean;
}

function normalizeSavedStarRatings(survey: Survey, source: Record<string, any>) {
  const normalized = { ...source };
  for (const question of survey.questions) {
    if (question.type !== 'star_rating') continue;
    const rating = roundLegacyStarRating(normalized[question.id]);
    if (rating !== null) normalized[question.id] = rating;
  }
  return normalized;
}

const DEFAULT_SCREEN_OUT_MESSAGE = 'Cảm ơn bạn đã tham gia. Dựa trên câu trả lời của bạn, bạn không thuộc đối tượng khảo sát này.';

export function Respondent({ survey, onExit, onComplete, isPublic = false }: RespondentProps) {
  const { submitResponse, fetchMyResponse } = useSurvey();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [respondentId, setRespondentId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isScreenedOut, setIsScreenedOut] = useState(false);
  const [isScreeningOut, setIsScreeningOut] = useState(false);
  const [screenOutNotice, setScreenOutNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [quizScore, setQuizScore] = useState<number | undefined>(undefined);
  const [quizTotal, setQuizTotal] = useState<number | undefined>(undefined);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showCloseHint, setShowCloseHint] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [hasStartedTimedSurvey, setHasStartedTimedSurvey] = useState(false);

  const getDeviceId = useCallback(() => {
    const key = `survey-device-id:${survey?.id ?? 'anon'}`;
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = `device-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(key, next);
    return next;
  }, [survey?.id]);

  const getCurrentDeviceAttempts = useCallback(() => {
    if (!survey?.id) return 0;
    const key = `survey-device-attempts:${survey.id}`;
    try {
      const raw = localStorage.getItem(key);
      const map = raw ? JSON.parse(raw) : {};
      const id = getDeviceId();
      return Number(map[id] || 0);
    } catch {
      return 0;
    }
  }, [getDeviceId, survey?.id]);

  useEffect(() => {
    if (!survey) {
      setIsLoading(false);
      return;
    }

    const initRespondent = async () => {
      try {
        // A device may be allowed to submit more than once.  Give each allowed
        // attempt its own respondent ID so the response API creates a new row
        // instead of loading/updating the first attempt.
        const completedAttempts = getCurrentDeviceAttempts();
        const maxAttempts = survey.maxAttemptsPerDevice ?? null;
        // Once the device has reached its limit, reopen its most recent
        // attempt so the respondent can still view the saved score.
        const attemptNumber = maxAttempts && maxAttempts > 0 && completedAttempts >= maxAttempts
          ? maxAttempts
          : completedAttempts + 1;
        const rid = `${getDeviceId()}-attempt-${attemptNumber}`;
        setRespondentId(rid);
        setHasStartedTimedSurvey(
          !survey.timeLimitMinutes || survey.timeLimitMinutes <= 0 ||
          Boolean(localStorage.getItem(`survey-timer-start:${survey.id}:${rid}`))
        );

        try {
          const savedDraft = localStorage.getItem(`survey-draft:${survey.id}:${rid}`);
          if (savedDraft) {
            const savedAnswers = JSON.parse(savedDraft);
            if (savedAnswers && typeof savedAnswers === 'object') {
              setAnswers(normalizeSavedStarRatings(survey, savedAnswers));
            }
          }
        } catch (error) {
          console.warn('Failed to load survey draft', error);
        }

        try {
          const existingResponse = await fetchMyResponse(survey.id, rid);
          if (existingResponse && existingResponse.answers && Object.keys(existingResponse.answers).length > 0) {
            setAnswers(normalizeSavedStarRatings(survey, existingResponse.answers));
            if (existingResponse.screenedOut) {
              const screeningQuestion = survey.questions.find(question =>
                question.type === 'single_choice'
                && question.screenOutAnswer
                && existingResponse.answers[question.id] === question.screenOutAnswer
              );
              setIsScreenedOut(true);
              setScreenOutNotice(screeningQuestion?.screenOutMessage?.trim() || DEFAULT_SCREEN_OUT_MESSAGE);
            }
            if (existingResponse.score !== undefined) setQuizScore(existingResponse.score);
            if (existingResponse.totalQuizQuestions !== undefined) setQuizTotal(existingResponse.totalQuizQuestions);
            setIsCompleted(true);
          }
        } catch (e) {
          console.warn('Failed to fetch existing response', e);
        }
      } catch (err) {
        console.error('Error during initRespondent:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initRespondent();
  }, [survey?.id, fetchMyResponse, getCurrentDeviceAttempts, getDeviceId]);

  useEffect(() => {
    if (!survey || !respondentId) return;
    const draftKey = `survey-draft:${survey.id}:${respondentId}`;
    if (isCompleted) {
      localStorage.removeItem(draftKey);
      return;
    }

    localStorage.setItem(draftKey, JSON.stringify(answers));
    setDraftSavedAt(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
  }, [answers, isCompleted, respondentId, survey]);

  useEffect(() => {
    if (!survey || !respondentId || !survey.timeLimitMinutes || survey.timeLimitMinutes <= 0 || !hasStartedTimedSurvey || isCompleted) {
      setRemainingSeconds(null);
      return;
    }

    const timerKey = `survey-timer-start:${survey.id}:${respondentId}`;
    let startedAt = Number(localStorage.getItem(timerKey));
    if (!startedAt) {
      startedAt = Date.now();
      localStorage.setItem(timerKey, String(startedAt));
    }

    let hasExpired = false;
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((startedAt + survey.timeLimitMinutes! * 60_000 - Date.now()) / 1000));
      setRemainingSeconds(seconds);
      if (seconds === 0 && !hasExpired) {
        hasExpired = true;
        void submitSurvey();
      }
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(intervalId);
  }, [survey?.id, survey?.timeLimitMinutes, respondentId, hasStartedTimedSurvey, isCompleted]);

  const questions = survey?.questions ?? [];
  const displayMode = survey?.displayMode ?? 'single';
  const showAllQuestions = displayMode === 'all';
  const sections = survey?.sections ?? [];
  const sectionMode = sections.length > 1;
  const currentSection = sectionMode ? sections[step] : undefined;
  const currentPageQuestions = sectionMode
    ? questions.filter(question => (
        sections.some(section => section.id === question.sectionId) ? question.sectionId : sections[0].id
      ) === currentSection?.id)
    : showAllQuestions ? questions : questions[step] ? [questions[step]] : [];
  const totalSteps = sectionMode ? sections.length : showAllQuestions ? 1 : questions.length;
  const currentQuestion = showAllQuestions || sectionMode ? null : questions[step];
  const answeredQuestionCount = questions.reduce((count, question) => {
    const value = answers[question.id];
    if (value === undefined || value === null || value === '') return count;
    if (Array.isArray(value) && value.length === 0) return count;
    return count + 1;
  }, 0);
  const progress = showAllQuestions && !sectionMode
    ? Math.round((answeredQuestionCount / Math.max(questions.length, 1)) * 100)
    : Math.round(((step + 1) / totalSteps) * 100);
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const hasAnswerProgress = Object.keys(answers).length > 0 || step > 0;

  const callExit = useCallback(() => {
    if (isPublic) {
      // Try closing the tab; if blocked, show a friendly hint instead of leaving user stuck
      try {
        window.close();
      } catch (_) { /* ignore */ }
      // window.close() is silently ignored on non-popup tabs — show fallback hint
      setTimeout(() => setShowCloseHint(true), 300);
      return;
    }

    try {
      onExit();
    } catch (_) {
      window.location.replace('/');
    }
  }, [isPublic, onExit]);

  const handleExitAndClearDraft = useCallback(() => {
    if (survey && respondentId) {
      localStorage.removeItem(`survey-draft:${survey.id}:${respondentId}`);
    }
    setAnswers({});
    setDraftSavedAt(null);
    setShowExitConfirm(false);
    callExit();
  }, [survey, respondentId, callExit]);

  const handleExitKeepDraft = useCallback(() => {
    setShowExitConfirm(false);
    callExit();
  }, [callExit]);

  const handleExitRequest = () => {
    // Smart confirm: only show dialog if the user has made progress
    if (!hasAnswerProgress) {
      callExit();
      return;
    }
    setShowExitConfirm(true);
  };

  const startTimedSurvey = () => {
    if (!survey || !respondentId) return;
    localStorage.setItem(`survey-timer-start:${survey.id}:${respondentId}`, String(Date.now()));
    setHasStartedTimedSurvey(true);
  };

  const hasAnswerProgressRef = { current: hasAnswerProgress };
  hasAnswerProgressRef.current = hasAnswerProgress;

  // Handle browser back button — prevent accidental exit when there's progress
  useEffect(() => {
    if (!survey || isCompleted) return;

    window.history.pushState({ surveyGuard: true }, '');

    const handlePopState = () => {
      if (hasAnswerProgressRef.current) {
        window.history.pushState({ surveyGuard: true }, '');
        setShowExitConfirm(true);
      } else {
        callExit();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [survey?.id, isCompleted, callExit]);

  if (isLoading) {
    return <div className="min-h-screen bg-surface-background flex items-center justify-center font-sans text-text-secondary">Đang chuẩn bị khảo sát...</div>;
  }

  const isSurveyClosed = !!survey?.closesAt && new Date(survey.closesAt).getTime() <= Date.now();
  const maxAttemptsPerDevice = survey?.maxAttemptsPerDevice ?? null;
  const currentDeviceAttempts = getCurrentDeviceAttempts();

  if (maxAttemptsPerDevice && maxAttemptsPerDevice > 0 && currentDeviceAttempts >= maxAttemptsPerDevice && !isCompleted) {
    return (
      <div className="min-h-screen bg-surface-background flex flex-col items-center justify-center gap-4 font-sans px-4 text-center">
        <div className="w-16 h-16 bg-surface-container-high rounded-2xl flex items-center justify-center">
          <AlertTriangle size={28} className="text-sentiment-negative" />
        </div>
        <h2 className="font-display text-2xl font-bold text-text-primary">Bạn đã hết lượt làm khảo sát trên thiết bị này</h2>
        <p className="text-text-secondary text-sm max-w-md">Mỗi thiết bị chỉ được làm tối đa {maxAttemptsPerDevice} lần.</p>
        <button onClick={onExit} className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors cursor-pointer">
          Quay lại
        </button>
      </div>
    );
  }

  if (isScreeningOut && !isCompleted) {
    return (
      <div className="min-h-screen bg-surface-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <h2 className="font-display text-xl font-bold text-text-primary">Đang kết thúc khảo sát...</h2>
        <p className="text-sm text-text-secondary">Đang lưu câu trả lời sàng lọc của bạn.</p>
      </div>
    );
  }

  if (isSurveyClosed) {
    return (
      <div className="min-h-screen bg-surface-background flex flex-col items-center justify-center gap-4 font-sans px-4 text-center">
        <div className="w-16 h-16 bg-surface-container-high rounded-2xl flex items-center justify-center">
          <Timer size={28} className="text-text-secondary" />
        </div>
        <h2 className="font-display text-2xl font-bold text-text-primary">Khảo sát đã kết thúc</h2>
        <p className="text-text-secondary text-sm max-w-md">Thời gian tham gia khảo sát đã hết. Cảm ơn bạn đã quan tâm.</p>
        <button onClick={onExit} className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors cursor-pointer">
          Quay lại
        </button>
      </div>
    );
  }

  if (!survey || !survey.questions || survey.questions.length === 0) {
    return (
      <div className="min-h-screen bg-surface-background flex flex-col items-center justify-center gap-4 font-sans">
        <div className="w-16 h-16 bg-surface-container-high rounded-2xl flex items-center justify-center">
          <Sparkles size={28} className="text-text-secondary" />
        </div>
        <h2 className="font-display text-2xl font-bold text-text-primary">Không có khảo sát nào để hiển thị</h2>
        <p className="text-text-secondary text-sm">Vui lòng quay lại sau hoặc liên hệ quản trị viên.</p>
        <button onClick={onExit} className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors cursor-pointer">
          Quay lại
        </button>
      </div>
    );
  }

  if (survey.timeLimitMinutes && survey.timeLimitMinutes > 0 && !hasStartedTimedSurvey && !isCompleted) {
    return (
      <div className="min-h-screen bg-surface-background flex flex-col items-center justify-center gap-6 font-sans px-4 text-center">
        <div className="w-16 h-16 bg-primary-fixed rounded-2xl flex items-center justify-center">
          <Timer size={30} className="text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary mb-2">Sẵn sàng làm bài?</h1>
          <p className="text-text-secondary text-sm max-w-md">Bài làm có thời gian {survey.timeLimitMinutes} phút. Đồng hồ sẽ bắt đầu khi bạn bấm nút bên dưới và bài sẽ tự nộp khi hết giờ.</p>
        </div>
        <button onClick={startTimedSurvey} className="px-7 py-3 bg-primary text-white rounded-xl font-bold text-base hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 cursor-pointer">
          Bắt đầu làm bài
        </button>
        <button onClick={onExit} className="text-sm font-semibold text-text-secondary hover:text-primary transition-colors cursor-pointer">Quay lại</button>
      </div>
    );
  }

  const setAnswerForQuestion = (questionId: string, value: any) => {
    setErrorMsg('');
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const clearAnswerForQuestion = (questionId: string) => {
    setErrorMsg('');
    setAnswers(prev => { const next = { ...prev }; delete next[questionId]; return next; });
  };

  const clearAllDraft = () => {
    if (!survey || !respondentId) return;
    setAnswers({});
    localStorage.removeItem(`survey-draft:${survey.id}:${respondentId}`);
    setDraftSavedAt(null);
  };

  const setAnswer = (value: any) => {
    if (!currentQuestion) return;
    setAnswerForQuestion(currentQuestion.id, value);
  };

  const clearAnswer = () => {
    if (!currentQuestion) return;
    clearAnswerForQuestion(currentQuestion.id);
  };

  const clearCurrentPageAnswers = () => {
    setErrorMsg('');
    setAnswers(previous => {
      const next = { ...previous };
      currentPageQuestions.forEach(question => delete next[question.id]);
      return next;
    });
  };

  const validateQuestion = (question: SurveyQuestion, answer: any) => {
    if (!question.required) return true;
    if (question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid') {
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
      return (question.options ?? []).every(row => {
        const rowAnswer = answer[row];
        if (question.type === 'checkbox_grid') {
          return Array.isArray(rowAnswer) && rowAnswer.length > 0 && rowAnswer.every(value => question.gridColumns?.includes(value));
        }
        return typeof rowAnswer === 'string' && question.gridColumns?.includes(rowAnswer);
      });
    }
    if (answer === undefined || answer === null || answer === '') return false;
    if (Array.isArray(answer) && answer.length === 0) return false;
    return true;
  };

  const validateCurrentQuestion = () => {
    if (!currentQuestion) return true;
    return validateQuestion(currentQuestion, currentAnswer);
  };

  const validateAllQuestions = () => {
    const invalid = questions.find(question => !validateQuestion(question, answers[question.id]));
    if (invalid) {
      setErrorMsg('Vui lòng hoàn thành câu hỏi bắt buộc.');
      return false;
    }
    return true;
  };

  const validateCurrentPage = () => {
    const invalid = currentPageQuestions.find(question => !validateQuestion(question, answers[question.id]));
    if (invalid) {
      setErrorMsg(`Vui lòng hoàn thành câu hỏi bắt buộc: "${stripHtml(invalid.text) || 'Câu hỏi chưa có tiêu đề'}"`);
      return false;
    }
    return true;
  };

  async function submitSurvey(answerOverrides?: Record<string, any>, isScreenOutResponse = false) {
    if (isSubmitting || isCompleted) return;
    if (survey?.closesAt && new Date(survey.closesAt).getTime() <= Date.now()) {
      setErrorMsg('Khảo sát đã hết thời gian cho phép gửi phản hồi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const submittedAnswers = answerOverrides ?? answers;

      const normalizedAnswers = normalizeSavedStarRatings(survey, submittedAnswers);
      if (Object.keys(normalizedAnswers).some(key => normalizedAnswers[key] !== submittedAnswers[key])) {
        setAnswers(normalizedAnswers);
      }
      const submittedResponse = await submitResponse(survey.id, respondentId, normalizedAnswers);
      if (survey?.isQuiz && !isScreenOutResponse) {
        setQuizScore(typeof submittedResponse.score === 'number' ? submittedResponse.score : 0);
        setQuizTotal(typeof submittedResponse.totalQuizQuestions === 'number' ? submittedResponse.totalQuizQuestions : 0);
      }

      const deviceKey = `survey-device-attempts:${survey.id}`;
      const deviceId = getDeviceId();
      try {
        const raw = localStorage.getItem(deviceKey);
        const map = raw ? JSON.parse(raw) : {};
        map[deviceId] = (Number(map[deviceId] || 0) + 1);
        localStorage.setItem(deviceKey, JSON.stringify(map));
      } catch (error) {
        console.warn('Failed to record device attempts', error);
      }

      if (isScreenOutResponse) setIsScreenedOut(true);
      setIsCompleted(true);
      if (onComplete) onComplete();
    } catch (e) {
      console.error(e);
      setErrorMsg(e instanceof Error ? e.message : 'Không thể lưu phản hồi. Vui lòng thử lại.');
      if (isScreenOutResponse) {
        setIsScreeningOut(false);
        setScreenOutNotice('');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const terminateSurveyForScreening = async (
    question: SurveyQuestion,
    selectedAnswer: string,
    currentAnswers: Record<string, any>,
  ) => {
    if (!survey || isSubmitting || isCompleted || isScreeningOut) return;
    if (maxAttemptsPerDevice && maxAttemptsPerDevice > 0 && currentDeviceAttempts >= maxAttemptsPerDevice) {
      setErrorMsg(`Bạn chỉ được làm tối đa ${maxAttemptsPerDevice} lần trên thiết bị này.`);
      return;
    }
    const stopIndex = survey.questions.findIndex(item => item.id === question.id);
    const allowedQuestionIds = new Set(survey.questions.slice(0, stopIndex + 1).map(item => item.id));
    const screeningAnswers = Object.fromEntries(
      Object.entries(currentAnswers).filter(([questionId]) => allowedQuestionIds.has(questionId)),
    );
    screeningAnswers[question.id] = selectedAnswer;
    setAnswers(screeningAnswers);
    setScreenOutNotice(question.screenOutMessage?.trim() || DEFAULT_SCREEN_OUT_MESSAGE);
    setIsScreeningOut(true);
    await submitSurvey(screeningAnswers, true);
  };

  const selectSingleChoice = (question: SurveyQuestion, option: string) => {
    const nextAnswers = { ...answers, [question.id]: option };
    setAnswerForQuestion(question.id, option);
    if (question.screenOutAnswer === option) {
      void terminateSurveyForScreening(question, option, nextAnswers);
    }
  };

  const handleNext = async () => {
    if (maxAttemptsPerDevice && maxAttemptsPerDevice > 0 && currentDeviceAttempts >= maxAttemptsPerDevice) {
      setErrorMsg(`Bạn chỉ được làm tối đa ${maxAttemptsPerDevice} lần trên thiết bị này.`);
      return;
    }

    if (showAllQuestions && !sectionMode) {
      const screenOutQuestion = questions.find(question =>
        question.type === 'single_choice'
        && question.screenOutAnswer
        && answers[question.id] === question.screenOutAnswer
      );
      if (screenOutQuestion) {
        await terminateSurveyForScreening(screenOutQuestion, screenOutQuestion.screenOutAnswer!, answers);
        return;
      }
      if (!validateAllQuestions()) return;
      await submitSurvey();
      return;
    }

    const isValid = sectionMode ? validateCurrentPage() : validateCurrentQuestion();
    if (!isValid) {
      if (!sectionMode) setErrorMsg('Vui lòng hoàn thành câu hỏi bắt buộc này để tiếp tục.');
      return;
    }

    const screenOutQuestion = (sectionMode ? currentPageQuestions : currentQuestion ? [currentQuestion] : []).find(question =>
      question.type === 'single_choice'
      && question.screenOutAnswer
      && answers[question.id] === question.screenOutAnswer
    );
    if (screenOutQuestion) {
      await terminateSurveyForScreening(screenOutQuestion, screenOutQuestion.screenOutAnswer!, answers);
      return;
    }

    if (
      currentQuestion?.type === 'single_choice'
      && currentQuestion.screenOutAnswer
      && currentAnswer === currentQuestion.screenOutAnswer
    ) {
      await terminateSurveyForScreening(currentQuestion, currentQuestion.screenOutAnswer, answers);
      return;
    }

    if (step < totalSteps - 1) {
      setStep(prev => prev + 1);
    } else {
      await submitSurvey();
    }
  };

  const formattedRemainingTime = remainingSeconds === null
    ? ''
    : `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  const handlePrev = () => {
    setErrorMsg('');
    if (showAllQuestions && !sectionMode) return;
    if (step > 0) setStep(prev => prev - 1);
  };

  const toggleMultiple = (question: SurveyQuestion, option: string) => {
    setErrorMsg('');
    const current = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : [];
    if (current.includes(option)) {
      setAnswerForQuestion(question.id, current.filter((o: string) => o !== option));
    } else {
      const limit = question.maxSelections;
      if (limit && current.length >= limit) {
        setErrorMsg(`Chỉ được chọn tối đa ${limit} đáp án cho câu hỏi này.`);
        return;
      }
      setAnswerForQuestion(question.id, [...current, option]);
    }
  };

  const renderQuestionInput = (question: SurveyQuestion, answer: any, questionId: string) => {
    switch (question.type) {
      case 'star_rating':
        return (
          <div className="flex flex-col items-center gap-6 py-8 bg-white border border-border-subtle rounded-2xl shadow-sm">
            <div className="flex flex-row gap-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const rating = roundLegacyStarRating(answer) ?? 0;
                const selected = rating >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    aria-label={`Chọn ${star} sao`}
                    aria-pressed={rating === star}
                    onClick={() => setAnswerForQuestion(questionId, star)}
                    className="cursor-pointer transition-transform active:scale-90 hover:scale-110 p-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={selected ? 'text-primary' : 'text-surface-container-highest'}>
                      <polygon fill={selected ? 'currentColor' : 'none'} points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                );
              })}
            </div>
            <p className="text-sm font-medium text-text-secondary">Chọn một mức nguyên từ 1 đến 5 sao</p>
            <div className="flex justify-between w-full px-8 text-sm font-semibold text-text-secondary italic">
              <span>Cần cải thiện</span>
              <span>Tuyệt vời</span>
            </div>
          </div>
        );
      case 'single_choice':
        return (
          <div className="space-y-3">
            {question.options?.map((option, idx) => (
              <button key={idx} onClick={() => selectSingleChoice(question, option)} className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${answer === option ? 'border-primary bg-primary-fixed shadow-sm' : 'border-border-subtle bg-white hover:border-primary/30 hover:shadow-sm'}`}>
                <CircleDot size={20} className={`flex-shrink-0 mt-0.5 ${answer === option ? 'text-primary' : 'text-text-secondary'}`} />
                <span className={`min-w-0 text-base font-medium rendered-option break-words ${answer === option ? 'text-primary' : 'text-text-primary'}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(option) }} />
              </button>
            ))}
          </div>
        );
      case 'dropdown':
        return (
          <select
            value={typeof answer === 'string' ? answer : ''}
            onChange={event => setAnswerForQuestion(questionId, event.target.value)}
            className="w-full rounded-xl border border-border-subtle bg-white px-4 py-4 text-base text-text-primary shadow-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Chọn một lựa chọn</option>
            {(question.options ?? []).map((option, index) => (
              <option key={`${index}-${option}`} value={option}>{stripHtml(cleanHtmlWhitespace(option))}</option>
            ))}
          </select>
        );
      case 'date':
        return (
          <input
            type="date"
            value={typeof answer === 'string' ? answer : ''}
            onChange={event => setAnswerForQuestion(questionId, event.target.value)}
            className="w-full rounded-xl border border-border-subtle bg-white px-4 py-4 text-base text-text-primary shadow-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        );
      case 'linear_scale': {
        const min = question.scaleMin ?? 1;
        const max = question.scaleMax ?? 5;
        return (
          <div className="space-y-3 py-2">
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: max - min + 1 }, (_, index) => min + index).map(value => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={answer === value}
                  onClick={() => setAnswerForQuestion(questionId, value)}
                  className={`h-11 min-w-11 rounded-xl px-3 text-base font-bold transition-all ${answer === value ? 'bg-primary text-white shadow-md' : 'border border-border-subtle bg-white text-text-primary hover:border-primary/40 hover:bg-primary-fixed/40'}`}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="flex justify-between gap-4 text-sm font-medium text-text-secondary">
              <span>{question.scaleMinLabel || String(min)}</span>
              <span className="text-right">{question.scaleMaxLabel || String(max)}</span>
            </div>
          </div>
        );
      }
      case 'multiple_choice_grid':
      case 'checkbox_grid': {
        const gridAnswers = answer && typeof answer === 'object' && !Array.isArray(answer)
          ? answer as Record<string, string | string[]>
          : {};
        const isCheckboxGrid = question.type === 'checkbox_grid';
        return (
          <div className="overflow-x-auto rounded-xl border border-border-subtle bg-white">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-surface-container-low">
                  <th className="sticky left-0 min-w-40 bg-surface-container-low px-4 py-3 text-left font-semibold text-text-secondary">Hàng</th>
                  {(question.gridColumns ?? []).map((column, index) => (
                    <th key={`${column}-${index}`} className="min-w-24 px-3 py-3 text-center font-semibold text-text-secondary">{stripHtml(cleanHtmlWhitespace(column))}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(question.options ?? []).map((row, rowIndex) => (
                  <tr key={`${row}-${rowIndex}`} className="border-t border-border-subtle">
                    <th scope="row" className="sticky left-0 bg-white px-4 py-3 text-left font-medium text-text-primary">{stripHtml(cleanHtmlWhitespace(row))}</th>
                    {(question.gridColumns ?? []).map((column, columnIndex) => {
                      const current = gridAnswers[row];
                      const checked = isCheckboxGrid
                        ? Array.isArray(current) && current.includes(column)
                        : current === column;
                      return (
                        <td key={`${column}-${columnIndex}`} className="px-3 py-3 text-center">
                          <input
                            type={isCheckboxGrid ? 'checkbox' : 'radio'}
                            name={`${questionId}-${rowIndex}`}
                            aria-label={`${stripHtml(cleanHtmlWhitespace(row))}: ${stripHtml(cleanHtmlWhitespace(column))}`}
                            checked={checked}
                            onChange={() => {
                              const next = { ...gridAnswers };
                              if (isCheckboxGrid) {
                                const selected = Array.isArray(current) ? current : [];
                                next[row] = checked ? selected.filter(value => value !== column) : [...selected, column];
                              } else {
                                next[row] = column;
                              }
                              setAnswerForQuestion(questionId, next);
                            }}
                            className="h-4 w-4 cursor-pointer accent-primary"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'multiple_choice': {
        const selectedAnswers = Array.isArray(answer) ? answer : [];
        const reachedLimit = Boolean(question.maxSelections && selectedAnswers.length >= question.maxSelections);
        return (
          <div className="space-y-3">
            {question.options?.map((option, idx) => {
              const selected = selectedAnswers.includes(option);
              return (
                <button key={idx} onClick={() => toggleMultiple(question, option)} disabled={!selected && reachedLimit} className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${selected ? 'border-primary bg-primary-fixed shadow-sm cursor-pointer' : reachedLimit ? 'border-border-subtle bg-surface-container-low text-text-secondary/60 cursor-not-allowed' : 'border-border-subtle bg-white hover:border-primary/30 hover:shadow-sm cursor-pointer'}`}>
                  <CheckSquare size={20} className={`flex-shrink-0 mt-0.5 ${selected ? 'text-primary' : 'text-text-secondary'}`} />
                  <span className={`min-w-0 text-base font-medium rendered-option break-words ${selected ? 'text-primary' : 'text-text-primary'}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(option) }} />
                </button>
              );
            })}
            <p className={`text-xs font-medium mt-2 ${question.maxSelections && reachedLimit ? 'text-sentiment-negative' : 'text-text-secondary'}`}>
              {question.maxSelections
                ? `Chọn tối đa ${question.maxSelections} đáp án · Đã chọn ${selectedAnswers.length}/${question.maxSelections}`
                : 'Có thể chọn nhiều đáp án'}
            </p>
          </div>
        );
      }
      case 'text':
        return (
          <textarea
            value={answer || ''}
            onChange={(e) => setAnswerForQuestion(questionId, e.target.value)}
            placeholder="Hãy chia sẻ thêm chi tiết..."
            rows={5}
            className="w-full bg-white border border-border-subtle rounded-xl p-5 focus:ring-2 focus:ring-secondary/50 focus:border-secondary outline-none transition-all text-base shadow-sm resize-y"
          />
        );
      case 'nps':
        return (
          <div className="py-6">
            <div className="flex flex-wrap justify-center gap-2 mb-4">
              {Array.from({ length: 11 }, (_, i) => (
                <button key={i} onClick={() => { setAnswerForQuestion(questionId, i); setErrorMsg(''); }} className={`w-12 h-12 rounded-xl font-bold text-lg transition-all cursor-pointer ${answer === i ? 'bg-primary text-white shadow-md scale-110' : 'bg-white border border-border-subtle text-text-primary hover:border-primary/30 hover:shadow-sm'}`}>
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between px-2 text-sm font-semibold text-text-secondary italic">
              <span>Hoàn toàn không</span>
              <span>Chắc chắn có</span>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-surface-background flex flex-col font-sans text-text-primary selection:bg-secondary-fixed selection:text-on-secondary-fixed relative overflow-hidden">
        {/* Luxurious background elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/20 rounded-full blur-[100px] opacity-70 animate-pulse"></div>
          <div className="absolute top-1/3 -left-20 w-72 h-72 bg-secondary/20 rounded-full blur-[80px] opacity-60"></div>
          <div className="absolute -bottom-40 right-1/4 w-80 h-80 bg-sentiment-positive/10 rounded-full blur-[80px]"></div>
        </div>

        <nav className="relative z-10 px-4 py-4 flex justify-between items-center border-b border-white/10 backdrop-blur-md">
          <div className="font-display text-xl font-bold text-primary line-clamp-1" dangerouslySetInnerHTML={{ __html: sanitizeHtml(survey.title) }} />
        </nav>

        <main className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 animate-in zoom-in-95 duration-700">
          <div className="bg-white/80 backdrop-blur-xl p-10 md:p-14 rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white/50 text-center max-w-2xl w-full">
            <div className="mx-auto w-24 h-24 bg-gradient-to-tr from-primary to-secondary rounded-full flex items-center justify-center shadow-2xl shadow-primary/30 mb-8 relative">
              <CheckCircle2 size={48} className="text-white" />
              <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping"></div>
            </div>
            
            <h1 className="font-display text-4xl md:text-5xl font-extrabold text-text-primary mb-4 tracking-tight leading-tight">
              {isScreenedOut ? 'Khảo sát đã kết thúc' : survey.isQuiz ? 'Hoàn thành Bài kiểm tra!' : 'Cảm ơn bạn!'}
            </h1>
            {isScreenedOut ? (
              <p className="text-text-secondary text-lg md:text-xl mb-10 max-w-lg mx-auto leading-relaxed">{screenOutNotice || DEFAULT_SCREEN_OUT_MESSAGE}</p>
            ) : survey.isQuiz ? (
              survey.showScore !== false ? (
                <div className="mb-10 text-center animate-in slide-in-from-bottom-4 duration-700 delay-150 fill-mode-both">
                  <p className="text-text-secondary text-lg mb-2 font-medium">Điểm số của bạn:</p>
                  <div className="text-6xl font-display font-extrabold text-primary drop-shadow-md">
                    {quizScore ?? 0} <span className="text-3xl text-text-secondary/50">/ {quizTotal ?? 0}</span>
                  </div>
                  {quizTotal !== undefined && quizTotal > 0 && (
                    <div className="mt-4 inline-block bg-primary-fixed text-primary px-4 py-1.5 rounded-full text-sm font-bold">
                      Đạt {Math.round(((quizScore ?? 0) / quizTotal) * 100)}%
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-text-secondary text-lg md:text-xl mb-10 max-w-lg mx-auto leading-relaxed">
                  Đã ghi nhận kết quả bài làm của bạn.
                </p>
              )
            ) : (
              <p className="text-text-secondary text-lg md:text-xl mb-10 max-w-lg mx-auto leading-relaxed">
                Phản hồi của bạn đã được ghi nhận. Những đóng góp quý báu này sẽ giúp chúng tôi nâng cao chất lượng dịch vụ.
              </p>
            )}

            <div className="flex flex-col items-center justify-center gap-4">
              {isPublic ? (
                <>
                  <button 
                    onClick={callExit} 
                    className="w-full sm:w-auto px-8 py-3.5 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/25 hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <X size={18} />
                    Đóng trang
                  </button>
                  {showCloseHint && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 bg-surface-container-high/80 backdrop-blur-sm text-text-secondary text-sm font-medium px-5 py-3 rounded-xl text-center max-w-sm">
                      Trình duyệt không cho phép tự động đóng tab. Bạn có thể <strong className="text-text-primary">đóng tab này thủ công</strong> bằng cách nhấn nút × trên trình duyệt.
                    </div>
                  )}
                </>
              ) : (
                <button 
                  onClick={callExit} 
                  className="w-full sm:w-auto px-8 py-3.5 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/25 hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Home size={18} />
                  Về trang quản trị
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      {showExitConfirm && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowExitConfirm(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-border-subtle animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-500 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-xl font-bold text-text-primary">Rời khỏi khảo sát?</h3>
                <p className="text-sm text-text-secondary mt-0.5">
                  Bạn đã trả lời <strong className="text-text-primary">{answeredQuestionCount}/{questions.length}</strong> câu hỏi
                </p>
              </div>
            </div>

            {/* Draft info */}
            <div className="bg-surface-container-low rounded-xl p-3.5 mb-5 flex items-start gap-2.5">
              <Edit3 size={15} className="text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-text-secondary leading-relaxed">
                Câu trả lời của bạn đã được <strong className="text-text-primary">lưu tạm tự động</strong>. Khi quay lại, bạn có thể tiếp tục từ nơi đã dừng.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary/90 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                Tiếp tục khảo sát
              </button>
              <button
                onClick={handleExitKeepDraft}
                className="w-full rounded-xl border border-border-subtle bg-white px-4 py-3 text-sm font-bold text-text-primary hover:bg-surface-container-low transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <LogOut size={15} />
                Thoát & giữ bản nháp
              </button>
              <button
                onClick={handleExitAndClearDraft}
                className="w-full rounded-xl px-4 py-2.5 text-xs font-semibold text-sentiment-negative/70 hover:text-sentiment-negative hover:bg-sentiment-negative/5 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 size={13} />
                Xóa tất cả câu trả lời & thoát
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-surface-background flex flex-col font-sans text-text-primary animate-in fade-in duration-500 selection:bg-secondary-fixed selection:text-on-secondary-fixed">
        <nav className="sticky top-0 z-50 bg-surface-background/90 backdrop-blur-md px-4 md:px-6 py-3 md:py-4 flex flex-col gap-2 border-b border-border-subtle/50">
          <div className="flex justify-between items-start md:items-center w-full gap-3">
            <div className="font-display text-base sm:text-lg md:text-2xl font-bold text-primary flex-1 pr-2 sm:pr-4 line-clamp-2 break-all" dangerouslySetInnerHTML={{ __html: sanitizeHtml(survey.title) || 'Khảo sát thông minh' }} />
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              {remainingSeconds !== null && (
                <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs sm:text-sm font-bold ${remainingSeconds <= 60 ? 'bg-sentiment-negative/10 text-sentiment-negative' : 'bg-primary-fixed text-primary'}`}>
                  <Timer size={15} />
                  <span>{formattedRemainingTime}</span>
                </div>
              )}
              <button onClick={handleExitRequest} className="min-h-10 rounded-lg border border-border-subtle bg-white px-2.5 py-2 text-[11px] sm:text-xs md:text-sm font-bold text-text-secondary hover:text-primary hover:border-primary/30 transition-colors cursor-pointer shadow-sm">Thoát</button>
            </div>
          </div>
          <div className="mt-1 md:mt-2">
            <div className="flex justify-between items-end mb-1.5 md:mb-2 gap-3">
              <span className="text-[11px] sm:text-xs md:text-sm font-bold text-text-primary">
                {sectionMode ? `${currentSection?.title || `Phần ${step + 1}`} · ${currentPageQuestions.length} câu hỏi` : showAllQuestions ? `Tổng cộng ${questions.length} câu hỏi` : `Câu hỏi ${step + 1} / ${totalSteps}`}
              </span>
              <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-text-secondary">Hoàn thành {progress}%</span>
            </div>
            <div className="h-1.5 md:h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-700 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </nav>

        <main className="flex-grow flex flex-col items-center px-3 sm:px-4 md:px-6 pt-5 sm:pt-8 md:pt-12 pb-32 md:pb-40 w-full" key={`${sectionMode ? 'sections' : showAllQuestions ? 'all-questions' : 'single-question'}-${step}`}>
          <div className="w-full max-w-[720px] space-y-4 sm:space-y-6 md:space-y-8 animate-in slide-in-from-bottom-4 duration-500 fade-in">
            {(!showAllQuestions || sectionMode) && step === 0 && (
              <div className="bg-white border-t-[8px] sm:border-t-[10px] border-t-primary rounded-2xl shadow-sm p-4 sm:p-6 md:p-10 border border-border-subtle mb-5 sm:mb-8">
                <h1 
                  className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold text-text-primary mb-3 sm:mb-4 leading-[1.1] sm:leading-tight rendered-html break-words"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(survey.title) || 'Khảo sát thông minh' }}
                />
                {survey.description && (
                  <div 
                    className="text-sm sm:text-base md:text-lg text-text-secondary leading-relaxed rendered-html break-words"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(survey.description) }}
                  />
                )}
              </div>
            )}

            {sectionMode && currentSection && (
              <section className="bg-white border-l-4 border-primary rounded-2xl shadow-sm p-4 sm:p-6 md:p-8">
                <p className="text-xs font-bold uppercase tracking-wide text-primary mb-2">Phần {step + 1}</p>
                <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-text-primary break-words">{currentSection.title}</h2>
                {currentSection.description && (
                  <p className="mt-3 text-sm sm:text-base text-text-secondary leading-relaxed whitespace-pre-wrap">{currentSection.description}</p>
                )}
              </section>
            )}

            {showAllQuestions || sectionMode ? (
              (sectionMode ? currentPageQuestions : questions).map((question) => {
                const index = questions.indexOf(question);
                return (
                <section key={question.id} className="bg-white border border-border-subtle rounded-2xl shadow-sm p-4 sm:p-6 md:p-8">
                  <header className="space-y-2 mb-4 sm:mb-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] sm:text-xs md:text-sm font-bold text-primary bg-primary-fixed px-2.5 py-1 rounded-full">{question.label && question.label.trim() !== '' ? question.label : ''}</span>
                      {question.required && <span className="text-[11px] sm:text-xs md:text-sm text-sentiment-negative font-medium">* Bắt buộc</span>}
                    </div>
                    <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-text-primary tracking-tight leading-[1.2] sm:leading-tight break-words" dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.text) || sanitizeHtml(question.label?.trim() || `Câu hỏi ${index + 1}`) }} />
                  </header>
                  {question.screenOutAnswer && <p className="mb-4 text-sm italic text-text-secondary">Nếu chọn “{stripHtml(question.screenOutAnswer)}”, khảo sát sẽ kết thúc tại đây.</p>}
                  {renderQuestionInput(question, answers[question.id], question.id)}
                </section>
                );
              })
            ) : (
              <>
                <header className="space-y-2">
                  <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-text-primary tracking-tight leading-[1.2] sm:leading-tight break-words" dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentQuestion?.text) }} />
                  {currentQuestion?.required && (
                    <p className="text-[11px] sm:text-xs md:text-sm text-sentiment-negative font-medium">* Bắt buộc</p>
                  )}
                  {currentQuestion?.screenOutAnswer && (
                    <p className="text-sm italic text-text-secondary">Nếu chọn “{stripHtml(currentQuestion.screenOutAnswer)}”, khảo sát sẽ kết thúc tại đây.</p>
                  )}
                  </header>
                {currentQuestion && renderQuestionInput(currentQuestion, currentAnswer, currentQuestion.id)}
              </>
            )}

            {errorMsg && (
              <div className="mt-4 p-3 bg-sentiment-negative/10 text-sentiment-negative text-sm font-medium rounded-lg flex items-center gap-2 animate-in slide-in-from-bottom-2">
                <span className="w-1.5 h-1.5 rounded-full bg-sentiment-negative"></span>
                {errorMsg}
              </div>
            )}
          </div>
        </main>

        <div className="fixed bottom-0 w-full bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.06)] px-3 sm:px-6 py-4 sm:py-5 flex justify-center border-t border-border-subtle/50 z-50">
          <div className="w-full max-w-[720px] flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sentiment-positive opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sentiment-positive"></span>
                </span>
                <span className="text-[10px] sm:text-xs font-bold text-text-secondary truncate">Đang tự động lưu...</span>
              </div>
              {(!showAllQuestions || sectionMode) && (
                <button onClick={sectionMode ? clearCurrentPageAnswers : clearAnswer} className="text-primary text-[11px] sm:text-sm font-bold flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer shrink-0">
                  <Undo2 size={14} className="sm:h-4 sm:w-4" /> Xóa
                </button>
              )}
              {draftSavedAt && (
                <span className="hidden sm:inline text-[10px] font-semibold text-text-secondary">Lưu tạm {draftSavedAt}</span>
              )}
            </div>
            <div className="flex gap-3 sm:gap-4">
              <button onClick={handlePrev} disabled={(showAllQuestions && !sectionMode) || step === 0} className={`flex-1 min-h-[48px] sm:min-h-[52px] bg-white border-2 border-border-subtle rounded-xl text-sm sm:text-base font-bold text-text-primary transition-colors shadow-sm ${(showAllQuestions && !sectionMode) || step === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-container-low active:scale-95 cursor-pointer'}`}>
                Quay lại
              </button>
              <button disabled={isSubmitting} onClick={handleNext} className={`flex-[2] min-h-[48px] sm:min-h-[52px] bg-primary text-white rounded-xl text-base sm:text-lg font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}>
                {isSubmitting ? 'Đang gửi...' : showAllQuestions && !sectionMode || step === totalSteps - 1 ? 'Hoàn thành' : 'Tiếp theo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
