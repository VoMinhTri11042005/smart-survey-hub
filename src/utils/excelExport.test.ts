import { describe, expect, it, vi } from 'vitest';
import type { Survey, SurveyResponse } from '../types';
import { createSurveyAnalysisWorkbook, exportSurveyAnalysisToExcel } from './excelExport';

function cellTexts(sheet: ReturnType<ReturnType<typeof createSurveyAnalysisWorkbook>['workbook']['getWorksheet']>) {
  const values: string[] = [];
  sheet?.eachRow(row => row.eachCell(cell => values.push(String(cell.value ?? ''))));
  return values;
}

describe('createSurveyAnalysisWorkbook', () => {
  it('keeps quiz score, correctness, audit and histogram sheets in the final workbook', () => {
    const survey: Survey = {
      id: 'quiz-1',
      title: 'Bài kiểm tra an toàn',
      description: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'live',
      isQuiz: true,
      questions: [{ id: 'q1', type: 'single_choice', text: 'Câu 1', options: ['A', 'B'], correctAnswer: 'A', required: true }],
    };
    const responses: SurveyResponse[] = [{
      id: 'r1', surveyId: survey.id, submittedAt: '2026-01-01T01:00:00.000Z', answers: { q1: 'A' }, score: 2, totalQuizQuestions: 2,
      surveySnapshot: { schemaVersion: 1, capturedAt: '2026-01-01T01:00:00.000Z', isQuiz: true, questions: survey.questions },
    }];

    const { workbook, nativeCharts } = createSurveyAnalysisWorkbook(survey, responses);
    const names = workbook.worksheets.map(sheet => sheet.name);

    expect(names).toEqual(expect.arrayContaining([
      'Tổng quan', 'Phân tích câu hỏi', 'Dữ liệu phản hồi', 'Kiểm tra số liệu', 'Biểu đồ',
      'Dashboard', 'Chi tiết câu hỏi', 'Phân tích chéo', 'Phân tích sâu',
    ]));
    expect(cellTexts(workbook.getWorksheet('Tổng quan'))).toContain('Điểm trung bình chuẩn hóa (n=1)');
    expect(cellTexts(workbook.getWorksheet('Phân tích câu hỏi'))).toContain('Tỷ lệ đúng');
    expect(cellTexts(workbook.getWorksheet('Biểu đồ'))).toContain('Phân bố điểm bài kiểm tra');
    expect(cellTexts(workbook.getWorksheet('Dashboard'))).toContain('ĐIỂM TB CHUẨN HÓA\n100%');
    expect(cellTexts(workbook.getWorksheet('Dashboard'))).not.toContain(expect.stringContaining('MỨC ẢNH HƯỞNG'));
    expect(nativeCharts.some(chart => chart.sheetName === 'Dashboard' && chart.title === 'Phân bố điểm chuẩn hóa')).toBe(true);
  });

  it('uses the question denominator for multi-select exports and omits direct identifiers', () => {
    const survey: Survey = {
      id: 'survey-1', title: 'Khảo sát', description: '', createdAt: '2026-01-01T00:00:00.000Z', status: 'live',
      questions: [
        { id: 'email', type: 'text', text: 'Email của bạn', required: false },
        { id: 'multi', type: 'multiple_choice', text: 'Chọn các phương án', options: ['A', 'B'], required: false },
      ],
    };
    const responses: SurveyResponse[] = [
      { id: 'r1', surveyId: survey.id, submittedAt: '2026-01-01T00:00:00.000Z', answers: { email: 'person@example.com', multi: ['A', 'B'] } },
      { id: 'r2', surveyId: survey.id, submittedAt: '2026-01-01T00:01:00.000Z', answers: { email: 'other@example.com', multi: ['A'] } },
    ];

    const { workbook, nativeCharts } = createSurveyAnalysisWorkbook(survey, responses);
    const rawValues = cellTexts(workbook.getWorksheet('Dữ liệu phản hồi'));
    const detailValues = cellTexts(workbook.getWorksheet('Chi tiết câu hỏi'));

    expect(rawValues).not.toContain('Email của bạn');
    expect(rawValues).not.toContain('person@example.com');
    expect(detailValues).toContain('% người chọn');
    expect(nativeCharts.find(chart => chart.sheetName === 'Chi tiết câu hỏi' && chart.title === 'Câu 2')?.type).toBe('bar');
  });

  it('exports formatting-equivalent legacy choice answers as two current categories and keeps cross-tabs aligned', async () => {
    const survey: Survey = {
      id: 'legacy-choice', title: 'Khảo sát lựa chọn cũ', description: '', createdAt: '2026-01-01T00:00:00.000Z', status: 'live',
      questions: [
        { id: 'year', type: 'single_choice', text: 'Bạn là sinh viên năm mấy?', options: ['Năm 1', 'Năm 2'], required: false },
        { id: 'habit', type: 'multiple_choice', text: 'Bạn chọn những phương án nào?', options: ['Có', 'Không'], required: false },
      ],
    };
    const responses: SurveyResponse[] = [
      { id: 'r1', surveyId: survey.id, submittedAt: '2026-01-01T00:00:00.000Z', answers: { year: '<p>Năm 1</p>', habit: ['<strong>Có</strong>'] } },
      { id: 'r2', surveyId: survey.id, submittedAt: '2026-01-01T00:01:00.000Z', answers: { year: 'Năm 1', habit: ['Có', '<em>Có</em>'] } },
      { id: 'r3', surveyId: survey.id, submittedAt: '2026-01-01T00:02:00.000Z', answers: { year: '<i>Năm 2</i>', habit: [' Không '] } },
    ];

    const { workbook } = createSurveyAnalysisWorkbook(survey, responses);
    for (const sheetName of ['Dashboard', 'Chi tiết câu hỏi', 'Phân tích sâu', 'Biểu đồ']) {
      const values = cellTexts(workbook.getWorksheet(sheetName));
      expect(values.some(value => value.includes('Lựa chọn cũ/không còn trong cấu hình'))).toBe(false);
    }

    const cross = workbook.getWorksheet('Phân tích chéo');
    expect(cross?.getCell('A6').value).toBe('Có');
    expect(cross?.getCell('B6').value).toBe(1);
    expect(cross?.getCell('C6').value).toBe(0);
    expect(cross?.getCell('A7').value).toBe('Không');
    expect(cross?.getCell('B7').value).toBe(0);
    expect(cross?.getCell('C7').value).toBe(1);

    // Confirm the workbook remains serializable after the normalized tables
    // have driven every export sheet.
    const file = await workbook.xlsx.writeBuffer();
    expect(file.byteLength).toBeGreaterThan(0);
  });

  it('uses the answered, current-version sample in each cross-tab and keeps rating formats separate', () => {
    const survey: Survey = {
      id: 'cross-sample', title: 'Khảo sát', description: '', createdAt: '2026-01-01T00:00:00.000Z', status: 'live',
      questions: [
        { id: 'year', type: 'single_choice', text: 'Bạn là sinh viên năm mấy?', options: ['Năm 1', 'Năm 2', 'Năm 3'], required: false },
        { id: 'habit', type: 'multiple_choice', text: 'Chọn phương án', options: ['A', 'B'], required: false },
        { id: 'rating', type: 'star_rating', text: 'Đánh giá', required: false },
      ],
    };
    const snapshot = (questions = survey.questions) => ({ schemaVersion: 1, capturedAt: '2026-01-01T00:00:00.000Z', isQuiz: false, questions });
    const response = (id: string, answers: SurveyResponse['answers'], questions = survey.questions): SurveyResponse => ({
      id, surveyId: survey.id, submittedAt: '2026-01-01T00:00:00.000Z', answers, surveySnapshot: snapshot(questions),
    });
    const previousQuestion = (id: string) => survey.questions.map(question => question.id === id ? { ...question, text: `${question.text} (cũ)` } : question);
    const responses: SurveyResponse[] = [
      response('r1', { year: 'Năm 1', habit: ['A'], rating: 5 }),
      response('r2', { year: 'Năm 1', habit: ['B'], rating: 3 }),
      response('r3', { year: 'Năm 1', habit: [], rating: 2 }), // skipped outcome
      response('r4', { year: 'Năm 1', habit: ['B'], rating: 1 }, previousQuestion('habit')),
      response('r5', { year: 'Năm 1', habit: ['B'], rating: 1 }, previousQuestion('year')),
      response('r6', { year: 'Năm 2', habit: ['B'], rating: 4 }),
      response('r7', { year: 'Năm 2', habit: ['A'], rating: 3 }, previousQuestion('rating')),
      { id: 'legacy', surveyId: survey.id, submittedAt: '2026-01-01T00:00:00.000Z', answers: { year: 'Năm 2', habit: ['B'], rating: 5 } },
      response('old-form', { year: 'Năm 2', habit: ['B'] }, survey.questions.filter(question => question.id !== 'habit')),
    ];

    const { workbook, nativeCharts } = createSurveyAnalysisWorkbook(survey, responses);
    const cross = workbook.getWorksheet('Phân tích chéo')!;
    const headers = cross.getRow(5);
    const findColumn = (prefix: string) => {
      let column = 0;
      headers.eachCell((cell, index) => { if (String(cell.value).startsWith(prefix)) column = index; });
      return column;
    };
    const findRow = (label: string) => {
      let number = 0;
      cross.eachRow((row, index) => { if (row.getCell(1).value === label) number = index; });
      return number;
    };
    const first = findColumn('Năm 1');
    const second = findColumn('Năm 2');
    const third = findColumn('Năm 3');
    expect(first && second && third).toBeTruthy();
    expect(headers.getCell(first).value).toBe('Năm 1 (n=2)');
    expect(headers.getCell(second).value).toBe('Năm 2 (n=3)');
    expect(headers.getCell(third).value).toBe('Năm 3 (n=0)');
    expect(cross.getCell(findRow('A'), first).value).toBe(0.5);
    expect(cross.getCell(findRow('B'), first).value).toBe(0.5);
    expect(cross.getCell(findRow('A'), second).value).toBeCloseTo(1 / 3);
    expect(cross.getCell(findRow('B'), second).value).toBeCloseTo(2 / 3);
    expect(cross.getCell(findRow('A'), third).value).toBe('—');
    expect(cross.getCell(findRow('A'), second).numFmt).toBe('0.0%');

    expect(cross.getCell(findRow('Năm 1'), 2).value).toBe(4);
    expect(cross.getCell(findRow('Năm 1'), 3).value).toBe(2.75);
    expect(cross.getCell(findRow('Năm 2'), 2).value).toBe(2);
    expect(cross.getCell(findRow('Năm 2'), 3).value).toBe(4.5);
    expect(cross.getCell(findRow('Năm 1'), 3).numFmt).toBe('0.00');
    const chart = nativeCharts.find(item => item.sheetName === 'Phân tích chéo' && item.title === 'Tỷ lệ theo nhóm (%)')!;
    expect(chart.series.map(item => item.name)).toEqual(['Năm 1 (n=2)', 'Năm 2 (n=3)']);
    expect(new Set(chart.series.map(item => item.color)).size).toBe(2);
  });

  it('does not turn an empty cross-tab sample into a zero-percent result', () => {
    const survey: Survey = {
      id: 'empty-cross', title: 'Khảo sát', description: '', createdAt: '2026-01-01T00:00:00.000Z', status: 'live',
      questions: [
        { id: 'year', type: 'single_choice', text: 'Bạn là sinh viên năm mấy?', options: ['Năm 1'], required: false },
        { id: 'habit', type: 'multiple_choice', text: 'Chọn phương án', options: ['A'], required: false },
      ],
    };
    const responses: SurveyResponse[] = [{
      id: 'r1', surveyId: survey.id, submittedAt: '2026-01-01T00:00:00.000Z', answers: { year: 'Năm 1', habit: [] },
    }];
    const { workbook, nativeCharts } = createSurveyAnalysisWorkbook(survey, responses);
    const cross = workbook.getWorksheet('Phân tích chéo')!;
    expect(cross.getCell('B5').value).toBe('Năm 1 (n=0)');
    expect(cross.getCell('B6').value).toBe('—');
    expect(cellTexts(cross)).toContain('Chưa đủ dữ liệu để tạo nhận xét định lượng.');
    expect(nativeCharts.some(item => item.sheetName === 'Phân tích chéo' && item.title === 'Tỷ lệ theo nhóm (%)')).toBe(false);
  });

  it('renders all cross-tab groups and their legends in the exported PNG', async () => {
    const survey: Survey = {
      id: 'chart-groups', title: 'Khảo sát', description: '', createdAt: '2026-01-01T00:00:00.000Z', status: 'live',
      questions: [
        { id: 'year', type: 'single_choice', text: 'Bạn là sinh viên năm mấy?', options: ['Năm 1', 'Năm 2', 'Năm 3'], required: false },
        { id: 'habit', type: 'multiple_choice', text: 'Chọn phương án', options: ['A', 'B'], required: false },
      ],
    };
    const responses: SurveyResponse[] = ['Năm 1', 'Năm 2', 'Năm 3'].map((year, index) => ({
      id: `r${index}`, surveyId: survey.id, submittedAt: '2026-01-01T00:00:00.000Z', answers: { year, habit: index === 1 ? ['A', 'B'] : ['A'] },
    }));
    type RecordedChart = { texts: string[]; rectangles: Array<{ color: string; height: number }> };
    const charts: RecordedChart[] = [];
    const noOperation = () => {};
    const makeCanvas = () => {
      const chart: RecordedChart = { texts: [], rectangles: [] };
      charts.push(chart);
      const context = {
        fillStyle: '',
        fillRect(_x: number, _y: number, _width: number, height: number) { chart.rectangles.push({ color: String(this.fillStyle), height }); },
        fillText(value: string) { chart.texts.push(value); },
        measureText(value: string) { return { width: value.length * 8 }; },
        beginPath: noOperation, moveTo: noOperation, lineTo: noOperation, stroke: noOperation,
        save: noOperation, restore: noOperation, translate: noOperation, rotate: noOperation,
        arc: noOperation, closePath: noOperation, fill: noOperation,
      };
      return { getContext: () => context, toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=' };
    };
    const link = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('document', { createElement: (tag: string) => tag === 'canvas' ? makeCanvas() : link });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(noOperation);
    try {
      await exportSurveyAnalysisToExcel(survey, responses);
      const chart = charts.find(item => item.texts.includes('Tỷ lệ theo nhóm (%)'))!;
      expect(chart).toBeDefined();
      expect(chart.texts).toEqual(expect.arrayContaining(['Năm 1 (n=1)', 'Năm 2 (n=1)', 'Năm 3 (n=1)']));
      const barColors = new Set(chart.rectangles.filter(rectangle => rectangle.height > 20 && rectangle.height < 520).map(rectangle => rectangle.color));
      expect(barColors).toEqual(new Set(['#3730A3', '#006591', '#60A5FA']));
      expect(link.click).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
});
