import { Router } from 'express';
import { login, register, getMe, updateProfile, changePassword, forgotPassword, resetPassword, deleteAccount } from '../controllers/authController';
import { validateActivationToken, activateAccount } from '../controllers/activateAccountController';
import { protect } from '../middleware/auth';
import { authRateLimiter } from '../middleware/security';
import { validateLogin, validateRegister } from '../middleware/validators';

const router = Router();

// Rotas públicas com rate limiting de autenticação e validação
router.post('/login', authRateLimiter, validateLogin, login);
router.post('/register', authRateLimiter, validateRegister, register);
router.get('/activate', validateActivationToken); // Validar token de ativação
router.post('/activate', activateAccount); // Ativar conta (definir senha)
router.post('/forgot-password', forgotPassword); // Solicitar recuperação de senha
router.post('/reset-password', resetPassword); // Redefinir senha com token

// Rotas protegidas
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, changePassword);
router.delete('/account', protect, deleteAccount);

export default router;

