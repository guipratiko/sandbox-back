/**
 * Gera ID curto alfanumérico (6 caracteres) para mídias e localizações do agente.
 * Usado no prompt: "use a tool ID: CbWa3"
 */
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generateShortId(length: number = 6): string {
  let id = '';
  for (let i = 0; i < length; i++) {
    id += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return id;
}
