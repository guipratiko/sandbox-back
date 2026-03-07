/**
 * Utilitário para parsing de arquivos CSV
 * Suporta dois formatos:
 * 1. Apenas números: primeira coluna = número
 * 2. Nome e número: primeira coluna = nome, segunda coluna = número
 */

export interface ParsedContact {
  phone: string;
  name?: string;
}

/**
 * Parse de uma linha CSV
 * @param line - Linha do CSV
 * @returns Objeto com phone e name (se disponível)
 */
const parseCSVLine = (line: string): ParsedContact | null => {
  if (!line || !line.trim()) {
    return null;
  }

  // Remover espaços e dividir por vírgula ou ponto e vírgula
  const parts = line
    .trim()
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return null;
  }

  // Se tem apenas uma coluna, assumir que é o número
  if (parts.length === 1) {
    return {
      phone: parts[0],
    };
  }

  // Se tem duas ou mais colunas, primeira = nome, segunda = número
  return {
    name: parts[0],
    phone: parts[1],
  };
};

/**
 * Detecta se a primeira linha é um cabeçalho
 * @param line - Linha a ser verificada
 * @returns true se for um cabeçalho
 */
const isHeaderLine = (line: string): boolean => {
  const lowerLine = line.toLowerCase();
  const headerKeywords = [
    'nome', 'name', 'telefone', 'phone', 'número', 'numero', 'celular',
    'whatsapp', 'contato', 'contact'
  ];
  return headerKeywords.some(keyword => lowerLine.includes(keyword));
};

/**
 * Parse de texto CSV (campo de digitação)
 * @param csvText - Texto CSV (pode ter múltiplas linhas)
 * @returns Array de contatos parseados
 */
export const parseCSVText = (csvText: string): ParsedContact[] => {
  if (!csvText || !csvText.trim()) {
    return [];
  }

  // Dividir por linhas - suporta \r\n (Windows), \n (Unix/Linux), ou \r (Mac antigo/Excel)
  const lines = csvText.split(/\r\n|\r|\n/);

  // Detectar se a primeira linha é um cabeçalho
  let startIndex = 0;
  if (lines.length > 0 && isHeaderLine(lines[0])) {
    startIndex = 1; // Pular a primeira linha
  }

  // Parsear cada linha
  const contacts: ParsedContact[] = [];
  for (let i = startIndex; i < lines.length; i++) {
    const contact = parseCSVLine(lines[i]);
    if (contact) {
      contacts.push(contact);
    }
  }

  return contacts;
};

/**
 * Parse de arquivo CSV (Buffer)
 * @param fileBuffer - Buffer do arquivo CSV
 * @returns Array de contatos parseados
 */
export const parseCSVFile = async (fileBuffer: Buffer): Promise<ParsedContact[]> => {
  // Converter buffer para string
  const csvText = fileBuffer.toString('utf-8');

  // Usar a mesma lógica de parse de texto
  return parseCSVText(csvText);
};

/**
 * Parse de campo de digitação (formato: nome;número ou apenas número)
 * @param inputText - Texto de entrada (pode ter múltiplas linhas)
 * @returns Array de contatos parseados
 */
export const parseInputText = (inputText: string): ParsedContact[] => {
  if (!inputText || !inputText.trim()) {
    return [];
  }

  // Dividir por linhas - suporta \r\n (Windows), \n (Unix/Linux), ou \r (Mac antigo/Excel)
  const lines = inputText.split(/\r\n|\r|\n/);

  const contacts: ParsedContact[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Verificar se tem ponto e vírgula (formato: nome;número)
    if (trimmed.includes(';')) {
      const parts = trimmed.split(';').map((p) => p.trim());
      if (parts.length >= 2) {
        contacts.push({
          name: parts[0],
          phone: parts[1],
        });
      } else if (parts.length === 1) {
        // Apenas número após o ponto e vírgula
        contacts.push({
          phone: parts[0],
        });
      }
    } else {
      // Apenas número
      contacts.push({
        phone: trimmed,
      });
    }
  }

  return contacts;
};

