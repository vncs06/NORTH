export interface CurrentActor {
  id: string;
  name: string;
  role: 'MANAGER' | 'EMPLOYEE';
  sessionId: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
