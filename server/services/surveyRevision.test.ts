import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSurvey, getResponses, submitResponse, updateSurvey } from './survey.service';

describe('survey revisions in the development store', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('rejects a stale form and records a snapshot only for the version actually shown', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const survey = await createSurvey({
      title: 'Bản gốc', status: 'live', sections: [],
      questions: [{ id: 'q1', type: 'text', text: 'Nội dung cũ', required: true }],
    });
    const firstRevision = survey.surveyRevision;
    const first = await submitResponse(survey.id, {
      respondentId: 'device-one-attempt-1', answers: { q1: 'Trả lời cũ' }, surveyRevision: firstRevision,
    });
    expect(first?.surveySnapshot?.questions[0].text).toBe('Nội dung cũ');

    const edited = await updateSurvey(survey.id, {
      questions: [{ id: 'q1', type: 'text', text: 'Nội dung mới', required: true }],
    });
    expect(edited?.surveyRevision).not.toBe(firstRevision);
    await expect(submitResponse(survey.id, {
      respondentId: 'device-two-attempt-1', answers: { q1: 'Trả lời khác' }, surveyRevision: firstRevision,
    })).rejects.toMatchObject({ status: 409 });
    expect(await getResponses(survey.id)).toHaveLength(1);

    const current = await submitResponse(survey.id, {
      respondentId: 'device-three-attempt-1', answers: { q1: 'Trả lời mới' }, surveyRevision: edited?.surveyRevision,
    });
    expect(current?.surveySnapshot?.questions[0].text).toBe('Nội dung mới');
    expect(first?.surveySnapshot?.questions[0].text).toBe('Nội dung cũ');
  });

  it('preserves old clients without falsely claiming a verified questionnaire version', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const survey = await createSurvey({
      title: 'Tương thích', status: 'live', sections: [],
      questions: [{ id: 'q1', type: 'text', text: 'Câu hỏi', required: true }],
    });
    const response = await submitResponse(survey.id, {
      respondentId: 'device-legacy-attempt-1', answers: { q1: 'Câu trả lời' },
    });
    expect(response?.answers).toEqual({ q1: 'Câu trả lời' });
    expect(response?.surveySnapshot).toBeNull();
  });
});
