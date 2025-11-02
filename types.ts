

export interface User {
  id: number;
  username: string;
}

export interface Tag {
  id: number;
  name: string;
  database_id?: number; // Add database_id for scoping DB operations
}

export interface Subscriber {
  id: number;
  email: string;
  name: string;
  subscribed_at: string;
  unsubscribed_at: string | null;
  external_id?: string;
  // This is now populated at runtime from a join table
}

// Fix: Define a reusable type for subscribers that includes their tags.
export type AppSubscriber = Subscriber & { tags: number[] };

export interface Campaign {
  id: number;
  subject: string;
  body: string;
  sent_at: string | null; // Can be null for drafts
  recipient_count: number;
  status: 'Sent' | 'Draft' | 'Sending';
  recipients: number[]; // List of subscriber IDs it was sent to
  target: { // Save targeting criteria for drafts
    tags: number[];
    logic: TagLogic;
  };
}

export interface SocialLink {
  platform: 'Facebook' | 'Twitter' | 'LinkedIn' | 'Instagram' | 'Other';
  url: string;
}

export interface Database {
  id: number;
  name: string;
  description: string;
  // Fix: Use the AppSubscriber type for consistency.
  subscribers: AppSubscriber[]; // App-level type includes tags
  tags: Tag[];
  campaigns: Campaign[];
  // New company profile fields
  logo_base64?: string;
  street?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  county?: string;
  website?: string;
  phone?: string;
  fax_number?: string;
  social_links?: SocialLink[];
  key_contact_name?: string;
  key_contact_phone?: string;
  key_contact_email?: string;
}

export type View = 'DASHBOARD' | 'SUBSCRIBERS' | 'TAGS' | 'COMPOSE' | 'CAMPAIGNS' | 'DATA' | 'ADMIN';

export type TagLogic = 'ANY' | 'ALL' | 'NONE';

// Types for the advanced DataManager
export type TableName = 'Subscribers' | 'Tags' | 'Campaigns' | 'Companies';
export type PivotTarget = 'Subscribers' | 'Tags' | 'Campaigns';

export interface TableView {
  type: 'table';
  name: TableName;
}
export interface PivotView {
  type: 'pivot';
  from: TableName;
  fromId: number;
  fromName: string; 
  to: PivotTarget;
}
export type ViewStackItem = TableView | PivotView;