/**
 * Comprehensive test suite for symboldiff parser and diff engine.
 * Run with: node test.mjs (or bun test.mjs)
 */

import assert from 'node:assert';
import { parseSymbols, hashContent } from './parser.mjs';

function runTests() {
  console.log('🧪 Running SymbolDiff Test Suite...\n');

  // Test 1: TypeScript function and arrow function parsing
  {
    const tsCode = `
      export async function calculateMetrics<T>(userId: string, opts?: MetricOptions): Promise<MetricsResult> {
        const x = 10;
        return { score: x };
      }

      export const processOrder = (orderId: string, amount: number): boolean => {
        return amount > 0;
      };

      export interface MetricOptions {
        timeout?: number;
      }

      export type MetricsResult = { score: number };

      export class MetricEngine {
        async compute(data: any[]): Promise<void> {
          console.log(data);
        }
      }
    `;

    const symbols = parseSymbols(tsCode, 'metrics.ts');
    const names = symbols.map(s => s.name);
    
    assert(names.includes('calculateMetrics'), 'Should find calculateMetrics');
    assert(names.includes('processOrder'), 'Should find processOrder');
    assert(names.includes('MetricOptions'), 'Should find MetricOptions');
    assert(names.includes('MetricsResult'), 'Should find MetricsResult');
    assert(names.includes('MetricEngine'), 'Should find MetricEngine');
    assert(names.includes('MetricEngine.compute'), 'Should find MetricEngine.compute');

    const fnSym = symbols.find(s => s.name === 'calculateMetrics');
    assert.strictEqual(fnSym.isAsync, true, 'calculateMetrics should be async');
    assert.strictEqual(fnSym.returnType, 'Promise<MetricsResult>', 'Return type matches');
    assert.strictEqual(fnSym.params.length, 2, 'Params count matches');
    assert.strictEqual(fnSym.params[0].name, 'userId', 'Param 1 name matches');

    console.log('✅ Test 1 Passed: TypeScript functions, interfaces, types, and classes parsed correctly.');
  }

  // Test 2: Python functions, methods, and classes
  {
    const pyCode = `
class AgentRunner:
    def __init__(self, agent_id: str):
        self.agent_id = agent_id

    async def execute_task(self, prompt: str, timeout: int = 30) -> TaskResult:
        result = await run(prompt)
        return result

def standalone_helper(x: int) -> int:
    return x * 2
`;

    const symbols = parseSymbols(pyCode, 'runner.py');
    const names = symbols.map(s => s.name);

    assert(names.includes('AgentRunner'), 'Should find AgentRunner class');
    assert(names.includes('AgentRunner.__init__'), 'Should find __init__ method');
    assert(names.includes('AgentRunner.execute_task'), 'Should find execute_task method');
    assert(names.includes('standalone_helper'), 'Should find standalone_helper function');

    const method = symbols.find(s => s.name === 'AgentRunner.execute_task');
    assert.strictEqual(method.isAsync, true, 'execute_task should be async');
    assert.strictEqual(method.returnType, 'TaskResult', 'Return type should match');

    console.log('✅ Test 2 Passed: Python classes, methods, and functions parsed correctly.');
  }

  // Test 3: Rust structs, traits, and functions
  {
    const rsCode = `
pub struct DiffEngine<T> {
    pub name: String,
    pub inner: T,
}

pub trait Engine {
    fn run(&self) -> bool;
}

pub async fn run_diff<T: Engine>(engine: &T, path: &str) -> Result<(), Error> {
    Ok(())
}
`;

    const symbols = parseSymbols(rsCode, 'engine.rs');
    const names = symbols.map(s => s.name);

    assert(names.includes('DiffEngine'), 'Should find DiffEngine struct');
    assert(names.includes('Engine'), 'Should find Engine trait');
    assert(names.includes('run_diff'), 'Should find run_diff function');

    const fnSym = symbols.find(s => s.name === 'run_diff');
    assert.strictEqual(fnSym.isAsync, true, 'run_diff is async');
    assert.strictEqual(fnSym.isExported, true, 'run_diff is pub');

    console.log('✅ Test 3 Passed: Rust structs, traits, and functions parsed correctly.');
  }

  // Test 4: Go structs, interfaces, and methods
  {
    const goCode = `
type DiffResult struct {
    Files []string
}

type Evaluator interface {
    Eval(input string) error
}

func (d *DiffResult) Summarize(verbose bool) (string, error) {
    return "ok", nil
}

func GlobalHelper(val int) bool {
    return val > 0
}
`;

    const symbols = parseSymbols(goCode, 'diff.go');
    const names = symbols.map(s => s.name);

    assert(names.includes('DiffResult'), 'Should find DiffResult struct');
    assert(names.includes('Evaluator'), 'Should find Evaluator interface');
    assert(names.includes('DiffResult.Summarize'), 'Should find DiffResult.Summarize method');
    assert(names.includes('GlobalHelper'), 'Should find GlobalHelper function');

    console.log('✅ Test 4 Passed: Go structs, interfaces, and methods parsed correctly.');
  }

  // Test 5: Signature vs Body Modification Detection
  {
    const oldCode = `
      export function fetchUser(id: string): Promise<User> {
        const cache = getCache();
        return cache.get(id);
      }
    `;

    const newCodeBodyMod = `
      export function fetchUser(id: string): Promise<User> {
        const cache = getCache();
        const logger = getLogger();
        logger.info("Fetching user", id);
        return cache.get(id);
      }
    `;

    const newCodeSigMod = `
      export function fetchUser(id: string, forceFresh?: boolean): Promise<User> {
        const cache = getCache();
        return cache.get(id);
      }
    `;

    const oldSym = parseSymbols(oldCode, 'user.ts')[0];
    const bodyModSym = parseSymbols(newCodeBodyMod, 'user.ts')[0];
    const sigModSym = parseSymbols(newCodeSigMod, 'user.ts')[0];

    // Check body mod
    assert.strictEqual(oldSym.signature, bodyModSym.signature, 'Signature should be identical for body mod');
    assert.notStrictEqual(oldSym.bodyHash, bodyModSym.bodyHash, 'Body hash should differ for body mod');

    // Check signature mod
    assert.notStrictEqual(oldSym.signature, sigModSym.signature, 'Signature should differ for sig mod');

    console.log('✅ Test 5 Passed: Signature Modification vs Body Modification correctly differentiated.');
  }

  console.log('\n🎉 All SymbolDiff tests passed successfully!\n');
}

runTests();
