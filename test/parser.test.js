const test = require('node:test');
const assert = require('node:assert/strict');
const QuizParser = require('../parser.js');

test('Multiple Choice: happy path', () => {
  const input = [
    'What is 2 + 2?',
    'A. 3',
    'B. 4',
    'C. 5',
    'D. 6',
    'ANSWER: B',
    'FEEDBACK: Basic arithmetic.',
  ].join('\n');
  const { results, successCount, totalCount } = QuizParser.parseInput(input);
  assert.equal(totalCount, 1);
  assert.equal(successCount, 1);
  const r = results[0];
  assert.equal(r.type, 'MC');
  assert.deepEqual(r.csvRows, [
    ['NewQuestion', 'MC'],
    ['Title', 'What is 2 + 2?'],
    ['QuestionText', 'What is 2 + 2?'],
    ['Points', '1'],
    ['Difficulty', '1'],
    ['Option', '0', '3'],
    ['Option', '100', '4'],
    ['Option', '0', '5'],
    ['Option', '0', '6'],
    ['Hint', ''],
    ['Feedback', 'Basic arithmetic.'],
  ]);
});

test('Multiselect: happy path', () => {
  const input = [
    'Which are primary colors?',
    'A. Red',
    'B. Green',
    'C. Blue',
    'D. Orange',
    'ANSWER: A, C',
    'FEEDBACK:',
  ].join('\n');
  const { results, successCount } = QuizParser.parseInput(input);
  assert.equal(successCount, 1);
  const r = results[0];
  assert.equal(r.type, 'MS');
  assert.deepEqual(r.csvRows.slice(5, 10), [
    ['Scoring', 'RightAnswers'],
    ['Option', '1', 'Red'],
    ['Option', '0', 'Green'],
    ['Option', '1', 'Blue'],
    ['Option', '0', 'Orange'],
  ]);
  assert.deepEqual(r.csvRows[r.csvRows.length - 1], ['Feedback', '']);
});

test('True/False: happy path', () => {
  const input = [
    'True or False: The sky is blue.',
    'ANSWER: TRUE',
    'FEEDBACK: Correct, scattering of light.',
  ].join('\n');
  const { results, successCount } = QuizParser.parseInput(input);
  assert.equal(successCount, 1);
  const r = results[0];
  assert.equal(r.type, 'TF');
  assert.deepEqual(r.csvRows.slice(5, 7), [
    ['TRUE', '100'],
    ['FALSE', '0'],
  ]);
});

test('Short Answer: happy path', () => {
  const input = [
    'What is the capital of France?',
    'ANSWER: Paris',
    'FEEDBACK: Nice work.',
  ].join('\n');
  const { results, successCount } = QuizParser.parseInput(input);
  assert.equal(successCount, 1);
  const r = results[0];
  assert.equal(r.type, 'SA');
  assert.deepEqual(r.csvRows.slice(5, 7), [
    ['InputBox', '2', '40'],
    ['Answer', '100', 'Paris'],
  ]);
});

test('Ordering: happy path', () => {
  const input = [
    'Put the steps in order.',
    '1. Mix flour and sugar',
    '2. Add eggs',
    '3. Bake at 350F',
    'FEEDBACK:',
  ].join('\n');
  const { results, successCount } = QuizParser.parseInput(input);
  assert.equal(successCount, 1);
  const r = results[0];
  assert.equal(r.type, 'O');
  assert.deepEqual(r.csvRows.slice(5, 9), [
    ['Scoring', 'All or nothing'],
    ['Item', 'Mix flour and sugar', 'NOT HTML'],
    ['Item', 'Add eggs', 'NOT HTML'],
    ['Item', 'Bake at 350F', 'NOT HTML'],
  ]);
});

test('Matching: happy path', () => {
  const input = [
    'Match the country to its capital.',
    'A. France',
    'B. Japan',
    'C. Egypt',
    'MATCH:',
    'Tokyo = B',
    'Cairo = C',
    'Paris = A',
    'FEEDBACK:',
  ].join('\n');
  const { results, successCount } = QuizParser.parseInput(input);
  assert.equal(successCount, 1);
  const r = results[0];
  assert.equal(r.type, 'M');
  assert.deepEqual(r.csvRows.slice(5, 12), [
    ['Scoring', 'All or nothing'],
    ['Choice', '1', 'France'],
    ['Choice', '2', 'Japan'],
    ['Choice', '3', 'Egypt'],
    ['Match', '2', 'Tokyo'],
    ['Match', '3', 'Cairo'],
    ['Match', '1', 'Paris'],
  ]);
});

test('Multiple questions without blank-line separation still split correctly', () => {
  const input = [
    'True or False: Water boils at 100C at sea level.',
    'ANSWER: TRUE',
    'FEEDBACK:',
    'What is 5 x 5?',
    'A. 20',
    'B. 25',
    'ANSWER: B',
    'FEEDBACK:',
  ].join('\n');
  const { totalCount, successCount } = QuizParser.parseInput(input);
  assert.equal(totalCount, 2);
  assert.equal(successCount, 2);
});

test('MC: invalid answer letter produces an error and blocks success', () => {
  const input = [
    'What is 2 + 2?',
    'A. 3',
    'B. 4',
    'ANSWER: Z',
    'FEEDBACK:',
  ].join('\n');
  const { results, successCount } = QuizParser.parseInput(input);
  assert.equal(successCount, 0);
  assert.equal(results[0].ok, false);
  assert.match(results[0].errors[0], /does not match any option/);
});

test('Matching: unknown letter reference produces an error', () => {
  const input = [
    'Match items.',
    'A. One',
    'B. Two',
    'MATCH:',
    'X = Z',
    'FEEDBACK:',
  ].join('\n');
  const { results, successCount } = QuizParser.parseInput(input);
  assert.equal(successCount, 0);
  assert.match(results[0].errors.join(' '), /unknown choice letter/);
});

test('Unrecognized block produces a clear error', () => {
  const input = 'Just some random text with no structure.\nFEEDBACK:';
  const { results, successCount } = QuizParser.parseInput(input);
  assert.equal(successCount, 0);
  assert.match(results[0].errors.join(' '), /Could not detect question type/);
});

test('generateCSV only includes successful questions and has UTF-8 BOM', () => {
  const input = [
    'True or False: Sky is blue.',
    'ANSWER: TRUE',
    'FEEDBACK:',
  ].join('\n');
  const { results } = QuizParser.parseInput(input);
  const csv = QuizParser.generateCSV(results);
  assert.equal(csv[0], '﻿');
  assert.match(csv, /NewQuestion,TF/);
});

test('csvEscape wraps fields containing commas or quotes', () => {
  const row = QuizParser.csvRow(['Title', 'Question, with a "quote"']);
  assert.equal(row, 'Title,"Question, with a ""quote""",,,');
});

test('buildFilename sanitizes and formats correctly', () => {
  assert.equal(QuizParser.buildFilename('CHEM110', 'Unit3'), 'CHEM110_Unit3_Quiz CSV.csv');
  assert.equal(QuizParser.buildFilename('CS/101', 'Unit:2'), 'CS101_Unit2_Quiz CSV.csv');
});
