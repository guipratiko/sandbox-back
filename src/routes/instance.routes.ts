import { Router } from 'express';
import {
  createInstance,
  createOfficialInstance,
  registerOfficialPhone,
  getInstances,
  getInstance,
  updateInstanceSettings,
  deleteInstance,
} from '../controllers/instanceController';
import { protect, requirePremium } from '../middleware/auth';
import { validateCreateInstance, validateInstanceId } from '../middleware/validators';

const router = Router();

// Todas as rotas requerem autenticação e plano premium
router.use(protect, requirePremium);

router.post('/official', createOfficialInstance);
router.post('/:id/register-phone', validateInstanceId, registerOfficialPhone);
router.post('/', validateCreateInstance, createInstance);
router.get('/', getInstances);
router.get('/:id', validateInstanceId, getInstance);
router.put('/:id/settings', validateInstanceId, updateInstanceSettings);
router.delete('/:id', validateInstanceId, deleteInstance);

export default router;

