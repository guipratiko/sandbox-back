/**
 * Ajuste manual: define meta_access_token em uma instância oficial (WHATSAPP-CLOUD)
 * que foi criada sem token (ex.: condição de corrida no Embedded Signup).
 *
 * Uso:
 *   INSTANCE_ID=<id_da_instancia> META_ACCESS_TOKEN=<token> npx ts-node --transpile-only src/scripts/fixOfficialInstanceToken.ts
 * Ou após build:
 *   INSTANCE_ID=<id> META_ACCESS_TOKEN=<token> node dist/scripts/fixOfficialInstanceToken.js
 *
 * O token deve ser um access token da Meta com permissão na WABA dessa instância.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { DATABASE_CONFIG } from '../config/constants';

async function run() {
  const instanceId = process.env.INSTANCE_ID?.trim();
  const token = process.env.META_ACCESS_TOKEN?.trim();

  if (!instanceId || !token) {
    console.error('Uso: INSTANCE_ID=<id> META_ACCESS_TOKEN=<token> npx ts-node --transpile-only src/scripts/fixOfficialInstanceToken.ts');
    process.exit(1);
  }

  console.log('Conectando ao MongoDB...');
  await mongoose.connect(DATABASE_CONFIG.URI);

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database não disponível');
  }

  const collection = db.collection('instances');
  let id: mongoose.Types.ObjectId;
  try {
    id = new mongoose.Types.ObjectId(instanceId);
  } catch {
    console.error('INSTANCE_ID inválido (deve ser um ObjectId válido).');
    process.exit(1);
  }

  const doc = await collection.findOne({ _id: id });
  if (!doc) {
    const official = await collection.find({ integration: 'WHATSAPP-CLOUD' }).project({ _id: 1, name: 1, waba_id: 1 }).limit(20).toArray();
    console.error('Nenhuma instância encontrada com esse _id.');
    if (official.length > 0) {
      console.error('IDs de instâncias oficiais (WHATSAPP-CLOUD) no banco:');
      const list = official as Array<{ _id: unknown; name?: string; waba_id?: string }>;
      list.forEach((o) => console.error(`  ${o._id}  name=${o.name || '—'}  waba_id=${o.waba_id || '—'}`));
    }
    await mongoose.connection.close();
    process.exit(1);
  }

  if ((doc as { integration?: string }).integration !== 'WHATSAPP-CLOUD') {
    console.error(`Instância encontrada mas integration="${doc.integration}" (não é WHATSAPP-CLOUD). Não atualizado.`);
    await mongoose.connection.close();
    process.exit(1);
  }

  const result = await collection.updateOne(
    { _id: id },
    { $set: { meta_access_token: token } }
  );
  await mongoose.connection.close();

  if (result.modifiedCount === 0) {
    console.log('Instância já tinha o mesmo token ou nada foi alterado.');
  } else {
    console.log('Instância atualizada: meta_access_token definido.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
