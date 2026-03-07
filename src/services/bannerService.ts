/**
 * Service para gerenciamento de Banners do Dashboard
 * Trabalha com PostgreSQL
 */

import { pgPool } from '../config/databases';

export interface Banner {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBannerData {
  imageUrl: string;
  linkUrl?: string | null;
  title?: string | null;
  order?: number;
  isActive?: boolean;
}

export interface UpdateBannerData {
  imageUrl?: string;
  linkUrl?: string | null;
  title?: string | null;
  order?: number;
  isActive?: boolean;
}

export class BannerService {
  /**
   * Obter todos os banners ativos, ordenados por ordem
   */
  static async getActiveBanners(): Promise<Banner[]> {
    const query = `
      SELECT 
        id,
        image_url as "imageUrl",
        link_url as "linkUrl",
        title,
        "order",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM banners
      WHERE is_active = true
      ORDER BY "order" ASC, created_at ASC
    `;

    const result = await pgPool.query(query);
    return result.rows.map(this.mapRowToBanner);
  }

  /**
   * Obter todos os banners (incluindo inativos) - para administração
   */
  static async getAllBanners(): Promise<Banner[]> {
    const query = `
      SELECT 
        id,
        image_url as "imageUrl",
        link_url as "linkUrl",
        title,
        "order",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM banners
      ORDER BY "order" ASC, created_at ASC
    `;

    const result = await pgPool.query(query);
    return result.rows.map(this.mapRowToBanner);
  }

  /**
   * Obter banner por ID
   */
  static async getBannerById(id: string): Promise<Banner | null> {
    const query = `
      SELECT 
        id,
        image_url as "imageUrl",
        link_url as "linkUrl",
        title,
        "order",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM banners
      WHERE id = $1
    `;

    const result = await pgPool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToBanner(result.rows[0]);
  }

  /**
   * Criar novo banner
   */
  static async createBanner(data: CreateBannerData): Promise<Banner> {
    const query = `
      INSERT INTO banners (image_url, link_url, title, "order", is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING 
        id,
        image_url as "imageUrl",
        link_url as "linkUrl",
        title,
        "order",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    const values = [
      data.imageUrl,
      data.linkUrl || null,
      data.title || null,
      data.order ?? 0,
      data.isActive ?? true,
    ];

    const result = await pgPool.query(query, values);
    return this.mapRowToBanner(result.rows[0]);
  }

  /**
   * Atualizar banner
   */
  static async updateBanner(id: string, data: UpdateBannerData): Promise<Banner | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.imageUrl !== undefined) {
      updates.push(`image_url = $${paramIndex}`);
      values.push(data.imageUrl);
      paramIndex++;
    }

    if (data.linkUrl !== undefined) {
      updates.push(`link_url = $${paramIndex}`);
      values.push(data.linkUrl);
      paramIndex++;
    }

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      values.push(data.title);
      paramIndex++;
    }

    if (data.order !== undefined) {
      updates.push(`"order" = $${paramIndex}`);
      values.push(data.order);
      paramIndex++;
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(data.isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.getBannerById(id);
    }

    values.push(id);

    const query = `
      UPDATE banners
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING 
        id,
        image_url as "imageUrl",
        link_url as "linkUrl",
        title,
        "order",
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    const result = await pgPool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToBanner(result.rows[0]);
  }

  /**
   * Deletar banner
   */
  static async deleteBanner(id: string): Promise<boolean> {
    const query = 'DELETE FROM banners WHERE id = $1';
    const result = await pgPool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Mapeia uma row do PostgreSQL para o formato Banner
   */
  private static mapRowToBanner(row: any): Banner {
    return {
      id: row.id,
      imageUrl: row.imageUrl,
      linkUrl: row.linkUrl,
      title: row.title,
      order: row.order,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
