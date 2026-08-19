export interface ToeicQuestion {
  id: number;
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  relatedKnowledge: string;
}

export interface ToeicQuizPayload {
  questions: ToeicQuestion[];
}
