export interface ICreateMentorPayload {
  name: string;
  email: string;
}

export interface IUpdateMentorPayload {
  name?: string;
  isActive?: boolean;
}

export interface IMentorResponse {
  id: string;
  name: string;
  email: string;
  role: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMentorDetailResponse extends IMentorResponse {
  totalReviews: number;
}
