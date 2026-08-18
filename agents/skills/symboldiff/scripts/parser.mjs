/**
 * Multi-language structural symbol parser for symboldiff.
 * Extracts symbols (functions, methods, classes, types, interfaces, enums)
 * along with their signatures, parameter types, return types, and bodies.
 */

import crypto from 'node:crypto';

/**
 * @typedef {Object} SymbolDescriptor
 * @property {string} id Unique identifier within file (e.g. 'CanvasEditor' or 'CanvasEditor.handleSave')
 * @property {string} name Base symbol name
 * @property {'function' | 'method' | 'class' | 'interface' | 'type' | 'enum' | 'const' | 'struct' | 'trait'} kind
 * @property {string} signature Full signature string
 * @property {string|null} returnType
 * @property {Array<{name: string, type?: string, default?: string}>} params
 * @property {string|null} generics
 * @property {boolean} isExported
 * @property {boolean} isAsync
 * @property {number} startLine
 * @property {number} endLine
 * @property {string} bodyHash SHA-256 hash of symbol body
 * @property {string} rawDeclaration Full raw declaration text
 */

/**
 * Hash string content for body comparison
 * @param {string} str 
 * @returns {string}
 */
export function hashContent(str) {
  const normalized = str.replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Parse symbols from source code according to file extension
 * @param {string} content 
 * @param {string} filePath 
 * @returns {SymbolDescriptor[]}
 */
export function parseSymbols(content, filePath) {
  if (!content || typeof content !== 'string') return [];

  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    return parseTypeScriptJavaScript(content);
  } else if (['py', 'pyw'].includes(ext)) {
    return parsePython(content);
  } else if (['rs'].includes(ext)) {
    return parseRust(content);
  } else if (['go'].includes(ext)) {
    return parseGo(content);
  }

  // Fallback generic scanner
  return parseGeneric(content);
}

/**
 * Replace comments, string literals, and regexes with whitespace to prevent
 * them from triggering false-positive symbol matches, while preserving exact line counts.
 */
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, match => ' '.repeat(match.length))
    .replace(/`[\s\S]*?`/g, match => match.replace(/[^\n]/g, ' '))
    .replace(/'(?:\\.|[^'\\])*'/g, match => ' '.repeat(match.length))
    .replace(/"(?:\\.|[^"\\])*"/g, match => ' '.repeat(match.length));
}

/**
 * Parse TypeScript / JavaScript files
 * @param {string} content 
 * @returns {SymbolDescriptor[]}
 */
export function parseTypeScriptJavaScript(content) {
  const cleanContent = stripComments(content);
  const symbols = [];
  const lines = content.split('\n');

  // Helper to extract line number from character index
  function getLineNumber(idx) {
    let count = 1;
    for (let i = 0; i < idx && i < content.length; i++) {
      if (content[i] === '\n') count++;
    }
    return count;
  }

  // 1. Interfaces & Types
  // export interface Name<T> { ... }
  const interfaceRegex = /(?:export\s+)?(?:default\s+)?interface\s+([A-Za-z0-9_$]+)(<[^>]+>)?(?:\s+extends\s+[^{]+)?\s*\{/g;
  let match;
  while ((match = interfaceRegex.exec(cleanContent)) !== null) {
    const isExported = match[0].includes('export');
    const name = match[1];
    const generics = match[2] || null;
    const startIdx = match.index;
    const startLine = getLineNumber(startIdx);
    
    // Find matching closing brace
    const block = extractBraceBlock(content, startIdx + match[0].length - 1);
    const endLine = startLine + (block.text.split('\n').length - 1);
    
    symbols.push({
      id: name,
      name,
      kind: 'interface',
      signature: `interface ${name}${generics || ''}`,
      returnType: null,
      params: [],
      generics,
      isExported,
      isAsync: false,
      startLine,
      endLine,
      bodyHash: hashContent(block.text),
      rawDeclaration: match[0]
    });
  }

  // 2. Type Aliases
  // export type Name<T> = ...;
  const typeRegex = /(?:export\s+)?type\s+([A-Za-z0-9_$]+)(<[^>]+>)?\s*=\s*([^;\n]+(?:;|\n))/g;
  while ((match = typeRegex.exec(cleanContent)) !== null) {
    const isExported = match[0].includes('export');
    const name = match[1];
    const generics = match[2] || null;
    const typeDef = match[3].replace(/[;\n]/g, '').trim();
    const startLine = getLineNumber(match.index);

    symbols.push({
      id: name,
      name,
      kind: 'type',
      signature: `type ${name}${generics || ''} = ${typeDef}`,
      returnType: typeDef,
      params: [],
      generics,
      isExported,
      isAsync: false,
      startLine,
      endLine: startLine + match[0].split('\n').length - 1,
      bodyHash: hashContent(typeDef),
      rawDeclaration: match[0]
    });
  }

  // 3. Enums
  // export enum Name { ... }
  const enumRegex = /(?:export\s+)?enum\s+([A-Za-z0-9_$]+)\s*\{/g;
  while ((match = enumRegex.exec(cleanContent)) !== null) {
    const isExported = match[0].includes('export');
    const name = match[1];
    const startIdx = match.index;
    const startLine = getLineNumber(startIdx);
    const block = extractBraceBlock(content, startIdx + match[0].length - 1);

    symbols.push({
      id: name,
      name,
      kind: 'enum',
      signature: `enum ${name}`,
      returnType: null,
      params: [],
      generics: null,
      isExported,
      isAsync: false,
      startLine,
      endLine: startLine + (block.text.split('\n').length - 1),
      bodyHash: hashContent(block.text),
      rawDeclaration: match[0]
    });
  }

  // 4. Classes & Class Methods
  const classRegex = /(?:export\s+)?(?:default\s+)?class\s+([A-Za-z0-9_$]+)(<[^>]+>)?(?:\s+extends\s+[A-Za-z0-9_$.<>\s]+)?(?:\s+implements\s+[A-Za-z0-9_$,.<>\s]+)?\s*\{/g;
  while ((match = classRegex.exec(cleanContent)) !== null) {
    const isExported = match[0].includes('export');
    const className = match[1];
    const generics = match[2] || null;
    const startIdx = match.index;
    const startLine = getLineNumber(startIdx);
    const block = extractBraceBlock(content, startIdx + match[0].length - 1);
    const endLine = startLine + (block.text.split('\n').length - 1);

    symbols.push({
      id: className,
      name: className,
      kind: 'class',
      signature: `class ${className}${generics || ''}`,
      returnType: null,
      params: [],
      generics,
      isExported,
      isAsync: false,
      startLine,
      endLine,
      bodyHash: hashContent(block.text),
      rawDeclaration: match[0]
    });

    // Extract class methods inside class body
    parseClassMembers(block.text, className, startLine, symbols);
  }

  // 5. Functions (Standard & Exported)
  // [export] [default] [async] function name<T>(params): ReturnType {
  const funcRegex = /(?:export\s+)?(?:default\s+)?(async\s+)?function\s*([A-Za-z0-9_$]*)(<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g;
  while ((match = funcRegex.exec(cleanContent)) !== null) {
    const isExported = match[0].includes('export');
    const isAsync = !!match[1];
    const name = match[2] || 'default_function';
    const generics = match[3] || null;
    const rawParams = match[4] || '';
    const returnType = match[5]?.trim() || null;
    const startIdx = match.index;
    const startLine = getLineNumber(startIdx);
    const block = extractBraceBlock(content, startIdx + match[0].length - 1);
    const endLine = startLine + (block.text.split('\n').length - 1);

    const params = parseParams(rawParams);
    const sig = `${isAsync ? 'async ' : ''}function ${name}${generics || ''}(${cleanParams(rawParams)})${returnType ? `: ${returnType}` : ''}`;

    symbols.push({
      id: name,
      name,
      kind: 'function',
      signature: sig,
      returnType,
      params,
      generics,
      isExported,
      isAsync,
      startLine,
      endLine,
      bodyHash: hashContent(block.text),
      rawDeclaration: match[0]
    });
  }

  // 6. Arrow Functions & Variable Functions:
  // [export] const name = [async] (<params>): ReturnType => {
  const arrowRegex = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(async\s+)?(?:(<[^>]+>)\s*)?(?:\(([^)]*)\)|([A-Za-z0-9_$]+))(?:\s*:\s*([^=]+))?\s*=>\s*(\{)?/g;
  while ((match = arrowRegex.exec(cleanContent)) !== null) {
    const isExported = match[0].includes('export');
    const name = match[1];
    const isAsync = !!match[2];
    const generics = match[3] || null;
    const rawParams = match[4] || match[5] || '';
    const returnType = match[6]?.trim() || null;
    const hasBrace = !!match[7];
    const startIdx = match.index;
    const startLine = getLineNumber(startIdx);
    
    let bodyText = '';
    let endLine = startLine;
    if (hasBrace) {
      const block = extractBraceBlock(content, startIdx + match[0].length - 1);
      bodyText = block.text;
      endLine = startLine + (block.text.split('\n').length - 1);
    } else {
      // Expression body until semicolon or newline
      const rest = content.slice(startIdx + match[0].length);
      const endOfExp = rest.indexOf(';') !== -1 ? rest.indexOf(';') : rest.indexOf('\n');
      bodyText = rest.slice(0, endOfExp !== -1 ? endOfExp : 50);
      endLine = startLine + bodyText.split('\n').length - 1;
    }

    const params = parseParams(rawParams);
    const sig = `const ${name}${generics || ''} = ${isAsync ? 'async ' : ''}(${cleanParams(rawParams)})${returnType ? `: ${returnType}` : ''}`;

    symbols.push({
      id: name,
      name,
      kind: 'function',
      signature: sig,
      returnType,
      params,
      generics,
      isExported,
      isAsync,
      startLine,
      endLine,
      bodyHash: hashContent(bodyText),
      rawDeclaration: match[0]
    });
  }

  // Deduplicate and sort symbols by startLine
  return deduplicateSymbols(symbols);
}

/**
 * Extract methods inside a class body
 */
function parseClassMembers(classBody, className, classStartLine, symbols) {
  const methodRegex = /(?:public|private|protected|static|override|readonly|\s)*(async\s+)?([A-Za-z0-9_$]+)(<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g;
  let match;
  while ((match = methodRegex.exec(classBody)) !== null) {
    const isAsync = !!match[1];
    const methodName = match[2];
    if (['if', 'for', 'while', 'switch', 'catch', 'function'].includes(methodName)) continue;
    
    const generics = match[3] || null;
    const rawParams = match[4] || '';
    const returnType = match[5]?.trim() || null;
    const block = extractBraceBlock(classBody, match.index + match[0].length - 1);
    
    // Relative line numbers inside class body
    const relativeLine = classBody.slice(0, match.index).split('\n').length - 1;
    const startLine = classStartLine + relativeLine;
    const endLine = startLine + (block.text.split('\n').length - 1);
    
    const params = parseParams(rawParams);
    const sig = `${isAsync ? 'async ' : ''}${methodName}${generics || ''}(${cleanParams(rawParams)})${returnType ? `: ${returnType}` : ''}`;

    symbols.push({
      id: `${className}.${methodName}`,
      name: `${className}.${methodName}`,
      kind: 'method',
      signature: sig,
      returnType,
      params,
      generics,
      isExported: false,
      isAsync,
      startLine,
      endLine,
      bodyHash: hashContent(block.text),
      rawDeclaration: match[0]
    });
  }
}

/**
 * Parse Python files
 * @param {string} content 
 * @returns {SymbolDescriptor[]}
 */
export function parsePython(content) {
  const symbols = [];
  const lines = content.split('\n');

  let currentClass = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const indent = line.length - line.trimStart().length;

    // Reset current class if indentation returns to 0
    if (indent === 0) {
      currentClass = null;
    }

    // Classes: class Foo(Bar):
    const classMatch = trimmed.match(/^class\s+([A-Za-z0-9_]+)(?:\(([^)]*)\))?:/);
    if (classMatch) {
      const className = classMatch[1];
      const baseClasses = classMatch[2] || null;
      currentClass = className;
      
      const body = extractPythonBlock(lines, i, indent);
      symbols.push({
        id: className,
        name: className,
        kind: 'class',
        signature: `class ${className}${baseClasses ? `(${baseClasses})` : ''}`,
        returnType: null,
        params: [],
        generics: null,
        isExported: true,
        isAsync: false,
        startLine: i + 1,
        endLine: i + body.lineCount,
        bodyHash: hashContent(body.text),
        rawDeclaration: trimmed
      });
      continue;
    }

    // Functions/Methods: [async] def name(params) -> ReturnType:
    const funcMatch = trimmed.match(/^(async\s+)?def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/);
    if (funcMatch) {
      const isAsync = !!funcMatch[1];
      const rawName = funcMatch[2];
      const rawParams = funcMatch[3] || '';
      const returnType = funcMatch[4]?.trim() || null;
      
      const name = currentClass ? `${currentClass}.${rawName}` : rawName;
      const kind = currentClass ? 'method' : 'function';
      const body = extractPythonBlock(lines, i, indent);

      const params = parseParams(rawParams);
      const sig = `${isAsync ? 'async ' : ''}def ${rawName}(${cleanParams(rawParams)})${returnType ? ` -> ${returnType}` : ''}`;

      symbols.push({
        id: name,
        name,
        kind,
        signature: sig,
        returnType,
        params,
        generics: null,
        isExported: !rawName.startsWith('_') || rawName.startsWith('__init__'),
        isAsync,
        startLine: i + 1,
        endLine: i + body.lineCount,
        bodyHash: hashContent(body.text),
        rawDeclaration: trimmed
      });
    }
  }

  return deduplicateSymbols(symbols);
}

/**
 * Parse Rust files
 * @param {string} content 
 * @returns {SymbolDescriptor[]}
 */
export function parseRust(content) {
  const symbols = [];
  const lines = content.split('\n');

  function getLineNumber(idx) {
    let count = 1;
    for (let i = 0; i < idx && i < content.length; i++) {
      if (content[i] === '\n') count++;
    }
    return count;
  }

  // Structs, Enums, Traits
  const typeRegex = /(pub\s+)?(struct|enum|trait)\s+([A-Za-z0-9_]+)(<[^>]+>)?/g;
  let match;
  while ((match = typeRegex.exec(content)) !== null) {
    const isExported = !!match[1];
    const kind = match[2];
    const name = match[3];
    const generics = match[4] || null;
    const startLine = getLineNumber(match.index);

    symbols.push({
      id: name,
      name,
      kind: kind === 'struct' ? 'struct' : (kind === 'trait' ? 'trait' : 'enum'),
      signature: `${isExported ? 'pub ' : ''}${kind} ${name}${generics || ''}`,
      returnType: null,
      params: [],
      generics,
      isExported,
      isAsync: false,
      startLine,
      endLine: startLine + 5,
      bodyHash: hashContent(name),
      rawDeclaration: match[0]
    });
  }

  // Functions & Methods: [pub] [async] [unsafe] fn name<T>(params) [-> Ret] [{|;]
  const fnRegex = /(pub(?:\([^)]+\))?\s+)?(?:(async|unsafe|const)\s+)?fn\s+([A-Za-z0-9_]+)(<[^>]+>)?\s*\(([^)]*)\)(?:\s*->\s*([^{\n;]+))?\s*([;{])/g;
  while ((match = fnRegex.exec(content)) !== null) {
    const isExported = !!match[1];
    const isAsync = match[2] === 'async';
    const name = match[3];
    const generics = match[4] || null;
    const rawParams = match[5] || '';
    const returnType = match[6]?.trim() || null;
    const isBlock = match[7] === '{';
    const startIdx = match.index;
    const startLine = getLineNumber(startIdx);
    
    let blockText = '';
    let endLine = startLine;
    if (isBlock) {
      const block = extractBraceBlock(content, startIdx + match[0].length - 1);
      blockText = block.text;
      endLine = startLine + (block.text.split('\n').length - 1);
    } else {
      blockText = match[0];
    }

    const sig = `${isExported ? 'pub ' : ''}${isAsync ? 'async ' : ''}fn ${name}${generics || ''}(${cleanParams(rawParams)})${returnType ? ` -> ${returnType}` : ''}`;

    symbols.push({
      id: name,
      name,
      kind: 'function',
      signature: sig,
      returnType,
      params: parseParams(rawParams),
      generics,
      isExported,
      isAsync,
      startLine,
      endLine,
      bodyHash: hashContent(blockText),
      rawDeclaration: match[0]
    });
  }

  return deduplicateSymbols(symbols);
}

/**
 * Parse Go files
 * @param {string} content 
 * @returns {SymbolDescriptor[]}
 */
export function parseGo(content) {
  const symbols = [];
  
  function getLineNumber(idx) {
    let count = 1;
    for (let i = 0; i < idx && i < content.length; i++) {
      if (content[i] === '\n') count++;
    }
    return count;
  }

  // Structs & Interfaces: type Name struct/interface
  const typeRegex = /type\s+([A-Za-z0-9_]+)\s+(struct|interface)\s*\{/g;
  let match;
  while ((match = typeRegex.exec(content)) !== null) {
    const name = match[1];
    const kind = match[2];
    const startIdx = match.index;
    const startLine = getLineNumber(startIdx);
    const block = extractBraceBlock(content, startIdx + match[0].length - 1);

    symbols.push({
      id: name,
      name,
      kind: kind === 'interface' ? 'interface' : 'struct',
      signature: `type ${name} ${kind}`,
      returnType: null,
      params: [],
      generics: null,
      isExported: /^[A-Z]/.test(name),
      isAsync: false,
      startLine,
      endLine: startLine + (block.text.split('\n').length - 1),
      bodyHash: hashContent(block.text),
      rawDeclaration: match[0]
    });
  }

  // Functions & Methods: func [(r *Recv)] Name(params) (returns) {
  const funcRegex = /func\s*(?:\(([^)]+)\)\s*)?([A-Za-z0-9_]+)\s*\(([^)]*)\)(?:\s*(\([^)]+\)|[^{]+))?\s*\{/g;
  while ((match = funcRegex.exec(content)) !== null) {
    const receiver = match[1]?.trim();
    const rawName = match[2];
    const rawParams = match[3] || '';
    const returnType = match[4]?.trim() || null;
    const startIdx = match.index;
    const startLine = getLineNumber(startIdx);
    const block = extractBraceBlock(content, startIdx + match[0].length - 1);

    const name = receiver ? `${receiver.split(/\s+/).pop()?.replace(/[*&]/g, '')}.${rawName}` : rawName;
    const sig = `func ${receiver ? `(${receiver}) ` : ''}${rawName}(${cleanParams(rawParams)})${returnType ? ` ${returnType}` : ''}`;

    symbols.push({
      id: name,
      name,
      kind: receiver ? 'method' : 'function',
      signature: sig,
      returnType,
      params: parseParams(rawParams),
      generics: null,
      isExported: /^[A-Z]/.test(rawName),
      isAsync: false,
      startLine,
      endLine: startLine + (block.text.split('\n').length - 1),
      bodyHash: hashContent(block.text),
      rawDeclaration: match[0]
    });
  }

  return deduplicateSymbols(symbols);
}

/**
 * Generic fallback parser
 */
export function parseGeneric(content) {
  return [];
}

/**
 * Helper to match balanced curly braces { ... }
 */
function extractBraceBlock(content, openBraceIdx) {
  if (content[openBraceIdx] !== '{') {
    return { text: '', endIdx: openBraceIdx };
  }
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = openBraceIdx; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];

    if (!inString && c === '/' && next === '/') {
      const nextLine = content.indexOf('\n', i);
      if (nextLine === -1) break;
      i = nextLine;
      continue;
    }

    if (!inString && (c === '"' || c === "'" || c === '`')) {
      inString = true;
      stringChar = c;
      continue;
    } else if (inString && c === stringChar && content[i - 1] !== '\\') {
      inString = false;
      continue;
    }

    if (!inString) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          return {
            text: content.slice(openBraceIdx, i + 1),
            endIdx: i
          };
        }
      }
    }
  }

  return { text: content.slice(openBraceIdx, Math.min(content.length, openBraceIdx + 200)), endIdx: content.length };
}

/**
 * Extract Python indentation block
 */
function extractPythonBlock(lines, startLineIdx, baseIndent) {
  let text = lines[startLineIdx] + '\n';
  let lineCount = 1;

  for (let i = startLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      text += line + '\n';
      lineCount++;
      continue;
    }
    const currentIndent = line.length - line.trimStart().length;
    if (currentIndent <= baseIndent) {
      break;
    }
    text += line + '\n';
    lineCount++;
  }

  return { text, lineCount };
}

/**
 * Parse comma-separated parameter string into structured array
 */
function parseParams(paramStr) {
  if (!paramStr || !paramStr.trim()) return [];
  const items = [];
  let current = '';
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < paramStr.length; i++) {
    const c = paramStr[i];
    if (c === '(') parenDepth++;
    else if (c === ')') parenDepth--;
    else if (c === '{') braceDepth++;
    else if (c === '}') braceDepth--;
    else if (c === '<') bracketDepth++;
    else if (c === '>') bracketDepth--;
    else if (c === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      if (current.trim()) items.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) items.push(current.trim());

  return items.map(p => {
    const clean = p.replace(/\s+/g, ' ').trim();
    const parts = clean.split(':');
    const namePart = parts[0]?.trim() || '';
    const typePart = parts.slice(1).join(':')?.trim() || undefined;
    return {
      name: namePart,
      type: typePart,
      optional: namePart.endsWith('?')
    };
  });
}

function cleanParams(paramStr) {
  return paramStr.replace(/\s+/g, ' ').trim();
}

const RESERVED_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
  'function', 'async', 'return', 'break', 'continue', 'import', 'export',
  'from', 'as', 'const', 'let', 'var', 'class', 'interface', 'type',
  'enum', 'struct', 'trait', 'impl', 'fn', 'pub', 'mut', 'def', 'pass',
  'try', 'catch', 'finally', 'throw', 'new', 'delete', 'typeof', 'instanceof'
]);

/**
 * Deduplicate symbols by unique ID, keeping the most specific one
 */
function deduplicateSymbols(symbols) {
  const map = new Map();
  for (const s of symbols) {
    if (RESERVED_KEYWORDS.has(s.name) || RESERVED_KEYWORDS.has(s.id)) {
      continue;
    }
    if (!map.has(s.id) || map.get(s.id).kind === 'const') {
      map.set(s.id, s);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.startLine - b.startLine);
}
