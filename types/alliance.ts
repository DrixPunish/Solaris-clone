export type AllianceRole = 'leader' | 'officer' | 'diplomat' | 'member';

export interface Alliance {
  id: string;
  name: string;
  tag: string;
  description: string;
  leader_id: string;
  created_at: string;
}

export interface AllianceMember {
  id: string;
  alliance_id: string;
  user_id: string;
  username: string;
  role: AllianceRole;
  joined_at: string;
}

export interface AllianceMessage {
  id: string;
  alliance_id: string;
  sender_id: string;
  sender_username: string;
  content: string;
  created_at: string;
}

export interface AllianceInvitation {
  id: string;
  alliance_id: string;
  alliance_name: string;
  alliance_tag: string;
  sender_id: string;
  sender_username: string;
  target_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}
