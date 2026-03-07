import { Router } from 'express';
import { protect } from '../middleware/auth';
import {
  validateSubscription,
  getActiveSubscriptionEndpoint,
  registerDeviceToken,
  removeDeviceToken,
  cancelSubscription,
} from '../controllers/subscriptionController';

const router = Router();

// Todas as rotas requerem autenticação
router.use(protect);

// Validar assinatura da Apple
router.post('/validate', validateSubscription);

// Obter assinatura ativa
router.get('/active', getActiveSubscriptionEndpoint);

// Cancelar assinatura
router.delete('/cancel', cancelSubscription);

// Registrar device token para push notifications
router.post('/device-token', registerDeviceToken);

// Remover device token
router.delete('/device-token/:token', removeDeviceToken);

export default router;

