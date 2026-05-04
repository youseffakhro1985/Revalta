export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'new' | 'received' | 'under_review' | 'planned' | 'in_progress' | 'waiting_material' | 'waiting_external' | 'completed' | 'closed' | 'rejected';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string;
  companyId: string;
  propertyText?: string | null;
  aiCategory?: string | null;
  aiPriority?: string | null;
  aiSummary?: string | null;
  aiRiskScore?: number | null;
  aiRiskLevel?: string | null;
  aiRecommendedAction?: string | null;
  aiReplyDraft?: string | null;
  aiConfidence?: number | null;
  createdAt: string;
}
