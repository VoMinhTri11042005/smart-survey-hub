import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, X, Send, Sparkles, Bot } from 'lucide-react';
import { useSurvey } from '../../context/SurveyContext';
import type { Survey, ChatMessage } from '../../types';
import { motion, useDragControls } from 'motion/react';

export function Chatbot({ survey }: { survey: Survey | null }) {
  const { chatWithAI } = useSurvey();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { type: 'bot', text: 'Xin chào! Tôi là AI trợ lý khảo sát. Tôi có thể giải đáp các thắc mắc của bạn về các câu hỏi trong khảo sát này.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages(prev => [...prev, { type: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      const reply = await chatWithAI(
        userMsg,
        survey?.title || '',
        survey?.description || '',
        survey?.questions || []
      );
      setMessages(prev => [...prev, { type: 'bot', text: reply }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { type: 'bot', text: `Lỗi: ${err.message || 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.'}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        drag
        dragMomentum={false}
        whileDrag={{ scale: 1.1 }}
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 w-14 h-14 bg-secondary text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 hover:shadow-xl active:scale-95 transition-all z-50 cursor-grab active:cursor-grabbing ${isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}
        style={{ touchAction: 'none' }}
        aria-label="Mở Trợ lý AI"
      >
        <MessageSquare size={24} className="pointer-events-none" />
        <span className="absolute -top-1 -right-1 flex h-3 w-3 pointer-events-none">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sentiment-positive opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-sentiment-positive border-2 border-white"></span>
        </span>
      </motion.button>

      {/* Chat Window */}
      <motion.div 
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        className={`fixed bottom-6 right-6 w-[360px] h-[500px] max-h-[calc(100vh-48px)] max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-2xl border border-border-subtle flex flex-col z-50 transition-all origin-bottom-right duration-300 overflow-hidden ${isOpen ? 'scale-100 opacity-100 pointer-events-auto shadow-[0_12px_40px_-10px_rgba(31,16,142,0.2)]' : 'scale-50 opacity-0 pointer-events-none'}`}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 bg-primary text-white cursor-move touch-none flex-shrink-0"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center pointer-events-none">
              <Sparkles size={16} className="text-secondary-fixed" />
            </div>
            <div className="pointer-events-none">
              <h3 className="font-display font-bold text-sm leading-tight">Trợ lý Thông minh</h3>
              <p className="text-[10px] text-primary-fixed-dim font-medium uppercase tracking-wider">Trực tuyến (Kéo để di chuyển)</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} onPointerDown={(e) => e.stopPropagation()} className="p-1 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-background custom-scrollbar">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.type === 'bot' && (
                <div className="w-6 h-6 rounded-full bg-surface-container-high border border-border-subtle flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                  <Bot size={12} className="text-primary" />
                </div>
              )}
              <div className={`max-w-[85%] p-3 text-sm leading-relaxed shadow-sm ${msg.type === 'user' ? 'bg-primary text-white rounded-2xl rounded-tr-sm' : 'bg-white text-text-primary rounded-2xl rounded-tl-sm border border-border-subtle'}`}>
                {msg.type === 'bot' ? (
                  <ReactMarkdown
                    components={{
                      p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-bold text-primary" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2" {...props} />,
                      li: ({node, ...props}) => <li className="mb-1" {...props} />,
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-full bg-surface-container-high border border-border-subtle flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                <Bot size={12} className="text-primary" />
              </div>
              <div className="bg-white text-text-primary rounded-2xl rounded-tl-sm border border-border-subtle p-3 shadow-sm">
                <div className="flex gap-1.5 items-center h-5">
                  <span className="w-2 h-2 bg-text-secondary/50 rounded-full animate-bounce [animation-delay:0ms]"></span>
                  <span className="w-2 h-2 bg-text-secondary/50 rounded-full animate-bounce [animation-delay:150ms]"></span>
                  <span className="w-2 h-2 bg-text-secondary/50 rounded-full animate-bounce [animation-delay:300ms]"></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-border-subtle">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isTyping && handleSend()}
              placeholder="Hỏi bất cứ điều gì..."
              disabled={isTyping}
              className="w-full bg-surface-background border border-border-subtle rounded-full py-2.5 pl-4 pr-12 text-sm focus:ring-2 focus:ring-secondary/30 focus:border-secondary outline-none transition-all disabled:opacity-60"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className={`absolute right-1.5 p-2 rounded-full transition-colors cursor-pointer ${input.trim() && !isTyping ? 'bg-secondary text-white hover:bg-secondary/90' : 'bg-surface-container text-text-secondary cursor-not-allowed'}`}
            >
              <Send size={16} />
            </button>
          </div>
          <div className="text-center mt-2">
            <span className="text-[10px] text-text-secondary font-medium">AI có thể mắc lỗi. Hãy luôn xác minh các dữ liệu quan trọng.</span>
          </div>
        </div>
      </motion.div>
    </>
  );
}
