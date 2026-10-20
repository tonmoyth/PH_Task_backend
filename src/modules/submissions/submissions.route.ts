import express from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import validateRequest from "../../middlewares/validateRequest";
import { submissionRateLimiter } from "../../middlewares/rateLimiter";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsValidation } from "./submissions.validation";
import { Role } from "../../generated/prisma/enums";

const router = express.Router();

// 1. Create a submission (POST /api/v1/submissions)
router.post(
  "/",
  checkAuth(Role.STUDENT),
  submissionRateLimiter,
  validateRequest(SubmissionsValidation.createSubmissionZodSchema),
  SubmissionsController.createSubmission,
);

// 2. Get my submissions (GET /api/v1/submissions/mine)
router.get(
  "/mine",
  checkAuth(Role.STUDENT),
  validateRequest(SubmissionsValidation.getMySubmissionsQueryZodSchema),
  SubmissionsController.getMySubmissions,
);

// 3. Get my submission details (GET /api/v1/submissions/mine/:id)
router.get(
  "/mine/:id",
  checkAuth(Role.STUDENT),
  validateRequest(SubmissionsValidation.submissionIdParamZodSchema),
  SubmissionsController.getMySubmissionById,
);

// 4. Edit and resubmit a submission (PATCH /api/v1/submissions/mine/:id)
router.patch(
  "/mine/:id",
  checkAuth(Role.STUDENT),
  validateRequest(SubmissionsValidation.updateSubmissionZodSchema),
  SubmissionsController.updateAndResubmit,
);

// 5. Withdraw a pending submission (DELETE /api/v1/submissions/mine/:id)
router.delete(
  "/mine/:id",
  checkAuth(Role.STUDENT),
  validateRequest(SubmissionsValidation.submissionIdParamZodSchema),
  SubmissionsController.withdrawSubmission,
);

export const SubmissionRoutes = router;
