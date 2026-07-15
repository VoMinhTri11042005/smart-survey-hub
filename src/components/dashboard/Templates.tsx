import { FileText, Sparkles, Search, CircleDot, CheckSquare, Star, AlignLeft, Minus } from 'lucide-react';
import { useState } from 'react';
import { SURVEY_TEMPLATES, TEMPLATE_CATEGORIES } from '../../data/templates';
import type { View, QuestionType } from '../../types';
import { useSurvey } from '../../context/SurveyContext';

const typeIcons: Record<QuestionType, React.ReactNode> = {
  single_choice: <CircleDot size={12} />,
  multiple_choice: <CheckSquare size={12} />,
  star_rating: <Star size={12} />,
  text: <AlignLeft size={12} />,
  nps: <Minus size={12} />,
};

interface TemplatesProps {
  onViewChange?: (view: View) => void;
}

export function Templates({ onViewChange }: TemplatesProps) {
  const [category, setCategory] = useState('Tất cả');
  const [search, setSearch] = useState('');
  const { loadTemplate } = useSurvey();

  const handleUseTemplate = (templateId: string) => {
    const template = SURVEY_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      loadTemplate(template);
      onViewChange?.('builder');
    }
  };

  const filtered = SURVEY_TEMPLATES.filter(t => {
    const matchCategory = category === 'Tất cả' || t.category === category;
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-text-primary">Thư viện Mẫu</h1>
          <p className="text-sm text-text-secondary mt-1">Bắt đầu nhanh với {SURVEY_TEMPLATES.length} mẫu khảo sát được thiết kế sẵn.</p>
        </div>
        <button
          onClick={() => onViewChange?.('builder')}
          className="px-5 py-2.5 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary/90 transition-all flex items-center gap-2 cursor-pointer self-start"
        >
          <Sparkles size={18} />
          Tạo bằng AI
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mẫu khảo sát..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-border-subtle rounded-xl text-sm focus:ring-2 focus:ring-secondary/30 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                category === cat ? 'bg-primary text-white' : 'bg-white border border-border-subtle text-text-secondary hover:border-primary/30'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-border-subtle">
          <FileText size={40} className="text-text-secondary mb-4" />
          <p className="text-text-secondary text-sm">Không tìm thấy mẫu phù hợp.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(template => (
            <div key={template.id} className="bg-white rounded-2xl border border-border-subtle p-6 hover:shadow-lg transition-all group flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center text-2xl">
                  {template.icon}
                </div>
                <span className="px-2.5 py-1 bg-surface-container text-text-secondary text-[10px] font-bold uppercase tracking-wider rounded-md">
                  {template.category}
                </span>
              </div>

              <h3 className="font-display text-lg font-bold text-text-primary group-hover:text-primary transition-colors mb-2">
                {template.title}
              </h3>
              <p className="text-text-secondary text-sm mb-4 flex-1 line-clamp-2">{template.description}</p>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {Array.from(new Set(template.questions.map(q => q.type))).map(type => (
                  <span key={type} className="flex items-center gap-1 px-2 py-0.5 bg-surface-container-low rounded-md text-[10px] font-semibold text-text-secondary">
                    {typeIcons[type]}
                  </span>
                ))}
                <span className="px-2 py-0.5 bg-primary-fixed text-primary rounded-md text-[10px] font-bold">
                  {template.questions.length} câu hỏi
                </span>
              </div>

              <button
                onClick={() => handleUseTemplate(template.id)}
                className="w-full py-2.5 bg-primary text-white font-bold rounded-xl text-sm hover:bg-primary/90 active:scale-95 transition-all cursor-pointer"
              >
                Sử dụng mẫu này
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
