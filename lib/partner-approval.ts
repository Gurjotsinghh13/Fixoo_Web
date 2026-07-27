export const PARTNER_APPLICATION_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
] as const;

export type PartnerApplicationStatus =
  (typeof PARTNER_APPLICATION_STATUSES)[number];

type PartnerApprovalRecord = {
  applicationStatus: string;
  isApproved: boolean;
  isSuspended: boolean;
};

export function normalizePartnerApplicationStatus(
  status: string | null | undefined
): PartnerApplicationStatus {
  return PARTNER_APPLICATION_STATUSES.includes(
    status as PartnerApplicationStatus
  )
    ? (status as PartnerApplicationStatus)
    : "PENDING";
}

export function canPartnerParticipate(partner: PartnerApprovalRecord) {
  return (
    normalizePartnerApplicationStatus(partner.applicationStatus) === "APPROVED" &&
    partner.isApproved &&
    !partner.isSuspended
  );
}

export const APPROVED_PARTNER_WHERE = {
  applicationStatus: "APPROVED",
  isApproved: true,
  isSuspended: false,
} as const;
