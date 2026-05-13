/**
 * Notification copy constants — Stage 34.
 * T3 self-resolve: pinned defaults per C-C-D-V; production copy may be revised in v1.1.
 */

interface NotificationCopy {
  title: string;
  body: string;
  link: string | null;
}

export function getNotificationCopy(
  type: string,
  _payload: Record<string, unknown>,
): NotificationCopy {
  if (type === 'assignment_assigned') {
    return { title: 'New Assignment', body: 'You have a new assignment.', link: '/assignments' };
  }
  if (type === 'plan_updated') {
    return {
      title: 'Your Learning Plan Updated',
      body: 'Your weekly learning plan has been updated.',
      link: '/',
    };
  }
  if (type === 'intervention_alert') {
    return {
      title: 'Student Alert',
      body: 'A student may need attention.',
      link: '/teacher#alerts',
    };
  }
  if (type === 'access_downgraded') {
    return {
      title: 'Your subscription has ended',
      body: "Your MindMosaic plan has ended. You're now on the free plan.",
      link: '/billing',
    };
  }
  return { title: 'Notification', body: 'You have a new notification.', link: null };
}
