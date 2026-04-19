import { Router, type IRouter } from "express";
import healthRouter from "./health";
import postsRouter from "./posts";
import categoriesRouter from "./categories";
import productsRouter from "./products";
import contactRouter from "./contact";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(postsRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(contactRouter);
router.use(statsRouter);

export default router;
