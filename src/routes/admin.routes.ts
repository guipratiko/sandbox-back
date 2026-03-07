import { Router } from 'express';
import { protect, requireAdmin } from '../middleware/auth';
import { sendPromotion } from '../controllers/adminController';
import {
  getAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
} from '../controllers/bannerController';
import {
  getAllNews,
  createNews,
  updateNews,
  deleteNews,
} from '../controllers/newsController';

const router = Router();

// Todas as rotas requerem autenticação e privilégios de admin
router.use(protect);
router.use(requireAdmin);

// Enviar notificação promocional
router.post('/send-promotion', sendPromotion);

// Rotas de gerenciamento de banners (admin)
router.get('/banners', getAllBanners);
router.get('/banners/:id', getBannerById);
router.post('/banners', createBanner);
router.put('/banners/:id', updateBanner);
router.delete('/banners/:id', deleteBanner);

// Rotas de gerenciamento de novidades (admin)
router.get('/news', getAllNews);
router.post('/news', createNews);
router.put('/news/:id', updateNews);
router.delete('/news/:id', deleteNews);

export default router;

