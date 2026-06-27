export interface Notification {
  id: number;
  type: string;
  message: string;
  related_user_id: number | null;
  acted_by_admin_id: number | null;
  is_read: boolean;
  created_at: string;
}
