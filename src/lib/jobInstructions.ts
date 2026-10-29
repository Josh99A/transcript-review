/** Starting instructions for new jobs, using the editor's supported bold and highlight markup. */
export const DEFAULT_JOB_INSTRUCTIONS = [
  "<p><strong>Your task:</strong> Listen to the audio and <mark><strong>replace each statement with its English meaning</strong></mark>. Everything else stays the same: <strong>same speakers, same order, same timestamps</strong>.</p>",
  "<ol>",
  "<li><strong>Meaning, not word for word:</strong> Write <mark>clear, natural English</mark> that says exactly what the speaker meant. <strong>Do not add your own ideas and do not leave anything out.</strong></li>",
  "<li><strong>Speakers:</strong> Keep every line under the <mark>right person</mark> (<strong>Interviewer</strong> or <strong>Respondent</strong>). Move any line that is under the wrong speaker.</li>",
  "<li><strong>Timestamps:</strong> Each timestamp must <mark>match the audio</mark>, at the moment that person <strong>starts speaking</strong>.</li>",
  "<li><strong>Translator:</strong> When you hear a translator, add a <mark><strong>Translator</strong> tag with its own timestamp</mark> and give the <strong>English meaning</strong> of what they say.</li>",
  "<li><strong>Numbers:</strong> Write numbers as <mark>figures</mark>, for example <strong>25</strong>, not “twenty-five”.</li>",
  "<li><strong>Names and local words:</strong> Keep names of <strong>people and places as you hear them</strong>. If a word has <mark>no English equivalent</mark>, keep it and add the <strong>meaning in brackets</strong>, for example <strong>matooke (cooked green bananas)</strong>.</li>",
  "<li><strong>Fillers:</strong> Leave out sounds like “uhm”, “eh” and false starts <mark>when they add nothing to the meaning</mark>.</li>",
  "</ol>",
].join("");
