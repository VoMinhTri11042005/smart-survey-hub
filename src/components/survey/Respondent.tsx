import { Timer, Undo2, Sparkles, CircleDot, CheckSquare, CheckCircle2, Home, Edit3, LogOut, X, Trash2, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useSurvey } from '../../context/SurveyContext';
import { stripHtml, cleanHtmlWhitespace } from '../../utils/stringUtils';
import type { Survey, SurveyQuestion } from '../../types';

interface RespondentProps {
  survey: Survey | null;
  onExit: () => void;
  onComplete?: () => void;
  isPublic?: boolean;
}

export function Respondent({ survey, onExit, onComplete, isPublic = false }: RespondentProps) {
  const { submitResponse, fetchMyResponse } = useSurvey();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [respondentId, setRespondentId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [quizScore, setQuizScore] = useState<number | undefined>(undefined);
  const [quizTotal, setQuizTotal] = useState<number | undefined>(undefined);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showCloseHint, setShowCloseHint] = useState(false);

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

        try {
          const savedDraft = localStorage.getItem(`survey-draft:${survey.id}:${rid}`);
          if (savedDraft) {
            const savedAnswers = JSON.parse(savedDraft);
            if (savedAnswers && typeof savedAnswers === 'object') {
              setAnswers(savedAnswers);
            }
          }
        } catch (error) {
          console.warn('Failed to load survey draft', error);
        }

        try {
          const existingResponse = await fetchMyResponse(survey.id, rid);
          if (existingResponse && existingResponse.answers && Object.keys(existingResponse.answers).length > 0) {
            setAnswers(existingResponse.answers);
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

  const questions = survey?.questions ?? [];
  const displayMode = survey?.displayMode ?? 'single';
  const showAllQuestions = displayMode === 'all';
  const totalSteps = showAllQuestions ? 1 : questions.length;
  const currentQuestion = showAllQuestions ? null : questions[step];
  const answeredQuestionCount = questions.reduce((count, question) => {
    const value = answers[question.id];
    if (value === undefined || value === null || value === '') return count;
    if (Array.isArray(value) && value.length === 0) return count;
    return count + 1;
  }, 0);
  const progress = showAllQuestions
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

  const validateQuestion = (question: SurveyQuestion, answer: any) => {
    if (!question.required) return true;
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

  const submitSurvey = async () => {
    if (survey?.closesAt && new Date(survey.closesAt).getTime() <= Date.now()) {
      setErrorMsg('Khảo sát đã hết thời gian cho phép gửi phản hồi.');
      return;
    }

    setIsSubmitting(true);
    try {
      let score: number | undefined = undefined;
      let totalQ: number | undefined = undefined;

      if (survey?.isQuiz) {
        score = 0;
        totalQ = 0;
        survey.questions.forEach(q => {
          if (q.type === 'single_choice') {
            const hasCorrect = typeof q.correctAnswer === 'string' && q.correctAnswer.trim().length > 0;
            if (hasCorrect) {
              const qPoints = typeof q.points === 'number' && q.points > 0 ? q.points : 1;
              totalQ! += qPoints;
              const userAnswer = answers[q.id];
              if (typeof userAnswer === 'string' && userAnswer === q.correctAnswer) {
                score! += qPoints;
              }
            }
          } else if (q.type === 'multiple_choice') {
            const hasCorrect = Array.isArray(q.correctAnswer) && q.correctAnswer.length > 0;
            if (hasCorrect) {
              const qPoints = typeof q.points === 'number' && q.points > 0 ? q.points : 1;
              totalQ! += qPoints;
              const userAnswer = answers[q.id];
              if (Array.isArray(userAnswer) && userAnswer.length === q.correctAnswer.length) {
                const sortedUser = [...userAnswer].sort();
                const sortedCorrect = [...q.correctAnswer].sort();
                if (sortedUser.every((val, idx) => val === sortedCorrect[idx])) {
                  score! += qPoints;
                }
              }
            }
          }
        });
        setQuizScore(score);
        setQuizTotal(totalQ);
      }

      await submitResponse(survey.id, respondentId, answers, score, totalQ);

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

      setIsCompleted(true);
      if (onComplete) onComplete();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (maxAttemptsPerDevice && maxAttemptsPerDevice > 0 && currentDeviceAttempts >= maxAttemptsPerDevice) {
      setErrorMsg(`Bạn chỉ được làm tối đa ${maxAttemptsPerDevice} lần trên thiết bị này.`);
      return;
    }

    if (showAllQuestions) {
      if (!validateAllQuestions()) return;
      await submitSurvey();
      return;
    }

    if (!validateCurrentQuestion()) {
      setErrorMsg('Vui lòng hoàn thành câu hỏi bắt buộc này để tiếp tục.');
      return;
    }

    if (step < totalSteps - 1) {
      setStep(prev => prev + 1);
    } else {
      await submitSurvey();
    }
  };

  const handlePrev = () => {
    setErrorMsg('');
    if (showAllQuestions) return;
    if (step > 0) setStep(prev => prev - 1);
  };

  const toggleMultiple = (questionId: string, option: string) => {
    setErrorMsg('');
    const current: string[] = answers[questionId] || [];
    if (current.includes(option)) {
      setAnswerForQuestion(questionId, current.filter((o: string) => o !== option));
    } else {
      setAnswerForQuestion(questionId, [...current, option]);
    }
  };

  const renderQuestionInput = (question: SurveyQuestion, answer: any, questionId: string) => {
    switch (question.type) {
      case 'star_rating':
        return (
          <div className="flex flex-col items-center gap-6 py-8 bg-white border border-border-subtle rounded-2xl shadow-sm">
            <div className="flex flex-row gap-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const fill = (answer || 0);
                let fillPercent = 0;
                if (fill >= star) fillPercent = 100;
                else if (fill >= star - 0.5) fillPercent = 50;
                else fillPercent = 0;
                const gradId = `grad-${questionId}-${star}`;
                return (
                  <button
                    key={star}
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const isLeft = x < rect.width / 2;
                      const value = isLeft ? star - 0.5 : star;
                      setAnswerForQuestion(questionId, value);
                    }}
                    className="cursor-pointer transition-transform active:scale-90 hover:scale-110 p-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={fillPercent > 0 ? 'text-primary' : 'text-surface-container-highest'}>
                      <defs>
                        <linearGradient id={gradId} x1="0%" x2="100%" y1="0%" y2="0%">
                          <stop offset={`${fillPercent}%`} stopColor="currentColor" />
                          <stop offset={`${fillPercent}%`} stopColor="transparent" />
                        </linearGradient>
                      </defs>
                      <polygon fill={fillPercent > 0 ? `url(#${gradId})` : 'none'} points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                );
              })}
            </div>
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
              <button key={idx} onClick={() => setAnswerForQuestion(questionId, option)} className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${answer === option ? 'border-primary bg-primary-fixed shadow-sm' : 'border-border-subtle bg-white hover:border-primary/30 hover:shadow-sm'}`}>
                <CircleDot size={20} className={`flex-shrink-0 mt-0.5 ${answer === option ? 'text-primary' : 'text-text-secondary'}`} />
                <span className={`min-w-0 text-base font-medium rendered-option break-words ${answer === option ? 'text-primary' : 'text-text-primary'}`} dangerouslySetInnerHTML={{ __html: cleanHtmlWhitespace(option) }} />
              </button>
            ))}
          </div>
        );
      case 'multiple_choice':
        return (
          <div className="space-y-3">
            {question.options?.map((option, idx) => {
              const selected = (answer || []).includes(option);
              return (
                <button key={idx} onClick={() => toggleMultiple(questionId, option)} className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${selected ? 'border-primary bg-primary-fixed shadow-sm' : 'border-border-subtle bg-white hover:border-primary/30 hover:shadow-sm'}`}>
                  <CheckSquare size={20} className={`flex-shrink-0 mt-0.5 ${selected ? 'text-primary' : 'text-text-secondary'}`} />
                  <span className={`min-w-0 text-base font-medium rendered-option break-words ${selected ? 'text-primary' : 'text-text-primary'}`} dangerouslySetInnerHTML={{ __html: cleanHtmlWhitespace(option) }} />
                </button>
              );
            })}
            <p className="text-xs text-text-secondary font-medium mt-2">Có thể chọn nhiều đáp án</p>
          </div>
        );
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
          <div className="font-display text-xl font-bold text-primary line-clamp-1" dangerouslySetInnerHTML={{ __html: cleanHtmlWhitespace(survey.title) }} />
        </nav>

        <main className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 animate-in zoom-in-95 duration-700">
          <div className="bg-white/80 backdrop-blur-xl p-10 md:p-14 rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white/50 text-center max-w-2xl w-full">
            <div className="mx-auto w-24 h-24 bg-gradient-to-tr from-primary to-secondary rounded-full flex items-center justify-center shadow-2xl shadow-primary/30 mb-8 relative">
              <CheckCircle2 size={48} className="text-white" />
              <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping"></div>
            </div>
            
            <h1 className="font-display text-4xl md:text-5xl font-extrabold text-text-primary mb-4 tracking-tight leading-tight">
              {survey.isQuiz ? 'Hoàn thành Bài kiểm tra!' : 'Cảm ơn bạn!'}
            </h1>
            {survey.isQuiz ? (
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
            <div className="font-display text-base sm:text-lg md:text-2xl font-bold text-primary flex-1 pr-2 sm:pr-4 line-clamp-2 break-all" dangerouslySetInnerHTML={{ __html: cleanHtmlWhitespace(survey.title) || 'Khảo sát thông minh' }} />
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <button onClick={handleExitRequest} className="min-h-10 rounded-lg border border-border-subtle bg-white px-2.5 py-2 text-[11px] sm:text-xs md:text-sm font-bold text-text-secondary hover:text-primary hover:border-primary/30 transition-colors cursor-pointer shadow-sm">Thoát</button>
            </div>
          </div>
          <div className="mt-1 md:mt-2">
            <div className="flex justify-between items-end mb-1.5 md:mb-2 gap-3">
              <span className="text-[11px] sm:text-xs md:text-sm font-bold text-text-primary">{showAllQuestions ? `Tổng cộng ${questions.length} câu hỏi` : `Câu hỏi ${step + 1} / ${totalSteps}`}</span>
              <span className="text-[10px] sm:text-[11px] md:text-xs font-bold text-text-secondary">Hoàn thành {progress}%</span>
            </div>
            <div className="h-1.5 md:h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-700 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        </nav>

        <main className="flex-grow flex flex-col items-center px-3 sm:px-4 md:px-6 pt-5 sm:pt-8 md:pt-12 pb-32 md:pb-40 w-full" key={showAllQuestions ? 'all-questions' : step}>
          <div className="w-full max-w-[720px] space-y-4 sm:space-y-6 md:space-y-8 animate-in slide-in-from-bottom-4 duration-500 fade-in">
            {!showAllQuestions && step === 0 && (
              <div className="bg-white border-t-[8px] sm:border-t-[10px] border-t-primary rounded-2xl shadow-sm p-4 sm:p-6 md:p-10 border border-border-subtle mb-5 sm:mb-8">
                <h1 
                  className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold text-text-primary mb-3 sm:mb-4 leading-[1.1] sm:leading-tight rendered-html break-words"
                  dangerouslySetInnerHTML={{ __html: cleanHtmlWhitespace(survey.title) || 'Khảo sát thông minh' }}
                />
                {survey.description && (
                  <div 
                    className="text-sm sm:text-base md:text-lg text-text-secondary leading-relaxed rendered-html break-words"
                    dangerouslySetInnerHTML={{ __html: cleanHtmlWhitespace(survey.description) }}
                  />
                )}
              </div>
            )}

            {showAllQuestions ? (
              questions.map((question, index) => (
                <section key={question.id} className="bg-white border border-border-subtle rounded-2xl shadow-sm p-4 sm:p-6 md:p-8">
                  <header className="space-y-2 mb-4 sm:mb-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] sm:text-xs md:text-sm font-bold text-primary bg-primary-fixed px-2.5 py-1 rounded-full">{question.label && question.label.trim() !== '' ? question.label : ''}</span>
                      {question.required && <span className="text-[11px] sm:text-xs md:text-sm text-sentiment-negative font-medium">* Bắt buộc</span>}
                    </div>
                    <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-text-primary tracking-tight leading-[1.2] sm:leading-tight break-words" dangerouslySetInnerHTML={{ __html: cleanHtmlWhitespace(question.text) || (question.label && question.label.trim() !== '' ? question.label : `Câu hỏi ${index + 1}`) }} />
                  </header>
                  {renderQuestionInput(question, answers[question.id], question.id)}
                </section>
              ))
            ) : (
              <>
                <header className="space-y-2">
                  <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-text-primary tracking-tight leading-[1.2] sm:leading-tight break-words" dangerouslySetInnerHTML={{ __html: cleanHtmlWhitespace(currentQuestion?.text || '') }} />
                  {currentQuestion?.required && (
                    <p className="text-[11px] sm:text-xs md:text-sm text-sentiment-negative font-medium">* Bắt buộc</p>
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
              {!showAllQuestions && (
                <button onClick={clearAnswer} className="text-primary text-[11px] sm:text-sm font-bold flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer shrink-0">
                  <Undo2 size={14} className="sm:h-4 sm:w-4" /> Xóa
                </button>
              )}
              {draftSavedAt && (
                <span className="hidden sm:inline text-[10px] font-semibold text-text-secondary">Lưu tạm {draftSavedAt}</span>
              )}
            </div>
            <div className="flex gap-3 sm:gap-4">
              <button onClick={handlePrev} disabled={showAllQuestions || step === 0} className={`flex-1 min-h-[48px] sm:min-h-[52px] bg-white border-2 border-border-subtle rounded-xl text-sm sm:text-base font-bold text-text-primary transition-colors shadow-sm ${showAllQuestions || step === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-container-low active:scale-95 cursor-pointer'}`}>
                Quay lại
              </button>
              <button disabled={isSubmitting} onClick={handleNext} className={`flex-[2] min-h-[48px] sm:min-h-[52px] bg-primary text-white rounded-xl text-base sm:text-lg font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}>
                {isSubmitting ? 'Đang gửi...' : showAllQuestions ? 'Hoàn thành' : step === totalSteps - 1 ? 'Hoàn thành' : 'Tiếp theo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
