'use strict';
// Read the calculator's original numeric state; do not parse rounded result text.
window.RiskCalculatorBridge=Object.freeze({
  read() {
    return {inputs:readValues(),stopDriver,budgetDriver,
      raw:{...Object.fromEntries(Object.entries(fieldIds).map(([key,id])=>[key,$(id).value])),
        'stop-price':$('stop-price').value,'loss-budget':$('loss-budget').value,side}};
  },
  load(plan) {
    calculate(plan.inputs); // Existing validation before changing any field.
    Object.entries(fieldIds).forEach(([key,id])=>$(id).value=String(plan.inputs[key]));
    side=plan.inputs.side;stopDriver=plan.stopDriver;budgetDriver=plan.budgetDriver;
    $('stop-price').value=plan.raw['stop-price'];$('loss-budget').value=plan.raw['loss-budget'];
    syncInputs('entry');syncInputs('capital');
    document.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.side===side)));
    render();
  }
});
