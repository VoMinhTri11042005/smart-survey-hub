import ExcelJS from 'exceljs';
import type { Survey, SurveyResponse } from '../types';
import { computeSurveyAnalytics } from './analytics';
import { cleanHtmlWhitespace, stripHtml } from './stringUtils';

const BRAND = '3730A3';
const PALETTE = ['3730A3', '006591', '60A5FA', '10B981', 'F59E0B', 'EF4444'];

function displayText(value: string | undefined) {
  return stripHtml(cleanHtmlWhitespace(value)).replace(/\s+/g, ' ').trim();
}

function shortenText(value: string, maxLength = 58) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
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

function drawDoughnutChart(title: string, labels: string[], values: number[]) {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!ctx || total <= 0) return '';

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

  labels.forEach((label, index) => {
    const y = 115 + index * 58;
    const percent = Math.round((values[index] / total) * 100);
    ctx.fillStyle = `#${PALETTE[index % PALETTE.length]}`;
    ctx.fillRect(545, y - 14, 18, 18);
    ctx.fillStyle = '#172033';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(shortenText(label, 44), 575, y);
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

function addChartSection(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  headers: [string, string, string],
  rows: Array<[string, number, number]>,
  color: string,
  chartKind: 'bar' | 'doughnut' = 'bar',
) {
  sheet.mergeCells(`A${startRow}:C${startRow}`);
  const titleCell = sheet.getCell(`A${startRow}`);
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: `FF${BRAND}` }, size: 12 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };
  titleCell.alignment = { vertical: 'middle' };
  sheet.getRow(startRow).height = 24;

  const headerRow = sheet.getRow(startRow + 1);
  headerRow.values = headers;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  rows.forEach((row, index) => {
    const target = sheet.getRow(startRow + index + 2);
    target.values = row;
    target.alignment = { vertical: 'top', wrapText: true };
  });
  sheet.getColumn(3).numFmt = '0.0%';

  const chart = chartKind === 'doughnut'
    ? drawDoughnutChart(title, rows.map(([label]) => label), rows.map(([, count]) => count))
    : drawBarChart(title, rows.map(([label]) => label), rows.map(([, count]) => count), color);
  if (chart) {
    const id = sheet.workbook.addImage({ base64: chart, extension: 'png' });
    sheet.addImage(id, { tl: { col: 4, row: startRow - 1 }, ext: { width: 720, height: 340 } });
  }

  return Math.max(startRow + rows.length + 4, startRow + 23);
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
    index + 1, displayText(metric.questionText), metric.type, metric.required ? 'Có' : 'Không', metric.answered, metric.missing, metric.answerRate / 100, metric.correctCount ?? null, metric.correctRate !== undefined ? metric.correctRate / 100 : null,
  ]));
  formatSheet(questionSheet, [8, 55, 20, 12, 15, 12, 18, 12, 16]);
  questionSheet.getColumn(7).numFmt = '0.0%'; questionSheet.getColumn(9).numFmt = '0.0%';

  const raw = workbook.addWorksheet('Dữ liệu phản hồi');
  raw.addRow(['Mã phản hồi', 'Thời gian gửi', ...(survey.isQuiz ? ['Điểm', 'Điểm tối đa', 'Tỷ lệ điểm'] : []), ...survey.questions.map(question => displayText(question.text))]);
  responses.forEach(response => raw.addRow([
    response.id,
    new Date(response.submittedAt),
    ...(survey.isQuiz ? [response.score ?? '', response.totalQuizQuestions ?? '', response.score !== null && response.score !== undefined && response.totalQuizQuestions ? Number(response.score) / Number(response.totalQuizQuestions) : ''] : []),
    ...survey.questions.map(question => {
      const answer = response.answers[question.id];
      if (Array.isArray(answer)) return answer.map(item => displayText(String(item))).join('; ');
      return typeof answer === 'string' ? displayText(answer) : answer ?? '';
    }),
  ]));
  formatSheet(raw, [22, 21, ...(survey.isQuiz ? [12, 14, 14] : []), ...survey.questions.map(() => 30)]);
  raw.getColumn(2).numFmt = 'yyyy-mm-dd hh:mm';
  if (survey.isQuiz) raw.getColumn(5).numFmt = '0.0%';

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
    analytics.questionMetrics.map((metric, index) => [shortenText(`Câu ${index + 1}: ${displayText(metric.questionText)}`), metric.answerRate, metric.answerRate / 100]),
    '#3730A3',
  );

  analytics.choiceDistributions.forEach((distribution, index) => {
    if (distribution.options.length === 0) return;
    const question = survey.questions.find(item => item.id === distribution.questionId);
    nextChartRow = addChartSection(
      chartSheet,
      nextChartRow,
      `Câu ${survey.questions.findIndex(question => question.id === distribution.questionId) + 1}: ${shortenText(displayText(distribution.questionText), 64)}`,
      ['Lựa chọn', 'Số lượt chọn', 'Tỷ lệ'],
      distribution.options.map(option => [shortenText(displayText(option.label)), option.count, option.percent / 100]),
      `#${PALETTE[(index + 1) % PALETTE.length]}`,
      question?.type === 'single_choice' && distribution.options.length <= 6 ? 'doughnut' : 'bar',
    );
  });

  analytics.starRatings.forEach((rating, index) => {
    nextChartRow = addChartSection(
      chartSheet,
      nextChartRow,
      `Câu ${survey.questions.findIndex(question => question.id === rating.questionId) + 1}: ${shortenText(displayText(rating.questionText), 64)}`,
      ['Mức đánh giá', 'Số phản hồi', 'Tỷ lệ'],
      [1, 2, 3, 4, 5].map(star => [`${star} sao`, rating.distribution[star] || 0, rating.totalAnswered ? (rating.distribution[star] || 0) / rating.totalAnswered : 0]),
      `#${PALETTE[(index + 2) % PALETTE.length]}`,
    );
  });

  analytics.npsByQuestion.forEach((result, index) => {
    nextChartRow = addChartSection(
      chartSheet,
      nextChartRow,
      `Câu ${survey.questions.findIndex(question => question.id === result.questionId) + 1}: ${shortenText(displayText(result.questionText), 64)}`,
      ['Nhóm NPS', 'Số phản hồi', 'Tỷ lệ'],
      [
        ['Ủng hộ', result.promoters, result.promoterPercent / 100],
        ['Thụ động', result.passives, result.passivePercent / 100],
        ['Phản đối', result.detractors, result.detractorPercent / 100],
      ],
      `#${PALETTE[(index + 3) % PALETTE.length]}`,
      'doughnut',
    );
  });

  if (analytics.scoreDistribution) {
    addChartSection(
      chartSheet,
      nextChartRow,
      'Phân bố điểm bài kiểm tra',
      ['Khoảng điểm', 'Số người', 'Tỷ lệ'],
      analytics.scoreDistribution.map(item => [item.label, item.count, analytics.totalResponses ? item.count / analytics.totalResponses : 0]),
      '#006591',
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = createDownloadFilename(survey.title);
  link.click();
  URL.revokeObjectURL(url);
}
