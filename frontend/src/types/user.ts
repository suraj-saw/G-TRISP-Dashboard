/**
 * @file user.ts
 * @description Type definitions for authenticated users.
 * @responsibility Defines the structure of the user session object, including RBAC (Role-Based Access Control) properties and approval status.
 */

/**
 * Interface representing a user in the system
 * 
 * @property {number} id - Unique primary key for the user
 * @property {string} username - Display name of the user
 * @property {string} email - Contact email for the user
 * @property {string} role - Authorization role (e.g., 'admin', 'user')
 * @property {"pending" | "approved" | "rejected"} status - Account approval status
 * @property {string} [created_at] - ISO timestamp of account creation
 * @property {string} [avatar] - URL or path to user's avatar image
 */
export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  status: "pending" | "approved" | "rejected";
  created_at?: string;
  avatar?: string;
}
