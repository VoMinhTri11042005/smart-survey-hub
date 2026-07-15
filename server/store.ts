/**
 * In-Memory Data Store
 * Lưu trữ surveys và responses trong bộ nhớ.
 * Có thể thay thế bằng database (MongoDB, PostgreSQL) trong tương lai.
 */

import fs from 'fs';
import path from 'path';

export interface StoredSurvey {
  id: string;
  title: string;
  description: string;
  questions: any[];
  createdAt: string;
  status: 'draft' | 'live' | 'closed';
}

export interface StoredResponse {
  id: string;
  surveyId: string;
  answers: Record<string, any>;
  submittedAt: string;
}

export interface StoredTeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  joinedAt: string;
}

const DB_FILE = path.join(process.cwd(), '.data.json');

let surveysData: Record<string, StoredSurvey> = {};
let responsesData: Record<string, StoredResponse[]> = {};
let teamsData: Record<string, StoredTeamMember> = {};

try {
  if (fs.existsSync(DB_FILE)) {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    surveysData = data.surveys || {};
    responsesData = data.responses || {};
    teamsData = data.teams || {};
  }
} catch (e) {
  console.error('Failed to read db file', e);
}

const saveDb = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify({ surveys: surveysData, responses: responsesData, teams: teamsData }, null, 2));
  } catch (e) {
    console.error('Failed to save db file', e);
  }
};

export const surveys = {
  get: (id: string) => surveysData[id],
  set: (id: string, survey: StoredSurvey) => { surveysData[id] = survey; saveDb(); },
  has: (id: string) => !!surveysData[id],
  delete: (id: string) => { delete surveysData[id]; saveDb(); },
  values: () => Object.values(surveysData),
};

export const responses = {
  get: (id: string) => responsesData[id] || [],
  set: (id: string, resps: StoredResponse[]) => { responsesData[id] = resps; saveDb(); },
  delete: (id: string) => { delete responsesData[id]; saveDb(); },
};

export const teams = {
  get: (id: string) => teamsData[id],
  set: (id: string, member: StoredTeamMember) => { teamsData[id] = member; saveDb(); },
  has: (id: string) => !!teamsData[id],
  delete: (id: string) => { delete teamsData[id]; saveDb(); },
  values: () => Object.values(teamsData),
  findByEmail: (email: string) => Object.values(teamsData).find(m => m.email.toLowerCase() === email.toLowerCase()),
};

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}
