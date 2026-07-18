/**
 * @file notification.ts
 * @description Type definitions for system notifications.
 * @responsibility Defines the data shape for admin alerts, such as new user registrations or system events.
 */

/**
 * Interface representing a notification in the system
 * 
 * @property {number} id - Unique identifier for the notification
 * @property {string} type - Category of notification (e.g., "registration_request")
 * @property {string} message - Human-readable notification content
 * @property {number | null} related_user_id - ID of the user this notification pertains to (if applicable)
 * @property {number | null} acted_by_admin_id - ID of the admin who resolved/acted on this notification
 * @property {boolean} is_read - Whether the notification has been acknowledged by an admin
 * @property {string} created_at - ISO timestamp of creation
 */
export interface Notification {
  id: number;
  type: string;
  message: string;
  related_user_id: number | null;
  acted_by_admin_id: number | null;
  is_read: boolean;
  created_at: string;
}
