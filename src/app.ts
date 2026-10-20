import express, { Application, Request, Response } from "express";
import cors from "cors";
import { auth } from "./lib/auth";
import { toNodeHandler } from "better-auth/node";
import cookieParser from "cookie-parser";
import router from "./routes";
import { globalErrorHandler } from "./middlewares/globalErrorHandler";
import { notFound } from "./middlewares/notFound";
// import { paymentController } from './modules/payment/payment.controller';

const app: Application = express();

app.all("/api/auth/*splat", toNodeHandler(auth));

// app.post(
//   "/webhook",
//   express.raw({ type: "application/json" }),
//   paymentController.handlerStripeWebhookEvent,
// );

app.use(express.json());

app.use(cors());
app.use(cookieParser());

// application routes
app.use("/api/v1", router);

app.get("/", (req: Request, res: Response) => {
  res.send("Ph_Task Backend is running");
});


app.use(globalErrorHandler);
app.use(notFound);

export default app;
