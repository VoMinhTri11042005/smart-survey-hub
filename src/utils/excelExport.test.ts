import { describe, expect, it } from 'vitest';
import type { Survey, SurveyResponse } from '../types';
import { createSurveyAnalysisWorkbook } from './excelExport';

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
});
