import type {
  DashboardReviewQueueItem,
  DashboardReviewQueueResponse,
} from "../review-queue-card";

export function buildApprovedReviewItem(
  item: DashboardReviewQueueItem,
  approverName: string,
  now: string,
): DashboardReviewQueueItem {
  return {
    ...item,
    status: "in_progress",
    approvedAt: now,
    updatedAt: now,
    approverName,
  };
}

export function applyApprovedReviewToDashboardQueue(
  current: DashboardReviewQueueResponse | undefined,
  item: DashboardReviewQueueItem,
  approverName: string,
  now: string,
): DashboardReviewQueueResponse | undefined {
  if (!current) return current;

  const approvedItem = buildApprovedReviewItem(item, approverName, now);

  return {
    items: current.items.filter(
      (queueItem) => !(queueItem.id === item.id && queueItem.type === item.type),
    ),
    clearedItems: [
      approvedItem,
      ...current.clearedItems.filter(
        (queueItem) => !(queueItem.id === item.id && queueItem.type === item.type),
      ),
    ].slice(0, 20),
  };
}
