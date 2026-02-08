import { Router } from "express";
import contactsRouter from "./contacts.router";
import notesRouter from "./notes.router";
import filesRouter from "./files.router";
import approvalsRouter from "./approvals.router";
import conversationsRouter from "./conversations.router";

const router = Router();

router.use(contactsRouter);
router.use(notesRouter);
router.use(filesRouter);
router.use(approvalsRouter);
router.use(conversationsRouter);

export default router;
