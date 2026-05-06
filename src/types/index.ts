export interface User {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
  status?: string;
  company_id?: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'new' | 'received' | 'in_progress' | 'waiting' | 'completed' | 'closed';
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  user_id: string;
  property_id?: string | null;
  assigned_to_id?: string | null;
  created_at: string;
  updated_at?: string;
  property?: Property | null;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  postal_code?: string | null;
  city: string;
  user_id: string;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  org_number?: string | null;
  plan: string;
  status: string;
  created_at: string;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}
