import { Router, type IRouter } from "express";
import healthRouter from "./health";
import postsRouter from "./posts";
import categoriesRouter from "./categories";
import productsRouter from "./products";
import contactRouter from "./contact";
import statsRouter from "./stats";
import adminRouter from "./admin";
import sitemapRouter from "./sitemap";

const router: IRouter = Router();

router.use(healthRouter);
router.use(postsRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(contactRouter);
router.use(statsRouter);
router.use(adminRouter);
router.use(sitemapRouter);

export default router;
