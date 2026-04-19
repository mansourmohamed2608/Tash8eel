export interface TranscriptTurn {
  user: string;
  assistant: string;
  mediaCount?: number;
}

export interface TranscriptAssertionResult {
  ok: boolean;
  failures: string[];
}

export function assertTranscript(turns: TranscriptTurn[]): TranscriptAssertionResult {
  const failures: string[] = [];

  turns.forEach((turn, index) => {
    const label = `turn ${index + 1}`;
    const questions = turn.assistant.match(/[؟?]/g) || [];
    if (questions.length > 1) {
      failures.push(`${label}: assistant asked more than one question`);
    }

    if (/AI|bot|بوت|مساعد\s*ذكي|ذكاء\s*اصطناعي/i.test(turn.assistant)) {
      failures.push(`${label}: assistant exposed system/AI wording`);
    }

    if (/هحوّ?لك|هيتواصل\s+معاك|زميل\s+هيرد|أحد\s+الزملاء/i.test(turn.assistant)) {
      failures.push(`${label}: assistant promised an unsupported human handoff`);
    }

    if (/شكوى|مشكلة|متضايق|زعلان/i.test(turn.user)) {
      const startsWithAck = /أيوة|معاك|فاهم|حقك|خليني/i.test(
        turn.assistant.slice(0, 80),
      );
      if (!startsWithAck) {
        failures.push(`${label}: complaint did not start with emotion acknowledgement`);
      }
    }
  });

  return { ok: failures.length === 0, failures };
}
