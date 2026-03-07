/**
 * Migração: substituir campo isPremium por premiumPlan na coleção users (MongoDB).
 *
 * - Usuários com isPremium: true  → premiumPlan: 'pro'
 * - Usuários com isPremium: false ou sem o campo → premiumPlan: 'free'
 * - Remove o campo isPremium dos documentos
 *
 * Uso: npx ts-node --transpile-only src/scripts/migrateIsPremiumToPremiumPlan.ts
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { DATABASE_CONFIG } from '../config/constants';

async function run() {
  console.log('Conectando ao MongoDB...');
  await mongoose.connect(DATABASE_CONFIG.URI);

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database não disponível');
  }

  const collection = db.collection('users');

  // 1) Usuários com isPremium true → premiumPlan 'pro'
  const resultPro = await collection.updateMany(
    { isPremium: true },
    { $set: { premiumPlan: 'pro' }, $unset: { isPremium: '' } }
  );
  console.log(`Atualizados para premiumPlan 'pro': ${resultPro.modifiedCount}`);

  // 2) Usuários com isPremium false ou sem o campo → premiumPlan 'free'
  const resultFree = await collection.updateMany(
    { $or: [{ isPremium: false }, { isPremium: { $exists: false } }] },
    { $set: { premiumPlan: 'free' }, $unset: { isPremium: '' } }
  );
  console.log(`Atualizados para premiumPlan 'free': ${resultFree.modifiedCount}`);

  // 3) Garantir que qualquer documento sem premiumPlan receba 'free'
  const resultMissing = await collection.updateMany(
    { premiumPlan: { $exists: false } },
    { $set: { premiumPlan: 'free' } }
  );
  console.log(`Documentos sem premiumPlan definido como 'free': ${resultMissing.modifiedCount}`);

  console.log('Migração concluída.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
