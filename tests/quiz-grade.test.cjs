const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRequest, gradeQuiz } = require('../quiz-grade');
const input = { question: 'Identify an effect and a reduction strategy.', markingGuidance: 'Credit an effect and a strategy.', studentAnswer: 'Accidents increase; provide awareness training.', maxMarks: 2, markingLevels: { 0: 'Neither part is correct.', 1: 'Only one part is correct.', 2: 'Both parts are correct.' } };

test('quiz marking uses typed Jev bands and returns no generated feedback', async () => {
  let calls = 0;
  const result = await gradeQuiz(input, { TYPESAFE_API_KEY: 'test-key' }, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'jev-1.13.0');assert.equal(body.state.student_response, input.studentAnswer);
    assert.equal(body.questions.mark.type, 'choice');assert.deepEqual(body.questions.mark.criteria, { marks_0: input.markingLevels[0], marks_1: input.markingLevels[1], marks_2: input.markingLevels[2] });
    return { ok: true, json: async () => ({ model: 'jev-1.13.0', answers: { mark: { type: 'choice', choice: 'marks_2', confidence: 0.9 } }, text: 'Must not be used as feedback' }) };
  });
  assert.equal(calls, 1);assert.deepEqual(result, { earned: 2, total: 2, confidence: 0.9, model: 'jev-1.13.0', provider: 'jev' });
});

test('invalid quiz inputs and incomplete authored bands fail before any model request', async () => {
  for (const changed of [{maxMarks:0},{maxMarks:2.5},{maxMarks:21},{studentAnswer:''},{studentAnswer:'x'.repeat(16001)},{markingLevels:{0:'Nothing',2:'Everything'}}]) {
    assert.throws(() => buildRequest({...input,...changed}), error => error.statusCode === 400);
  }
  await assert.rejects(gradeQuiz(input, {}, () => { throw Error('Must not fetch'); }), error => error.statusCode === 503);
});

test('provider errors and malformed decisions never silently award zero marks or fall back', async () => {
  const secrets = { TYPESAFE_API_KEY: 'test-key' };
  await assert.rejects(gradeQuiz(input, secrets, async () => ({ ok: false, status: 429 })), error => error.statusCode === 429);
  for (const mark of [{type:'choice',choice:'marks_99',confidence:1},{type:'choice',choice:'marks_1',confidence:NaN},{type:'score',score:1.5,confidence:1}]) {
    await assert.rejects(gradeQuiz(input, secrets, async () => ({ok:true,json:async()=>({answers:{mark}})})), error => error.statusCode === 502);
  }
});
