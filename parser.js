/**
 * QuizParser — plain text quiz parsing and LMS CSV generation.
 * UMD-style module: works as a browser <script> global (window.QuizParser)
 * and as a CommonJS module (require) for tests / Node tooling.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuizParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPE_LABELS = {
    MC: 'Multiple Choice',
    MS: 'Multiselect',
    TF: 'True/False',
    SA: 'Short Answer',
    O: 'Ordering',
    M: 'Matching',
  };

  var OPTION_LINE_RE = /^([A-Za-z])[.)]\s*(.*)$/;
  var NUMBERED_LINE_RE = /^(\d+)[.)]\s*(.*)$/;
  var ANSWER_LINE_RE = /^ANSWER:\s*(.*)$/i;
  var FEEDBACK_LINE_RE = /^FEEDBACK:\s*(.*)$/i;
  var MATCH_HEADER_RE = /^MATCH:\s*$/i;
  var MATCH_PAIR_RE = /^(.+?)\s*=\s*([A-Za-z]+)\s*$/;
  var TF_PREFIX_RE = /^true\s*or\s*false\s*:/i;

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len - 1).trim() + '…' : str;
  }

  function isOptionLine(line) {
    return OPTION_LINE_RE.test(line);
  }
  function isNumberedLine(line) {
    return NUMBERED_LINE_RE.test(line);
  }
  function isAnswerLine(line) {
    return ANSWER_LINE_RE.test(line);
  }

  /**
   * Split raw pasted text into question blocks. A block always ends at a
   * FEEDBACK: line, so blank lines between questions are not required
   * (though recommended for readability).
   */
  function splitBlocks(rawText) {
    var lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n');
    var blocks = [];
    var current = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line === '') continue;
      current.push(line);
      if (FEEDBACK_LINE_RE.test(line)) {
        blocks.push(current);
        current = [];
      }
    }
    if (current.length > 0) blocks.push(current);
    return blocks;
  }

  function csvEscape(value) {
    var str = value === undefined || value === null ? '' : String(value);
    if (/["\n\r,]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function csvRow(cells) {
    var padded = cells.slice(0, 5);
    while (padded.length < 5) padded.push('');
    return padded.map(csvEscape).join(',');
  }

  function buildQuestionRows(typeCode, questionText, feedbackText, typeRows) {
    var rows = [];
    rows.push(['NewQuestion', typeCode]);
    rows.push(['Title', questionText]);
    rows.push(['QuestionText', questionText]);
    rows.push(['Points', '1']);
    rows.push(['Difficulty', '1']);
    typeRows.forEach(function (r) {
      rows.push(r);
    });
    rows.push(['Hint', '']);
    rows.push(['Feedback', feedbackText]);
    return rows;
  }

  function parseOptionLines(optionLines) {
    return optionLines.map(function (l) {
      var m = l.match(OPTION_LINE_RE);
      return { letter: m[1].toUpperCase(), text: m[2].trim() };
    });
  }

  function buildMC(optionLines, answerValueRaw, errors) {
    var options = parseOptionLines(optionLines);
    if (options.length < 2) {
      errors.push('Multiple choice question needs at least 2 options.');
    }
    options.forEach(function (o) {
      if (!o.text) errors.push('Option ' + o.letter + ' has no text.');
    });
    var answerLetter = (answerValueRaw || '').replace(/[.\s]/g, '').toUpperCase();
    if (!/^[A-Z]$/.test(answerLetter)) {
      errors.push('ANSWER "' + answerValueRaw + '" is not a single valid letter.');
    } else if (!options.some(function (o) { return o.letter === answerLetter; })) {
      errors.push(
        'ANSWER letter "' + answerLetter + '" does not match any option (' +
          options.map(function (o) { return o.letter; }).join(', ') + ').'
      );
    }
    var rows = options.map(function (o) {
      return ['Option', o.letter === answerLetter ? '100' : '0', o.text];
    });
    return rows;
  }

  function buildMS(optionLines, answerValueRaw, errors) {
    var options = parseOptionLines(optionLines);
    if (options.length < 2) {
      errors.push('Multiselect question needs at least 2 options.');
    }
    options.forEach(function (o) {
      if (!o.text) errors.push('Option ' + o.letter + ' has no text.');
    });
    var letters = (answerValueRaw || '')
      .split(/[,/]+/)
      .map(function (s) { return s.replace(/[.\s]/g, '').toUpperCase(); })
      .filter(Boolean);
    if (letters.length < 1) {
      errors.push('Multiselect ANSWER must list at least one letter.');
    }
    letters.forEach(function (l) {
      if (!options.some(function (o) { return o.letter === l; })) {
        errors.push('ANSWER letter "' + l + '" does not match any option.');
      }
    });
    var rows = [['Scoring', 'RightAnswers']];
    options.forEach(function (o) {
      rows.push(['Option', letters.indexOf(o.letter) !== -1 ? '1' : '0', o.text]);
    });
    return rows;
  }

  function buildTF(answerLine, answerValueRaw, errors) {
    if (!answerLine) {
      errors.push('True/False question is missing an ANSWER: TRUE or FALSE line.');
      return [];
    }
    var val = (answerValueRaw || '').replace(/\.$/, '').trim().toUpperCase();
    if (val !== 'TRUE' && val !== 'FALSE') {
      errors.push('ANSWER "' + answerValueRaw + '" must be TRUE or FALSE.');
      return [];
    }
    var isTrue = val === 'TRUE';
    return [
      ['TRUE', isTrue ? '100' : '0'],
      ['FALSE', isTrue ? '0' : '100'],
    ];
  }

  function buildSA(answerValueRaw, errors) {
    if (!answerValueRaw || !answerValueRaw.trim()) {
      errors.push('Short answer question ANSWER text is empty.');
    }
    return [
      ['InputBox', '2', '40'],
      ['Answer', '100', (answerValueRaw || '').trim()],
    ];
  }

  function buildOrdering(numberedLines, errors) {
    var items = numberedLines.map(function (l) {
      var m = l.match(NUMBERED_LINE_RE);
      return m[2].trim();
    });
    if (items.length < 2) {
      errors.push('Ordering question needs at least 2 items.');
    }
    items.forEach(function (t, i) {
      if (!t) errors.push('Item ' + (i + 1) + ' has no text.');
    });
    var rows = [['Scoring', 'All or nothing']];
    items.forEach(function (t) {
      rows.push(['Item', t, 'NOT HTML']);
    });
    return rows;
  }

  function buildMatching(choiceLines, pairLines, errors) {
    var choices = [];
    choiceLines.forEach(function (l) {
      var m = l.match(OPTION_LINE_RE);
      if (!m) {
        errors.push('Invalid choice line: "' + l + '".');
        return;
      }
      choices.push({ letter: m[1].toUpperCase(), text: m[2].trim(), number: choices.length + 1 });
    });
    if (choices.length < 2) {
      errors.push('Matching question needs at least 2 choices.');
    }
    choices.forEach(function (c) {
      if (!c.text) errors.push('Choice ' + c.letter + ' has no text.');
    });

    var pairs = [];
    pairLines.forEach(function (l) {
      var m = l.match(MATCH_PAIR_RE);
      if (!m) {
        errors.push('Invalid MATCH line: "' + l + '". Expected "Item text = Letter".');
        return;
      }
      var itemText = m[1].trim();
      var letter = m[2].toUpperCase();
      var choice = choices.filter(function (c) { return c.letter === letter; })[0];
      if (!choice) {
        errors.push('Match item "' + itemText + '" references unknown choice letter "' + letter + '".');
        return;
      }
      if (!itemText) {
        errors.push('A MATCH line has no item text.');
        return;
      }
      pairs.push({ itemText: itemText, choiceNumber: choice.number });
    });
    if (pairs.length < 1) {
      errors.push('Matching question needs at least 1 "Item = Letter" pair.');
    }

    var rows = [['Scoring', 'All or nothing']];
    choices.forEach(function (c) {
      rows.push(['Choice', String(c.number), c.text]);
    });
    pairs.forEach(function (p) {
      rows.push(['Match', String(p.choiceNumber), p.itemText]);
    });
    return rows;
  }

  function detectType(questionText, bodyLines) {
    var matchHeaderIdx = -1;
    for (var i = 0; i < bodyLines.length; i++) {
      if (MATCH_HEADER_RE.test(bodyLines[i])) {
        matchHeaderIdx = i;
        break;
      }
    }
    if (matchHeaderIdx !== -1) {
      return { type: 'M', matchHeaderIdx: matchHeaderIdx };
    }

    var optionLines = bodyLines.filter(isOptionLine);
    var numberedLines = bodyLines.filter(isNumberedLine);
    var answerLine = bodyLines.filter(isAnswerLine)[0] || null;
    var answerValueRaw = answerLine ? answerLine.replace(ANSWER_LINE_RE, '$1').trim() : null;

    var isTrueFalseAnswer = answerValueRaw && /^(true|false)\.?$/i.test(answerValueRaw);
    var startsWithTFPrefix = TF_PREFIX_RE.test(questionText);

    if (startsWithTFPrefix || (isTrueFalseAnswer && optionLines.length === 0 && numberedLines.length === 0)) {
      return { type: 'TF', answerLine: answerLine, answerValueRaw: answerValueRaw };
    }
    if (optionLines.length > 0 && answerLine) {
      var letters = answerValueRaw.split(/[,/]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      return {
        type: letters.length > 1 ? 'MS' : 'MC',
        optionLines: optionLines,
        answerValueRaw: answerValueRaw,
      };
    }
    if (numberedLines.length > 0 && !answerLine) {
      return { type: 'O', numberedLines: numberedLines };
    }
    if (answerLine && optionLines.length === 0 && numberedLines.length === 0) {
      return { type: 'SA', answerValueRaw: answerValueRaw };
    }
    return { type: null };
  }

  function parseBlock(lines, index) {
    var errors = [];
    var warnings = [];
    var questionText = lines[0] || '';

    if (!questionText) {
      errors.push('Question text is empty.');
    }

    var feedbackIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (FEEDBACK_LINE_RE.test(lines[i])) {
        feedbackIdx = i;
        break;
      }
    }
    var feedbackText = '';
    var bodyLines;
    if (feedbackIdx === -1) {
      warnings.push('No FEEDBACK: line found — feedback left blank.');
      bodyLines = lines.slice(1);
    } else {
      feedbackText = lines[feedbackIdx].replace(FEEDBACK_LINE_RE, '$1').trim();
      bodyLines = lines.slice(1, feedbackIdx);
    }

    var detection = detectType(questionText, bodyLines);
    var type = detection.type;
    var typeRows = [];

    if (type === 'M') {
      var choiceLines = bodyLines.slice(0, detection.matchHeaderIdx);
      var pairLines = bodyLines.slice(detection.matchHeaderIdx + 1);
      typeRows = buildMatching(choiceLines, pairLines, errors);
    } else if (type === 'MC') {
      typeRows = buildMC(detection.optionLines, detection.answerValueRaw, errors);
    } else if (type === 'MS') {
      typeRows = buildMS(detection.optionLines, detection.answerValueRaw, errors);
    } else if (type === 'TF') {
      typeRows = buildTF(detection.answerLine, detection.answerValueRaw, errors);
    } else if (type === 'SA') {
      typeRows = buildSA(detection.answerValueRaw, errors);
    } else if (type === 'O') {
      typeRows = buildOrdering(detection.numberedLines, errors);
    } else {
      errors.push('Could not detect question type. Check formatting against the instructions.');
    }

    var ok = errors.length === 0 && type !== null;

    return {
      index: index,
      snippet: truncate(questionText, 70) || '(no question text — line ' + (index + 1) + ')',
      questionText: questionText,
      type: type,
      typeLabel: type ? TYPE_LABELS[type] : 'Unrecognized',
      ok: ok,
      errors: errors,
      warnings: warnings,
      csvRows: ok ? buildQuestionRows(type, questionText, feedbackText, typeRows) : [],
    };
  }

  function parseInput(rawText) {
    var blocks = splitBlocks(rawText);
    var results = blocks.map(function (lines, i) {
      return parseBlock(lines, i);
    });
    var successCount = results.filter(function (r) { return r.ok; }).length;
    return { results: results, totalCount: results.length, successCount: successCount };
  }

  function generateCSV(results) {
    var lines = [];
    results.forEach(function (r) {
      if (r.ok) {
        r.csvRows.forEach(function (cells) {
          lines.push(csvRow(cells));
        });
      }
    });
    return '\uFEFF' + lines.join('\r\n') + (lines.length ? '\r\n' : '');
  }

  function sanitizeForFilename(s) {
    return String(s || '').trim().replace(/[\\/:*?"<>|]/g, '');
  }

  function buildFilename(courseCode, unitNumber) {
    return sanitizeForFilename(courseCode) + '_' + sanitizeForFilename(unitNumber) + '_Quiz CSV.csv';
  }

  return {
    TYPE_LABELS: TYPE_LABELS,
    parseInput: parseInput,
    generateCSV: generateCSV,
    buildFilename: buildFilename,
    csvRow: csvRow,
  };
});
