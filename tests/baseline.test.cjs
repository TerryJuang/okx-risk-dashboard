const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculate}=require('../dist/calculator.js');
const baseline=require('./fixtures/v5-calculation-baseline.json');

// Frozen outputs from the published v5 model, before any Dashboard UI changes.
// These comparisons detect behavioral drift; risk.test.cjs independently checks
// financial identities, boundary conditions, and input synchronization.
for(const scenario of baseline.scenarios) {
  test(`v5 baseline: ${scenario.name}`,()=>{
    const input=Object.fromEntries(Object.entries(scenario.input).map(([key,value])=>
      [key,value==='__NaN__'?NaN:value==='__Infinity__'?Infinity:value]));
    if(scenario.error) {
      assert.throws(()=>calculate(input),error=>error.message===scenario.error);
      return;
    }
    const actual=calculate(input);
    assert.deepEqual(Object.keys(actual).sort(),Object.keys(scenario.output).sort());
    for(const [key,expected] of Object.entries(scenario.output)) {
      if(typeof expected==='number') {
        assert.ok(Number.isFinite(actual[key]),`${key}: non-finite output`);
        const tolerance=1e-10*Math.max(1,Math.abs(expected));
        assert.ok(Math.abs(actual[key]-expected)<=tolerance,
          `${key}: ${actual[key]} != ${expected}`);
      } else assert.equal(actual[key],expected,key);
    }
  });
}
