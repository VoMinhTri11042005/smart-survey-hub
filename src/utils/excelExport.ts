import ExcelJS from 'exceljs';
import type { Survey, SurveyQuestion, SurveyResponse } from '../types';
import { computeSurveyAnalytics } from './analytics';
import { cleanHtmlWhitespace } from './stringUtils';
import { roundLegacyStarRating } from '../../shared/starRating';
import { isPersonalIdentifierQuestion, normalizeTextCategoryValue } from './textAnalytics';
import type { NativeChartSpec } from './xlsxNativeCharts';

const BRAND = '3730A3';
const PALETTE = ['3730A3', '006591', '60A5FA', '10B981', 'F59E0B', 'EF4444'];

function displayText(value: string | undefined) {
  let text = cleanHtmlWhitespace(String(value ?? ''));
  // Answers may arrive as Quill HTML or as already-escaped HTML from an
  // import. Decode and strip twice so neither <p> nor &nbsp; leaks into XLSX.
  for (let pass = 0; pass < 2; pass++) {
    text = text
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
  }
  return text.replace(/\s+/g, ' ').trim();
}

type ChartPresentation = {
  kind?: 'bar' | 'doughnut';
  chartTitle?: string;
  chartLabels?: string[];
};

function estimatedLineCount(value: unknown, columnWidth: number) {
  const text = String(value ?? '');
  // Excel's usable text width is materially narrower than its column-width
  // unit, especially with wrapped Vietnamese labels. Keep this conservative
  // so long questions are never visually clipped on export.
  const charactersPerLine = Math.max(12, Math.floor(columnWidth * 1.15));
  return Math.max(1, ...text.split(/\r?\n/).map(line => Math.max(1, Math.ceil(line.length / charactersPerLine))));
}

function fitWrappedRows(sheet: ExcelJS.Worksheet, firstRow: number, lastRow: number, widths: number[]) {
  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const lineCount = Math.max(...widths.map((width, index) => estimatedLineCount(row.getCell(index + 1).value, width)));
    row.height = Math.min(400, Math.max(20, lineCount * 15 + 6));
  }
}

function createDownloadFilename(title: string) {
  const safeTitle = displayText(title)
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${safeTitle || 'Phân tích khảo sát'}_phan-tich.xlsx`;
}

function drawBarChart(title: string, labels: string[], values: number[], color = '#3730a3') {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#172033';
  ctx.font = 'bold 26px Arial';
  ctx.fillText(title, 55, 55);

  const left = 70;
  const top = 95;
  const width = 970;
  const height = 320;
  const max = Math.max(...values, 1);
  ctx.strokeStyle = '#dbe3ef';
  ctx.lineWidth = 1;
  for (let tick = 0; tick <= 4; tick++) {
    const y = top + height - (height * tick) / 4;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + width, y); ctx.stroke();
    ctx.fillStyle = '#64748b'; ctx.font = '14px Arial'; ctx.fillText(String(Math.round((max * tick) / 4)), 25, y + 5);
  }

  const slot = width / Math.max(labels.length, 1);
  const barWidth = Math.min(88, slot * 0.62);
  labels.forEach((label, index) => {
    const barHeight = (values[index] / max) * height;
    const x = left + index * slot + (slot - barWidth) / 2;
    const y = top + height - barHeight;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = '#172033'; ctx.font = 'bold 14px Arial';
    ctx.fillText(String(values[index]), x + Math.max(0, (barWidth - ctx.measureText(String(values[index])).width) / 2), y - 8);
    ctx.fillStyle = '#475569'; ctx.font = '13px Arial';
    ctx.save(); ctx.translate(x + barWidth / 2, top + height + 18); ctx.rotate(-0.42); ctx.textAlign = 'right'; ctx.fillText(label, 0, 0); ctx.restore();
  });
  return canvas.toDataURL('image/png');
}

function drawDoughnutChart(title: string, labels: string[], values: number[]) {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!ctx || total <= 0) return '';

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#172033';
  ctx.font = 'bold 26px Arial';
  ctx.fillText(title, 55, 55);

  const centerX = 285;
  const centerY = 285;
  const outerRadius = 155;
  const innerRadius = 82;
  let startAngle = -Math.PI / 2;
  values.forEach((value, index) => {
    const endAngle = startAngle + (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = `#${PALETTE[index % PALETTE.length]}`;
    ctx.fill();
    const share = value / total;
    if (share >= 0.05) {
      const labelAngle = startAngle + (endAngle - startAngle) / 2;
      const labelRadius = (outerRadius + innerRadius) / 2;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(share * 100)}%`, centerX + Math.cos(labelAngle) * labelRadius, centerY + Math.sin(labelAngle) * labelRadius + 5);
      ctx.textAlign = 'left';
    }
    startAngle = endAngle;
  });
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#172033';
  ctx.font = 'bold 34px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(total), centerX, centerY - 4);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#64748b';
  ctx.fillText('phản hồi', centerX, centerY + 22);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#172033';
  ctx.font = 'bold 16px Arial';
  ctx.fillText('Ghi chú', 545, 88);
  labels.forEach((label, index) => {
    const y = 130 + index * 58;
    const percent = Math.round((values[index] / total) * 100);
    ctx.fillStyle = `#${PALETTE[index % PALETTE.length]}`;
    ctx.fillRect(545, y - 14, 18, 18);
    ctx.fillStyle = '#172033';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(label, 575, y);
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Arial';
    ctx.fillText(`${values[index]} phản hồi (${percent}%)`, 575, y + 20);
  });
  return canvas.toDataURL('image/png');
}

function formatSheet(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns.forEach((column, index) => { column.width = widths[index] || 18; });
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 28;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
}

function sheetTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, endColumn = 'H') {
  sheet.views = [{ showGridLines: false }];
  sheet.mergeCells(`A1:${endColumn}1`);
  sheet.mergeCells(`A2:${endColumn}2`);
  sheet.getCell('A1').value = title;
  sheet.getCell('A2').value = subtitle;
  sheet.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF172033' } };
  sheet.getCell('A2').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 22;
}

function styleTableHeader(row: ExcelJS.Row) {
  row.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  row.height = 28;
}

function styleTableBody(sheet: ExcelJS.Worksheet, firstRow: number, lastRow: number, widths: number[]) {
  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    row.font = { name: 'Arial', size: 10, color: { argb: 'FF172033' } };
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = Math.min(300, Math.max(20, Math.max(...widths.map((width, index) => estimatedLineCount(row.getCell(index + 1).value, width))) * 15 + 6));
  }
}

function promptKey(value: unknown) {
  return displayText(String(value ?? ''))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi-VN');
}

function findQuestion(survey: Survey, matcher: RegExp, types?: SurveyQuestion['type'][]) {
  return survey.questions.find(question => (!types || types.includes(question.type)) && matcher.test(promptKey(question.text)));
}

function addKpiCard(sheet: ExcelJS.Worksheet, range: string, label: string, value: string | number) {
  sheet.mergeCells(range);
  const [start] = range.split(':');
  const cell = sheet.getCell(start);
  cell.value = `${label}\n${value}`;
  cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF172033' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  cell.border = { top: { style: 'thin', color: { argb: 'FFD9E2F3' } }, bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } }, left: { style: 'thin', color: { argb: 'FFD9E2F3' } }, right: { style: 'thin', color: { argb: 'FFD9E2F3' } } };
}

function categoryRows(options: Array<{ label: string; count: number; percent?: number }>, limit = 8) {
  const sorted = [...options].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));
  if (sorted.length <= limit) return sorted.map(option => ({ ...option, label: displayText(option.label) }));
  const top = sorted.slice(0, limit - 1);
  const rest = sorted.slice(limit - 1).reduce((sum, option) => sum + option.count, 0);
  return [...top.map(option => ({ ...option, label: displayText(option.label) })), { label: 'Khác', count: rest, percent: sorted.reduce((sum, option) => sum + (option.percent ?? 0), 0) - top.reduce((sum, option) => sum + (option.percent ?? 0), 0) }];
}

function writeAnalysisTable(sheet: ExcelJS.Worksheet, startRow: number, headers: string[], rows: Array<Array<string | number>>, widths: number[]) {
  sheet.getRow(startRow).values = headers;
  styleTableHeader(sheet.getRow(startRow));
  rows.forEach((values, index) => { sheet.getRow(startRow + index + 1).values = values; });
  if (rows.length) styleTableBody(sheet, startRow + 1, startRow + rows.length, widths);
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = Math.max(sheet.getColumn(index + 1).width || 0, width); });
  return startRow + rows.length;
}

function responseHasSelection(response: SurveyResponse, questionId: string, label: string) {
  const answer = response.answers[questionId];
  const target = displayText(label);
  if (Array.isArray(answer)) return answer.some(value => displayText(String(value)) === target);
  return typeof answer === 'string' && answer.split(';').map(value => displayText(value)).includes(target);
}

function groupAnswerKey(question: SurveyQuestion, answer: unknown) {
  if (question.type === 'text') return normalizeTextCategoryValue(displayText(String(answer ?? '')))?.key ?? null;
  return displayText(String(answer ?? '')).toLocaleLowerCase('vi-VN') || null;
}

function buildProfessionalSheets(workbook: ExcelJS.Workbook, survey: Survey, responses: SurveyResponse[], analytics: ReturnType<typeof computeSurveyAnalytics>) {
  const nativeCharts: NativeChartSpec[] = [];
  const choiceByQuestion = new Map(analytics.choiceDistributions.map(distribution => [distribution.questionId, distribution]));
  const textByQuestion = new Map(analytics.textCategoryDistributions.map(distribution => [distribution.questionId, distribution]));
  const starByQuestion = new Map(analytics.starRatings.map(result => [result.questionId, result]));
  const topChoice = (matcher: RegExp, types?: SurveyQuestion['type'][]) => {
    const question = findQuestion(survey, matcher, types);
    return question ? choiceByQuestion.get(question.id) : undefined;
  };
  const topText = (matcher: RegExp) => {
    const question = findQuestion(survey, matcher, ['text']);
    return question ? textByQuestion.get(question.id) : undefined;
  };

  const habits = topChoice(/thoi quen/, ['multiple_choice']) ?? analytics.choiceDistributions.find(distribution => survey.questions.find(question => question.id === distribution.questionId)?.type === 'multiple_choice');
  const recommendations = topChoice(/bien phap|khac phuc|giai phap/, ['multiple_choice']);
  const year = topChoice(/nam may|nam hoc|nam thu|sinh vien nam/, ['single_choice', 'multiple_choice']) ?? topText(/nam may|nam hoc|nam thu|sinh vien nam/);
  const school = topText(/truong|dai hoc|university|college/);
  const major = topText(/nganh|chuyen nganh|major|khoa/);
  const primaryRating = analytics.starRatings[0];

  const dashboard = workbook.addWorksheet('Dashboard');
  sheetTitle(dashboard, `DASHBOARD PHÂN TÍCH: ${displayText(survey.title).toUpperCase()}`, `Mẫu khảo sát n = ${analytics.totalResponses} phản hồi · Xuất lúc ${new Date().toLocaleString('vi-VN')}`, 'H');
  ['A','B','C','D','E','F','G','H'].forEach(column => dashboard.getColumn(column).width = 18);
  addKpiCard(dashboard, 'A4:B5', 'TỔNG PHẢN HỒI', analytics.totalResponses);
  addKpiCard(dashboard, 'C4:D5', 'TỶ LỆ HOÀN THÀNH', `${analytics.completionRate}%`);
  addKpiCard(dashboard, 'E4:F5', 'MỨC ẢNH HƯỞNG TB', primaryRating ? `${primaryRating.average}/5` : 'Chưa có');
  addKpiCard(dashboard, 'G4:H5', 'NHÓM PHỔ BIẾN NHẤT', habits?.options[0]?.label ?? 'Chưa có');
  dashboard.getRow(4).height = 30; dashboard.getRow(5).height = 32;
  dashboard.mergeCells('A7:H7');
  dashboard.getCell('A7').value = 'Tổng hợp các kết quả chính';
  dashboard.getCell('A7').font = { name: 'Arial', size: 12, bold: true, color: { argb: `FF${BRAND}` } };
  dashboard.getCell('A7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };

  let row = 8;
  const chartTables: Array<{ type: NativeChartSpec['type']; title: string; rows: Array<[string, number]>; categoryCol: number; valueCol: number; showPercent?: boolean; row: number }> = [];
  const addDashboardTable = (title: string, options: Array<{ label: string; count: number; percent?: number }> | undefined, chartType: NativeChartSpec['type']) => {
    if (!options?.length) return;
    const compact = categoryRows(options, 6);
    dashboard.getCell(`A${row}`).value = title;
    dashboard.getCell(`A${row}`).font = { bold: true, color: { argb: `FF${BRAND}` } };
    dashboard.getCell(`A${row + 1}`).value = 'Nhóm'; dashboard.getCell(`B${row + 1}`).value = 'Số lượt'; dashboard.getCell(`C${row + 1}`).value = 'Tỷ lệ';
    styleTableHeader(dashboard.getRow(row + 1));
    compact.forEach((option, index) => {
      dashboard.getCell(`A${row + index + 2}`).value = option.label;
      dashboard.getCell(`B${row + index + 2}`).value = option.count;
      dashboard.getCell(`C${row + index + 2}`).value = (option.percent ?? (analytics.totalResponses ? option.count / analytics.totalResponses * 100 : 0)) / 100;
    });
    dashboard.getColumn(3).numFmt = '0.0%';
    styleTableBody(dashboard, row + 2, row + compact.length + 1, [44, 14, 14]);
    chartTables.push({ type: chartType, title, rows: compact.map(option => [option.label, option.count]), categoryCol: 1, valueCol: 2, showPercent: chartType === 'doughnut', row });
    row += compact.length + 4;
  };
  addDashboardTable('Thói quen phổ biến nhất', habits?.options, 'bar');
  addDashboardTable('Cơ cấu năm học', year?.options, 'doughnut');
  addDashboardTable('Trường của người tham gia', school?.options, 'doughnut');
  if (primaryRating) {
    addDashboardTable('Phân bố mức ảnh hưởng', [1, 2, 3, 4, 5].map(star => ({ label: `${star} sao`, count: primaryRating.distribution[star] ?? 0, percent: primaryRating.totalAnswered ? (primaryRating.distribution[star] ?? 0) / primaryRating.totalAnswered * 100 : 0 })), 'bar');
  }
  chartTables.forEach((chart, index) => {
    const dataStart = chart.row + 2;
    const dataEnd = dataStart + chart.rows.length - 1;
    nativeCharts.push({ sheetName: 'Dashboard', type: chart.type, title: chart.title, categoryFormula: `'Dashboard'!$A$${dataStart}:$A$${dataEnd}`, categories: chart.rows.map(row => row[0]), series: [{ name: 'Số lượt', valueFormula: `'Dashboard'!$B$${dataStart}:$B$${dataEnd}`, values: chart.rows.map(row => row[1]), color: '1F4E78' }], anchor: { from: { col: 4 + index * 4, row: 7 }, to: { col: 8 + index * 4, row: 24 } }, showLegend: chart.type === 'doughnut', showValues: chart.type === 'bar', showPercent: chart.showPercent });
  });

  const detail = workbook.addWorksheet('Chi tiết câu hỏi');
  sheetTitle(detail, 'BIỂU ĐỒ CHI TIẾT THEO TỪNG CÂU HỎI', 'Phân phối câu trả lời, tỷ lệ trả lời và cỡ mẫu theo từng câu hỏi.', 'H');
  ['A','B','C','D','E','F','G','H'].forEach((column, index) => detail.getColumn(column).width = [9, 55, 22, 14, 14, 14, 14, 14][index]);
  let detailRow = 4;
  const detailChartRows: Array<{ title: string; rows: Array<[string, number]>; type: NativeChartSpec['type']; row: number }> = [];
  [...analytics.choiceDistributions, ...analytics.textCategoryDistributions].forEach(distribution => {
    if (!distribution.options.length) return;
    const number = survey.questions.findIndex(question => question.id === distribution.questionId) + 1;
    const options = categoryRows(distribution.options, 10);
    detail.mergeCells(`A${detailRow}:H${detailRow}`);
    detail.getCell(`A${detailRow}`).value = `Câu ${number}: ${displayText(distribution.questionText)}`;
    detail.getCell(`A${detailRow}`).font = { bold: true, color: { argb: `FF${BRAND}` } };
    detail.getCell(`A${detailRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
    detail.getRow(detailRow + 1).values = ['STT', 'Nhóm trả lời', 'Số lượt', 'Tỷ lệ', 'Cỡ mẫu (n)', '', '', ''];
    styleTableHeader(detail.getRow(detailRow + 1));
    options.forEach((option, index) => detail.getRow(detailRow + index + 2).values = [index + 1, option.label, option.count, (option.percent ?? 0) / 100, distribution.totalAnswered, '', '', '']);
    detail.getColumn(4).numFmt = '0.0%';
    styleTableBody(detail, detailRow + 2, detailRow + options.length + 1, [9, 55, 14, 14, 14]);
    detailChartRows.push({ title: `Câu ${number}`, rows: options.map(option => [option.label, option.count]), type: options.length <= 6 ? 'doughnut' : 'bar', row: detailRow });
    detailRow += options.length + 4;
  });
  analytics.starRatings.forEach(rating => {
    const number = survey.questions.findIndex(question => question.id === rating.questionId) + 1;
    const rows = [1,2,3,4,5].map(star => [`${star} sao`, rating.distribution[star] ?? 0] as [string, number]);
    detail.mergeCells(`A${detailRow}:H${detailRow}`); detail.getCell(`A${detailRow}`).value = `Câu ${number}: ${displayText(rating.questionText)}`; detail.getCell(`A${detailRow}`).font = { bold: true, color: { argb: `FF${BRAND}` } }; detail.getCell(`A${detailRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
    detail.getRow(detailRow + 1).values = ['STT', 'Mức đánh giá', 'Số phản hồi', 'Tỷ lệ', 'Cỡ mẫu (n)', '', '', '']; styleTableHeader(detail.getRow(detailRow + 1));
    rows.forEach(([label, count], index) => detail.getRow(detailRow + index + 2).values = [index + 1, label, count, rating.totalAnswered ? count / rating.totalAnswered : 0, rating.totalAnswered, '', '', '']);
    detail.getColumn(4).numFmt = '0.0%'; styleTableBody(detail, detailRow + 2, detailRow + 6, [9, 55, 14, 14, 14]);
    detailChartRows.push({ title: `Câu ${number}`, rows, type: 'bar', row: detailRow }); detailRow += 9;
  });
  detailChartRows.slice(0, 12).forEach((chart, index) => {
    const dataStart = chart.row + 2; const dataEnd = dataStart + chart.rows.length - 1;
    nativeCharts.push({ sheetName: 'Chi tiết câu hỏi', type: chart.type, title: chart.title, categoryFormula: `'Chi tiết câu hỏi'!$B$${dataStart}:$B$${dataEnd}`, categories: chart.rows.map(row => row[0]), series: [{ name: 'Số lượt', valueFormula: `'Chi tiết câu hỏi'!$C$${dataStart}:$C$${dataEnd}`, values: chart.rows.map(row => row[1]), color: index % 2 ? '70AD47' : '1F4E78' }], anchor: { from: { col: 7 + (index % 2) * 8, row: chart.row - 1 }, to: { col: 14 + (index % 2) * 8, row: chart.row + 12 } }, showLegend: chart.type === 'doughnut', showValues: chart.type === 'bar', showPercent: chart.type === 'doughnut' });
  });

  const cross = workbook.addWorksheet('Phân tích chéo');
  sheetTitle(cross, 'PHÂN TÍCH CHÉO — MỐI LIÊN HỆ GIỮA CÁC BIẾN', 'Tỷ lệ trong từng nhóm nhân khẩu học; các mẫu nhỏ cần diễn giải thận trọng.', 'H');
  ['A','B','C','D','E','F','G','H'].forEach((column, index) => cross.getColumn(column).width = [48, 16, 16, 16, 16, 16, 16, 16][index]);
  let crossRow = 4;
  const groupQuestion = findQuestion(survey, /nam may|nam hoc|nam thu|sinh vien nam/, ['text', 'single_choice', 'multiple_choice'])
    ?? findQuestion(survey, /truong|dai hoc|university|college|nganh|chuyen nganh|khoa/, ['text', 'single_choice', 'multiple_choice']);
  const outcomeQuestion = findQuestion(survey, /thoi quen/, ['multiple_choice']) ?? survey.questions.find(question => question.type === 'multiple_choice');
  if (groupQuestion && outcomeQuestion) {
    const groupValues = groupQuestion.type === 'text' ? textByQuestion.get(groupQuestion.id)?.options ?? [] : choiceByQuestion.get(groupQuestion.id)?.options ?? [];
    const groups = groupValues.slice(0, 6).map(group => ({ ...group, label: displayText(group.label) }));
    const outcome = choiceByQuestion.get(outcomeQuestion.id)?.options.slice(0, 6).map(option => ({ ...option, label: displayText(option.label) })) ?? [];
    cross.mergeCells(`A${crossRow}:H${crossRow}`); cross.getCell(`A${crossRow}`).value = `Tỷ lệ gặp từng nhóm của “${displayText(outcomeQuestion.text)}” theo “${displayText(groupQuestion.text)}”`; cross.getCell(`A${crossRow}`).font = { bold: true, color: { argb: `FF${BRAND}` } }; cross.getCell(`A${crossRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
    const groupHeaders = ['Nhóm thói quen', ...groups.map(group => group.label)]; cross.getRow(crossRow + 1).values = groupHeaders; styleTableHeader(cross.getRow(crossRow + 1));
    const groupKeys = groups.map(group => ({ label: group.label, key: normalizeTextCategoryValue(group.label)?.key ?? group.label.toLocaleLowerCase('vi-VN') }));
    const rows = outcome.map(option => {
      const values = groupKeys.map(group => {
        const inGroup = responses.filter(response => groupAnswerKey(groupQuestion, response.answers[groupQuestion.id]) === group.key);
        const hits = inGroup.filter(response => responseHasSelection(response, outcomeQuestion.id, option.label)).length;
        return inGroup.length ? hits / inGroup.length : 0;
      });
      return [option.label, ...values];
    });
    rows.forEach((values, index) => cross.getRow(crossRow + index + 2).values = values);
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) cross.getColumn(2 + groupIndex).numFmt = '0.0%'; styleTableBody(cross, crossRow + 2, crossRow + 1 + rows.length, [48, ...groups.map(() => 16)]);
    const insight = rows.flatMap(row => row.slice(1).map((value, index) => ({ label: row[0] as string, group: groups[index].label, value: Number(value) }))).sort((a, b) => b.value - a.value)[0];
    cross.mergeCells(`A${crossRow + rows.length + 3}:H${crossRow + rows.length + 4}`); cross.getCell(`A${crossRow + rows.length + 3}`).value = insight ? `Nhận xét định lượng: “${insight.label}” cao nhất ở nhóm “${insight.group}” (${(insight.value * 100).toFixed(1)}%). Đây là mô tả theo mẫu khảo sát, không phải kết luận nhân quả.` : 'Chưa đủ dữ liệu để tạo nhận xét định lượng.'; cross.getCell(`A${crossRow + rows.length + 3}`).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } }; cross.getCell(`A${crossRow + rows.length + 3}`).alignment = { wrapText: true, vertical: 'top' }; crossRow += rows.length + 7;
    nativeCharts.push({ sheetName: 'Phân tích chéo', type: 'bar', title: 'Tỷ lệ theo nhóm (%)', categoryFormula: `'Phân tích chéo'!$A$${crossRow - rows.length - 5}:$A$${crossRow - 6}`, categories: rows.map(row => String(row[0])), series: groups.map((group, index) => ({ name: group.label, valueFormula: `'Phân tích chéo'!$${String.fromCharCode(66 + index)}$${crossRow - rows.length - 5}:$${String.fromCharCode(66 + index)}$${crossRow - 6}`, values: rows.map(row => Number(row[index + 1]) * 100), color: index % 2 ? '70AD47' : '1F4E78', numberFormat: '0.0' })), anchor: { from: { col: 7, row: 3 }, to: { col: 15, row: 22 } }, showLegend: true, valueAxisTitle: 'Tỷ lệ (%)', valueAxisNumberFormat: '0.0' });
    if (primaryRating) {
      const addCrossRating = (title: string, question: SurveyQuestion | undefined) => {
        if (!question) return;
        const options = choiceByQuestion.get(question.id)?.options ?? [];
        if (!options.length) return;
        const start = crossRow + 1;
        cross.getCell(`A${start}`).value = title; cross.getCell(`A${start}`).font = { bold: true, color: { argb: `FF${BRAND}` } };
        cross.getRow(start + 1).values = ['Nhóm', 'Số mẫu', 'Điểm TB']; styleTableHeader(cross.getRow(start + 1));
        const table = options.slice(0, 8).map(option => {
          const matching = responses.filter(response => responseHasSelection(response, question.id, option.label));
          const ratings = matching.map(response => Number(response.answers[primaryRating.questionId])).filter(value => Number.isFinite(value) && value >= 1 && value <= 5);
          return [option.label, ratings.length, ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0] as [string, number, number];
        });
        table.forEach((values, i) => cross.getRow(start + i + 2).values = values); cross.getColumn(3).numFmt = '0.00'; styleTableBody(cross, start + 2, start + table.length + 1, [48, 16, 16]);
        nativeCharts.push({ sheetName: 'Phân tích chéo', type: 'bar', title, categoryFormula: `'Phân tích chéo'!$A$${start + 2}:$A$${start + table.length + 1}`, categories: table.map(row => row[0]), series: [{ name: 'Điểm TB', valueFormula: `'Phân tích chéo'!$C$${start + 2}:$C$${start + table.length + 1}`, values: table.map(row => row[2]), color: '70AD47', numberFormat: '0.00' }], anchor: { from: { col: 7, row: start - 1 }, to: { col: 15, row: start + 16 } }, showLegend: false, showValues: true, valueAxisTitle: 'Điểm trung bình', valueAxisNumberFormat: '0.00' });
        crossRow = start + table.length + 4;
      };
      addCrossRating('Điểm ảnh hưởng TB theo nhóm thói quen', survey.questions.find(question => question.text.toLocaleLowerCase('vi-VN').includes('thói quen') && question.type === 'multiple_choice'));
      addCrossRating('Điểm ảnh hưởng TB theo tần suất', survey.questions.find(question => ['tần suất', 'thường xuyên', 'mỗi ngày'].some(term => question.text.toLocaleLowerCase('vi-VN').includes(term)) && (question.type === 'single_choice' || question.type === 'multiple_choice')));
    }
  } else {
    cross.mergeCells('A4:H6'); cross.getCell('A4').value = 'Chưa có đồng thời biến phân nhóm và câu hỏi đa lựa chọn để thực hiện phân tích chéo.'; cross.getCell('A4').alignment = { wrapText: true, vertical: 'top' }; cross.getCell('A4').font = { italic: true, color: { argb: 'FF64748B' } };
  }

  const deep = workbook.addWorksheet('Biểu đồ tròn & Phân tích sâu');
  sheetTitle(deep, 'BIỂU ĐỒ TRÒN & PHÂN TÍCH SÂU', 'Cơ cấu mẫu, nhóm mức ảnh hưởng và các phân phối chính có thể dùng cho báo cáo nghiên cứu.', 'H');
  ['A','B','C','D','E','F','G','H'].forEach((column, index) => deep.getColumn(column).width = [44, 16, 16, 16, 16, 16, 16, 16][index]);
  let deepRow = 4;
  const deepCharts: Array<{ title: string; rows: Array<[string, number]>; type: NativeChartSpec['type']; row: number }> = [];
  const addDeepTable = (title: string, options: Array<{ label: string; count: number; percent?: number }> | undefined, type: NativeChartSpec['type']) => {
    if (!options?.length) return;
    const compact = categoryRows(options, 9);
    deep.mergeCells(`A${deepRow}:D${deepRow}`); deep.getCell(`A${deepRow}`).value = title; deep.getCell(`A${deepRow}`).font = { bold: true, color: { argb: `FF${BRAND}` } }; deep.getCell(`A${deepRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
    deep.getRow(deepRow + 1).values = ['Nhóm', 'Số người', 'Tỷ lệ', 'Cỡ mẫu (n)']; styleTableHeader(deep.getRow(deepRow + 1));
    compact.forEach((option, index) => deep.getRow(deepRow + index + 2).values = [option.label, option.count, (option.percent ?? (analytics.totalResponses ? option.count / analytics.totalResponses * 100 : 0)) / 100, analytics.totalResponses]);
    deep.getColumn(3).numFmt = '0.0%'; styleTableBody(deep, deepRow + 2, deepRow + compact.length + 1, [44, 16, 16, 16]);
    deepCharts.push({ title, rows: compact.map(option => [option.label, option.count]), type, row: deepRow }); deepRow += compact.length + 4;
  };
  addDeepTable('Trường đại học của người tham gia', school?.options, 'doughnut');
  addDeepTable('Top ngành học', major?.options, 'bar');
  if (primaryRating) {
    const ratingBands = [{ label: '1–2 (thấp)', count: (primaryRating.distribution[1] ?? 0) + (primaryRating.distribution[2] ?? 0) }, { label: '3 (trung bình)', count: primaryRating.distribution[3] ?? 0 }, { label: '4–5 (cao)', count: (primaryRating.distribution[4] ?? 0) + (primaryRating.distribution[5] ?? 0) }];
    addDeepTable('Nhóm mức độ ảnh hưởng', ratingBands, 'doughnut');
  }
  const frequency = topChoice(/tan suat|thuong xuyen|moi ngay/, ['single_choice', 'multiple_choice']);
  addDeepTable('Tần suất thực hiện thói quen', frequency?.options, 'bar');
  deepCharts.forEach(chart => {
    const dataStart = chart.row + 2; const dataEnd = dataStart + chart.rows.length - 1;
    nativeCharts.push({ sheetName: 'Biểu đồ tròn & Phân tích sâu', type: chart.type, title: chart.title, categoryFormula: `'Biểu đồ tròn & Phân tích sâu'!$A$${dataStart}:$A$${dataEnd}`, categories: chart.rows.map(row => row[0]), series: [{ name: 'Số người', valueFormula: `'Biểu đồ tròn & Phân tích sâu'!$B$${dataStart}:$B$${dataEnd}`, values: chart.rows.map(row => row[1]), color: '1F4E78' }], anchor: { from: { col: 5, row: chart.row - 1 }, to: { col: 13, row: chart.row + 15 } }, showLegend: chart.type === 'doughnut', showValues: chart.type === 'bar', showPercent: chart.type === 'doughnut' });
  });

  return nativeCharts;
}

function addChartSection(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  headers: [string, string, string],
  rows: Array<[string, number, number]>,
  color: string,
  presentation: ChartPresentation = {},
) {
  const chartKind = presentation.kind ?? 'bar';
  const chartTitle = presentation.chartTitle ?? title;
  const chartLabels = presentation.chartLabels ?? rows.map(([label]) => label);
  const tableRows = chartKind === 'doughnut'
    ? rows.map(([label, count, percent], index) => [`${index + 1}. ${label}`, count, percent] as [string, number, number])
    : rows;
  sheet.mergeCells(`A${startRow}:C${startRow}`);
  const titleCell = sheet.getCell(`A${startRow}`);
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: `FF${BRAND}` }, size: 12 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
  titleCell.alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(startRow).height = Math.max(24, estimatedLineCount(title, 74) * 16 + 8);

  const headerRow = sheet.getRow(startRow + 1);
  headerRow.values = chartKind === 'doughnut' ? ['Ghi chú', headers[1], headers[2]] : headers;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  tableRows.forEach((row, index) => {
    const target = sheet.getRow(startRow + index + 2);
    target.values = row;
    target.alignment = { vertical: 'top', wrapText: true };
    target.height = Math.max(20, estimatedLineCount(row[0], 44) * 15 + 6);
  });
  sheet.getColumn(3).numFmt = '0.0%';

  const chart = chartKind === 'doughnut'
    ? drawDoughnutChart(chartTitle, chartLabels, rows.map(([, count]) => count))
    : drawBarChart(chartTitle, chartLabels, rows.map(([, count]) => count), color);
  if (chart) {
    const id = sheet.workbook.addImage({ base64: chart, extension: 'png' });
    sheet.addImage(id, { tl: { col: 4, row: startRow - 1 }, ext: { width: 720, height: 340 } });
  }

  const tableVisualRows = tableRows.reduce((sum, [label]) => sum + estimatedLineCount(label, 44), 0);
  return Math.max(startRow + tableVisualRows + 4, startRow + 23);
}

export async function exportSurveyAnalysisToExcel(survey: Survey, responses: SurveyResponse[]) {
  const analytics = computeSurveyAnalytics(survey, responses);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smart Survey Hub';
  workbook.created = new Date();

  const overview = workbook.addWorksheet('Tổng quan');
  overview.mergeCells('A1:F1');
  overview.getCell('A1').value = `Phân tích khảo sát: ${displayText(survey.title)}`;
  overview.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  overview.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
  overview.getCell('A1').alignment = { vertical: 'middle' };
  overview.getRow(1).height = 34;
  overview.getCell('A2').value = `Xuất lúc: ${new Date().toLocaleString('vi-VN')}`;
  overview.getCell('A4').value = 'Chỉ số'; overview.getCell('B4').value = 'Giá trị';
  overview.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  overview.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006591' } };
  const overviewMetrics: Array<[string, string | number]> = [
    ['Tổng phản hồi', analytics.totalResponses],
    ['Câu hỏi', survey.questions.length],
    ['Tỷ lệ hoàn thành câu bắt buộc', analytics.completionRate / 100],
    ['Tỷ lệ trả lời trung bình', analytics.questionMetrics.length ? analytics.questionMetrics.reduce((sum, item) => sum + item.answerRate, 0) / analytics.questionMetrics.length / 100 : 0],
    ...((survey.isQuiz ? [
      ['Điểm trung bình', analytics.averageScore ?? 'Chưa có'],
      ['Điểm trung vị', analytics.medianScore ?? 'Chưa có'],
      ['Tỷ lệ đạt từ 50%', analytics.passRate !== undefined ? analytics.passRate / 100 : 'Chưa có'],
    ] : []) as Array<[string, string | number]>),
  ];
  overviewMetrics.forEach(row => overview.addRow(row));
  overview.getColumn(1).width = 52; overview.getColumn(2).width = 22;
  overview.getCell('B7').numFmt = '0.0%';
  overview.getCell('B8').numFmt = '0.0%';
  if (survey.isQuiz) overview.getCell('B11').numFmt = '0.0%';
  overview.getCell('A1').alignment = { vertical: 'middle', wrapText: true };
  overview.getRow(1).height = Math.max(34, estimatedLineCount(String(overview.getCell('A1').value), 74) * 18 + 10);
  fitWrappedRows(overview, 4, overviewMetrics.length + 4, [52, 22]);

  const questionSheet = workbook.addWorksheet('Phân tích câu hỏi');
  const hasScoredQuestions = analytics.questionMetrics.some(metric => metric.correctCount !== undefined);
  questionSheet.addRow([
    'STT', 'Câu hỏi', 'Loại', 'Bắt buộc', 'Đã trả lời', 'Bỏ qua', 'Tỷ lệ trả lời',
    ...(hasScoredQuestions ? ['Đúng', 'Tỷ lệ đúng'] : []),
  ]);
  analytics.questionMetrics.forEach((metric, index) => questionSheet.addRow([
    index + 1,
    displayText(metric.questionText),
    metric.type,
    metric.required ? 'Có' : 'Không',
    metric.answered,
    metric.missing,
    metric.answerRate / 100,
    ...(hasScoredQuestions ? [metric.correctCount ?? null, metric.correctRate !== undefined ? metric.correctRate / 100 : null] : []),
  ]));
  const questionWidths = hasScoredQuestions ? [8, 65, 20, 12, 15, 12, 18, 12, 16] : [8, 65, 20, 12, 15, 12, 18];
  formatSheet(questionSheet, questionWidths);
  questionSheet.getColumn(7).numFmt = '0.0%';
  if (hasScoredQuestions) questionSheet.getColumn(9).numFmt = '0.0%';
  fitWrappedRows(questionSheet, 1, analytics.questionMetrics.length + 1, questionWidths);

  const raw = workbook.addWorksheet('Dữ liệu phản hồi');
  raw.addRow(['Mã phản hồi', 'Thời gian gửi', ...(survey.isQuiz ? ['Điểm', 'Điểm tối đa', 'Tỷ lệ điểm'] : []), ...survey.questions.map(question => displayText(question.text))]);
  responses.forEach(response => raw.addRow([
    response.id,
    new Date(response.submittedAt),
    ...(survey.isQuiz ? [response.score ?? '', response.totalQuizQuestions ?? '', response.score !== null && response.score !== undefined && response.totalQuizQuestions ? Number(response.score) / Number(response.totalQuizQuestions) : ''] : []),
    ...survey.questions.map(question => {
      const answer = response.answers[question.id];
      if (question.type === 'star_rating') return roundLegacyStarRating(answer) ?? answer ?? '';
      if (Array.isArray(answer)) return answer.map(item => displayText(String(item))).join('; ');
      return typeof answer === 'string' ? displayText(answer) : answer ?? '';
    }),
  ]));
  const rawWidths = [22, 21, ...(survey.isQuiz ? [12, 14, 14] : []), ...survey.questions.map(() => 48)];
  formatSheet(raw, rawWidths);
  raw.getColumn(2).numFmt = 'yyyy-mm-dd hh:mm';
  if (survey.isQuiz) raw.getColumn(5).numFmt = '0.0%';
  fitWrappedRows(raw, 1, responses.length + 1, rawWidths);

  const textQuestions = survey.questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => question.type === 'text' && !isPersonalIdentifierQuestion(question));
  if (textQuestions.length > 0) {
    const openResponses = workbook.addWorksheet('Phản hồi mở');
    openResponses.addRow(['STT câu', 'Câu hỏi', 'Mã phản hồi', 'Thời gian gửi', 'Phản hồi']);
    textQuestions.forEach(({ question, index }) => {
      responses.forEach(response => {
        const answer = response.answers[question.id];
        if (typeof answer === 'string' && displayText(answer)) {
          openResponses.addRow([
            index + 1,
            displayText(question.text),
            response.id,
            new Date(response.submittedAt),
            displayText(answer),
          ]);
        }
      });
    });
    const openResponseWidths = [10, 62, 22, 21, 80];
    formatSheet(openResponses, openResponseWidths);
    openResponses.getColumn(4).numFmt = 'yyyy-mm-dd hh:mm';
    fitWrappedRows(openResponses, 1, openResponses.rowCount, openResponseWidths);
  }

  if (analytics.textCategoryDistributions.length > 0) {
    const textStatistics = workbook.addWorksheet('Thống kê văn bản');
    textStatistics.addRow(['STT câu', 'Câu hỏi', 'Cách tổng hợp', 'Nhóm trả lời', 'Số phản hồi', 'Tỷ lệ', 'Cỡ mẫu (n)']);
    analytics.textCategoryDistributions.forEach(distribution => {
      const questionNumber = survey.questions.findIndex(question => question.id === distribution.questionId) + 1;
      distribution.options.forEach(option => {
        textStatistics.addRow([
          questionNumber,
          displayText(distribution.questionText),
          distribution.source === 'manual' ? 'Bật thủ công' : 'Tự động',
          option.label,
          option.count,
          option.percent / 100,
          distribution.totalAnswered,
        ]);
      });
    });
    const textStatisticsWidths = [10, 62, 18, 42, 16, 14, 16];
    formatSheet(textStatistics, textStatisticsWidths);
    textStatistics.getColumn(6).numFmt = '0.0%';
    fitWrappedRows(textStatistics, 1, textStatistics.rowCount, textStatisticsWidths);
  }

  const choiceByQuestionId = new Map(analytics.choiceDistributions.map(distribution => [distribution.questionId, distribution]));
  const ratingByQuestionId = new Map(analytics.starRatings.map(rating => [rating.questionId, rating]));
  const npsByQuestionId = new Map(analytics.npsByQuestion.map(result => [result.questionId, result]));
  const checkSheet = workbook.addWorksheet('Kiểm tra số liệu');
  checkSheet.addRow(['STT', 'Câu hỏi', 'Loại', 'Tổng phản hồi', 'Đã trả lời', 'Bỏ qua', 'Tỷ lệ trả lời', 'Tổng lượt ghi nhận', 'Kết quả đối chiếu']);
  analytics.questionMetrics.forEach((metric, index) => {
    const choice = choiceByQuestionId.get(metric.questionId);
    const rating = ratingByQuestionId.get(metric.questionId);
    const npsResult = npsByQuestionId.get(metric.questionId);
    const recordedTotal = choice
      ? choice.options.reduce((sum, option) => sum + option.count, 0)
      : rating
      ? Object.values(rating.distribution).reduce((sum, count) => sum + count, 0)
      : npsResult
      ? npsResult.totalAnswered
      : metric.answered;
    const matchesSource = metric.answered + metric.missing === analytics.totalResponses
      && (!choice || metric.type === 'multiple_choice' || recordedTotal === metric.answered)
      && (!rating || recordedTotal === metric.answered)
      && (!npsResult || recordedTotal === metric.answered);
    const note = metric.type === 'multiple_choice'
      ? `${matchesSource ? 'Khớp dữ liệu gốc' : 'Cần kiểm tra'}; có thể chọn nhiều đáp án.`
      : matchesSource ? 'Khớp dữ liệu gốc.' : 'Cần kiểm tra.';
    checkSheet.addRow([
      index + 1,
      displayText(metric.questionText),
      metric.type,
      analytics.totalResponses,
      metric.answered,
      metric.missing,
      metric.answerRate / 100,
      recordedTotal,
      note,
    ]);
  });
  const checkWidths = [8, 62, 20, 16, 14, 12, 18, 20, 40];
  formatSheet(checkSheet, checkWidths);
  checkSheet.getColumn(7).numFmt = '0.0%';
  fitWrappedRows(checkSheet, 1, analytics.questionMetrics.length + 1, checkWidths);

  const chartSheet = workbook.addWorksheet('Biểu đồ');
  chartSheet.views = [{ showGridLines: false }];
  chartSheet.getColumn(1).width = 44;
  chartSheet.getColumn(2).width = 16;
  chartSheet.getColumn(3).width = 14;
  chartSheet.getColumn(4).width = 3;
  chartSheet.mergeCells('A1:C1');
  chartSheet.getCell('A1').value = 'Biểu đồ phân tích phản hồi';
  chartSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF172033' } };
  chartSheet.getCell('A2').value = 'Các biểu đồ thể hiện dữ liệu thực tế theo từng câu hỏi.';
  chartSheet.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } };

  let nextChartRow = 4;
  nextChartRow = addChartSection(
    chartSheet,
    nextChartRow,
    'Tỷ lệ trả lời theo câu hỏi',
    ['Câu hỏi', 'Tỷ lệ trả lời', 'Tỷ lệ'],
    analytics.questionMetrics.map((metric, index) => [`Câu ${index + 1}: ${displayText(metric.questionText)}`, metric.answerRate, metric.answerRate / 100]),
    '#3730A3',
    { chartLabels: analytics.questionMetrics.map((_, index) => `Câu ${index + 1}`) },
  );

  analytics.choiceDistributions.forEach((distribution, index) => {
    if (distribution.options.length === 0) return;
    const question = survey.questions.find(item => item.id === distribution.questionId);
    const questionNumber = survey.questions.findIndex(item => item.id === distribution.questionId) + 1;
    nextChartRow = addChartSection(
      chartSheet,
      nextChartRow,
      `Câu ${questionNumber}: ${displayText(distribution.questionText)}`,
      ['Lựa chọn', 'Số lượt chọn', 'Tỷ lệ'],
      distribution.options.map(option => [displayText(option.label), option.count, option.percent / 100]),
      `#${PALETTE[(index + 1) % PALETTE.length]}`,
      {
        kind: question?.type === 'single_choice' && distribution.options.length <= 6 ? 'doughnut' : 'bar',
        chartTitle: `Câu ${questionNumber}`,
        chartLabels: distribution.options.map((_, optionIndex) => `Lựa chọn ${optionIndex + 1}`),
      },
    );
  });

  analytics.textCategoryDistributions.forEach((distribution, index) => {
    if (distribution.options.length === 0) return;
    const questionNumber = survey.questions.findIndex(question => question.id === distribution.questionId) + 1;
    const omittedOptions = distribution.options.slice(9);
    const omittedCount = omittedOptions.reduce((sum, option) => sum + option.count, 0);
    const chartOptions = distribution.options.length > 10
      ? [
          ...distribution.options.slice(0, 9),
          {
            label: `Khác (${distribution.options.length - 9} nhóm)`,
            count: omittedCount,
            percent: distribution.totalAnswered
              ? Math.round((omittedCount / distribution.totalAnswered) * 1000) / 10
              : 0,
          },
        ]
      : distribution.options;
    nextChartRow = addChartSection(
      chartSheet,
      nextChartRow,
      `Câu ${questionNumber}: ${displayText(distribution.questionText)}${distribution.options.length > 10 ? ' (Top 9 + Khác)' : ''}`,
      ['Nhóm trả lời', 'Số phản hồi', 'Tỷ lệ'],
      chartOptions.map(option => [displayText(option.label), option.count, option.percent / 100]),
      `#${PALETTE[(index + 4) % PALETTE.length]}`,
      {
        kind: chartOptions.length <= 6 ? 'doughnut' : 'bar',
        chartTitle: `Câu ${questionNumber}`,
        chartLabels: chartOptions.map(option => displayText(option.label)),
      },
    );
  });

  analytics.starRatings.forEach((rating, index) => {
    const questionNumber = survey.questions.findIndex(question => question.id === rating.questionId) + 1;
    const ratingLevels = Object.keys(rating.distribution).map(Number).sort((a, b) => a - b);
    nextChartRow = addChartSection(
      chartSheet,
      nextChartRow,
      `Câu ${questionNumber}: ${displayText(rating.questionText)}`,
      ['Mức đánh giá', 'Số phản hồi', 'Tỷ lệ'],
      ratingLevels.map(star => [`${star} sao`, rating.distribution[star] || 0, rating.totalAnswered ? (rating.distribution[star] || 0) / rating.totalAnswered : 0]),
      `#${PALETTE[(index + 2) % PALETTE.length]}`,
      { chartTitle: `Câu ${questionNumber}` },
    );
  });

  analytics.npsByQuestion.forEach((result, index) => {
    const questionNumber = survey.questions.findIndex(question => question.id === result.questionId) + 1;
    nextChartRow = addChartSection(
      chartSheet,
      nextChartRow,
      `Câu ${questionNumber}: ${displayText(result.questionText)}`,
      ['Nhóm NPS', 'Số phản hồi', 'Tỷ lệ'],
      [
        ['Ủng hộ', result.promoters, result.promoterPercent / 100],
        ['Thụ động', result.passives, result.passivePercent / 100],
        ['Phản đối', result.detractors, result.detractorPercent / 100],
      ],
      `#${PALETTE[(index + 3) % PALETTE.length]}`,
      { kind: 'doughnut', chartTitle: `Câu ${questionNumber}` },
    );
  });

  if (analytics.scoreDistribution) {
    addChartSection(
      chartSheet,
      nextChartRow,
      'Phân bố điểm bài kiểm tra',
      ['Khoảng điểm', 'Số người', 'Tỷ lệ'],
      analytics.scoreDistribution.map(item => [item.label, item.count, analytics.scoredResponseCount ? item.count / analytics.scoredResponseCount : 0]),
      '#006591',
    );
  }

  // Add the reference-style reader sheets after the raw/audit tabs are built.
  const nativeCharts = buildProfessionalSheets(workbook, survey, responses, analytics);
  // The professional export is intentionally self-contained. Keep only the
  // raw response sheet plus the reference-style analytical tabs; do not append
  // the earlier legacy analysis tabs to the final download.
  for (const legacyName of ['Tổng quan', 'Phân tích câu hỏi', 'Phản hồi mở', 'Thống kê văn bản', 'Kiểm tra số liệu', 'Biểu đồ']) {
    const legacySheet = workbook.getWorksheet(legacyName);
    if (legacySheet) workbook.removeWorksheet(legacySheet.id);
  }
  // Embed charts as PNGs. ExcelJS writes these drawing parts itself, avoiding
  // the fragile hand-built OOXML that desktop Excel was repairing/removing.
  nativeCharts.forEach(spec => {
    const sheet = workbook.getWorksheet(spec.sheetName);
    if (!sheet) return;
    const image = spec.type === 'doughnut' || spec.type === 'pie'
      ? drawDoughnutChart(spec.title, spec.categories, spec.series[0].values)
      : drawBarChart(spec.title, spec.categories, spec.series[0].values, `#${spec.series[0].color ?? '3730A3'}`);
    if (!image) return;
    const imageId = workbook.addImage({ base64: image, extension: 'png' });
    sheet.addImage(imageId, { tl: { col: spec.anchor.from.col, row: spec.anchor.from.row }, ext: { width: 720, height: 340 } });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = createDownloadFilename(survey.title);
  link.click();
  URL.revokeObjectURL(url);
}
