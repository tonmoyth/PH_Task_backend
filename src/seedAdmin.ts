import status from "http-status";
import AppError from "./errors/AppError";
import { auth } from "./lib/auth";
import { prisma } from "./lib/prisma";

const createAdmin = async () => {
  try {
    const adminEmail = "tonmoyth143@gmail.com";

    // 1. Check if  admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: {
        email: adminEmail,
      },
    });

    if (existingAdmin) {
      console.log(" admin already exists.");
      return;
    }

    // 2. Create user with better-auth (do not pass role in body because Better Auth forbids it in signUpEmail)
    const result = await auth.api.signUpEmail({
      body: {
        name: " ADMIN VAI",
        email: adminEmail,
        password: "12345678",
      },
    });

    if (result && result.user) {
      // 3. Elevate user role to ADMIN and mark email as verified & active
      await prisma.user.update({
        where: { id: result.user.id },
        data: {
          role: "ADMIN",
          emailVerified: true,
          isActive: true,
          mustChangePassword: false,
        },
      });
      console.log("✅  admin created successfully with role: ADMIN");
    }
  } catch (error) {
    console.error("Error creating  admin:", error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
};

// Run the seed function
createAdmin();
