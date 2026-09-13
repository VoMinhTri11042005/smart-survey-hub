import ExcelJS from 'exceljs';
import type { Survey, SurveyResponse } from '../types';
import { computeSurveyAnalytics } from './analytics';
import { cleanHtmlWhitespace, stripHtml } from './stringUtils';
import { roundLegacyStarRating } from '../../shared/starRating';

const BRAND = '3730A3';
const PALETTE = ['3730A3', '006591', '60A5FA', '10B981', 'F59E0B', 'EF4444'];

function displayText(value: string | undefined) {
  return stripHtml(cleanHtmlWhitespace(value)).replace(/\s+/g, ' ').trim();
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
    .filter(({ question }) => question.type === 'text');
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

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = createDownloadFilename(survey.title);
  link.click();
  URL.revokeObjectURL(url);
}
