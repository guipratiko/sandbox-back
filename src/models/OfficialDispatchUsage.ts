/**
 * Uso diário de disparos de template (conversation starts) por instância oficial.
 * Usado para limitar envios ao tier da Meta (ex.: TIER_250 = 250/dia).
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IOfficialDispatchUsage extends Document {
  instanceId: mongoose.Types.ObjectId;
  /** Data no formato YYYY-MM-DD (timezone do servidor) */
  date: string;
  /** Quantidade de mensagens de template enviadas neste dia */
  count: number;
  updatedAt: Date;
}

const OfficialDispatchUsageSchema = new Schema(
  {
    instanceId: { type: Schema.Types.ObjectId, ref: 'Instance', required: true },
    date: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

OfficialDispatchUsageSchema.index({ instanceId: 1, date: 1 }, { unique: true });

const OfficialDispatchUsage = mongoose.model<IOfficialDispatchUsage>(
  'OfficialDispatchUsage',
  OfficialDispatchUsageSchema
);

export default OfficialDispatchUsage;
