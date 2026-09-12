import ExcelJS from 'exceljs';
import type { Survey, SurveyResponse } from '../types';
import { computeSurveyAnalytics } from './analytics';
import { cleanHtmlWhitespace, stripHtml } from './stringUtils';

const BRAND = '3730A3';
const PALETTE = ['3730A3', '006591', '60A5FA', '10B981', 'F59E0B', 'EF4444'];

function drawBarChart(title: string, labels: string[], values: number[], color = '#3730a3') {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

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
    const shortened = label.length > 18 ? `${label.slice(0, 17)}…` : label;
    ctx.save(); ctx.translate(x + barWidth / 2, top + height + 18); ctx.rotate(-0.42); ctx.textAlign = 'right'; ctx.fillText(shortened, 0, 0); ctx.restore();
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

export async function exportSurveyAnalysisToExcel(survey: Survey, responses: SurveyResponse[]) {
  const analytics = computeSurveyAnalytics(survey, responses);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smart Survey Hub';
  workbook.created = new Date();

  const overview = workbook.addWorksheet('Tổng quan');
  overview.mergeCells('A1:F1');
  overview.getCell('A1').value = `Phân tích khảo sát: ${stripHtml(survey.title)}`;
  overview.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  overview.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
  overview.getCell('A1').alignment = { vertical: 'middle' };
  overview.getRow(1).height = 34;
  overview.getCell('A2').value = `Xuất lúc: ${new Date().toLocaleString('vi-VN')}`;
  overview.getCell('A4').value = 'Chỉ số'; overview.getCell('B4').value = 'Giá trị';
  overview.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  overview.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006591' } };
  [
    ['Tổng phản hồi', analytics.totalResponses],
    ['Câu hỏi', survey.questions.length],
    ['Tỷ lệ hoàn thành câu bắt buộc', analytics.completionRate / 100],
    ['Tỷ lệ trả lời trung bình', analytics.questionMetrics.length ? analytics.questionMetrics.reduce((sum, item) => sum + item.answerRate, 0) / analytics.questionMetrics.length / 100 : 0],
    ...(survey.isQuiz ? [
      ['Điểm trung bình', analytics.averageScore ?? 'Chưa có'],
      ['Điểm trung vị', analytics.medianScore ?? 'Chưa có'],
      ['Tỷ lệ đạt từ 50%', analytics.passRate !== undefined ? analytics.passRate / 100 : 'Chưa có'],
    ] : []),
  ].forEach(row => overview.addRow(row));
  overview.getColumn(1).width = 34; overview.getColumn(2).width = 22;
  overview.getCell('B6').numFmt = '0.0%'; overview.getCell('B7').numFmt = '0.0%';

  const questionSheet = workbook.addWorksheet('Phân tích câu hỏi');
  questionSheet.addRow(['STT', 'Câu hỏi', 'Loại', 'Bắt buộc', 'Đã trả lời', 'Bỏ qua', 'Tỷ lệ trả lời', 'Đúng', 'Tỷ lệ đúng']);
  analytics.questionMetrics.forEach((metric, index) => questionSheet.addRow([
    index + 1, stripHtml(cleanHtmlWhitespace(metric.questionText)), metric.type, metric.required ? 'Có' : 'Không', metric.answered, metric.missing, metric.answerRate / 100, metric.correctCount ?? '', metric.correctRate !== undefined ? metric.correctRate / 100 : '',
  ]));
  formatSheet(questionSheet, [8, 55, 20, 12, 15, 12, 18, 12, 16]);
  questionSheet.getColumn(7).numFmt = '0.0%'; questionSheet.getColumn(9).numFmt = '0.0%';

  const raw = workbook.addWorksheet('Dữ liệu phản hồi');
  raw.addRow(['Mã phản hồi', 'Thời gian gửi', ...(survey.isQuiz ? ['Điểm', 'Điểm tối đa', 'Tỷ lệ điểm'] : []), ...survey.questions.map(question => stripHtml(cleanHtmlWhitespace(question.text)))]);
  responses.forEach(response => raw.addRow([
    response.id,
    new Date(response.submittedAt),
    ...(survey.isQuiz ? [response.score ?? '', response.totalQuizQuestions ?? '', response.score !== null && response.score !== undefined && response.totalQuizQuestions ? Number(response.score) / Number(response.totalQuizQuestions) : ''] : []),
    ...survey.questions.map(question => {
      const answer = response.answers[question.id];
      return Array.isArray(answer) ? answer.join('; ') : answer ?? '';
    }),
  ]));
  formatSheet(raw, [22, 21, ...(survey.isQuiz ? [12, 14, 14] : []), ...survey.questions.map(() => 30)]);
  raw.getColumn(2).numFmt = 'yyyy-mm-dd hh:mm';
  if (survey.isQuiz) raw.getColumn(5).numFmt = '0.0%';

  const chartSheet = workbook.addWorksheet('Biểu đồ');
  chartSheet.getColumn(1).width = 24;
  chartSheet.getColumn(2).width = 18;
  chartSheet.addRow(['Câu hỏi', 'Tỷ lệ trả lời']);
  analytics.questionMetrics.forEach(metric => chartSheet.addRow([stripHtml(cleanHtmlWhitespace(metric.questionText)), metric.answerRate]));
  formatSheet(chartSheet, [42, 20]);
  const responseRateChart = drawBarChart('Tỷ lệ trả lời theo câu hỏi', analytics.questionMetrics.map((_, index) => `Câu ${index + 1}`), analytics.questionMetrics.map(metric => metric.answerRate), '#3730a3');
  if (responseRateChart) {
    const id = workbook.addImage({ base64: responseRateChart, extension: 'png' });
    chartSheet.addImage(id, { tl: { col: 3, row: 1 }, ext: { width: 720, height: 340 } });
  }
  if (analytics.scoreDistribution) {
    const startRow = analytics.questionMetrics.length + 4;
    chartSheet.getCell(`A${startRow}`).value = 'Khoảng điểm'; chartSheet.getCell(`B${startRow}`).value = 'Số người';
    analytics.scoreDistribution.forEach((item, index) => chartSheet.getRow(startRow + index + 1).values = [item.label, item.count]);
    const scoreChart = drawBarChart('Phân bố điểm bài kiểm tra', analytics.scoreDistribution.map(item => item.label), analytics.scoreDistribution.map(item => item.count), '#006591');
    if (scoreChart) {
      const id = workbook.addImage({ base64: scoreChart, extension: 'png' });
      chartSheet.addImage(id, { tl: { col: 3, row: 20 }, ext: { width: 720, height: 340 } });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${stripHtml(survey.title).replace(/[^a-zA-Z0-9]/g, '_') || 'survey'}_analysis.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
