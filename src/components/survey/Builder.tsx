import React from 'react';
import { CircleDot, CheckSquare, Star, AlignLeft, Minus, GripVertical, Copy, Trash2, Plus, GitBranch, Sparkles, RefreshCw, Send, CheckCircle2, Check, Info, UploadCloud, ChevronDown, X, FileText } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useSurvey } from '../../context/SurveyContext';
import { ShareModal } from '../common/ShareModal';
import ReactMarkdown from 'react-markdown';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import type { SurveyQuestion, QuestionType } from '../../types';

const questionTypeLabels: Record<QuestionType, { label: string; icon: React.ReactNode }> = {
  single_choice: { label: 'Một lựa chọn', icon: <CircleDot size={16} className="text-primary" /> },
  multiple_choice: { label: 'Nhiều lựa chọn', icon: <CheckSquare size={16} className="text-primary" /> },
  star_rating: { label: 'Thang điểm sao', icon: <Star size={16} className="text-primary" /> },
  text: { label: 'Văn bản tự do', icon: <AlignLeft size={16} className="text-primary" /> },
  nps: { label: 'Điểm NPS', icon: <Minus size={16} className="text-primary" /> },
};

export function Builder({ onPublished, onError }: { onPublished?: () => void; onError?: (msg: string) => void }) {
  const { parseDocx, createSurvey, setCurrentSurvey, isLoading, pendingTemplate, clearPendingTemplate, chatWithAI } = useSurvey();
  
  const [showSurvey, setShowSurvey] = useState(false);
  const [topic, setTopic] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [surveyTitle, setSurveyTitle] = useState('');
  const [surveyDescription, setSurveyDescription] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isQuiz, setIsQuiz] = useState(false);
  const [showScore, setShowScore] = useState(true);
  const [publishedSurvey, setPublishedSurvey] = useState<{ id: string; title: string } | null>(null);

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
      setShowSurvey(true);
      if (pendingTemplate.questions.length > 0) {
        setActiveQuestionId('q1');
      }
      clearPendingTemplate();
    }
  }, [pendingTemplate, clearPendingTemplate]);

  const handleGenerate = async () => {
    try {
      const result = await parseDocx(selectedFile, topic);
      setSurveyTitle(result.title);
      setSurveyDescription(topic);
      setQuestions(result.questions);
      setShowSurvey(true);
      if (result.questions.length > 0) {
        setActiveQuestionId(result.questions[0].id);
      }
    } catch (err: any) {
      if (onError) onError(err.message || 'Đã xảy ra lỗi khi phân tích. Vui lòng thử lại.');
    }
  };

  const handlePublish = async () => {
    if (questions.length === 0) return;
    setIsPublishing(true);
    try {
      const survey = await createSurvey({
        title: surveyTitle,
        description: surveyDescription,
        questions,
        isQuiz,
        showScore,
      });
      setCurrentSurvey(survey);
      setPublishedSurvey({ id: survey.id, title: survey.title });
      if (onPublished) onPublished();
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

  const addQuestion = () => {
    const newQ: SurveyQuestion = {
      id: `q${Date.now()}`,
      type: 'single_choice',
      text: '',
      options: ['Lựa chọn 1', 'Lựa chọn 2'],
      required: true,
    };
    setQuestions(prev => [...prev, newQ]);
    setActiveQuestionId(newQ.id);
  };

  const addOption = (questionId: string) => {
    const q = questions.find(q => q.id === questionId);
    if (!q || !q.options) return;
    updateQuestion(questionId, { options: [...q.options, `Lựa chọn ${q.options.length + 1}`] });
  };

  const updateOption = (questionId: string, optionIdx: number, value: string) => {
    const q = questions.find(q => q.id === questionId);
    if (!q || !q.options) return;
    const newOptions = [...q.options];
    newOptions[optionIdx] = value;
    updateQuestion(questionId, { options: newOptions });
  };

  const removeOption = (questionId: string, optionIdx: number) => {
    const q = questions.find(q => q.id === questionId);
    if (!q || !q.options || q.options.length <= 2) return;
    updateQuestion(questionId, { options: q.options.filter((_, i) => i !== optionIdx) });
  };

  const changeQuestionType = (questionId: string, newType: QuestionType) => {
    const updates: Partial<SurveyQuestion> = { type: newType, correctAnswer: undefined };
    if (newType === 'single_choice' || newType === 'multiple_choice') {
      const q = questions.find(q => q.id === questionId);
      if (!q?.options || q.options.length === 0) {
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
    if (q.type === 'single_choice') {
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
    <div className="flex flex-col md:flex-row h-full w-full overflow-y-auto md:overflow-hidden animate-in fade-in duration-500">
      


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
                     onChange={setSurveyTitle}
                     placeholder="Nhập tiêu đề khảo sát..."
                     modules={{
                       toolbar: [
                         ['bold', 'italic', 'underline', 'strike'],
                         [{ 'color': [] }, { 'background': [] }],
                         ['clean']
                       ]
                     }}
                   />
                 </div>
                 <div className="quill-desc quill-smart-toolbar w-full mt-4">
                   <ReactQuill
                     theme="snow"
                     value={surveyDescription}
                     onChange={setSurveyDescription}
                     placeholder="Mô tả ngắn gọn về khảo sát..."
                     modules={{
                       toolbar: [
                         ['bold', 'italic', 'underline', 'strike'],
                         [{ 'color': [] }, { 'background': [] }],
                         ['clean']
                       ]
                     }}
                   />
                 </div>
               </div>

               {/* Question Cards */}
               {questions.map((q, idx) => {
                 const isActive = q.id === activeQuestionId;
                 return (
                   <div
                     key={q.id}
                     onClick={() => setActiveQuestionId(q.id)}
                     className={`bg-white rounded-2xl p-6 transition-all cursor-pointer ${
                       isActive
                         ? 'border-2 border-primary shadow-lg ring-4 ring-primary/5 scale-[1.01]'
                         : 'border border-border-subtle shadow-sm hover:shadow-md opacity-80 hover:opacity-100'
                     }`}
                   >
                     {/* Question Header */}
                     <div className="flex justify-between items-center mb-4">
                       <div className="flex items-center gap-3">
                         <span className={`text-xs font-bold px-2.5 py-1 rounded ${isActive ? 'bg-primary-fixed text-primary' : 'bg-surface-container text-text-secondary'}`}>
                           Q{idx + 1} • {questionTypeLabels[q.type]?.label}
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
                           onChange={(val) => updateQuestion(q.id, { text: val })}
                           placeholder="Nhập nội dung câu hỏi..."
                           modules={{
                             toolbar: [
                               ['bold', 'italic', 'underline', 'strike'],
                               [{ 'color': [] }, { 'background': [] }],
                               ['clean']
                             ]
                           }}
                         />
                       </div>
                     ) : (
                       <div 
                         className="font-display text-xl font-semibold text-text-primary mb-4" 
                         dangerouslySetInnerHTML={{ __html: q.text || 'Nhập nội dung câu hỏi...' }} 
                       />
                     )}

                     {/* Question Type Selector (active only) */}
                     {isActive && (
                       <div className="mb-4">
                         <label className="text-xs font-semibold text-text-secondary mb-2 block">Loại câu hỏi</label>
                         <div className="flex flex-wrap gap-2">
                           {(Object.keys(questionTypeLabels) as QuestionType[]).map(type => (
                             <button
                               key={type}
                               onClick={(e) => { e.stopPropagation(); changeQuestionType(q.id, type); }}
                               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                 q.type === type ? 'bg-primary text-white' : 'bg-surface-container text-text-secondary hover:bg-surface-container-high'
                               }`}
                             >
                               {questionTypeLabels[type].icon}
                               {questionTypeLabels[type].label}
                             </button>
                           ))}
                         </div>
                       </div>
                     )}

                     {/* Options (for single_choice / multiple_choice) */}
                     {(q.type === 'single_choice' || q.type === 'multiple_choice') && q.options && (
                       <div className="space-y-2 mt-3">
                         {q.options.map((opt, optIdx) => (
                           <div key={optIdx} className={`flex items-center gap-3 p-3 bg-surface-background rounded-xl border group ${isQuiz && ((q.type === 'single_choice' && q.correctAnswer === opt) || (q.type === 'multiple_choice' && Array.isArray(q.correctAnswer) && q.correctAnswer.includes(opt))) ? 'border-sentiment-positive bg-sentiment-positive/5' : 'border-border-subtle'}`}>
                             {isQuiz ? (
                               <button
                                 onClick={(e) => { e.stopPropagation(); toggleCorrectAnswer(q.id, opt); }}
                                 className={`flex-shrink-0 w-5 h-5 ${q.type === 'multiple_choice' ? 'rounded-md' : 'rounded-full'} border-2 flex items-center justify-center transition-colors cursor-pointer ${
                                   (q.type === 'single_choice' && q.correctAnswer === opt) || (q.type === 'multiple_choice' && Array.isArray(q.correctAnswer) && q.correctAnswer.includes(opt))
                                     ? 'border-sentiment-positive bg-sentiment-positive text-white' 
                                     : 'border-text-secondary hover:border-sentiment-positive'
                                 }`}
                                 title="Đánh dấu là đáp án đúng"
                               >
                                 {((q.type === 'single_choice' && q.correctAnswer === opt) || (q.type === 'multiple_choice' && Array.isArray(q.correctAnswer) && q.correctAnswer.includes(opt))) && (
                                    q.type === 'multiple_choice' ? <Check size={14} strokeWidth={3} /> : <CheckCircle2 size={12} />
                                 )}
                               </button>
                             ) : (
                               q.type === 'single_choice'
                                 ? <CircleDot size={18} className="text-text-secondary flex-shrink-0" />
                                 : <CheckSquare size={18} className="text-text-secondary flex-shrink-0" />
                             )}
                             <div className="flex-1 quill-option quill-smart-toolbar">
                               <ReactQuill
                                 theme="snow"
                                 value={opt}
                                 onChange={(val) => updateOption(q.id, optIdx, val)}
                                 placeholder={`Lựa chọn ${optIdx + 1}`}
                                 modules={{
                                   toolbar: [
                                     ['bold', 'italic', 'underline', 'strike'],
                                     [{ 'color': [] }, { 'background': [] }],
                                     ['clean']
                                   ]
                                 }}
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
                             <Plus size={16} /> Thêm lựa chọn
                           </button>
                         )}
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

                     {/* Footer Settings */}
                     {isActive && (
                       <div className="mt-4 pt-4 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-end gap-4">
                         {isQuiz && (q.type === 'single_choice' || q.type === 'multiple_choice') && (
                           <div className="flex items-center gap-2">
                             <span className="text-sm font-medium text-text-secondary">Điểm:</span>
                             <input
                               type="number"
                               min="0"
                               value={q.points !== undefined ? q.points : 1}
                               onChange={(e) => updateQuestion(q.id, { points: parseInt(e.target.value) || 0 })}
                               className="w-16 px-2 py-1 bg-surface-background border border-border-subtle rounded-md text-sm text-center focus:ring-2 focus:ring-primary/50 outline-none"
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
                 );
               })}

               {/* Add New Question */}
               <div
                 onClick={addQuestion}
                 className="border-2 border-dashed border-border-subtle p-8 rounded-2xl flex flex-col items-center justify-center text-text-secondary hover:border-primary hover:text-primary hover:bg-primary-fixed/30 transition-all cursor-pointer group"
               >
                 <Plus size={32} className="mb-2 group-hover:scale-110 transition-transform" />
                 <span className="text-sm font-semibold">Nhấp để thêm câu hỏi mới</span>
               </div>

               {/* Publish Bar */}
               <div className="fixed bottom-0 left-0 md:left-64 right-0 md:right-80 bg-white/95 backdrop-blur-md border-t border-border-subtle p-4 flex items-center justify-between z-20">
                 <div className="flex items-center gap-2 md:gap-4">
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
                   <button
                     onClick={() => { setShowSurvey(false); setQuestions([]); setSurveyTitle(''); setIsQuiz(false); }}
                     className="text-xs md:text-sm font-semibold text-text-secondary hover:text-sentiment-negative transition-colors cursor-pointer"
                   >
                     Tạo lại
                   </button>
                 </div>
                 <button
                   onClick={handlePublish}
                   disabled={isPublishing || questions.length === 0}
                   className="px-4 md:px-8 py-2 md:py-2.5 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-xs md:text-sm"
                 >
                   {isPublishing ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
                   Xuất bản
                 </button>
               </div>
             </>
           )}

        </div>
      </section>

      {/* Right Sidebar: AI Orchestrator */}
      <aside className="w-full md:w-80 bg-white border-t md:border-t-0 md:border-l border-border-subtle md:h-full flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-2 border-b border-border-subtle bg-surface-background/50">
           <Sparkles size={20} className="text-secondary-container" />
           <h2 className="font-display text-lg font-bold">Bộ điều phối AI</h2>
        </div>
        
        <div className="flex-1 p-6 space-y-8 overflow-y-auto">
           {/* Stats */}
           {showSurvey && questions.length > 0 && (
             <div className="rounded-2xl p-5 bg-gradient-to-br from-surface-background to-secondary-fixed/30 border border-secondary-container/30 shadow-[0_0_15px_rgba(57,184,253,0.1)]">
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
           <div className="p-5 bg-primary-fixed/40 rounded-2xl border border-primary-fixed-dim/50">
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
        <div className="p-6 border-t border-border-subtle bg-surface-background/50">
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


