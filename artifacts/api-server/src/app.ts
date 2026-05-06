import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { clerkMiddleware } from "@clerk/express";
import { authMiddleware } from "./middlewares/authMiddleware";
import router from "./routes";
import clerkWebhooksRouter from "./routes/clerk-webhooks";

const app: Express = express();

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());

// Clerk webhook MUST be mounted before express.json() — svix verifies the
// raw request body, and a JSON parser would break the signature check.
app.use("/api", clerkWebhooksRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// clerkMiddleware populates req.auth with the Clerk session info if the
// caller has a valid Clerk token. authMiddleware below uses that to look
// up our DB user, with a fallback to the legacy sid cookie.
app.use(clerkMiddleware());
app.use(authMiddleware);

app.use("/api", router);

export default app;
