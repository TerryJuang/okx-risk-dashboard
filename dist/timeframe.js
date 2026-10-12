'use strict';
(() => {
  const select=document.getElementById('timeframe');
  const field=document.getElementById('custom-timeframe-field');
  const input=document.getElementById('custom-timeframe');
  const error=document.getElementById('timeframe-error');
  function updateTimeframe() {
    const custom=select.value==='other';
    field.hidden=!custom;input.disabled=!custom;input.required=custom;
    const invalid=custom && input.value.trim()!=='' && (!Number.isSafeInteger(Number(input.value)) || Number(input.value)<1);
    const message=invalid?'請輸入大於 0 的整數分鐘數。':'';
    input.setCustomValidity(message);input.setAttribute('aria-invalid',String(invalid));
    error.textContent=message;error.hidden=!invalid;
  }
  select.addEventListener('change',updateTimeframe);
  input.addEventListener('input',updateTimeframe);
  updateTimeframe();
})();
