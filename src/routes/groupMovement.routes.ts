import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  getGroupMovements,
  getGroupMovementsStatistics,
  upsertGroupAutoMessage,
  getGroupAutoMessages,
  updateGroupAutoMessage,
  deleteGroupAutoMessage,
  replaceGroupAutoMessages,
} from '../controllers/groupMovementController';
// Rotas de templates e mensagens foram movidas para o Grupo-Clerky
// Mantendo apenas rotas de movimentações e mensagens automáticas aqui

const router = Router();

// Todas as rotas requerem autenticação
router.use(protect);

// Rotas de movimentações
router.get('/movements', getGroupMovements);
router.get('/movements/statistics', getGroupMovementsStatistics);

// Rotas de mensagens automáticas
router.post('/auto-messages', upsertGroupAutoMessage);
router.get('/auto-messages', getGroupAutoMessages);
router.put('/auto-messages/:id', updateGroupAutoMessage);
router.delete('/auto-messages/:id', deleteGroupAutoMessage);
router.post('/auto-messages/replace-groups', replaceGroupAutoMessages);

// Rotas de templates e mensagens foram movidas para o Grupo-Clerky
// Essas rotas agora são tratadas pelo proxy groupProxy que redireciona para o microserviço

export default router;
