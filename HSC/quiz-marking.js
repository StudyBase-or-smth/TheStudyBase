(function (root) {
  'use strict';
  async function mark(question, studentAnswer) {
    const user = root.__sbAuth?.currentUser;
    if (!user || root.isGuest) throw Error('Sign in with an approved account to use quiz marking.');
    const response = await fetch(typeof sbApiUrl === 'function' ? sbApiUrl('/api/quizGrade') : '/api/quizGrade', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
      body: JSON.stringify({ question: question.question || question.name, markingGuidance: question.answer, maxMarks: question.marks, markingLevels: question.markingLevels, studentAnswer })
    });
    if (!(response.headers.get('content-type') || '').includes('application/json')) throw Error('Quiz marking needs the updated StudyBase backend.');
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Quiz marking failed. Please try again.');
    if (data.provider !== 'jev' || !Number.isInteger(data.earned) || data.earned < 0 || data.earned > question.marks || data.total !== question.marks || typeof data.confidence !== 'number' || !Number.isFinite(data.confidence) || data.confidence < 0 || data.confidence > 1) throw Error('Invalid marking result. Please try again.');
    return { earned: data.earned, total: data.total, provider: 'jev', confidence: data.confidence, model: data.model };
  }
  function showCompletionGuide(canvas, question) {
    canvas.querySelector('.quiz-completion-guide')?.remove();
    if (typeof question?.completionGuide !== 'string' || !question.completionGuide.trim()) return;
    const block = document.createElement('section'), heading = document.createElement('h3'), content = document.createElement('p');
    block.className = 'quiz-completion-guide'; heading.textContent = 'How to complete this task'; content.textContent = question.completionGuide.trim();
    block.append(heading, content); canvas.querySelector('#quizFeedback')?.after(block);
  }
  root.StudyQuizMarking = { mark, showCompletionGuide };
})(window);
