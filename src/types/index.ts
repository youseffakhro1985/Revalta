export interface User {
  id: string;
  email: string;
  name?: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'ÖPPEN' | 'PÅGÅENDE' | 'STÄNGD';
  user_id: string;
  created_at: string;
}
