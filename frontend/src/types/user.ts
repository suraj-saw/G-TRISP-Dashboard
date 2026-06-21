export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  status: "pending" | "approved" | "rejected";
  created_at?: string;
  avatar?: string;
}
