-- Stage 46: access_downgraded notification type for subscription expiry (Q-46.1).
-- ALTER TYPE ... ADD VALUE is non-transactional; deferred-validation per deployment.md.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'access_downgraded';
