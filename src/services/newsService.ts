/**
 * Service para gerenciamento de Novidades do Sistema
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';

export interface SystemNews {
  id: string;
  type: 'system_update' | 'tool_update' | 'announcement';
  tool: string | null;
  title: string;
  description: string;
  fullContent: string | null;
  imageUrl: string | null;
  publishedAt: Date;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNewsData {
  type: 'system_update' | 'tool_update' | 'announcement';
  tool?: string | null;
  title: string;
  description: string;
  fullContent?: string | null;
  imageUrl?: string | null;
  publishedAt?: Date;
  isActive?: boolean;
  priority?: number;
}

export interface UpdateNewsData {
  type?: 'system_update' | 'tool_update' | 'announcement';
  tool?: string | null;
  title?: string;
  description?: string;
  fullContent?: string | null;
  imageUrl?: string | null;
  publishedAt?: Date;
  isActive?: boolean;
  priority?: number;
}

export class NewsService {
  /**
   * Obter últimas novidades ativas (para dashboard)
   * Ordenado por prioridade (maior primeiro) e data de publicação (mais recente primeiro)
   */
  static async getLatestNews(limit: number = 5): Promise<SystemNews[]> {
    const query = `
      SELECT 
        id,
        type,
        tool,
        title,
        description,
        full_content as "fullContent",
        image_url as "imageUrl",
        published_at as "publishedAt",
        is_active as "isActive",
        priority,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM system_news
      WHERE is_active = true
      ORDER BY priority DESC, published_at DESC
      LIMIT $1
    `;

    const result = await pgPool.query(query, [limit]);
    return result.rows.map(this.mapRowToNews);
  }

  /**
   * Obter todas as novidades ativas
   * Ordenado por prioridade (maior primeiro) e data de publicação (mais recente primeiro)
   */
  static async getAllActiveNews(): Promise<SystemNews[]> {
    const query = `
      SELECT 
        id,
        type,
        tool,
        title,
        description,
        full_content as "fullContent",
        image_url as "imageUrl",
        published_at as "publishedAt",
        is_active as "isActive",
        priority,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM system_news
      WHERE is_active = true
      ORDER BY priority DESC, published_at DESC
    `;

    const result = await pgPool.query(query);
    return result.rows.map(this.mapRowToNews);
  }

  /**
   * Obter todas as novidades (incluindo inativas) - para administração
   */
  static async getAllNews(): Promise<SystemNews[]> {
    const query = `
      SELECT 
        id,
        type,
        tool,
        title,
        description,
        full_content as "fullContent",
        image_url as "imageUrl",
        published_at as "publishedAt",
        is_active as "isActive",
        priority,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM system_news
      ORDER BY priority DESC, published_at DESC
    `;

    const result = await pgPool.query(query);
    return result.rows.map(this.mapRowToNews);
  }

  /**
   * Obter novidade por ID
   */
  static async getNewsById(id: string): Promise<SystemNews | null> {
    const query = `
      SELECT 
        id,
        type,
        tool,
        title,
        description,
        full_content as "fullContent",
        image_url as "imageUrl",
        published_at as "publishedAt",
        is_active as "isActive",
        priority,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM system_news
      WHERE id = $1
    `;

    const result = await pgPool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToNews(result.rows[0]);
  }

  /**
   * Criar nova novidade
   */
  static async createNews(data: CreateNewsData): Promise<SystemNews> {
    const query = `
      INSERT INTO system_news (type, tool, title, description, full_content, image_url, published_at, is_active, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        id,
        type,
        tool,
        title,
        description,
        full_content as "fullContent",
        image_url as "imageUrl",
        published_at as "publishedAt",
        is_active as "isActive",
        priority,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    const values = [
      data.type,
      data.tool || null,
      data.title,
      data.description,
      data.fullContent || null,
      data.imageUrl || null,
      data.publishedAt || new Date(),
      data.isActive ?? true,
      data.priority ?? 5,
    ];

    const result = await pgPool.query(query, values);
    return this.mapRowToNews(result.rows[0]);
  }

  /**
   * Atualizar novidade
   */
  static async updateNews(id: string, data: UpdateNewsData): Promise<SystemNews | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.type !== undefined) {
      updates.push(`type = $${paramIndex}`);
      values.push(data.type);
      paramIndex++;
    }

    if (data.tool !== undefined) {
      updates.push(`tool = $${paramIndex}`);
      values.push(data.tool);
      paramIndex++;
    }

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      values.push(data.title);
      paramIndex++;
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(data.description);
      paramIndex++;
    }

    if (data.fullContent !== undefined) {
      updates.push(`full_content = $${paramIndex}`);
      values.push(data.fullContent);
      paramIndex++;
    }

    if (data.imageUrl !== undefined) {
      updates.push(`image_url = $${paramIndex}`);
      values.push(data.imageUrl);
      paramIndex++;
    }

    if (data.publishedAt !== undefined) {
      updates.push(`published_at = $${paramIndex}`);
      values.push(data.publishedAt);
      paramIndex++;
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(data.isActive);
      paramIndex++;
    }

    if (data.priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      values.push(data.priority);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.getNewsById(id);
    }

    values.push(id);

    const query = `
      UPDATE system_news
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING 
        id,
        type,
        tool,
        title,
        description,
        full_content as "fullContent",
        image_url as "imageUrl",
        published_at as "publishedAt",
        is_active as "isActive",
        priority,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    const result = await pgPool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToNews(result.rows[0]);
  }

  /**
   * Deletar novidade
   */
  static async deleteNews(id: string): Promise<boolean> {
    const query = 'DELETE FROM system_news WHERE id = $1';
    const result = await pgPool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Mapeia uma row do PostgreSQL para o formato SystemNews
   */
  private static mapRowToNews(row: any): SystemNews {
    return {
      id: row.id,
      type: row.type,
      tool: row.tool,
      title: row.title,
      description: row.description,
      fullContent: row.fullContent,
      imageUrl: row.imageUrl,
      publishedAt: row.publishedAt,
      isActive: row.isActive,
      priority: row.priority,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
