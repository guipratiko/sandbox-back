import { Router } from 'express';
import { protect } from '../middleware/auth';
import { getDashboardStats } from '../controllers/dashboardController';
import { getBanners } from '../controllers/bannerController';
import { getLatestNews, getAllActiveNews, getNewsById } from '../controllers/newsController';

const router = Router();

// Todas as rotas requerem autenticação
router.use(protect);

router.get('/stats', getDashboardStats);
router.get('/banners', getBanners);

// Rotas de novidades (públicas para usuários autenticados)
router.get('/news/latest', getLatestNews);
router.get('/news', getAllActiveNews);
router.get('/news/:id', getNewsById);

export default router;

