import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import type { QuestionType, Survey, SurveyAnswer, SurveyQuestion } from '../../types';
import { stripHtml, toUnaccented } from '../../utils/stringUtils';

interface ImportedResponse {
  answers: Record<string, SurveyAnswer>;
  submittedAt?: string;
}

interface Props {
  surveys: Survey[];
  onClose: () => void;
  onImported: (surveyId: string) => Promise<void>;
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'single_choice', label: 'Một lựa chọn' },
  { value: 'multiple_choice', label: 'Nhiều lựa chọn' },
  { value: 'dropdown', label: 'Menu thả xuống' },
  { value: 'date', label: 'Ngày' },
  { value: 'linear_scale', label: 'Thang tuyến tính' },
  { value: 'star_rating', label: 'Đánh giá sao (1–5)' },
  { value: 'nps', label: 'NPS (0–10)' },
  { value: 'text', label: 'Văn bản' },
];

let apiBase = import.meta.env.VITE_API_URL;
if (apiBase && !apiBase.endsWith('/api')) apiBase = apiBase.endsWith('/') ? `${apiBase}api` : `${apiBase}/api`;
const API_BASE = apiBase || (import.meta.env.PROD ? 'https://smart-survey-hub.onrender.com/api' : '/api');
const normalize = (value: string) => toUnaccented(stripHtml(value)).trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ');
const isBlank = (value: unknown) => value === undefined || value === null || String(value).trim() === '';

function cellText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const item = value as { text?: unknown; richText?: { text?: unknown }[]; result?: unknown; hyperlink?: unknown };
    if (Array.isArray(item.richText)) return item.richText.map(part => String(part.text ?? '')).join('');
    if (item.text !== undefined) return String(item.text);
    if (item.result !== undefined) return cellText(item.result);
    if (item.hyperlink !== undefined) return String(item.text ?? item.hyperlink);
  }
  return String(value ?? '').trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [[]];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ',') {
      rows[rows.length - 1].push(value);
      value = '';
    } else if (character === '\n' || character === '\r') {
      rows[rows.length - 1].push(value);
      value = '';
      if (character === '\r' && text[index + 1] === '\n') index++;
      rows.push([]);
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error('File CSV có dấu ngoặc kép chưa được đóng đúng.');
  rows[rows.length - 1].push(value);
  return rows.filter(row => row.some(cell => cell.trim() !== ''));
}

function parseTimestamp(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const text = cellText(value);
  const localized = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (localized) {
    const [, day, month, year, hour = '0', minute = '0', second = '0'] = localized;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
    if (parsed.getUTCDate() === Number(day) && parsed.getUTCMonth() === Number(month) - 1) return parsed.toISOString();
    return undefined;
  }
  const parsed = new Date(text);
  return text && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function inferType(values: string[], header: string): QuestionType {
  const nonEmpty = values.filter(Boolean);
  if (nonEmpty.length && nonEmpty.every(value => /^\d+(?:[.,]\d+)?$/.test(value))) {
    const numbers = nonEmpty.map(value => Number(value.replace(',', '.')));
    if (numbers.every(value => Number.isInteger(value) && value >= 1 && value <= 5)) return 'star_rating';
    if (numbers.every(value => Number.isInteger(value) && value >= 0 && value <= 10) && /nps|recommend|gioi thieu|khuyen/i.test(toUnaccented(header))) return 'nps';
  }
  const unique = new Set(nonEmpty);
  return unique.size > 0 && unique.size <= 15 && Math.max(...nonEmpty.map(value => value.length), 0) <= 120
    ? 'single_choice'
    : 'text';
}

function getOptions(values: string[], type: QuestionType) {
  const candidates = type === 'multiple_choice'
    ? values.flatMap(value => value.split(/[,;\n]+/).map(part => part.trim()).filter(Boolean))
    : values.filter(Boolean);
  return [...new Set(candidates)].slice(0, 100);
}

function splitMultipleAnswer(value: string, options: string[]) {
  const exact = options.find(option => normalize(option) === normalize(value));
  return exact ? [exact] : value.split(/[,;\n]+/).map(part => part.trim()).filter(Boolean);
}

function parseGridAnswer(value: string, question: SurveyQuestion): Record<string, string | string[]> | null {
  const rows = question.options ?? [];
  const columns = question.gridColumns ?? [];
  const result: Record<string, string | string[]> = {};
  for (const entry of value.split(/;\s*/).filter(Boolean)) {
    const separator = entry.indexOf(':');
    if (separator < 1) return null;
    const rowText = entry.slice(0, separator).trim();
    const answerText = entry.slice(separator + 1).trim();
    const row = rows.find(option => normalize(option) === normalize(rowText));
    const selections = splitMultipleAnswer(answerText, columns)
      .map(label => columns.find(option => normalize(option) === normalize(label)))
      .filter((option): option is string => Boolean(option));
    if (!row || !selections.length || (question.type === 'multiple_choice_grid' && selections.length !== 1)) return null;
    result[row] = question.type === 'checkbox_grid' ? [...new Set(selections)] : selections[0];
  }
  return Object.keys(result).length ? result : null;
}

export function ImportResponsesDialog({ surveys, onClose, onImported }: Props) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [timestampColumn, setTimestampColumn] = useState<number | null>(null);
  const [mode, setMode] = useState<'create' | 'existing'>('create');
  const [targetSurveyId, setTargetSurveyId] = useState(surveys[0]?.id || '');
  const [title, setTitle] = useState('');
  const [questionTypes, setQuestionTypes] = useState<Record<number, QuestionType>>({});
  const [columnMappings, setColumnMappings] = useState<Record<number, string>>({});
  const [fileName, setFileName] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [error, setError] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const selectedSurvey = surveys.find(survey => survey.id === targetSurveyId);
  const dataColumns = headers.map((header, index) => ({ header, index })).filter(column => column.index !== timestampColumn);
  const initializedTypes = useMemo(() => Object.fromEntries(dataColumns.map(({ header, index }) => [
    index,
    questionTypes[index] || inferType(rows.map(row => cellText(row[index])), header),
  ])) as Record<number, QuestionType>, [dataColumns, rows, questionTypes]);

  const suggestedMappings = useMemo(() => {
    if (!selectedSurvey) return {};
    return Object.fromEntries(dataColumns.map(({ header, index }) => {
      const match = selectedSurvey.questions.find(question => normalize(stripHtml(question.text)) === normalize(header));
      return [index, columnMappings[index] ?? match?.id ?? ''];
    })) as Record<number, string>;
  }, [selectedSurvey, dataColumns, columnMappings]);

  const questions = useMemo<SurveyQuestion[]>(() => dataColumns.map(({ header, index }) => {
    const type = initializedTypes[index] || 'text';
    return {
      id: `import-q-${index + 1}`,
      text: header || `Câu hỏi ${index + 1}`,
      type,
      required: false,
      ...(type === 'single_choice' || type === 'multiple_choice' || type === 'dropdown'
        ? { options: getOptions(rows.map(row => cellText(row[index])), type) }
        : type === 'linear_scale' ? { scaleMin: 1, scaleMax: 10 } : {}),
    };
  }), [dataColumns, initializedTypes, rows]);

  const builtRows = useMemo(() => {
    const issues: string[] = [];
    let issueCount = 0;
    const imported: ImportedResponse[] = [];
    const questionById = new Map((selectedSurvey?.questions || []).map(question => [question.id, question]));
    const mappedColumns = mode === 'create'
      ? dataColumns.map(column => ({
        ...column,
        question: questions.find(question => question.id === `import-q-${column.index + 1}`),
      }))
      : dataColumns.map(column => {
        const questionId = suggestedMappings[column.index] || '';
        return { ...column, question: questionById.get(questionId) };
      }).filter(column => column.question);

    const addIssue = (message: string) => {
      issueCount++;
      if (issues.length < 8) issues.push(message);
    };
    if (!dataColumns.length) addIssue('Không tìm thấy cột câu hỏi trong file.');
    if (mode === 'create' && questions.some(question =>
      (question.type === 'single_choice' || question.type === 'multiple_choice' || question.type === 'dropdown') && !question.options?.length
    )) {
      addIssue('Có câu hỏi lựa chọn chưa có đáp án trong file; hãy đổi loại câu hỏi hoặc kiểm tra dữ liệu.');
    }
    if (mode === 'existing' && mappedColumns.length === 0) addIssue('Hãy ghép ít nhất một cột Excel với câu hỏi của khảo sát.');
    if (mode === 'existing') {
      const ids = mappedColumns.map(column => column.question!.id);
      if (new Set(ids).size !== ids.length) addIssue('Mỗi câu hỏi trong khảo sát chỉ được ghép với một cột Excel.');
    }

    rows.forEach((row, rowIndex) => {
      const answers: ImportedResponse['answers'] = {};
      for (const column of mappedColumns) {
        const value = cellText(row[column.index]);
        if (!value || !column.question) continue;
        const question = column.question;
        if (question.type === 'text') {
          answers[question.id] = value;
        } else if (question.type === 'star_rating' || question.type === 'nps' || question.type === 'linear_scale') {
          const numberMatch = value.match(/^-?\d+(?:[.,]\d+)?/);
          const number = numberMatch ? Number(numberMatch[0].replace(',', '.')) : Number.NaN;
          const valid = Number.isInteger(number) && (
            question.type === 'nps' ? number >= 0 && number <= 10
              : question.type === 'linear_scale' ? number >= (question.scaleMin ?? 1) && number <= (question.scaleMax ?? 10)
                : number >= 1 && number <= 5
          );
          if (!valid) addIssue(`Dòng ${rowIndex + 2}, “${column.header}”: giá trị điểm không hợp lệ (“${value}”).`);
          else answers[question.id] = number;
        } else if (question.type === 'date') {
          const dateValue = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
          const date = new Date(`${dateValue}T00:00:00.000Z`);
          const valid = /^\d{4}-\d{2}-\d{2}$/.test(dateValue) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateValue;
          if (!valid) addIssue(`Dòng ${rowIndex + 2}, “${column.header}”: ngày không hợp lệ (“${value}”).`);
          else answers[question.id] = dateValue;
        } else if (question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid') {
          const gridAnswer = parseGridAnswer(value, question);
          if (!gridAnswer) addIssue(`Dòng ${rowIndex + 2}, “${column.header}”: nhập lưới theo định dạng “Hàng: Cột; Hàng khác: Cột”.`);
          else answers[question.id] = gridAnswer;
        } else {
          const options = question.options || [];
          const labels = question.type === 'multiple_choice' ? splitMultipleAnswer(value, options) : [value];
          const matched = labels.map(label => options.find(option => normalize(option) === normalize(label)));
          if (matched.some(option => !option)) {
            addIssue(`Dòng ${rowIndex + 2}, “${column.header}”: đáp án “${value}” không khớp lựa chọn.`);
          } else if (question.type === 'multiple_choice') {
            const multipleAnswers = [...new Set(matched as string[])];
            if (question.maxSelections && multipleAnswers.length > question.maxSelections) {
              addIssue(`Dòng ${rowIndex + 2}, “${column.header}”: chỉ được chọn tối đa ${question.maxSelections} đáp án.`);
            } else {
              answers[question.id] = multipleAnswers;
            }
          } else if (matched[0]) {
            answers[question.id] = matched[0];
          }
        }
      }
      const timeValue = timestampColumn === null ? undefined : rows[rowIndex][timestampColumn];
      const submittedAt = timestampColumn === null ? undefined : parseTimestamp(timeValue);
      if (timestampColumn !== null && !isBlank(timeValue) && !submittedAt) {
        addIssue(`Dòng ${rowIndex + 2}: không đọc được thời gian gửi.`);
      }
      imported.push({ answers, ...(submittedAt ? { submittedAt } : {}) });
    });
    return { rows: imported, issues, issueCount };
  }, [dataColumns, mode, questions, rows, selectedSurvey, suggestedMappings, timestampColumn]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError('');
    if (file.size > 5 * 1024 * 1024) {
      setError('File tối đa 5 MB để bảo đảm nhập ổn định.');
      return;
    }
    setIsReading(true);
    try {
      let sheetRows: unknown[][];
      if (file.name.toLocaleLowerCase().endsWith('.csv')) {
        sheetRows = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
      } else if (file.name.toLocaleLowerCase().endsWith('.xlsx')) {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const worksheet = workbook.worksheets[0];
        if (!worksheet) throw new Error('File Excel không có trang tính.');
        sheetRows = [];
        worksheet.eachRow({ includeEmpty: false }, row => {
          const values: unknown[] = [];
          for (let column = 1; column <= worksheet.columnCount; column++) values.push(row.getCell(column).value);
          sheetRows.push(values);
        });
      } else {
        throw new Error('Chỉ hỗ trợ file .xlsx hoặc .csv. Hãy lưu file .xls dưới dạng .xlsx rồi tải lại.');
      }

      const parsedHeaders = (sheetRows.shift() || []).map(cellText);
      while (parsedHeaders.length && !parsedHeaders[parsedHeaders.length - 1]) parsedHeaders.pop();
      const meaningfulRows = sheetRows.filter(row => row.some(value => !isBlank(value)));
      if (parsedHeaders.length < 2 || !meaningfulRows.length) {
        throw new Error('File cần có hàng tiêu đề và ít nhất một dòng phản hồi.');
      }
      if (parsedHeaders.length > 101 || meaningfulRows.length > 5000) {
        throw new Error('File vượt giới hạn 100 câu hỏi hoặc 5000 phản hồi.');
      }
      const timestamp = parsedHeaders.findIndex(header => /^(timestamp|time stamp|submitted at|ngay gui|thoi gian( gui)?|thoi diem gui|dau thoi gian)$/i.test(normalize(header)));
      setHeaders(parsedHeaders);
      setRows(meaningfulRows);
      setTimestampColumn(timestamp >= 0 ? timestamp : null);
      setQuestionTypes(Object.fromEntries(parsedHeaders.map((header, index) => [
        index,
        inferType(meaningfulRows.map(row => cellText(row[index])), header),
      ])));
      setColumnMappings({});
      setFileName(file.name);
      setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 255));
      setIdempotencyKey(crypto.randomUUID());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đọc file dữ liệu.');
      setHeaders([]);
      setRows([]);
      setIdempotencyKey('');
    } finally {
      setIsReading(false);
    }
  };

  const submitImport = async () => {
    if (!idempotencyKey || builtRows.issueCount > 0 || isImporting) return;
    setIsImporting(true);
    setError('');
    try {
      const payload = {
        idempotencyKey,
        mode,
        ...(mode === 'existing' ? { surveyId: targetSurveyId } : {
          newSurvey: { title: title.trim(), description: `Được tạo từ file ${fileName}`, questions },
        }),
        responses: builtRows.rows,
      };
      const body = JSON.stringify(payload);
      if (new TextEncoder().encode(body).byteLength > 9 * 1024 * 1024) {
        throw new Error('Dữ liệu sau khi chuyển đổi vượt giới hạn gửi lên máy chủ. Hãy chia file thành các phần nhỏ hơn.');
      }
      const response = await fetch(`${API_BASE}/surveys/import-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không nhập được dữ liệu.');
      await onImported(data.surveyId);
      window.alert(data.replayed
        ? `Lượt nhập này đã được xử lý trước đó (${data.imported} phản hồi). Không thêm trùng dữ liệu.`
        : `Đã thêm ${data.imported} phản hồi${data.skipped ? `, bỏ qua ${data.skipped} phản hồi trùng` : ''}. Dữ liệu cũ được giữ nguyên.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không nhập được dữ liệu. Vui lòng thử lại.');
    } finally {
      setIsImporting(false);
    }
  };

  const canImport = Boolean(idempotencyKey)
    && builtRows.rows.length > 0
    && builtRows.issueCount === 0
    && (mode !== 'create' || title.trim().length > 0)
    && (mode !== 'existing' || Boolean(selectedSurvey));

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/50 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
      <section className="bg-white w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-3xl shadow-2xl border border-border-subtle">
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-border-subtle p-5 sm:p-6 flex justify-between items-start gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-sentiment-positive/10 text-sentiment-positive flex items-center justify-center shrink-0"><FileSpreadsheet size={22} /></div>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-text-primary">Nhập phản hồi từ Excel</h2>
              <p className="text-sm text-text-secondary mt-1">Xem trước trước khi thêm; phản hồi hiện có không bị ghi đè hoặc xóa.</p>
              <p className="text-xs text-text-secondary mt-1">Nên xuất bản sao lưu trước lần nhập đầu tiên.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="p-2 rounded-lg hover:bg-surface-container-low text-text-secondary cursor-pointer"><X size={20} /></button>
        </header>

        <div className="p-5 sm:p-6 space-y-5">
          <label className="block border-2 border-dashed border-border-subtle hover:border-primary/50 rounded-2xl p-6 text-center cursor-pointer transition-colors">
            <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={event => void handleFile(event.target.files?.[0])} />
            {isReading ? <Loader2 size={28} className="mx-auto animate-spin text-primary" /> : <Upload size={28} className="mx-auto text-primary" />}
            <span className="block mt-2 font-bold text-text-primary">{fileName || 'Chọn file Google Forms (.xlsx, .csv)'}</span>
            <span className="block mt-1 text-xs text-text-secondary">Tối đa 5 MB, 5000 dòng phản hồi và 100 cột</span>
          </label>

          {headers.length > 0 && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="text-sm font-semibold text-text-primary">
                  Cách nhập
                  <select value={mode} onChange={event => setMode(event.target.value as 'create' | 'existing')} className="mt-2 w-full rounded-xl border border-border-subtle bg-white p-3">
                    <option value="create">Tạo khảo sát mới và nhập phản hồi</option>
                    <option value="existing" disabled={!surveys.length}>Thêm vào khảo sát có sẵn</option>
                  </select>
                </label>
                {mode === 'create' ? (
                  <label className="text-sm font-semibold text-text-primary">
                    Tên khảo sát mới
                    <input value={title} onChange={event => setTitle(event.target.value)} maxLength={255} className="mt-2 w-full rounded-xl border border-border-subtle p-3" />
                  </label>
                ) : (
                  <label className="text-sm font-semibold text-text-primary">
                    Khảo sát nhận dữ liệu
                    <select value={targetSurveyId} onChange={event => { setTargetSurveyId(event.target.value); setColumnMappings({}); }} className="mt-2 w-full rounded-xl border border-border-subtle bg-white p-3">
                      {surveys.map(survey => <option key={survey.id} value={survey.id}>{stripHtml(survey.title)}</option>)}
                    </select>
                  </label>
                )}
              </div>

              {timestampColumn !== null && <p className="text-xs text-text-secondary bg-surface-container-low rounded-xl p-3">Đã nhận diện cột thời gian “{headers[timestampColumn]}”; thời gian gốc được giữ lại khi nhập.</p>}
              {mode === 'create' && <p className="text-xs text-text-secondary bg-surface-container-low rounded-xl p-3">Loại câu hỏi được đề xuất tự động và có thể chỉnh bên dưới. Câu mới không bắt buộc vì không thể suy ra thiết lập Google Forms.</p>}

              <div className="rounded-2xl border border-border-subtle overflow-hidden">
                <div className="p-4 bg-surface-container-low flex justify-between gap-3">
                  <div><h3 className="font-bold text-text-primary">Xem trước và ghép cột</h3><p className="text-xs text-text-secondary mt-1">{rows.length} phản hồi · {dataColumns.length} cột dữ liệu</p></div>
                  <CheckCircle2 className="text-sentiment-positive shrink-0" />
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="sticky top-0 bg-white"><tr><th className="p-3 text-xs text-text-secondary">Cột trong file</th><th className="p-3 text-xs text-text-secondary">{mode === 'create' ? 'Loại câu hỏi mới' : 'Ghép với câu hỏi'}</th><th className="p-3 text-xs text-text-secondary">Ví dụ dữ liệu</th></tr></thead>
                    <tbody>{dataColumns.map(({ header, index }) => (
                      <tr key={index} className="border-t border-border-subtle align-top">
                        <td className="p-3 font-semibold text-text-primary max-w-[240px]">{header}</td>
                        <td className="p-3">
                          {mode === 'create' ? (
                            <select value={initializedTypes[index] || 'text'} onChange={event => setQuestionTypes(previous => ({ ...previous, [index]: event.target.value as QuestionType }))} className="w-full rounded-lg border border-border-subtle p-2">
                              {QUESTION_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                            </select>
                          ) : (
                            <select value={suggestedMappings[index] || ''} onChange={event => setColumnMappings(previous => ({ ...previous, [index]: event.target.value }))} className="w-full rounded-lg border border-border-subtle p-2">
                              <option value="">Bỏ qua cột này</option>
                              {(selectedSurvey?.questions || []).map(question => <option key={question.id} value={question.id}>{stripHtml(question.text)}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="p-3 text-xs text-text-secondary max-w-[240px]">{rows.slice(0, 2).map(row => cellText(row[index])).filter(Boolean).join(' · ') || 'Ô trống'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>

              <div className={`rounded-xl p-3 text-sm ${builtRows.issueCount ? 'bg-sentiment-negative/10 text-sentiment-negative' : 'bg-sentiment-positive/10 text-text-primary'}`}>
                {builtRows.issueCount ? (
                  <div className="flex gap-2"><AlertTriangle size={18} className="shrink-0" /><div><strong>Cần xử lý {builtRows.issueCount} lỗi trước khi nhập</strong><ul className="mt-1 list-disc pl-5">{builtRows.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div></div>
                ) : <p className="flex items-center gap-2"><CheckCircle2 size={18} />Dữ liệu hợp lệ: sẵn sàng thêm {builtRows.rows.length} phản hồi. Dữ liệu cũ sẽ được giữ nguyên.</p>}
              </div>
            </>
          )}

          {error && <p role="alert" className="rounded-xl bg-sentiment-negative/10 p-3 text-sm text-sentiment-negative">{error}</p>}
        </div>

        <footer className="sticky bottom-0 bg-white border-t border-border-subtle p-5 sm:p-6 flex justify-end gap-3">
          <button onClick={onClose} disabled={isImporting} className="rounded-xl px-4 py-2.5 text-sm font-bold text-text-secondary hover:bg-surface-container-low disabled:opacity-50">Hủy</button>
          <button onClick={() => void submitImport()} disabled={!canImport || isImporting} className="rounded-xl px-5 py-2.5 bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            {isImporting && <Loader2 size={16} className="animate-spin" />}
            Xác nhận và nhập
          </button>
        </footer>
      </section>
    </div>
  );
}
