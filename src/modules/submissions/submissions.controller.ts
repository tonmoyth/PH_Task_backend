import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../shared/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { SubmissionsService } from "./submissions.service";

// 1. Create a submission (Student)
const createSubmission = catchAsync(async (req: Request, res: Response) => {
  const studentId = req.user.id;
  const result = await SubmissionsService.createSubmission(
    studentId,
    req.body,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Submission created successfully",
    data: result,
  });
});

// 2. Get my submissions (paginated) (Student)
const getMySubmissions = catchAsync(async (req: Request, res: Response) => {
  const studentId = req.user.id;
  const result = await SubmissionsService.getMySubmissions(
    studentId,
    req.query as any,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My submissions retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// 3. Get my submission details by ID (Student)
const getMySubmissionById = catchAsync(async (req: Request, res: Response) => {
  const studentId = req.user.id;
  const submissionId = req.params.id as string;
  const result = await SubmissionsService.getMySubmissionById(
    studentId,
    submissionId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Submission retrieved successfully",
    data: result,
  });
});

// 4. Edit and resubmit a submission (Student)
const updateAndResubmit = catchAsync(async (req: Request, res: Response) => {
  const studentId = req.user.id;
  const submissionId = req.params.id as string;
  const result = await SubmissionsService.updateAndResubmit(
    studentId,
    submissionId,
    req.body,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Submission updated and resubmitted successfully",
    data: result,
  });
});

// 5. Withdraw a pending submission (Student)
const withdrawSubmission = catchAsync(async (req: Request, res: Response) => {
  const studentId = req.user.id;
  const submissionId = req.params.id as string;
  await SubmissionsService.withdrawSubmission(studentId, submissionId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Submission withdrawn successfully",
    data: null,
  });
});

// =========================================================================
// MENTOR / ADMIN DASHBOARD CONTROLLERS
// =========================================================================

// A. List all submissions (Mentor / Admin)
const getAllSubmissions = catchAsync(async (req: Request, res: Response) => {
  const result = await SubmissionsService.getAllSubmissions(req.query as any);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Submissions retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// B. Overall submission statistics (Mentor / Admin)
const getSubmissionStats = catchAsync(async (req: Request, res: Response) => {
  const result = await SubmissionsService.getSubmissionStats();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Submission statistics retrieved successfully",
    data: result,
  });
});

// C. Get submission details by ID (Mentor / Admin)
const getSubmissionById = catchAsync(async (req: Request, res: Response) => {
  const submissionId = req.params.id as string;
  const result = await SubmissionsService.getSubmissionById(submissionId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Submission details retrieved successfully",
    data: result,
  });
});

// D. Review submission (Mentor / Admin)
const reviewSubmission = catchAsync(async (req: Request, res: Response) => {
  const reviewerId = req.user.id;
  const submissionId = req.params.id as string;
  const result = await SubmissionsService.reviewSubmission(
    reviewerId,
    submissionId,
    req.body,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Submission reviewed successfully",
    data: result,
  });
});





// E. Review history for a submission (Mentor / Admin)
const getSubmissionHistory = catchAsync(async (req: Request, res: Response) => {
  const submissionId = req.params.id as string;
  const result = await SubmissionsService.getSubmissionHistory(submissionId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Submission review history retrieved successfully",
    data: result,
  });
});

export const SubmissionsController = {
  createSubmission,
  getMySubmissions,
  getMySubmissionById,
  updateAndResubmit,
  withdrawSubmission,
  getAllSubmissions,
  getSubmissionStats,
  getSubmissionById,
  reviewSubmission,
  getSubmissionHistory,
};
