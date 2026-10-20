import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg'
import { envVeriables } from "../config/envConfig";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = envVeriables.DATABASE_URL
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

export { prisma }
