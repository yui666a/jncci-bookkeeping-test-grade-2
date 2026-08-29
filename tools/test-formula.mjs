// evalFormula の仕様：四則演算と括弧だけを評価し、それ以外は例外にする。
import { evalFormula } from './check.mjs';

let ng = 0;
const ok = [
  ['1+2', 3], ['2*3', 6], ['(50000 - 5000) * 0.25 + 1250', 12500],
  ['10/4', 2.5], ['-5+8', 3], ['2*(3+4)', 14], ['100 - 20 - 30', 50],
];
for (const [expr, want] of ok) {
  const got = evalFormula(expr);
  if (Math.abs(got - want) > 1e-9) { console.log('NG', expr, got, '!=', want); ng++; }
}
for (const bad of ['1+', '(1', 'alert(1)', '1/0', '', 'x*2']) {
  try {
    evalFormula(bad);
    console.log('NG 例外が出ない:', JSON.stringify(bad));
    ng++;
  } catch { /* 期待どおり */ }
}
console.log(ng ? 'NG ' + ng + ' 件' : 'OK 全件');
process.exit(ng ? 1 : 0);
