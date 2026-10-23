/** Safe arithmetic evaluator for the calculator disguise (no eval). Supports + − × ÷ and decimals. */
export type Op = '+' | '−' | '×' | '÷';
const PRECEDENCE: Record<Op, number> = { '+': 1, '−': 1, '×': 2, '÷': 2 };

export function tokenize(expr: string): (number | Op)[] | null {
  const tokens: (number | Op)[] = [];
  let num = '';
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    const prev = tokens[tokens.length - 1];
    const isUnaryMinus = ch === '−' && num === '' && (prev === undefined || typeof prev !== 'number');
    if (/[0-9.]/.test(ch) || isUnaryMinus) {
      num += ch === '−' ? '-' : ch;
      continue;
    }
    if (ch in PRECEDENCE) {
      if (num === '' || num === '-') return null;
      const n = Number(num);
      if (Number.isNaN(n)) return null;
      tokens.push(n, ch as Op);
      num = '';
      continue;
    }
    return null;
  }
  if (num === '' || num === '-') return null;
  const n = Number(num);
  if (Number.isNaN(n)) return null;
  tokens.push(n);
  return tokens;
}

function apply(a: number, b: number, op: Op): number {
  switch (op) {
    case '+': return a + b;
    case '−': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? NaN : a / b;
  }
}

export function evaluate(expr: string): number | null {
  const tokens = tokenize(expr);
  if (!tokens) return null;
  const values: number[] = [];
  const ops: Op[] = [];
  const reduce = () => {
    const b = values.pop()!;
    const a = values.pop()!;
    values.push(apply(a, b, ops.pop()!));
  };
  for (const t of tokens) {
    if (typeof t === 'number') { values.push(t); continue; }
    while (ops.length && PRECEDENCE[ops[ops.length - 1]] >= PRECEDENCE[t]) reduce();
    ops.push(t);
  }
  while (ops.length) reduce();
  const result = values[0];
  return Number.isFinite(result) ? result : null;
}

export function formatResult(n: number): string {
  const rounded = Math.round(n * 1e10) / 1e10;
  return String(rounded).replace('-', '−');
}
