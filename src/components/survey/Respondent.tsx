import { Timer, Undo2, Sparkles, CircleDot, CheckSquare, CheckCircle2, Home, Edit3 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSurvey } from '../../context/SurveyContext';
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

  useEffect(() => {
    if (!survey) return;

    const initRespondent = async () => {
      let rid = localStorage.getItem('respondentId');
      if (!rid) {
        rid = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
        localStorage.setItem('respondentId', rid);
      }
      setRespondentId(rid);

      const existingResponse = await fetchMyResponse(survey.id, rid);
      if (existingResponse && existingResponse.answers) {
        setAnswers(existingResponse.answers);
      }
      setIsLoading(false);
    };

    initRespondent();
  }, [survey, fetchMyResponse]);

  if (isLoading) {
    return <div className="min-h-screen bg-surface-background flex items-center justify-center font-sans text-text-secondary">Đang chuẩn bị khảo sát...</div>;
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

  const questions = survey.questions;
  const totalSteps = questions.length;
  const currentQuestion = questions[step];
  const progress = Math.round(((step + 1) / totalSteps) * 100);
  const currentAnswer = answers[currentQuestion.id];

  const setAnswer = (value: any) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
  };

  const clearAnswer = () => {
    setAnswers(prev => { const n = { ...prev }; delete n[currentQuestion.id]; return n; });
  };

  const handleNext = async () => {
    if (step < totalSteps - 1) {
      setStep(prev => prev + 1);
    } else {
      setIsSubmitting(true);
      try { 
        await submitResponse(survey.id, respondentId, answers); 
        setIsCompleted(true);
        if (onComplete) onComplete();
      } catch (e) {
        console.error(e);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handlePrev = () => { if (step > 0) setStep(prev => prev - 1); };

  const toggleMultiple = (option: string) => {
    const current: string[] = currentAnswer || [];
    if (current.includes(option)) {
      setAnswer(current.filter((o: string) => o !== option));
    } else {
      setAnswer([...current, option]);
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
          <div className="font-display text-xl font-bold text-primary">{survey.title}</div>
        </nav>

        <main className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 animate-in zoom-in-95 duration-700">
          <div className="bg-white/80 backdrop-blur-xl p-10 md:p-14 rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white/50 text-center max-w-2xl w-full">
            <div className="mx-auto w-24 h-24 bg-gradient-to-tr from-primary to-secondary rounded-full flex items-center justify-center shadow-2xl shadow-primary/30 mb-8 relative">
              <CheckCircle2 size={48} className="text-white" />
              <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping"></div>
            </div>
            
            <h1 className="font-display text-4xl md:text-5xl font-extrabold text-text-primary mb-4 tracking-tight leading-tight">
              Cảm ơn bạn!
            </h1>
            <p className="text-text-secondary text-lg md:text-xl mb-10 max-w-lg mx-auto leading-relaxed">
              Phản hồi của bạn đã được ghi nhận. Những đóng góp quý báu này sẽ giúp chúng tôi nâng cao chất lượng dịch vụ.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={() => setIsCompleted(false)} 
                className="w-full sm:w-auto px-8 py-3.5 bg-surface-container-lowest border border-border-subtle text-text-primary font-bold rounded-2xl hover:bg-surface-container-low transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <Edit3 size={18} />
                Sửa lại đáp án
              </button>
              {!isPublic && (
                <button 
                  onClick={onExit} 
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
    <div className="min-h-screen bg-surface-background flex flex-col font-sans text-text-primary animate-in fade-in duration-500 selection:bg-secondary-fixed selection:text-on-secondary-fixed">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 bg-surface-background/90 backdrop-blur-md px-4 md:px-6 py-3 md:py-4 flex flex-col gap-2 border-b border-border-subtle/50">
        <div className="flex justify-between items-center w-full">
          <div className="font-display text-lg md:text-2xl font-bold text-primary truncate max-w-[200px] md:max-w-md">{survey.title || 'Khảo sát thông minh'}</div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <div className="flex items-center gap-1.5 bg-surface-container rounded-full px-2 md:px-3 py-1 md:py-1.5">
              <Timer size={14} className="text-text-secondary md:w-4 md:h-4" />
              <span className="text-[10px] md:text-xs font-bold text-text-secondary">Còn ~{Math.max(1, totalSteps - step)} phút</span>
            </div>
            <button onClick={onExit} className="text-xs md:text-sm font-bold text-text-secondary hover:text-primary transition-colors cursor-pointer px-1 md:px-2">Thoát</button>
          </div>
        </div>
        <div className="mt-1 md:mt-2">
          <div className="flex justify-between items-end mb-1.5 md:mb-2">
            <span className="text-xs md:text-sm font-bold text-text-primary">Câu hỏi {step + 1} / {totalSteps}</span>
            <span className="text-[10px] md:text-xs font-bold text-text-secondary">Hoàn thành {progress}%</span>
          </div>
          <div className="h-1.5 md:h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-700 ease-out" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center px-4 md:px-6 pt-8 md:pt-12 pb-32 md:pb-40 w-full" key={step}>
        <div className="w-full max-w-[720px] space-y-6 md:space-y-8 animate-in slide-in-from-bottom-4 duration-500 fade-in">
          <header className="space-y-2">
            <h2 className="font-display text-2xl md:text-4xl font-bold text-text-primary tracking-tight leading-tight">
              {currentQuestion.text}
            </h2>
            {currentQuestion.required && (
              <p className="text-xs md:text-sm text-sentiment-negative font-medium">* Bắt buộc</p>
            )}
          </header>

          {/* Star Rating */}
          {currentQuestion.type === 'star_rating' && (
            <div className="flex flex-col items-center gap-6 py-8 bg-white border border-border-subtle rounded-2xl shadow-sm">
              <div className="flex flex-row gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} onClick={() => setAnswer(star)} className="cursor-pointer transition-transform active:scale-90 hover:scale-110 p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill={star <= (currentAnswer || 0) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={star <= (currentAnswer || 0) ? "text-primary" : "text-surface-container-highest"}>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                ))}
              </div>
              <div className="flex justify-between w-full px-8 text-sm font-semibold text-text-secondary italic">
                <span>Cần cải thiện</span>
                <span>Tuyệt vời</span>
              </div>
            </div>
          )}

          {/* Single Choice */}
          {currentQuestion.type === 'single_choice' && currentQuestion.options && (
            <div className="space-y-3">
              {currentQuestion.options.map((option, idx) => (
                <button key={idx} onClick={() => setAnswer(option)} className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${currentAnswer === option ? 'border-primary bg-primary-fixed shadow-sm' : 'border-border-subtle bg-white hover:border-primary/30 hover:shadow-sm'}`}>
                  <CircleDot size={20} className={currentAnswer === option ? 'text-primary' : 'text-text-secondary'} />
                  <span className={`text-base font-medium ${currentAnswer === option ? 'text-primary' : 'text-text-primary'}`}>{option}</span>
                </button>
              ))}
            </div>
          )}

          {/* Multiple Choice */}
          {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
            <div className="space-y-3">
              {currentQuestion.options.map((option, idx) => {
                const selected = (currentAnswer || []).includes(option);
                return (
                  <button key={idx} onClick={() => toggleMultiple(option)} className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${selected ? 'border-primary bg-primary-fixed shadow-sm' : 'border-border-subtle bg-white hover:border-primary/30 hover:shadow-sm'}`}>
                    <CheckSquare size={20} className={selected ? 'text-primary' : 'text-text-secondary'} />
                    <span className={`text-base font-medium ${selected ? 'text-primary' : 'text-text-primary'}`}>{option}</span>
                  </button>
                );
              })}
              <p className="text-xs text-text-secondary font-medium mt-2">Có thể chọn nhiều đáp án</p>
            </div>
          )}

          {/* Text */}
          {currentQuestion.type === 'text' && (
            <textarea
              value={currentAnswer || ''}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Hãy chia sẻ thêm chi tiết..."
              rows={5}
              className="w-full bg-white border border-border-subtle rounded-xl p-5 focus:ring-2 focus:ring-secondary/50 focus:border-secondary outline-none transition-all text-base shadow-sm resize-y"
            />
          )}

          {/* NPS */}
          {currentQuestion.type === 'nps' && (
            <div className="py-6">
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {Array.from({ length: 11 }, (_, i) => (
                  <button key={i} onClick={() => setAnswer(i)} className={`w-12 h-12 rounded-xl font-bold text-lg transition-all cursor-pointer ${currentAnswer === i ? 'bg-primary text-white shadow-md scale-110' : 'bg-white border border-border-subtle text-text-primary hover:border-primary/30 hover:shadow-sm'}`}>
                    {i}
                  </button>
                ))}
              </div>
              <div className="flex justify-between px-2 text-sm font-semibold text-text-secondary italic">
                <span>Hoàn toàn không</span>
                <span>Chắc chắn có</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 w-full bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.06)] px-6 py-5 flex justify-center border-t border-border-subtle/50 z-50">
        <div className="w-full max-w-[720px] flex flex-col gap-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sentiment-positive opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sentiment-positive"></span>
              </span>
              <span className="text-xs font-bold text-text-secondary">Đang tự động lưu...</span>
            </div>
            <button onClick={clearAnswer} className="text-primary text-sm font-bold flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer">
              <Undo2 size={16} /> Xóa
            </button>
          </div>
          <div className="flex gap-4">
            <button onClick={handlePrev} disabled={step === 0} className={`flex-1 py-4 bg-white border-2 border-border-subtle rounded-xl text-base font-bold text-text-primary transition-colors shadow-sm ${step === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-container-low active:scale-95 cursor-pointer'}`}>
              Quay lại
            </button>
            <button disabled={isSubmitting} onClick={handleNext} className={`flex-[2] py-4 bg-primary text-white rounded-xl text-lg font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}>
              {isSubmitting ? 'Đang gửi...' : step === totalSteps - 1 ? 'Hoàn thành' : 'Tiếp theo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
