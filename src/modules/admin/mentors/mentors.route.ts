import express from "express";
import { checkAuth } from "../../../middlewares/checkAuth";
import validateRequest from "../../../middlewares/validateRequest";
import { AdminMentorValidation } from "./mentors.validation";
import { AdminMentorController } from "./mentors.controller";
import { Role } from "../../../generated/prisma/enums";

const router = express.Router();

// 1. POST /admin/mentors — Create Mentor
router.post(
  "/",
  checkAuth(Role.ADMIN),
  validateRequest(AdminMentorValidation.createMentorZodSchema),
  AdminMentorController.createMentor,
);

// 2. GET /admin/mentors — List Mentors
router.get(
  "/",
  checkAuth(Role.ADMIN),
  validateRequest(AdminMentorValidation.listMentorsQueryZodSchema),
  AdminMentorController.listMentors,
);

// 3. GET /admin/mentors/:id — Mentor Details
router.get(
  "/:id",
  checkAuth(Role.ADMIN),
  validateRequest(AdminMentorValidation.mentorIdParamZodSchema),
  AdminMentorController.getMentorById,
);

// 4. PATCH /admin/mentors/:id — Update Mentor
router.patch(
  "/:id",
  checkAuth(Role.ADMIN),
  validateRequest(AdminMentorValidation.updateMentorZodSchema),
  AdminMentorController.updateMentor,
);

// 5. POST /admin/mentors/:id/reset-password — Reset Mentor Password
router.post(
  "/:id/reset-password",
  checkAuth(Role.ADMIN),
  validateRequest(AdminMentorValidation.resetPasswordZodSchema),
  AdminMentorController.resetMentorPassword,
);

export const AdminMentorRoutes = router;
