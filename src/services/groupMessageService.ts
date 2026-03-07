import { pgPool } from '../config/databases';

export type GroupMessageType = 'text' | 'media' | 'poll' | 'contact' | 'location' | 'audio';

export interface GroupMessageTemplate {
  id: string;
  userId: string;
  instanceId: string;
  name: string;
  description: string | null;
  messageType: GroupMessageType;
  contentJson: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGroupMessageTemplateData {
  userId: string;
  instanceId: string;
  name: string;
  description?: string | null;
  messageType: GroupMessageType;
  contentJson: any;
}

export interface UpdateGroupMessageTemplateData {
  name?: string;
  description?: string | null;
  contentJson?: any;
}

export type GroupMessageTargetType = 'all' | 'specific';

export type GroupScheduledMessageStatus =
  | 'scheduled'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'cancelled';

export interface GroupScheduledMessage {
  id: string;
  userId: string;
  instanceId: string;
  templateId: string | null;
  messageType: GroupMessageType;
  contentJson: any;
  targetType: GroupMessageTargetType;
  groupIds: string[] | null;
  scheduledAt: Date;
  status: GroupScheduledMessageStatus;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleGroupMessageData {
  userId: string;
  instanceId: string;
  templateId?: string | null;
  messageType: GroupMessageType;
  contentJson: any;
  targetType: GroupMessageTargetType;
  groupIds?: string[];
  scheduledAt: Date;
}

export class GroupMessageService {
  // =======================
  // Templates
  // =======================

  static mapRowToTemplate(row: any): GroupMessageTemplate {
    return {
      id: row.id,
      userId: row.user_id,
      instanceId: row.instance_id,
      name: row.name,
      description: row.description,
      messageType: row.message_type,
      contentJson: row.content_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static async createTemplate(
    data: CreateGroupMessageTemplateData
  ): Promise<GroupMessageTemplate> {
    const query = `
      INSERT INTO group_message_templates (
        user_id, instance_id, name, description, message_type, content_json
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pgPool.query(query, [
      data.userId,
      data.instanceId,
      data.name,
      data.description || null,
      data.messageType,
      data.contentJson,
    ]);

    return this.mapRowToTemplate(result.rows[0]);
  }

  static async updateTemplate(
    id: string,
    userId: string,
    updates: UpdateGroupMessageTemplateData
  ): Promise<GroupMessageTemplate> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${index++}`);
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      fields.push(`description = $${index++}`);
      values.push(updates.description);
    }

    if (updates.contentJson !== undefined) {
      fields.push(`content_json = $${index++}`);
      values.push(updates.contentJson);
    }

    if (fields.length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    // updated_at
    fields.push(`updated_at = NOW()`);

    const query = `
      UPDATE group_message_templates
      SET ${fields.join(', ')}
      WHERE id = $${index} AND user_id = $${index + 1}
      RETURNING *
    `;

    values.push(id, userId);

    const result = await pgPool.query(query, values);
    if (result.rows.length === 0) {
      throw new Error('Template não encontrado');
    }

    return this.mapRowToTemplate(result.rows[0]);
  }

  static async deleteTemplate(id: string, userId: string): Promise<void> {
    const query = `
      DELETE FROM group_message_templates
      WHERE id = $1 AND user_id = $2
    `;

    await pgPool.query(query, [id, userId]);
  }

  static async getTemplatesByInstance(
    userId: string,
    instanceId: string
  ): Promise<GroupMessageTemplate[]> {
    const query = `
      SELECT * FROM group_message_templates
      WHERE user_id = $1 AND instance_id = $2
      ORDER BY created_at DESC
    `;

    const result = await pgPool.query(query, [userId, instanceId]);
    return result.rows.map((row) => this.mapRowToTemplate(row));
  }

  static async getTemplateById(
    id: string,
    userId: string
  ): Promise<GroupMessageTemplate | null> {
    const query = `
      SELECT * FROM group_message_templates
      WHERE id = $1 AND user_id = $2
    `;

    const result = await pgPool.query(query, [id, userId]);
    if (result.rows.length === 0) return null;
    return this.mapRowToTemplate(result.rows[0]);
  }

  // =======================
  // Agendamentos
  // =======================

  static mapRowToScheduled(row: any): GroupScheduledMessage {
    return {
      id: row.id,
      userId: row.user_id,
      instanceId: row.instance_id,
      templateId: row.template_id,
      messageType: row.message_type,
      contentJson: row.content_json,
      targetType: row.target_type,
      groupIds: row.group_ids,
      scheduledAt: row.scheduled_at,
      status: row.status,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static async scheduleMessage(
    data: ScheduleGroupMessageData
  ): Promise<GroupScheduledMessage> {
    const query = `
      INSERT INTO group_scheduled_messages (
        user_id,
        instance_id,
        template_id,
        message_type,
        content_json,
        target_type,
        group_ids,
        scheduled_at,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
      RETURNING *
    `;

    const result = await pgPool.query(query, [
      data.userId,
      data.instanceId,
      data.templateId || null,
      data.messageType,
      data.contentJson,
      data.targetType,
      data.groupIds && data.groupIds.length > 0 ? data.groupIds : null,
      data.scheduledAt,
    ]);

    return this.mapRowToScheduled(result.rows[0]);
  }

  static async getScheduledMessages(
    userId: string,
    instanceId: string
  ): Promise<GroupScheduledMessage[]> {
    const query = `
      SELECT * FROM group_scheduled_messages
      WHERE user_id = $1 AND instance_id = $2
      ORDER BY scheduled_at DESC
    `;

    const result = await pgPool.query(query, [userId, instanceId]);
    return result.rows.map((row) => this.mapRowToScheduled(row));
  }

  static async getDueMessages(limit: number = 50): Promise<GroupScheduledMessage[]> {
    const query = `
      SELECT * FROM group_scheduled_messages
      WHERE status = 'scheduled'
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT $1
    `;

    const result = await pgPool.query(query, [limit]);
    return result.rows.map((row) => this.mapRowToScheduled(row));
  }

  static async updateScheduledStatus(
    id: string,
    status: GroupScheduledMessageStatus,
    lastError?: string | null
  ): Promise<void> {
    const query = `
      UPDATE group_scheduled_messages
      SET status = $1,
          last_error = $2,
          updated_at = NOW()
      WHERE id = $3
    `;

    await pgPool.query(query, [status, lastError || null, id]);
  }

  static async cancelScheduledMessage(id: string, userId: string): Promise<void> {
    const query = `
      UPDATE group_scheduled_messages
      SET status = 'cancelled',
          updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'scheduled'
    `;

    await pgPool.query(query, [id, userId]);
  }
}

