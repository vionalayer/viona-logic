import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketsRouter from "./markets";
import ordersRouter from "./orders";
import portfolioRouter from "./portfolio";
import walletRouter from "./wallet";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/markets", marketsRouter);
router.use("/orders", ordersRouter);
router.use("/portfolio", portfolioRouter);
router.use("/wallet", walletRouter);
router.use("/dashboard", dashboardRouter);

export default router;
