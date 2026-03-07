/**
 * Serviço para verificar status de todos os microserviços
 */

import axios, { AxiosError } from 'axios';

interface ServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'error';
  version?: string;
  message?: string;
  responseTime?: number;
  timestamp?: string;
  error?: string;
  details?: Record<string, any>;
}

interface PublicStatusResponse {
  timestamp: string;
  services: {
    frontend?: ServiceStatus;
    backend: ServiceStatus;
    dispatchClerky?: ServiceStatus;
    mindClerky?: ServiceStatus;
    instaClerky?: ServiceStatus;
    grupoClerky?: ServiceStatus;
    scrapingFlow?: ServiceStatus;
  };
}

// URLs dos serviços (do .env ou padrão)
const getServiceUrls = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    dispatchClerky: process.env.DISPATCH_SERVICE_URL || 'http://localhost:4332',
    mindClerky: process.env.MINDLERKY_URL?.replace('/api', '') || 'http://localhost:4333',
    instaClerky: process.env.INSTAGRAM_SERVICE_URL || 'http://localhost:4335',
    grupoClerky: process.env.GROUP_SERVICE_URL || 'http://localhost:4334',
    scrapingFlow: process.env.SCRAPING_FLOW_SERVICE_URL || 'http://localhost:4336',
    frontend: process.env.FRONTEND_URL || 'http://localhost:3000',
  };
};

/**
 * Verificar status de um serviço
 */
async function checkServiceStatus(
  name: string,
  url: string,
  endpoint: string = '/'
): Promise<ServiceStatus> {
  const startTime = Date.now();
  
  try {
    const fullUrl = `${url}${endpoint}`;
    const response = await axios.get(fullUrl, {
      timeout: 5000, // 5 segundos de timeout
      validateStatus: (status) => status < 500, // Aceitar 2xx, 3xx, 4xx como "online"
    });

    const responseTime = Date.now() - startTime;
    const data = response.data || {};

    return {
      name,
      status: response.status < 500 ? 'online' : 'error',
      version: data.version || process.env.VERSION || '1.0.0',
      message: data.message || `${name} está funcionando`,
      responseTime,
      timestamp: data.timestamp || new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const axiosError = error as AxiosError;

    return {
      name,
      status: 'offline',
      responseTime,
      timestamp: new Date().toISOString(),
      error: axiosError.message || 'Serviço não disponível',
    };
  }
}

/**
 * Verificar status do Backend (local)
 */
async function checkBackendStatus(): Promise<ServiceStatus> {
  const startTime = Date.now();
  
  // Tentar importar package.json para fallback
  let packageVersion = '1.0.0';
  try {
    const packageJson = require('../../package.json');
    packageVersion = packageJson.version;
  } catch {
    // Ignorar erro se não conseguir importar
  }

  // Verificar conexões com bancos de dados
  let dbStatus = 'ok';
  let dbDetails: Record<string, boolean | string> = {};
  try {
    const { checkDatabaseConnections } = await import('../config/databases');
    dbDetails = await checkDatabaseConnections();
    // Verificar se todos os bancos estão conectados
    if (!dbDetails.mongodb || !dbDetails.postgresql || !dbDetails.redis) {
      dbStatus = 'error';
    }
  } catch (error) {
    dbStatus = 'error';
    dbDetails = { 
      mongodb: false, 
      postgresql: false, 
      redis: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }

  const responseTime = Date.now() - startTime;

  return {
    name: 'API',
    status: dbStatus === 'ok' ? 'online' : 'error',
    version: process.env.VERSION || packageVersion,
    message: dbStatus === 'ok' 
      ? 'OnlyFlow API está funcionando' 
      : `OnlyFlow API com problemas: ${Object.entries(dbDetails)
          .filter(([key, value]) => key !== 'error' && !value)
          .map(([key]) => key)
          .join(', ')} offline`,
    responseTime,
    timestamp: new Date().toISOString(),
    details: {
      databases: dbDetails,
      environment: process.env.NODE_ENV || 'development',
    },
  };
}

/**
 * Verificar status do Frontend
 */
async function checkFrontendStatus(url: string): Promise<ServiceStatus> {
  const startTime = Date.now();
  
  try {
    // Verificar se o frontend está respondendo (qualquer resposta HTML é válida)
    const response = await axios.get(url, {
      timeout: 10000, // Aumentar timeout para 10 segundos
      validateStatus: () => true, // Aceitar qualquer status HTTP
      maxRedirects: 5, // Permitir redirecionamentos
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'OnlyFlow-Status-Checker/1.0',
      },
    });

    const responseTime = Date.now() - startTime;

    // Considerar online se retornou qualquer resposta (mesmo 404, pois significa que o servidor está respondendo)
    const isOnline = response.status >= 200 && response.status < 500;

    return {
      name: 'Página Principal',
      status: isOnline ? 'online' : 'error',
      version: process.env.FRONTEND_VERSION || '1.0.0',
      message: isOnline ? 'Página Principal está funcionando' : `Página Principal retornou status ${response.status}`,
      responseTime,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const axiosError = error as AxiosError;

    // Se for erro de timeout ou conexão, considerar offline
    let errorMessage = 'Página Principal não disponível';
    if (axiosError.code === 'ECONNREFUSED') {
      errorMessage = 'Conexão recusada - Página Principal pode não estar rodando';
    } else if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
      errorMessage = 'Timeout ao conectar à Página Principal';
    } else if (axiosError.message) {
      errorMessage = axiosError.message;
    }

    return {
      name: 'Página Principal',
      status: 'offline',
      responseTime,
      timestamp: new Date().toISOString(),
      error: errorMessage,
    };
  }
}

/**
 * Obter status de todos os serviços
 */
export async function getAllServicesStatus(): Promise<PublicStatusResponse> {
  const urls = getServiceUrls();

  // Verificar todos os serviços em paralelo
  const [
    backendStatus,
    frontendStatus,
    dispatchStatus,
    mindClerkyStatus,
    instaClerkyStatus,
    grupoClerkyStatus,
    scrapingFlowStatus,
  ] = await Promise.all([
    checkBackendStatus(),
    checkFrontendStatus(urls.frontend),
    checkServiceStatus('Serviço de Disparo', urls.dispatchClerky),
    checkServiceStatus('Ferramenta MindFlow', urls.mindClerky),
    checkServiceStatus('Gerenciador de Instagram', urls.instaClerky),
    checkServiceStatus('Gerenciador de Grupos', urls.grupoClerky),
    checkServiceStatus('Scraping Flow', urls.scrapingFlow),
  ]);

  return {
    timestamp: new Date().toISOString(),
    services: {
      frontend: frontendStatus,
      backend: backendStatus,
      dispatchClerky: dispatchStatus,
      mindClerky: mindClerkyStatus,
      instaClerky: instaClerkyStatus,
      grupoClerky: grupoClerkyStatus,
      scrapingFlow: scrapingFlowStatus,
    },
  };
}
