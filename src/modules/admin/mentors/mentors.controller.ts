import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../../shared/catchAsync";
import sendResponse from "../../../utils/sendResponse";
import { AdminMentorService } from "./mentors.service";

// 1. POST /admin/mentors — Create Mentor
const createMentor = catchAsync(async (req: Request, res: Response) => {
  const adminUserId = req.user.id;
  const result = await AdminMentorService.createMentor(adminUserId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Mentor created successfully",
    data: result,
  });
});

// 2. GET /admin/mentors — List Mentors
const listMentors = catchAsync(async (req: Request, res: Response) => {
  const result = await AdminMentorService.listMentors(req.query as any);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Mentors retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// 3. GET /admin/mentors/:id — Mentor Details
const getMentorById = catchAsync(async (req: Request, res: Response) => {
  const mentorId = req.params.id as string;
  const result = await AdminMentorService.getMentorById(mentorId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Mentor details retrieved successfully",
    data: result,
  });
});

// 4. PATCH /admin/mentors/:id — Update Mentor
const updateMentor = catchAsync(async (req: Request, res: Response) => {
  const mentorId = req.params.id as string;
  const result = await AdminMentorService.updateMentor(mentorId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Mentor updated successfully",
    data: result,
  });
});

// 5. POST /admin/mentors/:id/reset-password — Reset Mentor Password
const resetMentorPassword = catchAsync(async (req: Request, res: Response) => {
  const mentorId = req.params.id as string;
  const result = await AdminMentorService.resetMentorPassword(mentorId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully. New temporary credentials sent to mentor's email.",
    data: result,
  });
});

export const AdminMentorController = {
  createMentor,
  listMentors,
  getMentorById,
  updateMentor,
  resetMentorPassword,
};
