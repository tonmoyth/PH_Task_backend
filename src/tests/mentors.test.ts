import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import app from "../app";
import { prisma } from "../lib/prisma";
import { tokenUtils } from "../utils/token";
import { redis } from "../config/redis";
import { emailService } from "../utils/email.util";
import { verifyPassword } from "better-auth/crypto";
import { auth } from "../lib/auth";

describe("Admin Mentor Management Module - Complete Test Suite", () => {
  let server: http.Server;
  let baseUrl: string;

  let adminUser: { id: string; email: string };
  let studentUser: { id: string; email: string };
  let mentorUser: { id: string; email: string };

  let tokenAdmin: string;
  let tokenStudent: string;
  let tokenMentor: string;

  // Track created mentor IDs for cleanup
  const createdMentorIds: string[] = [];

  // Email delivery mock tracking
  const capturedCredentialsEmails: any[] = [];
  const capturedResetEmails: any[] = [];
  let simulateEmailFailure = false;

  // Save original email service methods
  const originalSendCredentialsEmail = emailService.sendMentorCredentialsEmail;
  const originalSendResetEmail = emailService.sendMentorPasswordResetEmail;

  before(async () => {
    // 1. Mock email delivery so tests never send real emails
    emailService.sendMentorCredentialsEmail = async (payload) => {
      if (simulateEmailFailure) {
        throw new Error("Simulated SMTP network delivery failure");
      }
      capturedCredentialsEmails.push(payload);
    };

    emailService.sendMentorPasswordResetEmail = async (payload) => {
      if (simulateEmailFailure) {
        throw new Error("Simulated SMTP reset delivery failure");
      }
      capturedResetEmails.push(payload);
    };

    // 2. Start ephemeral test server
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://localhost:${addr.port}/api/v1`;

    const timestamp = Date.now();

    // 3. Create test Admin
    adminUser = await prisma.user.create({
      data: {
        id: `test-admin-${timestamp}`,
        name: "Test System Admin",
        email: `admin.test.${timestamp}@example.com`,
        role: "ADMIN",
        isActive: true,
      },
    });
    tokenAdmin = tokenUtils.getToken({
      id: adminUser.id,
      email: adminUser.email,
      role: "ADMIN",
    });

    // 4. Create test Student (for forbidden checks)
    studentUser = await prisma.user.create({
      data: {
        id: `test-student-${timestamp}`,
        name: "Test Student Normal",
        email: `student.test.${timestamp}@example.com`,
        role: "STUDENT",
        isActive: true,
      },
    });
    tokenStudent = tokenUtils.getToken({
      id: studentUser.id,
      email: studentUser.email,
      role: "STUDENT",
    });

    // 5. Create test Mentor (pre-seeded with credential account)
    mentorUser = await prisma.user.create({
      data: {
        id: `test-mentor-seeded-${timestamp}`,
        name: "Pre-existing Mentor",
        email: `mentor.seeded.${timestamp}@example.com`,
        role: "MENTOR",
        isActive: true,
        mustChangePassword: false,
      },
    });
    tokenMentor = tokenUtils.getToken({
      id: mentorUser.id,
      email: mentorUser.email,
      role: "MENTOR",
    });

    // Seed a credential account for mentorUser
    await prisma.account.create({
      data: {
        id: `acc-mentor-${timestamp}`,
        userId: mentorUser.id,
        providerId: "credential",
        accountId: mentorUser.id,
        password: "seeded-initial-password-hash",
      },
    });

    // Seed 2 submissions reviewed by mentorUser
    await prisma.submission.create({
      data: {
        id: `sub-rev-1-${timestamp}`,
        projectName: "Reviewed Project 1",
        repoUrl: `https://github.com/test/rev1-${timestamp}`,
        repoUrlNormalized: `https://github.com/test/rev1-${timestamp}`,
        liveUrl: "https://rev1.example.com",
        description: "Review test description 1",
        status: "APPROVED",
        studentId: studentUser.id,
        reviewedById: mentorUser.id,
      },
    });

    await prisma.submission.create({
      data: {
        id: `sub-rev-2-${timestamp}`,
        projectName: "Reviewed Project 2",
        repoUrl: `https://github.com/test/rev2-${timestamp}`,
        repoUrlNormalized: `https://github.com/test/rev2-${timestamp}`,
        liveUrl: "https://rev2.example.com",
        description: "Review test description 2",
        status: "REJECTED",
        studentId: studentUser.id,
        reviewedById: mentorUser.id,
      },
    });
  });

  after(async () => {
    // Restore email service methods
    emailService.sendMentorCredentialsEmail = originalSendCredentialsEmail;
    emailService.sendMentorPasswordResetEmail = originalSendResetEmail;

    // Cleanup created mentor records
    for (const mentorId of createdMentorIds) {
      await prisma.session.deleteMany({ where: { userId: mentorId } }).catch(() => {});
      await prisma.account.deleteMany({ where: { userId: mentorId } }).catch(() => {});
      await prisma.user.delete({ where: { id: mentorId } }).catch(() => {});
    }

    // Cleanup seed data
    if (studentUser) {
      await prisma.submission.deleteMany({ where: { studentId: studentUser.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: studentUser.id } }).catch(() => {});
    }
    if (mentorUser) {
      await prisma.session.deleteMany({ where: { userId: mentorUser.id } }).catch(() => {});
      await prisma.account.deleteMany({ where: { userId: mentorUser.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: mentorUser.id } }).catch(() => {});
    }
    if (adminUser) {
      await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    }

    // Disconnect resources to allow clean node process exit
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      redis.disconnect();
    } catch {}
    await prisma.$disconnect();
  });

  // =========================================================================
  // SECTION 1: POST /admin/mentors — Create Mentor
  // =========================================================================

  test("1. Reject unauthenticated request to POST /admin/mentors with 401", async () => {
    const res = await fetch(`${baseUrl}/admin/mentors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unauth Mentor", email: "unauth@example.com" }),
    });

    assert.strictEqual(res.status, 401);
    const json = await res.json();
    assert.strictEqual(json.success, false);
  });

  test("2. Reject non-ADMIN user (e.g., STUDENT) with 403 Forbidden", async () => {
    const res = await fetch(`${baseUrl}/admin/mentors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStudent}`,
      },
      body: JSON.stringify({ name: "Forbidden Mentor", email: "forbidden@example.com" }),
    });

    assert.strictEqual(res.status, 403);
    const json = await res.json();
    assert.strictEqual(json.success, false);
  });

  test("3. Reject invalid inputs (empty name, invalid email) with 400 Bad Request", async () => {
    const resEmptyName = await fetch(`${baseUrl}/admin/mentors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ name: "   ", email: "valid@example.com" }),
    });
    assert.strictEqual(resEmptyName.status, 400);

    const resInvalidEmail = await fetch(`${baseUrl}/admin/mentors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ name: "Valid Name", email: "not-an-email" }),
    });
    assert.strictEqual(resInvalidEmail.status, 400);
  });

  test("4. Reject request containing client-supplied privileged fields with 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/admin/mentors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({
        name: "Hacker Mentor",
        email: "hacker@example.com",
        role: "ADMIN",
        mustChangePassword: false,
      }),
    });

    assert.strictEqual(res.status, 400);
  });

  test("5. Successfully create Mentor: sets role MENTOR, mustChangePassword true, isActive true, sends email, never leaks password", async () => {
    const timestamp = Date.now();
    const testEmail = `new.mentor.${timestamp}@example.com`;

    capturedCredentialsEmails.length = 0;

    const res = await fetch(`${baseUrl}/admin/mentors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({
        name: "Rahim Ahmed",
        email: testEmail,
      }),
    });

    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.id);
    assert.strictEqual(json.data.name, "Rahim Ahmed");
    assert.strictEqual(json.data.email, testEmail);
    assert.strictEqual(json.data.role, "MENTOR");
    assert.strictEqual(json.data.isActive, true);
    assert.strictEqual(json.data.mustChangePassword, true);

    // Assert sensitive credentials are never returned
    assert.strictEqual(json.data.password, undefined);
    assert.strictEqual(json.data.temporaryPassword, undefined);
    assert.strictEqual(json.data.passwordHash, undefined);

    createdMentorIds.push(json.data.id);

    // Verify database record
    const mentorDb = await prisma.user.findUnique({
      where: { id: json.data.id },
      include: { accounts: true },
    });
    assert.ok(mentorDb);
    assert.strictEqual(mentorDb.role, "MENTOR");
    assert.strictEqual(mentorDb.mustChangePassword, true);
    assert.strictEqual(mentorDb.isActive, true);
    assert.strictEqual(mentorDb.createdById, adminUser.id);

    // Verify credential account was created and password is NOT in plaintext
    assert.strictEqual(mentorDb.accounts.length, 1);
    const credentialAccount = mentorDb.accounts[0];
    assert.strictEqual(credentialAccount.providerId, "credential");
    assert.ok(credentialAccount.password);

    // Verify email was sent with credentials
    assert.strictEqual(capturedCredentialsEmails.length, 1);
    const sentEmail = capturedCredentialsEmails[0];
    assert.strictEqual(sentEmail.email, testEmail);
    assert.strictEqual(sentEmail.name, "Rahim Ahmed");
    assert.ok(sentEmail.temporaryPassword);
    assert.notStrictEqual(credentialAccount.password, sentEmail.temporaryPassword);

    // Verify temporary password works with Better Auth verifyPassword
    const isPasswordValid = await verifyPassword({
      hash: credentialAccount.password,
      password: sentEmail.temporaryPassword,
    });
    assert.strictEqual(isPasswordValid, true);
  });

  test("6. Reject duplicate email with 409 Conflict", async () => {
    const timestamp = Date.now();
    const testEmail = `dup.mentor.${timestamp}@example.com`;

    // Create first mentor
    const res1 = await fetch(`${baseUrl}/admin/mentors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ name: "Mentor One", email: testEmail }),
    });
    assert.strictEqual(res1.status, 201);
    const json1 = await res1.json();
    createdMentorIds.push(json1.data.id);

    // Attempt creating second mentor with identical email
    const res2 = await fetch(`${baseUrl}/admin/mentors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ name: "Mentor Two", email: testEmail }),
    });
    assert.strictEqual(res2.status, 409);
    const json2 = await res2.json();
    assert.strictEqual(json2.success, false);
  });

  test("7. Email delivery failure triggers safe compensating rollback of account creation", async () => {
    const timestamp = Date.now();
    const failEmail = `rollback.mentor.${timestamp}@example.com`;

    // Trigger simulated email failure
    simulateEmailFailure = true;

    try {
      const res = await fetch(`${baseUrl}/admin/mentors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({ name: "Rollback Mentor", email: failEmail }),
      });

      assert.strictEqual(res.status, 500);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.message.includes("rolled back"));

      // Verify the account was NOT left behind in the database
      const userInDb = await prisma.user.findUnique({
        where: { email: failEmail },
      });
      assert.strictEqual(userInDb, null);
    } finally {
      simulateEmailFailure = false;
    }
  });

  // =========================================================================
  // SECTION 2: GET /admin/mentors — List Mentors
  // =========================================================================

  test("8. GET /admin/mentors returns only accounts whose role is MENTOR with pagination", async () => {
    const res = await fetch(`${baseUrl}/admin/mentors?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.meta);
    assert.strictEqual(json.meta.page, 1);
    assert.ok(json.meta.total >= 1);

    // Verify EVERY returned account is a MENTOR and never STUDENT or ADMIN
    for (const mentor of json.data) {
      assert.strictEqual(mentor.role?.toUpperCase(), "MENTOR");
      assert.notStrictEqual(mentor.id, studentUser.id);
      assert.notStrictEqual(mentor.id, adminUser.id);
      // Ensure no password hash is returned
      assert.strictEqual(mentor.password, undefined);
    }
  });

  test("9. GET /admin/mentors?search= matches name or email", async () => {
    const res = await fetch(`${baseUrl}/admin/mentors?search=Pre-existing`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.length >= 1);
    assert.ok(json.data.some((m: any) => m.id === mentorUser.id));
  });

  test("10. GET /admin/mentors?isActive= filters boolean isActive properly", async () => {
    const resTrue = await fetch(`${baseUrl}/admin/mentors?isActive=true`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.strictEqual(resTrue.status, 200);
    const jsonTrue = await resTrue.json();
    for (const mentor of jsonTrue.data) {
      assert.strictEqual(mentor.isActive, true);
    }

    const resFalse = await fetch(`${baseUrl}/admin/mentors?isActive=false`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.strictEqual(resFalse.status, 200);
    const jsonFalse = await resFalse.json();
    for (const mentor of jsonFalse.data) {
      assert.strictEqual(mentor.isActive, false);
    }
  });

  // =========================================================================
  // SECTION 3: GET /admin/mentors/:id — Mentor Details
  // =========================================================================

  test("11. GET /admin/mentors/:id returns details and accurate review count", async () => {
    const res = await fetch(`${baseUrl}/admin/mentors/${mentorUser.id}`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.id, mentorUser.id);
    assert.strictEqual(json.data.role, "MENTOR");
    // Pre-seeded with 2 reviewed submissions
    assert.strictEqual(json.data.totalReviews, 2);
    assert.strictEqual(json.data.password, undefined);
  });

  test("12. GET /admin/mentors/:id returns 404 for nonexistent mentor ID", async () => {
    const res = await fetch(`${baseUrl}/admin/mentors/non-existent-id-999`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });

    assert.strictEqual(res.status, 404);
  });

  test("13. GET /admin/mentors/:id returns 404 when ID belongs to a STUDENT or ADMIN", async () => {
    const resStudent = await fetch(`${baseUrl}/admin/mentors/${studentUser.id}`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.strictEqual(resStudent.status, 404);

    const resAdmin = await fetch(`${baseUrl}/admin/mentors/${adminUser.id}`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.strictEqual(resAdmin.status, 404);
  });

  // =========================================================================
  // SECTION 4: PATCH /admin/mentors/:id — Update Mentor
  // =========================================================================

  test("14. PATCH /admin/mentors/:id updates mentor name", async () => {
    const res = await fetch(`${baseUrl}/admin/mentors/${mentorUser.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ name: "Updated Mentor Name" }),
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.name, "Updated Mentor Name");
  });

  test("15. PATCH /admin/mentors/:id rejects empty update with 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/admin/mentors/${mentorUser.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({}),
    });

    assert.strictEqual(res.status, 400);
  });

  test("16. PATCH /admin/mentors/:id rejects unauthorized fields (role, email, password)", async () => {
    const res = await fetch(`${baseUrl}/admin/mentors/${mentorUser.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ role: "ADMIN" }),
    });

    assert.strictEqual(res.status, 400);
  });

  test("17. Deactivating mentor sets isActive: false, revokes sessions, and prevents future requests", async () => {
    // 1. Create a session for mentor
    await prisma.session.create({
      data: {
        id: "mentor-active-session-token",
        token: "mentor-active-session-token",
        userId: mentorUser.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });

    // 2. Deactivate mentor
    const resDeact = await fetch(`${baseUrl}/admin/mentors/${mentorUser.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ isActive: false }),
    });

    assert.strictEqual(resDeact.status, 200);
    const jsonDeact = await resDeact.json();
    assert.strictEqual(jsonDeact.data.isActive, false);

    // 3. Verify session was deleted from database
    const sessions = await prisma.session.findMany({
      where: { userId: mentorUser.id },
    });
    assert.strictEqual(sessions.length, 0);

    // 4. Verify deactivated mentor's token is immediately rejected with 403 by checkAuth
    const resBlocked = await fetch(`${baseUrl}/admin/mentors`, {
      headers: { Authorization: `Bearer ${tokenMentor}` },
    });
    assert.strictEqual(resBlocked.status, 403);
    const jsonBlocked = await resBlocked.json();
    assert.ok(jsonBlocked.message.includes("deactivated"));

    // 5. Reactivate mentor and verify isActive restored to true
    const resReact = await fetch(`${baseUrl}/admin/mentors/${mentorUser.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenAdmin}`,
      },
      body: JSON.stringify({ isActive: true }),
    });

    assert.strictEqual(resReact.status, 200);
    const jsonReact = await resReact.json();
    assert.strictEqual(jsonReact.data.isActive, true);
  });

  // =========================================================================
  // SECTION 5: POST /admin/mentors/:id/reset-password — Reset Mentor Password
  // =========================================================================

  test("18. POST /admin/mentors/:id/reset-password generates new temporary password, hashes it, sets mustChangePassword=true, and revokes sessions", async () => {
    capturedResetEmails.length = 0;

    // Create session to verify revocation
    await prisma.session.create({
      data: {
        id: "mentor-reset-session-check",
        token: "mentor-reset-session-check",
        userId: mentorUser.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });

    const res = await fetch(`${baseUrl}/admin/mentors/${mentorUser.id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.id, mentorUser.id);
    assert.strictEqual(json.data.mustChangePassword, true);
    assert.strictEqual(json.data.temporaryPassword, undefined);

    // Verify session was revoked
    const sessions = await prisma.session.findMany({
      where: { userId: mentorUser.id },
    });
    assert.strictEqual(sessions.length, 0);

    // Verify email was sent with new temporary password
    assert.strictEqual(capturedResetEmails.length, 1);
    const resetEmail = capturedResetEmails[0];
    assert.strictEqual(resetEmail.email, mentorUser.email);
    assert.ok(resetEmail.temporaryPassword);

    // Verify new password in database works with Better Auth verifyPassword
    const mentorAccount = await prisma.account.findFirst({
      where: { userId: mentorUser.id, providerId: "credential" },
    });
    assert.ok(mentorAccount && mentorAccount.password);

    const isMatch = await verifyPassword({
      hash: mentorAccount.password,
      password: resetEmail.temporaryPassword,
    });
    assert.strictEqual(isMatch, true);
  });

  test("19. POST /admin/mentors/:id/reset-password returns 404 for STUDENT or ADMIN", async () => {
    const resStudent = await fetch(`${baseUrl}/admin/mentors/${studentUser.id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.strictEqual(resStudent.status, 404);

    const resAdmin = await fetch(`${baseUrl}/admin/mentors/${adminUser.id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.strictEqual(resAdmin.status, 404);
  });

  test("20. Reset password email failure triggers compensating rollback restoring previous password hash", async () => {
    // 1. Get current password hash
    const initialAccount = await prisma.account.findFirst({
      where: { userId: mentorUser.id, providerId: "credential" },
    });
    const initialPasswordHash = initialAccount?.password;
    assert.ok(initialPasswordHash);

    // 2. Trigger email failure
    simulateEmailFailure = true;

    try {
      const res = await fetch(`${baseUrl}/admin/mentors/${mentorUser.id}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });

      assert.strictEqual(res.status, 500);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.ok(json.message.includes("rolled back"));

      // 3. Verify previous password hash was restored in the database
      const accountAfterRollback = await prisma.account.findFirst({
        where: { userId: mentorUser.id, providerId: "credential" },
      });
      assert.strictEqual(accountAfterRollback?.password, initialPasswordHash);
    } finally {
      simulateEmailFailure = false;
    }
  });
});
