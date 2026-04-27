(function () {
  var STORAGE_KEY = 'shopbrain_truth_utm';
  var UTM_KEYS = ['utm_source', 'utm_campaign', 'utm_content'];

  function readStored() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeStored(payload) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
    }
  }

  function getParams() {
    var params = new URLSearchParams(window.location.search || '');
    var next = readStored();
    var changed = false;

    UTM_KEYS.forEach(function (key) {
      var value = params.get(key);
      if (value) {
        next[key] = value;
        changed = true;
      }
    });

    if (changed) {
      next.captured_at = new Date().toISOString();
      writeStored(next);
    }

    return next;
  }

  function ensureHiddenInput(form, name, value) {
    if (!value) return;
    var selector = 'input[name="' + name + '"]';
    var input = form.querySelector(selector);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      form.appendChild(input);
    }
    input.value = value;
  }

  function attachStoredUtmToForms() {
    var payload = getParams();
    var forms = document.querySelectorAll('form');
    forms.forEach(function (form) {
      ensureHiddenInput(form, 'attributes[utm_source]', payload.utm_source);
      ensureHiddenInput(form, 'attributes[utm_campaign]', payload.utm_campaign);
      ensureHiddenInput(form, 'attributes[utm_content]', payload.utm_content);
    });
  }

  window.ShopBrainTruthUTM = {
    get: function () {
      return getParams();
    },
    attach: attachStoredUtmToForms,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachStoredUtmToForms);
  } else {
    attachStoredUtmToForms();
  }
})();
