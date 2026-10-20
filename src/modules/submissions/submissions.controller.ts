import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../shared/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { SubmissionsService } from "./submissions.service";

// 1. Create a submission
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

// 2. Get my submissions (paginated)
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

// 3. Get my submission details by ID
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

// 4. Edit and resubmit a submission
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

// 5. Withdraw a pending submission
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

export const SubmissionsController = {
  createSubmission,
  getMySubmissions,
  getMySubmissionById,
  updateAndResubmit,
  withdrawSubmission,
};
