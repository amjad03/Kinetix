// Live Quiz: the game-show quiz on the board (services/api/src/quiz-games). The board runs the
// game over REST; students answer in the Student App over REST and follow it over the realtime
// gateway. The event contract is spelt out in services/api/src/quiz-games/quiz-games.service.ts.

/** `mcq`: 2 to 4 options A–D; `tf`: True / False (options[0] = True). Answers are option indexes. */
export type QuizQuestionKind = 'mcq' | 'tf';
/** Answered in the Student App (scored with the speed bonus) or with a printed answer card (without it). */
export type QuizAnswerSource = 'app' | 'card';
export type QuizGameStatus = 'lobby' | 'question' | 'reveal' | 'finished';

/** Seconds a question stays open. */
export const QUIZ_SECONDS = [10, 20, 30] as const;

/** A question as the teacher set it on the board. */
export interface QuizQuestionInput {
  kind: QuizQuestionKind;
  question: string;
  options: string[];
  /** The right option's index. */
  correct: number;
  seconds: (typeof QUIZ_SECONDS)[number];
}

/** One row of the leaderboard. Ties share a rank. */
export interface QuizStanding {
  studentId: string;
  name: string;
  rollNo: string | null;
  score: number;
  correct: number;
  /** Right answers in a row up to the last revealed question. */
  streak: number;
  rank: number;
}

/** Server → students of the class: a question is open (no right answer in it). */
export interface GameQuestionEvent {
  gameId: string;
  title: string;
  /** 0-based; `count` questions in all. */
  index: number;
  count: number;
  kind: QuizQuestionKind;
  question: string;
  options: string[];
  seconds: number;
  openedAt: string;
  closesAt: string;
  /** The server's clock when sent, so a phone with a wrong clock still counts down right. */
  serverNow: string;
}

/** Server → board: someone answered the open question. */
export interface GameAnsweredEvent {
  gameId: string;
  index: number;
  studentId: string;
  choice: number;
  source: QuizAnswerSource;
  /** Since the question opened (cards: null, they score without the speed bonus). */
  elapsedMs: number | null;
  answered: number;
  classSize: number;
}

/** What one student got for one question (in {@link GameRevealEvent} and the results). */
export interface QuizMyResult {
  answered: boolean;
  choice: number | null;
  correct: boolean;
  points: number;
  score: number;
  rank: number | null;
  streak: number;
}

/** Server → each student of the class (and the board's reveal reply, without `me`): the right answer. */
export interface GameRevealEvent {
  gameId: string;
  index: number;
  count: number;
  correct: number;
  /** How many chose each option. */
  tally: number[];
  answered: number;
  classSize: number;
  leaderboard: QuizStanding[];
  /** Sent to a student: their own result. */
  me?: QuizMyResult;
}

/** Server → each student of the class: the game is over (`cancelled` when the board ended it early with nothing revealed). */
export interface GameEndedEvent {
  gameId: string;
  podium: QuizStanding[];
  cancelled: boolean;
  me?: { score: number; rank: number | null; correct: number; count: number };
}

/** A game as the board and the teacher see it. */
export interface QuizGameView {
  id: string;
  title: string;
  status: QuizGameStatus;
  /** The open or last revealed question, -1 before the first. */
  index: number;
  count: number;
  cards: boolean;
  questions: (QuizQuestionInput & { tally?: number[] })[];
  openedAt: string | null;
  closesAt: string | null;
  createdAt: string;
  finishedAt: string | null;
  sectionId: string;
  subject: string | null;
  teacher: string;
  classSize: number;
  answered: number;
  leaderboard: QuizStanding[];
}

/** The game open in a student's class, to rejoin (GET /v1/student/quiz-game). */
export interface StudentQuizGame {
  game: GameQuestionEvent | null;
  status: QuizGameStatus | null;
  myChoice: number | null;
  score: number;
}
