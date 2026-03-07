import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createValidationError,
  createNotFoundError,
  handleControllerError,
} from '../utils/errorHelpers';
import { WorkflowService } from '../services/workflowService';
import axios from 'axios';
import { MINDLERKY_CONFIG } from '../config/constants';

/**
 * Obter todos os workflows do usuário
 * GET /api/workflows
 */
export const getWorkflows = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const workflows = await WorkflowService.getWorkflowsByUserId(userId);

    res.status(200).json({
      status: 'success',
      workflows: workflows.map((wf) => ({
        id: wf.id,
        name: wf.name,
        instanceId: wf.instanceId,
        nodes: wf.nodes,
        edges: wf.edges,
        isActive: wf.isActive,
        createdAt: wf.createdAt.toISOString(),
        updatedAt: wf.updatedAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao listar workflows'));
  }
};

/**
 * Obter workflow por ID
 * GET /api/workflows/:id
 */
export const getWorkflow = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const workflow = await WorkflowService.getWorkflowById(id, userId);

    if (!workflow) {
      return next(createNotFoundError('Workflow'));
    }

    res.status(200).json({
      status: 'success',
      workflow: {
        id: workflow.id,
        name: workflow.name,
        instanceId: workflow.instanceId,
        nodes: workflow.nodes,
        edges: workflow.edges,
        isActive: workflow.isActive,
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter workflow'));
  }
};

/**
 * Criar novo workflow
 * POST /api/workflows
 */
export const createWorkflow = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { name, instanceId, nodes, edges, isActive } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    if (!name || name.trim().length === 0) {
      return next(createValidationError('Nome do workflow é obrigatório'));
    }

    if (!nodes || !Array.isArray(nodes)) {
      return next(createValidationError('Nodes é obrigatório e deve ser um array'));
    }

    if (!edges || !Array.isArray(edges)) {
      return next(createValidationError('Edges é obrigatório e deve ser um array'));
    }

    // Se instanceId não for fornecido, tentar obter do nó de gatilho WhatsApp
    let finalInstanceId = instanceId;
    if (!finalInstanceId) {
      const whatsappTriggerNode = nodes.find((node: any) => node.type === 'whatsappTrigger');
      if (whatsappTriggerNode && whatsappTriggerNode.data?.instanceId) {
        finalInstanceId = whatsappTriggerNode.data.instanceId;
      }
    }

    // Se ainda não tiver instanceId, usar string vazia (será definida quando o workflow for executado)
    if (!finalInstanceId) {
      finalInstanceId = '';
    }

    const workflow = await WorkflowService.createWorkflow({
      userId,
      name: name.trim(),
      instanceId: finalInstanceId,
      nodes,
      edges,
      isActive,
    });

    res.status(201).json({
      status: 'success',
      message: 'Workflow criado com sucesso',
      workflow: {
        id: workflow.id,
        name: workflow.name,
        instanceId: workflow.instanceId,
        nodes: workflow.nodes,
        edges: workflow.edges,
        isActive: workflow.isActive,
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao criar workflow'));
  }
};

/**
 * Atualizar workflow
 * PUT /api/workflows/:id
 */
export const updateWorkflow = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, instanceId, nodes, edges, isActive } = req.body;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const workflow = await WorkflowService.getWorkflowById(id, userId);

    if (!workflow) {
      return next(createNotFoundError('Workflow'));
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (instanceId !== undefined) updateData.instanceId = instanceId;
    if (nodes !== undefined) updateData.nodes = nodes;
    if (edges !== undefined) updateData.edges = edges;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedWorkflow = await WorkflowService.updateWorkflow(id, userId, updateData);

    if (!updatedWorkflow) {
      return next(createNotFoundError('Workflow'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Workflow atualizado com sucesso',
      workflow: {
        id: updatedWorkflow.id,
        name: updatedWorkflow.name,
        instanceId: updatedWorkflow.instanceId,
        nodes: updatedWorkflow.nodes,
        edges: updatedWorkflow.edges,
        isActive: updatedWorkflow.isActive,
        createdAt: updatedWorkflow.createdAt.toISOString(),
        updatedAt: updatedWorkflow.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao atualizar workflow'));
  }
};

/**
 * Deletar workflow
 * DELETE /api/workflows/:id
 */
export const deleteWorkflow = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const workflow = await WorkflowService.getWorkflowById(id, userId);

    if (!workflow) {
      return next(createNotFoundError('Workflow'));
    }

    const deleted = await WorkflowService.deleteWorkflow(id, userId);

    if (!deleted) {
      return next(createNotFoundError('Workflow'));
    }

    res.status(200).json({
      status: 'success',
      message: 'Workflow deletado com sucesso',
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao deletar workflow'));
  }
};

/**
 * Obter lista de contatos que entraram no workflow
 * GET /api/workflows/:id/contacts
 */
export const getWorkflowContacts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const workflow = await WorkflowService.getWorkflowById(id, userId);

    if (!workflow) {
      return next(createNotFoundError('Workflow'));
    }

    const contacts = await WorkflowService.getWorkflowContacts(id);

    res.status(200).json({
      status: 'success',
      contacts: contacts.map((contact) => ({
        id: contact.id,
        contactPhone: contact.contactPhone,
        instanceId: contact.instanceId,
        enteredAt: contact.enteredAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao obter contatos do workflow'));
  }
};

/**
 * Limpar lista de contatos do workflow
 * POST /api/workflows/:id/contacts/clear
 */
export const clearWorkflowContacts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return next(createValidationError('Usuário não autenticado'));
    }

    const workflow = await WorkflowService.getWorkflowById(id, userId);

    if (!workflow) {
      return next(createNotFoundError('Workflow'));
    }

    const deletedCount = await WorkflowService.clearWorkflowContacts(id);

    res.status(200).json({
      status: 'success',
      message: 'Lista de contatos limpa com sucesso',
      deletedCount,
    });
  } catch (error: unknown) {
    return next(handleControllerError(error, 'Erro ao limpar contatos do workflow'));
  }
};

/**
 * Receber webhook do Typebot e executar workflow
 * POST /api/workflows/webhook/typebot/:nodeId
 */
export const receiveTypebotWebhook = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const payload = req.body;

    console.log(`📥 Webhook Typebot recebido para nó ${nodeId}`);
    console.log(`📦 Payload recebido:`, JSON.stringify(payload, null, 2));

    // Extrair dados do payload - aceitar dois formatos:
    // 1. Array com objeto contendo "body": [{ body: {...} }]
    // 2. Objeto direto com os dados: { submittedAt, Name, Telefone, ... }
    let bodyData: any;

    if (Array.isArray(payload) && payload.length > 0) {
      // Formato 1: Array com body
      const firstItem = payload[0];
      if (firstItem && firstItem.body) {
        bodyData = firstItem.body;
      } else if (firstItem && typeof firstItem === 'object') {
        // Se o primeiro item é um objeto mas não tem "body", usar o próprio item
        bodyData = firstItem;
      } else {
        res.status(400).json({
          status: 'error',
          message: 'Payload inválido. Array deve conter objetos válidos.',
        });
        return;
      }
    } else if (typeof payload === 'object' && payload !== null) {
      // Formato 2: Objeto direto
      bodyData = payload;
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Payload inválido. Esperado um objeto ou array com objetos.',
      });
      return;
    }

    console.log(`📋 Dados extraídos:`, JSON.stringify(bodyData, null, 2));

    // Buscar todos os workflows ativos para encontrar o que contém o nó typebotTrigger com o ID correspondente
    const allWorkflows = await WorkflowService.getAllActiveWorkflows();

    console.log(`🔍 Buscando workflow com nó typebotTrigger: ${nodeId}`);
    console.log(`📊 Total de workflows ativos encontrados: ${allWorkflows.length}`);

    // Se não encontrou nenhum workflow ativo, buscar também inativos para debug
    if (allWorkflows.length === 0) {
      console.log(`⚠️ Nenhum workflow ativo encontrado. Buscando workflows inativos para debug...`);
      const allWorkflowsIncludingInactive = await WorkflowService.getAllWorkflowsForDebug();
      console.log(`📊 Total de workflows (incluindo inativos): ${allWorkflowsIncludingInactive.length}`);
      
      for (const workflow of allWorkflowsIncludingInactive) {
        const typebotNodes = workflow.nodes.filter((node: any) => node.type === 'typebotTrigger');
        if (typebotNodes.length > 0) {
          console.log(`   - Workflow: ${workflow.name} (${workflow.id}) - Ativo: ${workflow.isActive}`);
          console.log(`     Nós typebotTrigger:`, typebotNodes.map((n: any) => n.id));
        }
      }
    }

    // Encontrar o workflow que contém o nó typebotTrigger com o nodeId
    let targetWorkflow: any = null;
    let targetNode: any = null;

    for (const workflow of allWorkflows) {
      console.log(`🔎 Verificando workflow: ${workflow.name} (${workflow.id})`);
      console.log(`   - Nós: ${workflow.nodes.length}`);
      
      // Log de todos os nós typebotTrigger encontrados
      const typebotNodes = workflow.nodes.filter((node: any) => node.type === 'typebotTrigger');
      if (typebotNodes.length > 0) {
        console.log(`   - Nós typebotTrigger encontrados:`, typebotNodes.map((n: any) => n.id));
      }

      const typebotNode = workflow.nodes.find(
        (node: any) => node.type === 'typebotTrigger' && node.id === nodeId
      );

      if (typebotNode) {
        targetWorkflow = workflow;
        targetNode = typebotNode;
        console.log(`✅ Nó encontrado no workflow: ${workflow.name}`);
        break;
      }
    }

    if (!targetWorkflow) {
      console.log(`⚠️ Nenhum workflow ativo encontrado com o nó typebotTrigger ${nodeId}`);
      console.log(`💡 Dica: Verifique se o workflow está salvo e ativo (isActive = true)`);
      res.status(404).json({
        status: 'error',
        message: 'Workflow não encontrado ou inativo para este nó. Verifique se o workflow foi salvo e está ativo.',
      });
      return;
    }

    console.log(`✅ Workflow encontrado: ${targetWorkflow.name} (${targetWorkflow.id})`);

    // Extrair telefone do body (pode estar em diferentes campos)
    const phone = bodyData.Telefone || bodyData.telefone || bodyData.phone || bodyData.Phone;
    
    if (!phone) {
      console.log(`⚠️ Telefone não encontrado no body`);
      res.status(400).json({
        status: 'error',
        message: 'Telefone não encontrado no payload. O campo deve conter "Telefone", "telefone", "phone" ou "Phone".',
      });
      return;
    }

    // Normalizar telefone usando função utilitária
    const { normalizePhone } = await import('../utils/numberNormalizer');
    const normalizedPhone = normalizePhone(phone, '55');
    if (!normalizedPhone) {
      res.status(400).json({
        status: 'error',
        message: 'Telefone inválido no payload',
      });
      return;
    }

    // Chamar endpoint do MindClerky para processar o webhook do Typebot
    try {
      await axios.post(
        `${MINDLERKY_CONFIG.URL}/workflows/webhook/typebot/${nodeId}`,
        payload, // Enviar o payload original completo
        {
          timeout: 30000, // 30 segundos de timeout (workflows podem demorar mais)
        }
      );

      res.status(200).json({
        status: 'success',
        message: 'Webhook processado com sucesso',
        workflowId: targetWorkflow.id,
        nodeId,
      });
    } catch (workflowError) {
      // Log apenas se não for erro de timeout ou conexão (pode ser que o MindClerky não esteja rodando)
      if (axios.isAxiosError(workflowError)) {
        if (workflowError.code === 'ECONNREFUSED' || workflowError.code === 'ETIMEDOUT') {
          console.warn('⚠️ MindClerky não está disponível. Webhook do Typebot não será processado.');
          res.status(503).json({
            status: 'error',
            message: 'Serviço de workflows temporariamente indisponível',
          });
          return;
        }
      }
      
      console.error('❌ Erro ao processar webhook do Typebot no MindClerky:', workflowError);
      throw workflowError; // Re-throw para ser capturado pelo catch externo
    }
  } catch (error: unknown) {
    console.error('❌ Erro ao processar webhook do Typebot:', error);
    return next(handleControllerError(error, 'Erro ao processar webhook do Typebot'));
  }
};

/**
 * Receber webhook genérico e fazer proxy para o MindClerky
 * POST /api/workflows/webhook/:nodeId
 */
export const receiveWebhook = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const payload = req.body;

    console.log(`📥 Webhook genérico recebido para nó ${nodeId}`);
    console.log(`📦 Payload recebido:`, JSON.stringify(payload, null, 2));

    // Fazer proxy direto para o MindClerky (sem validações, pois é webhook genérico)
    try {
      const response = await axios.post(
        `${MINDLERKY_CONFIG.URL}/workflows/webhook/${nodeId}`,
        payload, // Enviar o payload original completo
        {
          timeout: 30000, // 30 segundos de timeout (workflows podem demorar mais)
        }
      );

      // Retornar a resposta do MindClerky
      res.status(response.status).json(response.data);
    } catch (workflowError) {
      // Log apenas se não for erro de timeout ou conexão (pode ser que o MindClerky não esteja rodando)
      if (axios.isAxiosError(workflowError)) {
        if (workflowError.code === 'ECONNREFUSED' || workflowError.code === 'ETIMEDOUT') {
          console.warn('⚠️ MindClerky não está disponível. Webhook não será processado.');
          res.status(503).json({
            status: 'error',
            message: 'Serviço de workflows temporariamente indisponível',
          });
          return;
        }
        
        // Se o MindClerky retornou um erro, repassar a resposta
        if (workflowError.response) {
          res.status(workflowError.response.status || 500).json(
            workflowError.response.data || { status: 'error', message: 'Erro ao processar webhook' }
          );
          return;
        }
      }
      
      console.error('❌ Erro ao processar webhook no MindClerky:', workflowError);
      throw workflowError; // Re-throw para ser capturado pelo catch externo
    }
  } catch (error: unknown) {
    console.error('❌ Erro ao processar webhook:', error);
    return next(handleControllerError(error, 'Erro ao processar webhook'));
  }
};