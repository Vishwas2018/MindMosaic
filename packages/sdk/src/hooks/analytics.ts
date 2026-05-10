// hooks/analytics.ts → analytics-svc (ADR-0029 prefix: /analytics-svc/analytics/...)
// Stage 37: Screen 18 — teacher dashboard KPIs, intervention alerts, dismiss/acknowledge.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useMmClient } from '../context.js';
import { mmKeys } from '../keys.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const InterventionAlertSchema = z.object({
  id: z.string(),
  student_id: z.string(),
  alert_type: z.string(),
  severity: z.string(),
  status: z.string(),
  detail: z.unknown(),
  created_at: z.string(),
});
const ClassKpiSchema = z.object({
  active_students: z.number(),
  avg_class_score: z.number().nullable(),
  sessions_this_week: z.number(),
  assignments_active: z.number(),
  computed_at: z.string(),
  stale_since: z.null(),
});
export type InterventionAlert = z.infer<typeof InterventionAlertSchema>;
export type ClassKpiDTO = z.infer<typeof ClassKpiSchema>;

// ── Hooks ────────────────────────────────────────────────────────────────────

// Screen 18 Block 3: active intervention alerts for a class.
// jsonOk sends the array directly as the response body — schema = z.array.
export function useInterventionAlerts(classId: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.analytics.interventionAlerts(classId),
    queryFn: () =>
      client
        .get(
          `/analytics-svc/analytics/intervention-alerts?class_id=${encodeURIComponent(classId)}`,
          z.array(InterventionAlertSchema),
        )
        .then((r) => r.data),
    enabled: classId.length > 0,
  });
}

// Screen 18 Block 2: 4-stat class KPI strip.
// jsonOk sends ClassKpiDTO directly as the response body.
// ISSUE-0028: trend sparkline absent v1; static last-score shown.
export function useClassKpi(classId: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.analytics.classKpi(classId),
    queryFn: () =>
      client
        .get(
          `/analytics-svc/analytics/class-kpi/${encodeURIComponent(classId)}`,
          ClassKpiSchema,
        )
        .then((r) => r.data),
    enabled: classId.length > 0,
  });
}

// Screen 18 Block 3: dismiss or acknowledge an intervention alert.
export function useDismissAlert() {
  const client = useMmClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      alertId,
      action,
    }: {
      alertId: string;
      action: 'dismiss' | 'acknowledge';
    }) => {
      const body = action === 'dismiss' ? { dismissed: true } : { acknowledged: true };
      return client
        .patch(
          `/analytics-svc/analytics/intervention-alerts/${encodeURIComponent(alertId)}`,
          InterventionAlertSchema,
          body,
        )
        .then((r) => r.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mmKeys.analytics.all() });
    },
  });
}
