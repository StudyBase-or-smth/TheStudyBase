'use strict';

const RESTART_EXIT = 75;
let stopArmed = false;

function runProgramCommand(raw) {
  const line = String(raw || '').trim();
  const key = line.toLowerCase();
  if (!key) return { ok: false, message: 'Empty command', action: 'none' };

  if (key === 'stop') {
    if (stopArmed) {
      stopArmed = false;
      return { ok: true, message: 'Stopping StudyBaseProgram…', action: 'stop' };
    }
    stopArmed = true;
    return { ok: true, message: 'Type stop again to shut down.', action: 'none' };
  }

  stopArmed = false;

  if (key === 'restart') {
    return { ok: true, message: 'Restarting StudyBaseProgram…', action: 'restart' };
  }

  if (key === 'help' || key === '?') {
    return {
      ok: true,
      message: 'Commands:\n  stop     shut down (type twice in a row)\n  restart  reload the program\n  help     this list',
      action: 'none',
    };
  }

  return { ok: false, message: 'Unknown command: ' + line + '. Type help.', action: 'none' };
}

module.exports = { runProgramCommand, RESTART_EXIT };
