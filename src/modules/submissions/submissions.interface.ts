import { SubmissionStatus } from "../../generated/prisma/enums";

export interface ICreateSubmissionPayload {
  projectName: string;
  repoUrl: string;
  liveLink: string;
  description: string;
}

export interface IUpdateSubmissionPayload {
  projectName?: string;
  repoUrl?: string;
  liveLink?: string;
  description?: string;
}

export interface IReviewSubmissionPayload {
  status: SubmissionStatus;
  reason?: string;
}

export interface ISubmissionStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface IGetAllSubmissionsQuery {
  page?: string;
  limit?: string;
  status?: SubmissionStatus;
  search?: string;
  searchTerm?: string;
  sort?: string;
  sortBy?: string;
  order?: "asc" | "desc";
  sortOrder?: "asc" | "desc";
}
