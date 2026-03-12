import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import contactsRouter from "./contacts";
import eventsRouter from "./events";
import employeesRouter from "./employees";
import dashboardRouter from "./dashboard";
import signupRouter from "./signup";
import googleAuthRouter from "./google-auth";
import gmailRouter from "./gmail";
import calendarRouter from "./calendar";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(contactsRouter);
router.use(eventsRouter);
router.use(employeesRouter);
router.use(dashboardRouter);
router.use(signupRouter);
router.use(googleAuthRouter);
router.use(gmailRouter);
router.use(calendarRouter);

export default router;
