import { NotificationsListSchema } from '@mm/types';
import type { MmClient } from './client.js';

/**
 * Get the count of unread notifications for the authenticated user.
 * Calls GET /notifications-svc/notifications/me?unread=true.
 * Returns 0 on error (Bell component degrades gracefully).
 */
export async function getUnreadCount(client: MmClient): Promise<number> {
  try {
    const result = await client.get(
      '/notifications-svc/notifications/me?unread=true',
      NotificationsListSchema,
    );
    return result.data.length;
  } catch {
    return 0;
  }
}
