export type View = 'dashboard' | 'builder' | 'analytics' | 'respondent' | 'templates' | 'teams' | 'settings';
export type Role = 'admin' | 'user';

export interface UserProfile {
  name: string;
  email: string;
  photoURL: string;
  tagline: string;
}

// ===== Survey Data Model =====

export type QuestionType = 'single_choice' | 'multiple_choice' | 'star_rating' | 'text' | 'nps';

export interface SurveyQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  required: boolean;
  correctAnswer?: string | string[]; // For quiz mode
}

export interface Survey {
  id: string;
  title: string;
  description: string;
  questions: SurveyQuestion[];
  createdAt: string;
  status: 'draft' | 'live' | 'closed';
  isQuiz?: boolean;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  answers: Record<string, string | string[] | number>;
  score?: number;
  totalQuizQuestions?: number;
  submittedAt: string;
}

// ===== API Types =====

export interface ParseDocxResponse {
  title: string;
  questions: SurveyQuestion[];
}

export interface ChatMessage {
  type: 'user' | 'bot';
  text: string;
}

export interface ChatRequest {
  message: string;
  surveyTitle: string;
  surveyDescription: string;
  questions: SurveyQuestion[];
  currentQuestionIndex?: number;
}

// ===== Template =====

export interface SurveyTemplateData {
  title: string;
  description: string;
  questions: SurveyQuestion[];
}

// ===== Team =====

export type TeamRole = 'admin' | 'editor' | 'viewer';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}
