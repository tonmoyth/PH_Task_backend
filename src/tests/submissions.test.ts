import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import app from "../app";
import { prisma } from "../lib/prisma";
import { tokenUtils } from "../utils/token";

describe("Student Submission Module - Complete Test Suite", () => {
  let server: http.Server;
  let baseUrl: string;

  let studentA: { id: string; email: string };
  let studentB: { id: string; email: string };
  let mentor: { id: string; email: string };

  let tokenStudentA: string;
  let tokenStudentB: string;
  let tokenMentor: string;

  let submissionA1Id: string;
  let submissionA2Id: string;

  before(async () => {
    // Start ephemeral test server
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://localhost:${addr.port}/api/v1`;

    const timestamp = Date.now();

    // Create test student A
    studentA = await prisma.user.create({
      data: {
        id: `test-student-a-${timestamp}`,
        name: "Test Student A",
        email: `student.a.${timestamp}@example.com`,
        role: "STUDENT",
      },
    });
    tokenStudentA = tokenUtils.getToken({
      id: studentA.id,
      email: studentA.email,
      role: "STUDENT",
    });

    // Create test student B
    studentB = await prisma.user.create({
      data: {
        id: `test-student-b-${timestamp}`,
        name: "Test Student B",
        email: `student.b.${timestamp}@example.com`,
        role: "STUDENT",
      },
    });
    tokenStudentB = tokenUtils.getToken({
      id: studentB.id,
      email: studentB.email,
      role: "STUDENT",
    });

    // Create test mentor (for role checks)
    mentor = await prisma.user.create({
      data: {
        id: `test-mentor-${timestamp}`,
        name: "Test Mentor",
        email: `mentor.${timestamp}@example.com`,
        role: "MENTOR",
      },
    });
    tokenMentor = tokenUtils.getToken({
      id: mentor.id,
      email: mentor.email,
      role: "MENTOR",
    });
  });

  after(async () => {
    // Cleanup test data
    if (studentA) {
      await prisma.submission.deleteMany({ where: { studentId: studentA.id } });
      await prisma.user.delete({ where: { id: studentA.id } }).catch(() => {});
    }
    if (studentB) {
      await prisma.submission.deleteMany({ where: { studentId: studentB.id } });
      await prisma.user.delete({ where: { id: studentB.id } }).catch(() => {});
    }
    if (mentor) {
      await prisma.user.delete({ where: { id: mentor.id } }).catch(() => {});
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ==========================================
  // 1. POST /submissions (Create Submission)
  // ==========================================

  test("1. Reject unauthenticated submission request with 401", async () => {
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "My Project",
        repoUrl: "https://github.com/facebook/react",
        liveLink: "https://react.dev",
        description: "A JavaScript library for building user interfaces.",
      }),
    });

    assert.strictEqual(res.status, 401);
  });

  test("2. Reject non-STUDENT role with 403 Forbidden", async () => {
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenMentor}`,
      },
      body: JSON.stringify({
        projectName: "My Project",
        repoUrl: "https://github.com/facebook/react",
        liveLink: "https://react.dev",
        description: "A JavaScript library for building user interfaces.",
      }),
    });

    assert.strictEqual(res.status, 403);
  });

  test("3. Reject missing or empty required fields with 400", async () => {
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        projectName: " ",
        repoUrl: "",
        liveLink: "",
        description: "Short",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  test("4. Reject non-GitHub repository URLs with 400", async () => {
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        projectName: "GitLab Project",
        repoUrl: "https://gitlab.com/owner/repo",
        liveLink: "https://my-live-project.com",
        description: "Valid description for testing with non-github url.",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(
      data.message.includes("Validation") ||
        JSON.stringify(data).toLowerCase().includes("github"),
    );
  });

  test("5. Reject invalid live link URL with 400", async () => {
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        projectName: "Project With Bad Live URL",
        repoUrl: "https://github.com/owner/valid-repo",
        liveLink: "ftp://invalid-protocol.com",
        description: "Valid description for testing with invalid live link.",
      }),
    });

    assert.strictEqual(res.status, 400);
  });

  test("6. Reject unexpected privileged fields (status, studentId) with 400", async () => {
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        projectName: "Hacked Project",
        repoUrl: "https://github.com/owner/hacked-repo",
        liveLink: "https://live.com",
        description: "Trying to force approved status directly.",
        status: "APPROVED",
        studentId: "other-user-id",
        resubmitCount: 5,
      }),
    });

    assert.strictEqual(res.status, 400);
  });

  test("7. Valid student submission succeeds with 201, sets PENDING and resubmitCount: 0", async () => {
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        projectName: "Awesome Portfolio",
        repoUrl: "https://github.com/student-a/portfolio.git/",
        liveLink: "https://student-a.portfolio.dev/",
        description: "A modern developer portfolio website built with React and Tailwind CSS.",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, "PENDING");
    assert.strictEqual(data.data.resubmitCount, 0);
    assert.strictEqual(data.data.studentId, studentA.id);
    submissionA1Id = data.data.id;
  });

  test("8. Duplicate repository submission by the same student returns 409 Conflict", async () => {
    // Send same repo with slight variations in casing/slashes/extension
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        projectName: "Duplicate Submission",
        repoUrl: "https://github.com/STUDENT-A/Portfolio",
        liveLink: "https://student-a.portfolio.dev",
        description: "Trying to submit the exact same repo again.",
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.message, /already submitted/i);
  });

  test("9. Another student CAN submit the same repo (per-student uniqueness)", async () => {
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentB}`,
      },
      body: JSON.stringify({
        projectName: "Student B Fork",
        repoUrl: "https://github.com/student-a/portfolio",
        liveLink: "https://student-b.portfolio.dev",
        description: "Student B submitted their own submission with the same repo.",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.studentId, studentB.id);
  });

  // ==========================================
  // 2. GET /submissions/mine (Get My Submissions)
  // ==========================================

  test("10. GET /submissions/mine returns only Student A's submissions with QueryBuilder pagination", async () => {
    // Create another submission for Student A
    const res2 = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        projectName: "E-Commerce App",
        repoUrl: "https://github.com/student-a/ecommerce-app",
        liveLink: "https://ecommerce.dev",
        description: "A full-featured e-commerce platform with Stripe payment.",
      }),
    });
    const data2 = await res2.json();
    submissionA2Id = data2.data.id;

    // Fetch submissions for Student A
    const res = await fetch(`${baseUrl}/submissions/mine?page=1&limit=10`, {
      headers: {
        Authorization: `Bearer ${tokenStudentA}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.strictEqual(data.data.length, 2);
    assert.strictEqual(data.meta.total, 2);
    assert.strictEqual(data.meta.page, 1);

    // Verify all returned records belong to Student A
    for (const sub of data.data) {
      assert.strictEqual(sub.studentId, studentA.id);
    }
  });

  test("11. GET /submissions/mine?status=PENDING filters correctly", async () => {
    const res = await fetch(`${baseUrl}/submissions/mine?status=PENDING`, {
      headers: {
        Authorization: `Bearer ${tokenStudentA}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    for (const sub of data.data) {
      assert.strictEqual(sub.status, "PENDING");
    }
  });

  // ==========================================
  // 3. GET /submissions/mine/:id (Submission Details)
  // ==========================================

  test("12. Owner can retrieve their own submission details by ID", async () => {
    const res = await fetch(`${baseUrl}/submissions/mine/${submissionA1Id}`, {
      headers: {
        Authorization: `Bearer ${tokenStudentA}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.id, submissionA1Id);
    assert.strictEqual(data.data.projectName, "Awesome Portfolio");
  });

  test("13. Student B receives 404 when requesting Student A's submission", async () => {
    const res = await fetch(`${baseUrl}/submissions/mine/${submissionA1Id}`, {
      headers: {
        Authorization: `Bearer ${tokenStudentB}`,
      },
    });

    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.message, /not found/i);
  });

  test("14. Non-existent submission ID returns 404", async () => {
    const res = await fetch(`${baseUrl}/submissions/mine/non-existent-cuid-12345`, {
      headers: {
        Authorization: `Bearer ${tokenStudentA}`,
      },
    });

    assert.strictEqual(res.status, 404);
  });

  // ==========================================
  // 4. PATCH /submissions/mine/:id (Edit & Resubmit)
  // ==========================================

  test("15. Editing a PENDING submission updates fields, resets status and increments resubmitCount", async () => {
    const res = await fetch(`${baseUrl}/submissions/mine/${submissionA1Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        projectName: "Awesome Portfolio v2",
        description: "Updated description after fixing feedback issues.",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.projectName, "Awesome Portfolio v2");
    assert.strictEqual(data.data.status, "PENDING");
    assert.strictEqual(data.data.resubmitCount, 1);
  });

  test("16. Editing a REJECTED submission resets status to PENDING and clears rejectionReason", async () => {
    // Manually set submissionA2 to REJECTED with a reason
    await prisma.submission.update({
      where: { id: submissionA2Id },
      data: {
        status: "REJECTED",
        rejectionReason: "Missing responsive design and unit tests.",
      },
    });

    const res = await fetch(`${baseUrl}/submissions/mine/${submissionA2Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        description: "Fixed responsive issues and added comprehensive tests.",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, "PENDING");
    assert.strictEqual(data.data.rejectionReason, null);
    assert.strictEqual(data.data.resubmitCount, 1);
  });

  test("17. Reject editing an APPROVED submission with 400 Bad Request", async () => {
    // Manually set submissionA2 to APPROVED
    await prisma.submission.update({
      where: { id: submissionA2Id },
      data: {
        status: "APPROVED",
      },
    });

    const res = await fetch(`${baseUrl}/submissions/mine/${submissionA2Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        projectName: "Trying to edit approved project",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.message, /cannot edit.*APPROVED/i);
  });

  test("18. Duplicate repo update collision with another submission returns 409", async () => {
    // Attempt to change submissionA1's repo to submissionA2's repo
    const res = await fetch(`${baseUrl}/submissions/mine/${submissionA1Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentA}`,
      },
      body: JSON.stringify({
        repoUrl: "https://github.com/student-a/ecommerce-app",
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.message, /already submitted/i);
  });

  test("19. Student B editing Student A's submission returns 404", async () => {
    const res = await fetch(`${baseUrl}/submissions/mine/${submissionA1Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudentB}`,
      },
      body: JSON.stringify({
        projectName: "Unauthorized Edit",
      }),
    });

    assert.strictEqual(res.status, 404);
  });

  // ==========================================
  // 5. DELETE /submissions/mine/:id (Withdraw Submission)
  // ==========================================

  test("20. Reject withdrawing an APPROVED submission with 400", async () => {
    const res = await fetch(`${baseUrl}/submissions/mine/${submissionA2Id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenStudentA}`,
      },
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.message, /cannot withdraw.*APPROVED/i);
  });

  test("21. Student B cannot withdraw Student A's submission (returns 404)", async () => {
    const res = await fetch(`${baseUrl}/submissions/mine/${submissionA1Id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenStudentB}`,
      },
    });

    assert.strictEqual(res.status, 404);
  });

  test("22. Owner can withdraw their PENDING submission successfully", async () => {
    const res = await fetch(`${baseUrl}/submissions/mine/${submissionA1Id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenStudentA}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.match(data.message, /withdrawn successfully/i);

    // Verify record is gone from DB
    const check = await prisma.submission.findUnique({
      where: { id: submissionA1Id },
    });
    assert.strictEqual(check, null);
  });
});
