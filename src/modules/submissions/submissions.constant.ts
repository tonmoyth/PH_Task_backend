export const SUBMISSIONS_STATS_CACHE_KEY = "submissions:stats";

export const submissionSearchableFields = [
  "projectName",
  "repoUrl",
  "student.name",
  "student.email",
];

export const submissionFilterableFields = ["status"];

export const allowedSortFields = [
  "createdAt",
  "updatedAt",
  "projectName",
  "status",
  "resubmitCount",
  "reviewedAt",
] as const;

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 100;
export const STATS_CACHE_TTL_SECONDS = 3600; // 1 hour
