import { Router } from 'express';
import {
  createInstance,
  createOfficialInstance,
  registerOfficialPhone,
  getInstances,
  getInstance,
  updateInstanceSettings,
  deleteInstance,
  getWhatsAppProfile,
  patchWhatsAppProfile,
  getWhatsAppSettings,
  uploadWhatsAppProfilePictureImage,
  uploadWhatsAppProfilePicture,
} from '../controllers/instanceController';
import {
  listOfficialTemplates,
  createOfficialTemplate,
  getOfficialTemplate,
  updateOfficialTemplate,
  deleteOfficialTemplate,
} from '../controllers/officialTemplatesController';
import { getOfficialDispatchQuota, sendOfficialDispatches } from '../controllers/officialDispatchController';
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
router.get('/:id/whatsapp-profile', validateInstanceId, getWhatsAppProfile);
router.patch('/:id/whatsapp-profile', validateInstanceId, patchWhatsAppProfile);
router.post('/:id/whatsapp-profile-picture', validateInstanceId, uploadWhatsAppProfilePictureImage, uploadWhatsAppProfilePicture);
router.get('/:id/whatsapp-settings', validateInstanceId, getWhatsAppSettings);
router.get('/:id/official-templates', validateInstanceId, listOfficialTemplates);
router.post('/:id/official-templates', validateInstanceId, createOfficialTemplate);
router.get('/:id/official-templates/:templateId', validateInstanceId, getOfficialTemplate);
router.post('/:id/official-templates/:templateId', validateInstanceId, updateOfficialTemplate);
router.delete('/:id/official-templates', validateInstanceId, deleteOfficialTemplate);
router.get('/:id/official-dispatch-quota', validateInstanceId, getOfficialDispatchQuota);
router.post('/:id/official-dispatches', validateInstanceId, sendOfficialDispatches);
router.put('/:id/settings', validateInstanceId, updateInstanceSettings);
router.delete('/:id', validateInstanceId, deleteInstance);

export default router;

