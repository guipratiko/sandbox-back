import { Router } from 'express';
import { protect, requirePremium } from '../middleware/auth';
import {
  createAIAgent,
  getAIAgents,
  getAIAgent,
  updateAIAgent,
  deleteAIAgent,
  getLeads,
  addKnowledge,
  getKnowledgeCount,
  transcriptionCallback,
  listAgentMedia,
  addAgentMedia,
  deleteAgentMedia,
  uploadAgentMedia,
  listAgentLocations,
  addAgentLocation,
  deleteAgentLocation,
} from '../controllers/aiAgentController';

const router = Router();

// Rota pública para callback de transcrição
router.post('/transcription-callback', transcriptionCallback);

// Todas as outras rotas requerem autenticação e plano premium
router.use(protect, requirePremium);

// Rotas de agentes
router.post('/', createAIAgent);
router.get('/', getAIAgents);
router.get('/leads', getLeads);
router.get('/:id/knowledge/count', getKnowledgeCount);
router.post('/:id/knowledge', addKnowledge);
// Mídias e localizações (antes de /:id para não conflitar)
router.get('/:id/media', listAgentMedia);
router.post('/:id/media', uploadAgentMedia, addAgentMedia);
router.delete('/:id/media/:mediaId', deleteAgentMedia);
router.get('/:id/locations', listAgentLocations);
router.post('/:id/locations', addAgentLocation);
router.delete('/:id/locations/:locationId', deleteAgentLocation);
router.get('/:id', getAIAgent);
router.put('/:id', updateAIAgent);
router.delete('/:id', deleteAIAgent);

export default router;

