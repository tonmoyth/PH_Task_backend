import express from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import validateRequest from "../../middlewares/validateRequest";
import { submissionRateLimiter } from "../../middlewares/rateLimiter";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsValidation } from "./submissions.validation";
import { Role } from "../../generated/prisma/enums";

const router = express.Router();

// =========================================================================
// STUDENT SUBMISSION ROUTES
// =========================================================================

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

// =========================================================================
// MENTOR / ADMIN DASHBOARD ROUTES
// (Static routes like /stats registered BEFORE dynamic /:id to prevent routing collisions)
// =========================================================================

// A. List all submissions (GET /api/v1/submissions)
router.get(
  "/",
  checkAuth(Role.MENTOR, Role.ADMIN),
  validateRequest(SubmissionsValidation.getAllSubmissionsQueryZodSchema),
  SubmissionsController.getAllSubmissions,
);

// B. Overall submission statistics (GET /api/v1/submissions/stats)
router.get(
  "/stats",
  checkAuth(Role.MENTOR, Role.ADMIN),
  SubmissionsController.getSubmissionStats,
);

// C. Get submission details by ID (GET /api/v1/submissions/:id)
router.get(
  "/:id",
  checkAuth(Role.MENTOR, Role.ADMIN),
  validateRequest(SubmissionsValidation.submissionIdParamZodSchema),
  SubmissionsController.getSubmissionById,
);

// D. Review a submission (PATCH /api/v1/submissions/:id/review
router.patch(
  "/:id/review",
  checkAuth(Role.MENTOR, Role.ADMIN),
  validateRequest(SubmissionsValidation.reviewSubmissionZodSchema),
  SubmissionsController.reviewSubmission,
);

// E. Review history for a submission (GET /api/v1/submissions/:id/history)
router.get(
  "/:id/history",
  checkAuth(Role.MENTOR, Role.ADMIN),
  validateRequest(SubmissionsValidation.submissionIdParamZodSchema),
  SubmissionsController.getSubmissionHistory,
);

export const SubmissionRoutes = router;
