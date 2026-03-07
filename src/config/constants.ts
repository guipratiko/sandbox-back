/**
 * Configurações centralizadas do sistema
 * Todas as constantes e variáveis de ambiente devem ser acessadas através deste arquivo
 */

import dotenv from 'dotenv';

// Carregar variáveis de ambiente antes de acessá-las
dotenv.config();

// JWT Configuration
export const JWT_CONFIG = {
  SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  EXPIRE: process.env.JWT_EXPIRE || '7d',
};

// Server Configuration
export const SERVER_CONFIG = {
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
};

// Evolution API Configuration
export const EVOLUTION_CONFIG = {
  HOST: process.env.EVOLUTION_HOST || 'evo.clerky.com.br',
  API_KEY: process.env.EVOLUTION_APIKEY || '',
  SETTINGS_PATH: process.env.EVOLUTION_SETTINGS_PATH || '/instance/settings/{instance}',
};

// Webhook Configuration
export const WEBHOOK_CONFIG = {
  BASE_URL: process.env.WEBHOOK_BASE_URL || 'http://back.onlyflow.com.br/webhook/api',
  BASE64: process.env.WEBHOOK_BASE64 === 'true',
  EVENTS: (process.env.WEBHOOK_EVENTS || 'MESSAGES_UPSERT,MESSAGES_DELETE')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  PASSWORD_RESET_URL: process.env.PASSWORD_RESET_WEBHOOK_URL || 'https://api.clerky.com.br/webhook/6290eb9c-956b-41ca-88ac-e2f1ecaba969',
};

// Database Configuration
export const DATABASE_CONFIG = {
  URI: process.env.MONGODB_URI || 'mongodb://clerky:qGfdSCz1bDTuHD5o@easy.clerky.com.br:27017/?tls=false',
};

// PostgreSQL Configuration (CRM e Conversas)
export const POSTGRES_CONFIG = {
  URI: process.env.POSTGRES_URI || 'postgres://clerkypost:rf3dF5Bj76Tt4Olp@easy.clerky.com.br:5433/clerkysys?sslmode=disable',
};

// Redis Configuration (Cache e Sessões)
export const REDIS_CONFIG = {
  URI: process.env.REDIS_URI || 'redis://default:Gd4562Vbfs341le@easy.clerky.com.br:6378',
};

// Media Service Configuration
export const MEDIA_SERVICE_CONFIG = {
  URL: process.env.MEDIA_SERVICE_URL || 'https://midiaservice-midiaservice.2lfsvk.easypanel.host',
  TOKEN: process.env.MEDIA_SERVICE_TOKEN || 'Fg34Dsew5783gTy',
};

// Google OAuth Configuration
export const GOOGLE_CONFIG = {
  CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || '',
  API_URL: process.env.API_URL || process.env.BACKEND_URL || 'http://localhost:4331',
};

// OpenAI Configuration (Chave fixa para Agente de IA)
export const OPENAI_CONFIG = {
  API_KEY: process.env.OPENAI_API_KEY || '',
};

// Transcrição de Áudio Configuration
export const TRANSCRIPTION_CONFIG = {
  WEBHOOK_URL: process.env.TRANSCRIPTION_WEBHOOK_URL || 'https://api.clerky.com.br/webhook/178f79bf-6989-493d-bd58-b1ed7480b2bc',
  CALLBACK_URL: process.env.TRANSCRIPTION_CALLBACK_URL || 'https://back.onlyflow.com.br/api/ai-agent/transcription-callback',
};

// MindClerky Configuration (Microserviço de Workflows)
export const MINDLERKY_CONFIG = {
  URL: process.env.MINDLERKY_URL || 'http://localhost:4333/api',
};

// Premium Webhook Configuration
export const PREMIUM_WEBHOOK_CONFIG = {
  SECRET: process.env.PREMIUM_WEBHOOK_SECRET || 'GreSD324FDw32D43tbf2dFr',
};

// Supabase (base vetorizada por agente de IA)
export const SUPABASE_CONFIG = {
  URL: process.env.SUPABASE_URL || '',
  SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
};

// Email Configuration
export const EMAIL_CONFIG = {
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.umbler.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || 'contato@clerky.com.br',
  SMTP_PASS: process.env.SMTP_PASS || '@clerky!@',
  FROM_EMAIL: process.env.FROM_EMAIL || 'contato@clerky.com.br',
  FROM_NAME: process.env.FROM_NAME || 'Clerky',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  LOGO_DARK_URL: process.env.EMAIL_LOGO_DARK_URL || 'https://onlyflow.com.br/img/OnlyFlow-logo.png',
  LOGO_LIGHT_URL: process.env.EMAIL_LOGO_LIGHT_URL || 'https://onlyflow.com.br/img/OnlyFlow-logo-claro.png',
};

// Apple Configuration (APNs e In-App Purchase)
// Chave OnlyFlow: Apple Push Notifications service (APNs) em developer.apple.com/account → Keys
export const APPLE_CONFIG = {
  KEY_ID: process.env.APPLE_KEY_ID || 'Y54V7CX94R',
  TEAM_ID: process.env.APPLE_TEAM_ID || 'P5AJ6T7WFG',
  KEY_PATH: process.env.APPLE_KEY_PATH || './AuthKey_Y54V7CX94R.p8',
  BUNDLE_ID: process.env.APPLE_BUNDLE_ID || 'com.onlyflow.app',
  SHARED_SECRET: process.env.APPLE_SHARED_SECRET || '', // Opcional para validação de receipts
};

// Limites por plano premium (instâncias WhatsApp e Instagram)
export const PREMIUM_PLAN_LIMITS: Record<string, { maxWhatsApp: number; maxInstagram: number }> = {
  free: { maxWhatsApp: 0, maxInstagram: 0 },
  start: { maxWhatsApp: 1, maxInstagram: 0 },
  advance: { maxWhatsApp: 2, maxInstagram: 1 },
  pro: { maxWhatsApp: 4, maxInstagram: 2 },
};

export function getPlanLimits(premiumPlan: string): { maxWhatsApp: number; maxInstagram: number } {
  return PREMIUM_PLAN_LIMITS[premiumPlan] ?? PREMIUM_PLAN_LIMITS.free;
}

// Firebase Configuration (FCM para Android)
export const FIREBASE_CONFIG = {
  // Opção 1: Caminho para o arquivo JSON da Service Account do Firebase (desenvolvimento)
  // Pode ser caminho absoluto ou relativo à raiz do projeto
  SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './clerky-7bdad-firebase-adminsdk-fbsvc-5c940f24b9.json',
  
  // Opção 2: Credenciais via variáveis de ambiente (produção - mais seguro)
  // Use essas variáveis no servidor de produção em vez do arquivo JSON
  PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  // A chave privada será normalizada no pushNotificationService
  // IMPORTANTE: No .env do servidor, use a chave completa com \n para quebras de linha
  PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY, // Não fazer replace aqui, fazer no service
  PRIVATE_KEY_ID: process.env.FIREBASE_PRIVATE_KEY_ID,
  CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
  CLIENT_ID: process.env.FIREBASE_CLIENT_ID,
  AUTH_URI: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
  TOKEN_URI: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
  CLIENT_X509_CERT_URL: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

