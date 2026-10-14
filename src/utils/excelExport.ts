import ExcelJS from 'exceljs';
import type { Survey, SurveyQuestion, SurveyResponse } from '../types';
import { choiceDisplayKey, computeSurveyAnalytics } from './analytics';
import { cleanHtmlWhitespace } from './stringUtils';
import { parseStoredStarRating } from '../../shared/starRating';
import { isPersonalIdentifierQuestion, normalizeTextCategoryValue } from './textAnalytics';
import { allocateExclusivePercents, roundPercent, sanitizeSpreadsheetValue } from './percent';
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

function spreadsheetValue(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return sanitizeSpreadsheetValue(displayText(String(value ?? '')));
}

/**
 * Star-rating distributions can contain historical half-star values.  Keep
 * the category list data-driven so every valid stored level is present in the
 * exported tables and charts instead of silently rendering only 1–5.
 */
export function getStoredRatingLevels(distribution: Record<number, number>): number[] {
  return Object.keys(distribution)
    .map(Number)
    .filter(level => parseStoredStarRating(level) !== null)
    .sort((left, right) => left - right);
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

function chartLabel(value: unknown, maxLength = 32) {
  const text = displayText(String(value ?? ''));
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
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
  labels.forEach((rawLabel, index) => {
    const label = chartLabel(rawLabel);
    const barHeight = (values[index] / max) * height;
    const x = left + index * slot + (slot - barWidth) / 2;
    const y = top + height - barHeight;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, barHeight);
    const valueLabel = /%|tỷ lệ/i.test(title) ? `${Number(values[index]).toFixed(1)}%` : String(Math.round(Number(values[index])));
    ctx.fillStyle = '#172033'; ctx.font = 'bold 14px Arial';
    ctx.fillText(valueLabel, x + Math.max(0, (barWidth - ctx.measureText(valueLabel).width) / 2), y - 8);
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
  labels.forEach((rawLabel, index) => {
    const label = displayText(String(rawLabel ?? ''));
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

type CategoryRow = { label: string; count: number; percent?: number };

/**
 * Compact a long categorical table without deriving “Khác” from already
 * rounded percentages.  The count and displayed percentage always use the
 * same denominator.  Exclusive categories use largest-remainder rounding so
 * their displayed percentages add up to exactly 100.0%.
 */
function categoryRows(
  options: CategoryRow[],
  limit = 8,
  denominator?: number,
  exclusive = false,
) {
  const sorted = [...options].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));
  const compact = sorted.length <= limit
    ? sorted
    : [
        ...sorted.slice(0, limit - 1),
        { label: `Khác (${sorted.length - (limit - 1)} nhóm)`, count: sorted.slice(limit - 1).reduce((sum, option) => sum + option.count, 0) },
      ];
  const base = denominator ?? 0;
  const percents = base > 0
    ? exclusive
      ? allocateExclusivePercents(compact.map(option => option.count), base)
      : compact.map(option => roundPercent((option.count / base) * 100))
    : compact.map(option => option.percent ?? 0);
  return compact.map((option, index) => ({
    ...option,
    label: displayText(option.label),
    percent: percents[index] ?? 0,
  }));
}

/**
 * Scores are stored with the maximum score that was in effect when a response
 * was submitted.  Aggregate them as percentages here, rather than dividing a
 * historical score by the current survey's maximum.  This keeps an exported
 * report meaningful after a quiz has been edited.
 */
function calculateNormalizedScoreStats(responses: SurveyResponse[]) {
  const recordedRows = responses.flatMap(response => {
    const hasScore = response.score !== undefined && response.score !== null;
    const hasTotal = response.totalQuizQuestions !== undefined && response.totalQuizQuestions !== null;
    if (!hasScore && !hasTotal) return [];
    const score = Number(response.score);
    const total = Number(response.totalQuizQuestions);
    return [{ score, total, percent: (score / total) * 100 }];
  });
  const scorePercents = recordedRows
    .filter(row => Number.isFinite(row.score) && Number.isFinite(row.total) && row.total > 0 && Number.isFinite(row.percent) && row.percent >= 0 && row.percent <= 100)
    .map(row => row.percent);
  const sorted = [...scorePercents].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);

  return {
    count: scorePercents.length,
    invalidCount: recordedRows.length - scorePercents.length,
    average: scorePercents.length
      ? scorePercents.reduce((sum, value) => sum + value, 0) / scorePercents.length
      : undefined,
    median: sorted.length
      ? (sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2)
      : undefined,
    passRate: scorePercents.length
      ? scorePercents.filter(value => value >= 50).length / scorePercents.length
      : undefined,
  };
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
  const target = choiceDisplayKey(label);
  if (!target) return false;
  if (Array.isArray(answer)) return answer.some(value => choiceDisplayKey(value) === target);
  // Answers created by the application are either a single exact value or an
  // array.  Splitting a scalar on “;” makes an option such as “A; B” match a
  // different option and corrupts a cross-tab.
  return typeof answer === 'string' && choiceDisplayKey(answer) === target;
}

function groupAnswerKey(question: SurveyQuestion, answer: unknown) {
  if (question.type === 'text') return normalizeTextCategoryValue(displayText(String(answer ?? '')))?.key ?? null;
  if (Array.isArray(answer)) return null;
  return choiceDisplayKey(answer) || null;
}

function buildProfessionalSheets(workbook: ExcelJS.Workbook, survey: Survey, responses: SurveyResponse[], analytics: ReturnType<typeof computeSurveyAnalytics>) {
  const nativeCharts: NativeChartSpec[] = [];
  const choiceByQuestion = new Map(analytics.choiceDistributions.map(distribution => [distribution.questionId, distribution]));
  const textByQuestion = new Map(analytics.textCategoryDistributions.map(distribution => [distribution.questionId, distribution]));
  const primaryRating = analytics.starRatings[0];
  // Cross-tabs need a raw response value to reproduce each cell. Synthetic
  // historical/unknown labels are intentionally useful in the summary charts,
  // but cannot be matched back to a single current option without mixing
  // questionnaire versions.
  const currentChoiceOptions = (questionId: string) => (choiceByQuestion.get(questionId)?.options ?? [])
    .filter(option => !option.isHistorical && !option.isUnknown);

  const dashboard = workbook.addWorksheet('Dashboard');
  sheetTitle(dashboard, `DASHBOARD PHÂN TÍCH: ${displayText(survey.title).toUpperCase()}`, `Mẫu khảo sát n = ${analytics.totalResponses} phản hồi · Xuất lúc ${new Date().toLocaleString('vi-VN')}`, 'H');
  ['A','B','C','D','E','F','G','H'].forEach(column => dashboard.getColumn(column).width = 18);
  addKpiCard(dashboard, 'A4:B5', 'TỔNG PHẢN HỒI', analytics.totalResponses);
  addKpiCard(dashboard, 'C4:D5', 'TỶ LỆ HOÀN THÀNH', `${analytics.completionRate}%`);
  const averageAnswerRate = analytics.questionMetrics.length
    ? roundPercent(analytics.questionMetrics.reduce((sum, item) => sum + item.answerRate, 0) / analytics.questionMetrics.length)
    : 0;
  if (survey.isQuiz) {
    addKpiCard(dashboard, 'E4:F5', 'ĐIỂM TB CHUẨN HÓA', analytics.averageScorePercent === undefined ? 'Chưa có' : `${analytics.averageScorePercent}%`);
    addKpiCard(dashboard, 'G4:H5', 'ĐẠT TỪ 50%', analytics.passRate === undefined ? 'Chưa có' : `${analytics.passRate}%`);
  } else {
    addKpiCard(dashboard, 'E4:F5', 'TỶ LỆ TRẢ LỜI TB', `${averageAnswerRate}%`);
    addKpiCard(dashboard, 'G4:H5', 'SỐ CÂU HỎI', survey.questions.length);
  }
  dashboard.getRow(4).height = 30; dashboard.getRow(5).height = 32;
  dashboard.mergeCells('A7:H7');
  dashboard.getCell('A7').value = 'Tổng hợp các kết quả chính';
  dashboard.getCell('A7').font = { name: 'Arial', size: 12, bold: true, color: { argb: `FF${BRAND}` } };
  dashboard.getCell('A7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };

  let row = 8;
  const chartTables: Array<{ type: NativeChartSpec['type']; title: string; rows: Array<[string, number]>; categoryCol: number; valueCol: number; showPercent?: boolean; row: number }> = [];
  const addDashboardTable = (
    title: string,
    options: CategoryRow[] | undefined,
    chartType: NativeChartSpec['type'],
    maxCategories = 6,
    denominator?: number,
    exclusive = false,
  ) => {
    if (!options?.length) return;
    const compact = categoryRows(options, maxCategories, denominator, exclusive);
    const denominatorText = denominator === undefined ? '' : exclusive
      ? ` · tỷ lệ trên n=${denominator}`
      : ` · % người chọn, n=${denominator}`;
    dashboard.getCell(`A${row}`).value = `${title}${denominatorText}`;
    dashboard.getCell(`A${row}`).font = { bold: true, color: { argb: `FF${BRAND}` } };
    dashboard.getCell(`A${row + 1}`).value = 'Nhóm'; dashboard.getCell(`B${row + 1}`).value = 'Số lượt'; dashboard.getCell(`C${row + 1}`).value = 'Tỷ lệ';
    styleTableHeader(dashboard.getRow(row + 1));
    compact.forEach((option, index) => {
      dashboard.getCell(`A${row + index + 2}`).value = option.label;
      dashboard.getCell(`B${row + index + 2}`).value = option.count;
      dashboard.getCell(`C${row + index + 2}`).value = (option.percent ?? 0) / 100;
    });
    dashboard.getColumn(3).numFmt = '0.0%';
    styleTableBody(dashboard, row + 2, row + compact.length + 1, [44, 14, 14]);
    chartTables.push({ type: chartType, title, rows: compact.map(option => [option.label, option.count]), categoryCol: 1, valueCol: 2, showPercent: chartType === 'doughnut', row });
    row += compact.length + 4;
  };
  if (survey.isQuiz && analytics.scoreDistribution) {
    addDashboardTable(
      'Phân bố điểm chuẩn hóa',
      analytics.scoreDistribution,
      'bar',
      analytics.scoreDistribution.length,
      analytics.scoredResponseCount ?? 0,
      true,
    );
  }
  analytics.choiceDistributions
    .filter(distribution => distribution.options.length > 0)
    .slice(0, survey.isQuiz ? 2 : 3)
    .forEach(distribution => {
      const question = survey.questions.find(candidate => candidate.id === distribution.questionId);
      const number = survey.questions.findIndex(candidate => candidate.id === distribution.questionId) + 1;
      const exclusive = question?.type === 'single_choice' || question?.type === 'dropdown';
      addDashboardTable(
        `Câu ${number}: ${displayText(distribution.questionText)}`,
        distribution.options,
        exclusive && distribution.options.length <= 6 ? 'doughnut' : 'bar',
        6,
        distribution.totalAnswered,
        exclusive,
      );
    });
  if (primaryRating) {
    const ratingLevels = getStoredRatingLevels(primaryRating.distribution);
    const number = survey.questions.findIndex(question => question.id === primaryRating.questionId) + 1;
    addDashboardTable(
      `Câu ${number}: ${displayText(primaryRating.questionText)}`,
      ratingLevels.map(star => ({
        label: `${star} sao`,
        count: primaryRating.distribution[star] ?? 0,
      })),
      'bar',
      ratingLevels.length,
      primaryRating.totalAnswered,
      true,
    );
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
    const question = survey.questions.find(candidate => candidate.id === distribution.questionId);
    const isMultipleChoice = question?.type === 'multiple_choice';
    const exclusive = !isMultipleChoice;
    const options = categoryRows(distribution.options, 10, distribution.totalAnswered, exclusive);
    detail.mergeCells(`A${detailRow}:H${detailRow}`);
    detail.getCell(`A${detailRow}`).value = `Câu ${number}: ${displayText(distribution.questionText)}`;
    detail.getCell(`A${detailRow}`).font = { bold: true, color: { argb: `FF${BRAND}` } };
    detail.getCell(`A${detailRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
    detail.getRow(detailRow + 1).values = ['STT', 'Nhóm trả lời', 'Số lượt', isMultipleChoice ? '% người chọn' : 'Tỷ lệ', 'Cỡ mẫu (n)', '', '', ''];
    styleTableHeader(detail.getRow(detailRow + 1));
    options.forEach((option, index) => detail.getRow(detailRow + index + 2).values = [index + 1, option.label, option.count, (option.percent ?? 0) / 100, distribution.totalAnswered, '', '', '']);
    detail.getColumn(4).numFmt = '0.0%';
    styleTableBody(detail, detailRow + 2, detailRow + options.length + 1, [9, 55, 14, 14, 14]);
    detailChartRows.push({ title: `Câu ${number}`, rows: options.map(option => [option.label, option.count]), type: exclusive && options.length <= 6 ? 'doughnut' : 'bar', row: detailRow });
    detailRow += options.length + 4;
  });
  analytics.starRatings.forEach(rating => {
    const number = survey.questions.findIndex(question => question.id === rating.questionId) + 1;
    const levels = getStoredRatingLevels(rating.distribution);
    const ratingPercents = allocateExclusivePercents(levels.map(star => rating.distribution[star] ?? 0), rating.totalAnswered);
    const rows = levels
      .map((star, index) => [`${star} sao`, rating.distribution[star] ?? 0, ratingPercents[index] ?? 0] as [string, number, number]);
    detail.mergeCells(`A${detailRow}:H${detailRow}`); detail.getCell(`A${detailRow}`).value = `Câu ${number}: ${displayText(rating.questionText)}`; detail.getCell(`A${detailRow}`).font = { bold: true, color: { argb: `FF${BRAND}` } }; detail.getCell(`A${detailRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
    detail.getRow(detailRow + 1).values = ['STT', 'Mức đánh giá', 'Số phản hồi', 'Tỷ lệ', 'Cỡ mẫu (n)', '', '', '']; styleTableHeader(detail.getRow(detailRow + 1));
    rows.forEach(([label, count, percent], index) => detail.getRow(detailRow + index + 2).values = [index + 1, label, count, percent / 100, rating.totalAnswered, '', '', '']);
    detail.getColumn(4).numFmt = '0.0%'; styleTableBody(detail, detailRow + 2, detailRow + rows.length + 1, [9, 55, 14, 14, 14]);
    detailChartRows.push({ title: `Câu ${number}`, rows: rows.map(([label, count]) => [label, count]), type: 'bar', row: detailRow }); detailRow += rows.length + 4;
  });
  analytics.linearScales.forEach(scale => {
    const number = survey.questions.findIndex(question => question.id === scale.questionId) + 1;
    const scaleValues = Array.from({ length: scale.max - scale.min + 1 }, (_, index) => scale.min + index);
    const scalePercents = allocateExclusivePercents(scaleValues.map(value => scale.distribution[value] ?? 0), scale.totalAnswered);
    const rows = scaleValues
      .map((value, index) => [String(value), scale.distribution[value] ?? 0, scalePercents[index] ?? 0] as [string, number, number]);
    detail.mergeCells(`A${detailRow}:H${detailRow}`);
    detail.getCell(`A${detailRow}`).value = `Câu ${number}: ${displayText(scale.questionText)} · Trung bình ${scale.average}`;
    detail.getCell(`A${detailRow}`).font = { bold: true, color: { argb: `FF${BRAND}` } };
    detail.getCell(`A${detailRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
    detail.getRow(detailRow + 1).values = ['STT', 'Mức điểm', 'Số phản hồi', 'Tỷ lệ', 'Cỡ mẫu (n)', '', '', ''];
    styleTableHeader(detail.getRow(detailRow + 1));
    rows.forEach(([label, count, percent], index) => detail.getRow(detailRow + index + 2).values = [
      index + 1,
      label,
      count,
      percent / 100,
      scale.totalAnswered,
      '',
      '',
      '',
    ]);
    detail.getColumn(4).numFmt = '0.0%';
    styleTableBody(detail, detailRow + 2, detailRow + rows.length + 1, [9, 55, 14, 14, 14]);
    detailChartRows.push({ title: `Câu ${number}`, rows: rows.map(([label, count]) => [label, count]), type: 'bar', row: detailRow });
    detailRow += rows.length + 4;
  });
  analytics.gridDistributions.forEach(grid => {
    const number = survey.questions.findIndex(question => question.id === grid.questionId) + 1;
    const isCheckboxGrid = survey.questions.find(question => question.id === grid.questionId)?.type === 'checkbox_grid';
    grid.rows.forEach(gridRow => {
      const gridPercents = isCheckboxGrid
        ? gridRow.options.map(option => roundPercent(gridRow.totalAnswered ? (option.count / gridRow.totalAnswered) * 100 : 0))
        : allocateExclusivePercents(gridRow.options.map(option => option.count), gridRow.totalAnswered);
      const rows = gridRow.options.map((option, index) => [displayText(option.label), option.count, gridPercents[index] ?? 0] as [string, number, number]);
      detail.mergeCells(`A${detailRow}:H${detailRow}`);
      detail.getCell(`A${detailRow}`).value = `Câu ${number}: ${displayText(grid.questionText)} · ${displayText(gridRow.label)}`;
      detail.getCell(`A${detailRow}`).font = { bold: true, color: { argb: `FF${BRAND}` } };
      detail.getCell(`A${detailRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
      detail.getRow(detailRow + 1).values = ['STT', 'Lựa chọn', 'Số lượt', isCheckboxGrid ? '% người chọn' : 'Tỷ lệ', 'Cỡ mẫu (n)', '', '', ''];
      styleTableHeader(detail.getRow(detailRow + 1));
      rows.forEach(([label, count, percent], index) => detail.getRow(detailRow + index + 2).values = [
        index + 1,
        label,
        count,
        percent / 100,
        gridRow.totalAnswered,
        '',
        '',
        '',
      ]);
      detail.getColumn(4).numFmt = '0.0%';
      styleTableBody(detail, detailRow + 2, detailRow + gridRow.options.length + 1, [9, 55, 14, 14, 14]);
      detailChartRows.push({ title: `Câu ${number} · ${displayText(gridRow.label)}`, rows: rows.map(([label, count]) => [label, count]), type: 'bar', row: detailRow });
      detailRow += gridRow.options.length + 4;
    });
  });
  detailChartRows.slice(0, 12).forEach((chart, index) => {
    const dataStart = chart.row + 2; const dataEnd = dataStart + chart.rows.length - 1;
    nativeCharts.push({ sheetName: 'Chi tiết câu hỏi', type: chart.type, title: chart.title, categoryFormula: `'Chi tiết câu hỏi'!$B$${dataStart}:$B$${dataEnd}`, categories: chart.rows.map(row => row[0]), series: [{ name: 'Số lượt', valueFormula: `'Chi tiết câu hỏi'!$C$${dataStart}:$C$${dataEnd}`, values: chart.rows.map(row => row[1]), color: index % 2 ? '70AD47' : '1F4E78' }], anchor: { from: { col: 7 + (index % 2) * 8, row: chart.row - 1 }, to: { col: 14 + (index % 2) * 8, row: chart.row + 12 } }, showLegend: chart.type === 'doughnut', showValues: chart.type === 'bar', showPercent: chart.type === 'doughnut' });
  });

  const cross = workbook.addWorksheet('Phân tích chéo');
  sheetTitle(cross, 'PHÂN TÍCH CHÉO — MỐI LIÊN HỆ GIỮA CÁC BIẾN', 'Tỷ lệ trong từng nhóm nhân khẩu học; các mẫu nhỏ cần diễn giải thận trọng.', 'H');
  ['A','B','C','D','E','F','G','H'].forEach((column, index) => cross.getColumn(column).width = [48, 16, 16, 16, 16, 16, 16, 16][index]);
  let crossRow = 4;
  // A cross-tab needs mutually exclusive groups. Multiple-choice responses
  // deliberately overlap, so using them as a group variable would make the
  // column denominators incomparable.
  const groupQuestion = findQuestion(survey, /nam may|nam hoc|nam thu|sinh vien nam/, ['text', 'single_choice', 'dropdown'])
    ?? findQuestion(survey, /truong|dai hoc|university|college|nganh|chuyen nganh|khoa/, ['text', 'single_choice', 'dropdown']);
  const outcomeQuestion = survey.questions.find(question => question.type === 'multiple_choice');
  if (groupQuestion && outcomeQuestion) {
    const groupValues = groupQuestion.type === 'text' ? textByQuestion.get(groupQuestion.id)?.options ?? [] : currentChoiceOptions(groupQuestion.id);
    const groups = groupValues.slice(0, 6).map(group => ({ ...group, label: displayText(group.label) }));
    const outcome = currentChoiceOptions(outcomeQuestion.id).slice(0, 6).map(option => ({ ...option, label: displayText(option.label) }));
    if (groups.length && outcome.length) {
      cross.mergeCells(`A${crossRow}:H${crossRow}`); cross.getCell(`A${crossRow}`).value = `Tỷ lệ chọn “${displayText(outcomeQuestion.text)}” theo “${displayText(groupQuestion.text)}”`; cross.getCell(`A${crossRow}`).font = { bold: true, color: { argb: `FF${BRAND}` } }; cross.getCell(`A${crossRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
      const groupHeaders = [`Lựa chọn trong “${displayText(outcomeQuestion.text)}”`, ...groups.map(group => group.label)]; cross.getRow(crossRow + 1).values = groupHeaders; styleTableHeader(cross.getRow(crossRow + 1));
      const groupKeys = groups.map(group => ({
        label: group.label,
        key: groupQuestion.type === 'text'
          ? normalizeTextCategoryValue(group.label)?.key ?? ''
          : choiceDisplayKey(group.label),
      }));
      const rows = outcome.map(option => {
        const values = groupKeys.map(group => {
          const inGroup = responses.filter(response => groupAnswerKey(groupQuestion, response.answers[groupQuestion.id]) === group.key);
          const hits = inGroup.filter(response => responseHasSelection(response, outcomeQuestion.id, option.label)).length;
          return inGroup.length ? hits / inGroup.length : 0;
        });
        return [option.label, ...values] as [string, ...number[]];
      });
      rows.forEach((values, index) => cross.getRow(crossRow + index + 2).values = values);
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) cross.getColumn(2 + groupIndex).numFmt = '0.0%'; styleTableBody(cross, crossRow + 2, crossRow + 1 + rows.length, [48, ...groups.map(() => 16)]);
      const insight = rows.flatMap(row => row.slice(1).map((value, index) => ({ label: row[0], group: groups[index].label, value: Number(value) }))).sort((a, b) => b.value - a.value)[0];
      cross.mergeCells(`A${crossRow + rows.length + 3}:H${crossRow + rows.length + 4}`); cross.getCell(`A${crossRow + rows.length + 3}`).value = insight ? `Nhận xét định lượng: “${insight.label}” cao nhất ở nhóm “${insight.group}” (${(insight.value * 100).toFixed(1)}%). Đây là mô tả theo mẫu khảo sát, không phải kết luận nhân quả.` : 'Chưa đủ dữ liệu để tạo nhận xét định lượng.'; cross.getCell(`A${crossRow + rows.length + 3}`).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } }; cross.getCell(`A${crossRow + rows.length + 3}`).alignment = { wrapText: true, vertical: 'top' }; crossRow += rows.length + 7;
      nativeCharts.push({ sheetName: 'Phân tích chéo', type: 'bar', title: 'Tỷ lệ theo nhóm (%)', categoryFormula: `'Phân tích chéo'!$A$${crossRow - rows.length - 5}:$A$${crossRow - 6}`, categories: rows.map(row => String(row[0])), series: groups.map((group, index) => ({ name: group.label, valueFormula: `'Phân tích chéo'!$${String.fromCharCode(66 + index)}$${crossRow - rows.length - 5}:$${String.fromCharCode(66 + index)}$${crossRow - 6}`, values: rows.map(row => Number(row[index + 1]) * 100), color: index % 2 ? '70AD47' : '1F4E78', numberFormat: '0.0' })), anchor: { from: { col: 7, row: 3 }, to: { col: 15, row: 22 } }, showLegend: true, valueAxisTitle: 'Tỷ lệ (%)', valueAxisNumberFormat: '0.0' });
      if (primaryRating) {
        const start = crossRow + 1;
        const title = `Điểm trung bình “${displayText(primaryRating.questionText)}” theo “${displayText(groupQuestion.text)}”`;
        cross.getCell(`A${start}`).value = title; cross.getCell(`A${start}`).font = { bold: true, color: { argb: `FF${BRAND}` } };
        cross.getRow(start + 1).values = ['Nhóm', 'Số mẫu', 'Điểm TB']; styleTableHeader(cross.getRow(start + 1));
        const table = groupKeys.map(group => {
          const ratings = responses
            .filter(response => groupAnswerKey(groupQuestion, response.answers[groupQuestion.id]) === group.key)
            .map(response => parseStoredStarRating(response.answers[primaryRating.questionId]))
            .filter((value): value is number => value !== null);
          return [group.label, ratings.length, ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0] as [string, number, number];
        });
        table.forEach((values, i) => cross.getRow(start + i + 2).values = values); cross.getColumn(3).numFmt = '0.00'; styleTableBody(cross, start + 2, start + table.length + 1, [48, 16, 16]);
        nativeCharts.push({ sheetName: 'Phân tích chéo', type: 'bar', title, categoryFormula: `'Phân tích chéo'!$A$${start + 2}:$A$${start + table.length + 1}`, categories: table.map(row => row[0]), series: [{ name: 'Điểm TB', valueFormula: `'Phân tích chéo'!$C$${start + 2}:$C$${start + table.length + 1}`, values: table.map(row => row[2]), color: '70AD47', numberFormat: '0.00' }], anchor: { from: { col: 7, row: start - 1 }, to: { col: 15, row: start + 16 } }, showLegend: false, showValues: true, valueAxisTitle: 'Điểm trung bình', valueAxisNumberFormat: '0.00' });
      }
    } else {
      cross.mergeCells('A4:H6'); cross.getCell('A4').value = 'Chưa có đủ nhóm trả lời tương thích để thực hiện phân tích chéo.'; cross.getCell('A4').alignment = { wrapText: true, vertical: 'top' }; cross.getCell('A4').font = { italic: true, color: { argb: 'FF64748B' } };
    }
  } else {
    cross.mergeCells('A4:H6'); cross.getCell('A4').value = 'Cần một biến phân nhóm một lựa chọn/văn bản và một câu nhiều lựa chọn để thực hiện phân tích chéo.'; cross.getCell('A4').alignment = { wrapText: true, vertical: 'top' }; cross.getCell('A4').font = { italic: true, color: { argb: 'FF64748B' } };
  }

  const deep = workbook.addWorksheet('Phân tích sâu');
  sheetTitle(deep, 'PHÂN TÍCH SÂU THEO CÂU HỎI', 'Các bảng dưới đây dùng đúng cỡ mẫu của từng câu; biểu đồ tròn chỉ dành cho phân phối loại trừ nhau.', 'H');
  ['A','B','C','D','E','F','G','H'].forEach((column, index) => deep.getColumn(column).width = [44, 16, 16, 16, 16, 16, 16, 16][index]);
  let deepRow = 4;
  const deepCharts: Array<{ title: string; rows: Array<[string, number]>; type: NativeChartSpec['type']; row: number }> = [];
  const addDeepTable = (
    title: string,
    options: CategoryRow[] | undefined,
    type: NativeChartSpec['type'],
    denominator: number,
    exclusive: boolean,
  ) => {
    if (!options?.length) return;
    const compact = categoryRows(options, 9, denominator, exclusive);
    deep.mergeCells(`A${deepRow}:D${deepRow}`); deep.getCell(`A${deepRow}`).value = title; deep.getCell(`A${deepRow}`).font = { bold: true, color: { argb: `FF${BRAND}` } }; deep.getCell(`A${deepRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
    deep.getRow(deepRow + 1).values = ['Nhóm', 'Số người', exclusive ? 'Tỷ lệ' : '% người chọn', 'Cỡ mẫu (n)']; styleTableHeader(deep.getRow(deepRow + 1));
    compact.forEach((option, index) => deep.getRow(deepRow + index + 2).values = [option.label, option.count, (option.percent ?? 0) / 100, denominator]);
    deep.getColumn(3).numFmt = '0.0%'; styleTableBody(deep, deepRow + 2, deepRow + compact.length + 1, [44, 16, 16, 16]);
    deepCharts.push({ title, rows: compact.map(option => [option.label, option.count]), type, row: deepRow }); deepRow += compact.length + 4;
  };
  if (survey.isQuiz && analytics.scoreDistribution) {
    addDeepTable('Phân bố điểm chuẩn hóa', analytics.scoreDistribution, 'bar', analytics.scoredResponseCount ?? 0, true);
  }
  analytics.choiceDistributions
    .filter(distribution => distribution.options.length > 0)
    .slice(0, 5)
    .forEach(distribution => {
      const question = survey.questions.find(candidate => candidate.id === distribution.questionId);
      const number = survey.questions.findIndex(candidate => candidate.id === distribution.questionId) + 1;
      const exclusive = question?.type === 'single_choice' || question?.type === 'dropdown';
      addDeepTable(
        `Câu ${number}: ${displayText(distribution.questionText)}`,
        distribution.options,
        exclusive && distribution.options.length <= 8 ? 'doughnut' : 'bar',
        distribution.totalAnswered,
        exclusive,
      );
    });
  analytics.textCategoryDistributions
    .filter(distribution => distribution.options.length > 0)
    .slice(0, 2)
    .forEach(distribution => {
      const number = survey.questions.findIndex(candidate => candidate.id === distribution.questionId) + 1;
      addDeepTable(`Câu ${number}: ${displayText(distribution.questionText)}`, distribution.options, distribution.options.length <= 8 ? 'doughnut' : 'bar', distribution.totalAnswered, true);
    });
  if (primaryRating) {
    const countLevels = (predicate: (level: number) => boolean) => getStoredRatingLevels(primaryRating.distribution)
      .filter(predicate)
      .reduce((sum, level) => sum + (primaryRating.distribution[level] ?? 0), 0);
    const ratingBands = [
      { label: '0,5–2 (thấp)', count: countLevels(level => level <= 2) },
      { label: '2,5–3,5 (trung bình)', count: countLevels(level => level > 2 && level < 4) },
      { label: '4–5 (cao)', count: countLevels(level => level >= 4) },
    ];
    const number = survey.questions.findIndex(question => question.id === primaryRating.questionId) + 1;
    addDeepTable(`Nhóm mức đánh giá — Câu ${number}: ${displayText(primaryRating.questionText)}`, ratingBands, 'doughnut', primaryRating.totalAnswered, true);
  }
  deepCharts.forEach(chart => {
    const dataStart = chart.row + 2; const dataEnd = dataStart + chart.rows.length - 1;
    nativeCharts.push({ sheetName: 'Phân tích sâu', type: chart.type, title: chart.title, categoryFormula: `'Phân tích sâu'!$A$${dataStart}:$A$${dataEnd}`, categories: chart.rows.map(row => row[0]), series: [{ name: 'Số người', valueFormula: `'Phân tích sâu'!$B$${dataStart}:$B$${dataEnd}`, values: chart.rows.map(row => row[1]), color: '1F4E78' }], anchor: { from: { col: 5, row: chart.row - 1 }, to: { col: 13, row: chart.row + 15 } }, showLegend: chart.type === 'doughnut', showValues: chart.type === 'bar', showPercent: chart.type === 'doughnut' });
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

  // Workbook construction also runs in Node tests, where there is no canvas.
  // The browser export still embeds this chart; tests retain the full table
  // and report structure without needing a DOM shim.
  const chart = typeof document === 'undefined'
    ? ''
    : chartKind === 'doughnut'
      ? drawDoughnutChart(chartTitle, chartLabels, rows.map(([, count]) => count))
      : drawBarChart(chartTitle, chartLabels, rows.map(([, count]) => count), color);
  if (chart) {
    const id = sheet.workbook.addImage({ base64: chart, extension: 'png' });
    sheet.addImage(id, { tl: { col: 4, row: startRow - 1 }, ext: { width: 720, height: 340 } });
  }

  const tableVisualRows = tableRows.reduce((sum, [label]) => sum + estimatedLineCount(label, 44), 0);
  return Math.max(startRow + tableVisualRows + 4, startRow + 23);
}

/**
 * Build the workbook separately from the browser download so the complete
 * report structure can be verified in tests. No canvas or DOM access occurs
 * in this function.
 */
export function createSurveyAnalysisWorkbook(survey: Survey, responses: SurveyResponse[]) {
  const analytics = computeSurveyAnalytics(survey, responses);
  const normalizedScoreStats = survey.isQuiz ? calculateNormalizedScoreStats(responses) : null;
  // Keep the standard analytics workbook safe to share. Direct identifiers
  // remain stored in the database, but are not copied into its raw-data tab.
  const exportQuestions = survey.questions.filter(question => !isPersonalIdentifierQuestion(question));
  const redactedIdentifierCount = survey.questions.length - exportQuestions.length;
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
  const overviewMetrics: Array<{ label: string; value: string | number; isPercent?: boolean }> = [
    { label: 'Tổng phản hồi', value: analytics.totalResponses },
    { label: 'Câu hỏi', value: survey.questions.length },
    { label: 'Tỷ lệ hoàn thành câu bắt buộc', value: analytics.completionRate / 100, isPercent: true },
    {
      label: 'Tỷ lệ trả lời trung bình',
      value: analytics.questionMetrics.length
        ? analytics.questionMetrics.reduce((sum, item) => sum + item.answerRate, 0) / analytics.questionMetrics.length / 100
        : 0,
      isPercent: true,
    },
    ...(redactedIdentifierCount > 0
      ? [{ label: 'Cột định danh đã ẩn khỏi dữ liệu xuất', value: redactedIdentifierCount }]
      : []),
    ...((survey.isQuiz && normalizedScoreStats ? [
      { label: 'Phản hồi có điểm hợp lệ', value: normalizedScoreStats.count },
      {
        label: `Điểm trung bình chuẩn hóa (n=${normalizedScoreStats.count})`,
        value: normalizedScoreStats.average !== undefined ? normalizedScoreStats.average / 100 : 'Chưa có',
        isPercent: normalizedScoreStats.average !== undefined,
      },
      {
        label: `Điểm trung vị chuẩn hóa (n=${normalizedScoreStats.count})`,
        value: normalizedScoreStats.median !== undefined ? normalizedScoreStats.median / 100 : 'Chưa có',
        isPercent: normalizedScoreStats.median !== undefined,
      },
      {
        label: `Tỷ lệ đạt từ 50% (n=${normalizedScoreStats.count})`,
        value: normalizedScoreStats.passRate ?? 'Chưa có',
        isPercent: normalizedScoreStats.passRate !== undefined,
      },
      ...(normalizedScoreStats.invalidCount > 0
        ? [{ label: 'Điểm ngoài khoảng 0–100% cần kiểm tra', value: normalizedScoreStats.invalidCount }]
        : []),
    ] : []) as Array<{ label: string; value: string | number; isPercent?: boolean }>),
  ];
  overviewMetrics.forEach((metric, index) => {
    overview.addRow([metric.label, metric.value]);
    if (metric.isPercent) overview.getCell(`B${index + 5}`).numFmt = '0.0%';
  });
  overview.getColumn(1).width = 52; overview.getColumn(2).width = 22;
  overview.getCell('A1').alignment = { vertical: 'middle', wrapText: true };
  overview.getRow(1).height = Math.max(34, estimatedLineCount(String(overview.getCell('A1').value), 74) * 18 + 10);
  fitWrappedRows(overview, 4, overviewMetrics.length + 4, [52, 22]);

  const questionSheet = workbook.addWorksheet('Phân tích câu hỏi');
  const hasScoredQuestions = analytics.questionMetrics.some(metric => metric.correctCount !== undefined);
  questionSheet.addRow([
    'STT', 'Câu hỏi', 'Loại', 'Bắt buộc', 'Mẫu tương thích', 'Đã trả lời', 'Bỏ qua', 'Tỷ lệ trả lời', 'Khác phiên bản', 'Chưa có phiên bản',
    ...(hasScoredQuestions ? ['Đúng', 'Mẫu chấm', 'Tỷ lệ đúng'] : []),
  ]);
  analytics.questionMetrics.forEach((metric, index) => questionSheet.addRow([
    index + 1,
    spreadsheetValue(metric.questionText),
    metric.type,
    metric.required ? 'Có' : 'Không',
    metric.comparableResponses,
    metric.answered,
    metric.missing,
    metric.answerRate / 100,
    metric.versionDifferentResponses,
    metric.legacyUnversionedResponses,
    ...(hasScoredQuestions ? [metric.correctCount ?? null, metric.correctSampleSize ?? null, metric.correctRate !== undefined ? metric.correctRate / 100 : null] : []),
  ]));
  const questionWidths = hasScoredQuestions ? [8, 65, 20, 12, 16, 15, 12, 18, 16, 18, 12, 12, 16] : [8, 65, 20, 12, 16, 15, 12, 18, 16, 18];
  formatSheet(questionSheet, questionWidths);
  questionSheet.getColumn(8).numFmt = '0.0%';
  if (hasScoredQuestions) questionSheet.getColumn(13).numFmt = '0.0%';
  fitWrappedRows(questionSheet, 1, analytics.questionMetrics.length + 1, questionWidths);

  const raw = workbook.addWorksheet('Dữ liệu phản hồi');
  raw.addRow(['Mã phản hồi', 'Thời gian gửi', ...(survey.isQuiz ? ['Điểm', 'Điểm tối đa', 'Tỷ lệ điểm'] : []), ...exportQuestions.map(question => spreadsheetValue(question.text))]);
  responses.forEach(response => raw.addRow([
    spreadsheetValue(response.id),
    new Date(response.submittedAt),
    ...(survey.isQuiz ? [response.score ?? '', response.totalQuizQuestions ?? '', response.score !== null && response.score !== undefined && response.totalQuizQuestions ? Number(response.score) / Number(response.totalQuizQuestions) : ''] : []),
    ...exportQuestions.map(question => {
      const answer = response.answers[question.id];
      if (question.type === 'star_rating') return parseStoredStarRating(answer) ?? spreadsheetValue(answer);
      if (Array.isArray(answer)) return spreadsheetValue(answer.map(item => displayText(String(item))).join('; '));
      if (answer && typeof answer === 'object') {
        return spreadsheetValue(Object.entries(answer)
          .map(([row, selection]) => `${displayText(row)}: ${Array.isArray(selection) ? selection.map(item => displayText(String(item))).join(', ') : displayText(String(selection))}`)
          .join('; '));
      }
      return typeof answer === 'string' ? spreadsheetValue(answer) : spreadsheetValue(answer);
    }),
  ]));
  const rawWidths = [22, 21, ...(survey.isQuiz ? [12, 14, 14] : []), ...exportQuestions.map(() => 48)];
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
            spreadsheetValue(question.text),
            spreadsheetValue(response.id),
            new Date(response.submittedAt),
            spreadsheetValue(answer),
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
          spreadsheetValue(distribution.questionText),
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
  const linearScaleByQuestionId = new Map(analytics.linearScales.map(scale => [scale.questionId, scale]));
  const gridByQuestionId = new Map(analytics.gridDistributions.map(grid => [grid.questionId, grid]));
  const npsByQuestionId = new Map(analytics.npsByQuestion.map(result => [result.questionId, result]));
  const checkSheet = workbook.addWorksheet('Kiểm tra số liệu');
  checkSheet.addRow(['STT', 'Câu hỏi', 'Loại', 'Mẫu tương thích', 'Đã trả lời', 'Bỏ qua', 'Tỷ lệ trả lời', 'Khác phiên bản', 'Chưa có phiên bản', 'Tổng lượt ghi nhận', 'Kết quả đối chiếu']);
  analytics.questionMetrics.forEach((metric, index) => {
    const choice = choiceByQuestionId.get(metric.questionId);
    const rating = ratingByQuestionId.get(metric.questionId);
    const linearScale = linearScaleByQuestionId.get(metric.questionId);
    const grid = gridByQuestionId.get(metric.questionId);
    const npsResult = npsByQuestionId.get(metric.questionId);
    const recordedTotal = choice
      ? choice.options.reduce((sum, option) => sum + option.count, 0)
      : rating
      ? Object.values(rating.distribution).reduce((sum, count) => sum + count, 0)
      : linearScale
      ? Object.values(linearScale.distribution).reduce((sum, count) => sum + count, 0)
      : grid
      ? grid.rows.reduce((sum, row) => sum + row.options.reduce((rowSum, option) => rowSum + option.count, 0), 0)
      : npsResult
      ? npsResult.totalAnswered
      : metric.answered;
    const matchesSource = metric.answered + metric.missing === metric.comparableResponses
      && (!choice || metric.type === 'multiple_choice' || recordedTotal === metric.answered)
      && (!rating || recordedTotal === metric.answered)
      && (!linearScale || recordedTotal === metric.answered)
      && (!npsResult || recordedTotal === metric.answered);
    const note = metric.versionDifferentResponses > 0
      ? `Đã tách ${metric.versionDifferentResponses} phản hồi khác phiên bản; biểu đồ chỉ đối chiếu phần tương thích.`
      : metric.legacyUnversionedResponses > 0
      ? `Có ${metric.legacyUnversionedResponses} phản hồi cũ chưa có phiên bản; cần đối chiếu dữ liệu thô nếu biểu mẫu từng sửa.`
      : metric.type === 'multiple_choice' || metric.type === 'checkbox_grid'
      ? `${matchesSource ? 'Khớp dữ liệu gốc' : 'Cần kiểm tra'}; có thể chọn nhiều đáp án.`
      : grid
      ? 'Lượt chọn được đối chiếu riêng theo từng hàng.'
      : matchesSource ? 'Khớp dữ liệu gốc.' : 'Cần kiểm tra.';
    checkSheet.addRow([
      index + 1,
      spreadsheetValue(metric.questionText),
      metric.type,
      metric.comparableResponses,
      metric.answered,
      metric.missing,
      metric.answerRate / 100,
      metric.versionDifferentResponses,
      metric.legacyUnversionedResponses,
      recordedTotal,
      note,
    ]);
  });
  const checkWidths = [8, 62, 20, 16, 14, 12, 18, 16, 18, 20, 54];
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
    ['Câu hỏi', 'Tỷ lệ trả lời (%)', 'Tỷ lệ'],
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
      ['Lựa chọn', 'Số lượt chọn', question?.type === 'multiple_choice' ? '% người chọn' : 'Tỷ lệ'],
      distribution.options.map(option => [displayText(option.label), option.count, option.percent / 100]),
      `#${PALETTE[(index + 1) % PALETTE.length]}`,
      {
        kind: (question?.type === 'single_choice' || question?.type === 'dropdown') && distribution.options.length <= 6 ? 'doughnut' : 'bar',
        chartTitle: `Câu ${questionNumber}`,
        chartLabels: distribution.options.map((_, optionIndex) => `Lựa chọn ${optionIndex + 1}`),
      },
    );
  });

  analytics.textCategoryDistributions.forEach((distribution, index) => {
    if (distribution.options.length === 0) return;
    const questionNumber = survey.questions.findIndex(question => question.id === distribution.questionId) + 1;
    const chartOptions = categoryRows(distribution.options, 10, distribution.totalAnswered, true);
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
    const ratingLevels = getStoredRatingLevels(rating.distribution);
    const ratingPercents = allocateExclusivePercents(ratingLevels.map(star => rating.distribution[star] || 0), rating.totalAnswered);
    nextChartRow = addChartSection(
      chartSheet,
      nextChartRow,
      `Câu ${questionNumber}: ${displayText(rating.questionText)}`,
      ['Mức đánh giá', 'Số phản hồi', 'Tỷ lệ'],
      ratingLevels.map((star, levelIndex) => [`${star} sao`, rating.distribution[star] || 0, (ratingPercents[levelIndex] ?? 0) / 100]),
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
    const scorePercents = allocateExclusivePercents(
      analytics.scoreDistribution.map(item => item.count),
      analytics.scoredResponseCount ?? 0,
    );
    addChartSection(
      chartSheet,
      nextChartRow,
      'Phân bố điểm bài kiểm tra',
      ['Khoảng điểm', 'Số người', 'Tỷ lệ'],
      analytics.scoreDistribution.map((item, index) => [item.label, item.count, (scorePercents[index] ?? 0) / 100]),
      '#006591',
    );
  }

  // Add the reference-style reader sheets after the raw/audit tabs are built.
  const nativeCharts = buildProfessionalSheets(workbook, survey, responses, analytics);
  return { workbook, nativeCharts };
}

export async function exportSurveyAnalysisToExcel(survey: Survey, responses: SurveyResponse[]) {
  const { workbook, nativeCharts } = createSurveyAnalysisWorkbook(survey, responses);
  // Embed charts as PNGs. ExcelJS writes these drawing parts itself, avoiding
  // the fragile hand-built OOXML that desktop Excel was repairing/removing.
  nativeCharts.forEach(spec => {
    const sheet = workbook.getWorksheet(spec.sheetName);
    if (!sheet) return;
    const image = spec.type === 'doughnut' || spec.type === 'pie'
      ? drawDoughnutChart(displayText(spec.title), spec.categories.map(label => displayText(label)), spec.series[0].values)
      : drawBarChart(displayText(spec.title), spec.categories.map(label => displayText(label)), spec.series[0].values, `#${spec.series[0].color ?? '3730A3'}`);
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
