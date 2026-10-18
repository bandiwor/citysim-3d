// Собирает имена публичных членов классов проекта, которые безопасно укорачивать терсером.
// Исключаются: всё, что встречается как ключ объектного литерала / член интерфейса / деструктуризация /
// строковый литерал (сохранения, сообщения воркера, i18n, DOM-атрибуты) и всё, что есть в three.js
// (иначе сломаются наследники и вызовы внутри библиотеки). DOM и встроенные имена терсер защищает сам.
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(f) && !/\.d\.ts$/.test(f)) out.push(p);
  }
  return out;
}

export function collectOwnNames(root = 'src') {
  const members = new Set();
  const data = new Set();
  const strings = new Set();
  const nameOf = (n) => (n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : null);

  for (const file of walk(root)) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
    const visit = (node) => {
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        for (const m of node.members) {
          if (ts.isConstructorDeclaration(m) || ts.isIndexSignatureDeclaration(m) || ts.isClassStaticBlockDeclaration(m)) continue;
          // параметры-свойства конструктора
          const n = nameOf(m.name);
          if (n && ts.isIdentifier(m.name)) members.add(n);
          if (ts.isConstructorDeclaration(m)) continue;
        }
        for (const m of node.members) {
          if (ts.isConstructorDeclaration(m)) {
            for (const p of m.parameters) {
              if (p.modifiers?.some((x) => x.kind !== ts.SyntaxKind.Decorator) && ts.isIdentifier(p.name)) members.add(p.name.text);
            }
          }
        }
      } else if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
        for (const m of node.members) {
          const n = nameOf(m.name);
          if (n) data.add(n);
        }
      } else if (ts.isObjectLiteralExpression(node)) {
        for (const p of node.properties) {
          const n = nameOf(p.name);
          if (n) data.add(n);
          else if (ts.isShorthandPropertyAssignment(p)) data.add(p.name.text);
        }
      } else if (ts.isObjectBindingPattern(node)) {
        for (const e of node.elements) {
          const n = nameOf(e.propertyName) ?? (ts.isIdentifier(e.name) ? e.name.text : null);
          if (n) data.add(n);
        }
      } else if (ts.isEnumMember(node)) {
        const n = nameOf(node.name);
        if (n) data.add(n);
      } else if (ts.isStringLiteralLike(node)) {
        strings.add(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  // имена из three.js (в т.ч. внутренних свойств, которые мы можем переопределять)
  const three = readFileSync('node_modules/three/build/three.core.js', 'utf8') + readFileSync('node_modules/three/build/three.module.js', 'utf8');
  const lib = new Set();
  for (const m of three.matchAll(/[.\s{,]([A-Za-z_$][\w$]*)\s*(?=[:(=.,;)\]])/g)) lib.add(m[1]);

  return [...members]
    .filter((n) => n.length > 2 && !n.startsWith('_') && !data.has(n) && !strings.has(n) && !lib.has(n))
    .sort();
}
