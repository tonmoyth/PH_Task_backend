import status from "http-status";

import AppError from "./errors/AppError";
import { auth } from "./lib/auth";
import { prisma } from "./lib/prisma";

const createAdmin = async () => {
  try {
    // Check if super admin already exists
    const existingSuperAdmin = await prisma.user.findFirst({
      where: {
        email: "tonmoyth143@gmail.com",
      },
    });

    if (existingSuperAdmin) {
      throw new AppError(status.CONFLICT, "Super admin already exists");
    }

    // Create user with better-auth
    await auth.api.signUpEmail({
      body: {
        name: "SUPER ADMIN VAI",
        email: "tonmoyth143@gmail.com",
        password: "12345678",
        role: "SUPER_ADMIN",
      },
    });

    console.log("Super admin created successfully");
  } catch (error) {
    console.error("Error creating super admin:", error);
  }
};

// Run the seed function
createAdmin();
