(function () {
  'use strict';

  var courseCodeInput = document.getElementById('course-code');
  var unitNumberInput = document.getElementById('unit-number');
  var questionsTextarea = document.getElementById('questions-text');

  var courseCodeError = document.getElementById('course-code-error');
  var unitNumberError = document.getElementById('unit-number-error');
  var questionsTextError = document.getElementById('questions-text-error');

  var convertBtn = document.getElementById('convert-btn');
  var downloadBtn = document.getElementById('download-btn');
  var staleNotice = document.getElementById('stale-notice');

  var resultsSection = document.getElementById('results-section');
  var summaryEl = document.getElementById('summary');
  var downloadPolicyEl = document.getElementById('download-policy');
  var resultsListEl = document.getElementById('results-list');

  var lastParseResult = null;

  function clearFieldErrors() {
    [courseCodeError, unitNumberError, questionsTextError].forEach(function (el) {
      el.textContent = '';
    });
    [courseCodeInput, unitNumberInput, questionsTextarea].forEach(function (el) {
      el.classList.remove('invalid');
    });
  }

  function validateRequiredFields() {
    clearFieldErrors();
    var valid = true;
    if (!courseCodeInput.value.trim()) {
      courseCodeError.textContent = 'Course Code is required.';
      courseCodeInput.classList.add('invalid');
      valid = false;
    }
    if (!unitNumberInput.value.trim()) {
      unitNumberError.textContent = 'Unit Number is required.';
      unitNumberInput.classList.add('invalid');
      valid = false;
    }
    if (!questionsTextarea.value.trim()) {
      questionsTextError.textContent = 'Please paste at least one question.';
      questionsTextarea.classList.add('invalid');
      valid = false;
    }
    return valid;
  }

  function markStale() {
    if (!resultsSection.hidden) {
      staleNotice.hidden = false;
    }
    downloadBtn.disabled = true;
    lastParseResult = null;
  }

  function renderResults(parseResult) {
    var successCount = parseResult.successCount;
    var totalCount = parseResult.totalCount;

    resultsSection.hidden = false;
    staleNotice.hidden = true;

    summaryEl.textContent = successCount + ' of ' + totalCount + ' questions parsed successfully.';

    if (totalCount === 0) {
      downloadPolicyEl.textContent = 'No questions were detected. Paste your questions above and click Convert.';
    } else if (successCount === totalCount) {
      downloadPolicyEl.textContent = 'All questions are valid — Download CSV is now enabled.';
    } else {
      downloadPolicyEl.textContent =
        'Download is disabled until every question parses successfully. Fix the errors below and click Convert again.';
    }

    resultsListEl.innerHTML = '';
    parseResult.results.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'result-item ' + (r.ok ? 'ok' : 'fail');

      var head = document.createElement('div');
      head.className = 'result-head';

      var indexEl = document.createElement('span');
      indexEl.className = 'result-index';
      indexEl.textContent = 'Q' + (r.index + 1);
      head.appendChild(indexEl);

      var typeEl = document.createElement('span');
      typeEl.className = 'result-type' + (r.type ? '' : ' unrecognized');
      typeEl.textContent = r.typeLabel;
      head.appendChild(typeEl);

      var snippetEl = document.createElement('span');
      snippetEl.className = 'result-snippet';
      snippetEl.textContent = r.snippet;
      head.appendChild(snippetEl);

      li.appendChild(head);

      if (r.errors.length) {
        var errorsList = document.createElement('ul');
        errorsList.className = 'result-errors';
        r.errors.forEach(function (msg) {
          var item = document.createElement('li');
          item.textContent = msg;
          errorsList.appendChild(item);
        });
        li.appendChild(errorsList);
      }

      if (r.warnings.length) {
        var warningsList = document.createElement('ul');
        warningsList.className = 'result-warnings';
        r.warnings.forEach(function (msg) {
          var item = document.createElement('li');
          item.textContent = msg;
          warningsList.appendChild(item);
        });
        li.appendChild(warningsList);
      }

      resultsListEl.appendChild(li);
    });

    downloadBtn.disabled = !(totalCount > 0 && successCount === totalCount);
  }

  function handleConvert() {
    if (!validateRequiredFields()) {
      resultsSection.hidden = true;
      lastParseResult = null;
      downloadBtn.disabled = true;
      return;
    }
    var parseResult = QuizParser.parseInput(questionsTextarea.value);
    lastParseResult = parseResult;
    renderResults(parseResult);
  }

  function handleDownload() {
    if (!lastParseResult || lastParseResult.successCount !== lastParseResult.totalCount || lastParseResult.totalCount === 0) {
      return;
    }
    var csv = QuizParser.generateCSV(lastParseResult.results);
    var filename = QuizParser.buildFilename(courseCodeInput.value, unitNumberInput.value);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  convertBtn.addEventListener('click', handleConvert);
  downloadBtn.addEventListener('click', handleDownload);

  [courseCodeInput, unitNumberInput, questionsTextarea].forEach(function (el) {
    el.addEventListener('input', markStale);
  });
})();
