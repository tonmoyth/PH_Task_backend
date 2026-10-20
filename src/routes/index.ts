import express from "express";
import { AuthRoutes } from "../modules/auth/auth.route";
import { SubmissionRoutes } from "../modules/submissions/submissions.route";
import { AdminMentorRoutes } from "../modules/admin/mentors/mentors.route";

const router = express.Router();

const moduleRoutes = [
  {
    path: "/auth",
    route: AuthRoutes,
  },
  {
    path: "/submissions",
    route: SubmissionRoutes,
  },
  {
    path: "/admin/mentors",
    route: AdminMentorRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
