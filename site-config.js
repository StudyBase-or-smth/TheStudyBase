// Shared public site settings. This configuration is public and is not an access-control system.
// This file is not overwritten by `npm run build`.
window.STUDYBASE_CONFIG = {
  brand: {
    name: 'StudyBase',
    subtitle: 'EXPERIMENTAL TOOLS', // Use '' to hide the subtitle.
  },
  // hidden tools appear under Show more; disabled tools cannot be launched from tool links.
  // Names and image paths are shared by the tools sidebar and Continue studying.
  tools: [
    { id: 'graphing', name: 'Graphing Tool', href: 'graphing.html', icon: 'icons/tools/graphing.svg', disabled: false, hidden: false },
    { id: 'analyser', name: 'Analyser Tool', href: 'analyser.html', icon: 'icons/tools/analyser.svg', disabled: false, hidden: false },
    { id: 'quiz', name: 'Quiz Tool', href: 'quiz-tool/quiz-tool.html', icon: 'icons/tools/quiz.svg', disabled: false, hidden: false },
    { id: 'competition', name: 'Knowledge Competition', href: 'KnowledgeCompetition/KnowledgeCompetition.html', icon: 'icons/tools/competition.svg', disabled: false, hidden: true },
  ],
};
