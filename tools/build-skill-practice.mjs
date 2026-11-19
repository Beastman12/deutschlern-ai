/**
 * Build the static Milestone 8 skill-practice content file.
 *
 * This is an authoring tool, not runtime logic: every text, script, question,
 * explanation and model answer below is written by hand and emitted as JSON for
 * the browser to load. Run `npm run build:skills` after editing this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

const readTask = ({
  id,
  level,
  title,
  topic,
  minutes,
  lines,
  translation,
  glossary,
  focus,
  questions,
}) => ({
  id,
  level,
  skill: 'reading',
  title,
  topic,
  minutes,
  lines,
  translation,
  glossary: glossary.map(([de, en]) => ({ de, en })),
  focus,
  questions: questions.map(([prompt, options, answer, explanation, questionFocus], index) => ({
    id: `${id}-q${index + 1}`,
    type: 'mcq',
    prompt,
    options,
    answer,
    explanation,
    focus: questionFocus,
  })),
});

const listenTask = ({
  id,
  level,
  title,
  topic,
  minutes,
  lines,
  translation,
  glossary,
  focus,
  dictation,
  questions,
}) => ({
  id,
  level,
  skill: 'listening',
  title,
  topic,
  minutes,
  lines,
  translation,
  glossary: glossary.map(([de, en]) => ({ de, en })),
  focus,
  dictation: dictation.map((text, index) => ({
    id: `${id}-d${index + 1}`,
    text,
    hint: `Dictation line ${index + 1} — type exactly what you hear.`,
  })),
  questions: questions.map(([prompt, options, answer, explanation, questionFocus], index) => ({
    id: `${id}-q${index + 1}`,
    type: 'mcq',
    prompt,
    options,
    answer,
    explanation,
    focus: questionFocus,
  })),
});

const writeTask = ({
  id,
  level,
  title,
  topic,
  minutes,
  prompt,
  promptEn,
  situation,
  register,
  targetWords,
  requiredPoints,
  checklist,
  keyPhrases,
  rules,
  modelAnswer,
  modelNotes,
}) => ({
  id,
  level,
  skill: 'writing',
  title,
  topic,
  minutes,
  prompt,
  promptEn,
  situation,
  register,
  targetWords,
  requiredPoints,
  checklist,
  keyPhrases: keyPhrases.map(([de, en]) => ({ de, en })),
  modelAnswer,
  modelNotes,
  checks: [
    {
      id: `${id}-wc`,
      type: 'wordCount',
      min: targetWords.min,
      max: targetWords.max,
      label: `Write ${targetWords.min}–${targetWords.max} words`,
    },
    ...rules.map((rule, index) => ({ id: `${id}-c${index + 1}`, ...rule })),
  ],
});

const tasks = [
  /* ---------------------------------------------------------------- A1 ---- */
  readTask({
    id: 'read-a1-1',
    level: 'a1',
    title: 'Ein Brief aus Köln',
    topic: 'Family and daily life',
    minutes: 4,
    lines: [
      `Liebe Mia, ich bin jetzt in Köln. Ich wohne in einer kleinen Wohnung neben dem Bahnhof. Morgens kaufe ich Brötchen im Bäckerladen und dann gehe ich zur Arbeit.`,
      `Am Abend besuche ich oft meine Schwester. Sie hat einen Hund. Der Hund heißt Rex und spielt gern im Park. Am Sonntag komme ich nach Hause. Bis bald! Deine Lena`,
    ],
    translation: [
      `Dear Mia, I am in Cologne now. I live in a small flat next to the station. In the morning I buy rolls at the bakery and then I go to work.`,
      `In the evening I often visit my sister. She has a dog. The dog is called Rex and likes to play in the park. On Sunday I come home. See you soon! Your Lena`,
    ],
    glossary: [
      ['die Wohnung', 'the flat / apartment'],
      ['der Bahnhof', 'the station'],
      ['das Brötchen', 'the bread roll'],
      ['besuchen', 'to visit'],
      ['spielen', 'to play'],
    ],
    focus: 'Scanning a personal letter for people, places and routines',
    questions: [
      ['Where does Lena live?', ['Next to the station', 'Next to the park', 'With her sister', 'In a hotel'], 0, 'The first paragraph says: „Ich wohne in einer kleinen Wohnung neben dem Bahnhof.“', 'Scanning for a place'],
      ['What does Lena buy in the morning?', ['Coffee', 'Brötchen', 'A dog', 'A train ticket'], 1, '„Morgens kaufe ich Brötchen im Bäckerladen“ tells us what she buys.', 'Detail recognition'],
      ['Who is Rex?', ['Lenas brother', 'Lenas neighbour', 'Lenas sisters dog', 'The baker'], 2, 'The text says Lenas sister has a dog and that the dog is called Rex.', 'Reference words'],
    ],
  }),
  readTask({
    id: 'read-a1-2',
    level: 'a1',
    title: 'Samstag im Supermarkt',
    topic: 'Shopping and prices',
    minutes: 4,
    lines: [
      `Heute ist Samstag. Ich brauche Milch, Eier und Brot. Die Milch kostet 1,20 Euro. An der Kasse steht eine Frau vor mir. Sie hat nur einen Apfel.`,
      `Ich warte zwei Minuten. Dann bezahle ich mit Karte. Der Mann hinter mir sagt: „Haben Sie einen Moment Zeit?“ Ich zeige ihm die Eier. Wir lachen. Der Einkauf macht Spaß.`,
    ],
    translation: [
      `Today is Saturday. I need milk, eggs and bread. The milk costs 1.20 euros. At the checkout a woman is standing in front of me. She only has an apple.`,
      `I wait two minutes. Then I pay by card. The man behind me says: “Do you have a moment?” I show him the eggs. We laugh. The shopping is fun.`,
    ],
    glossary: [
      ['die Kasse', 'the checkout'],
      ['kosten', 'to cost'],
      ['bezahlen', 'to pay'],
      ['die Karte', 'the card'],
      ['der Einkauf', 'the shopping / purchase'],
    ],
    focus: 'Reading for numbers and sequence',
    questions: [
      ['What does the shopper NOT need?', ['Milk', 'Eggs', 'Bread', 'Apples'], 3, 'The shopping list is „Milch, Eier und Brot“. The apple belongs to the woman at the checkout.', 'Detail recognition'],
      ['How much is the milk?', ['1.20 euros', '2 euros', '1 euro', '12 euros'], 0, 'The text states: „Die Milch kostet 1,20 Euro.“', 'Numbers'],
      ['What happens before the shopper pays?', ['He laughs', 'He waits two minutes', 'He shows the eggs', 'He buys an apple'], 1, '„Ich warte zwei Minuten. Dann bezahle ich mit Karte.“', 'Sequence'],
    ],
  }),

  /* ---------------------------------------------------------------- A2 ---- */
  readTask({
    id: 'read-a2-1',
    level: 'a2',
    title: 'Die neue Nachbarin',
    topic: 'Neighbours and appointments',
    minutes: 5,
    lines: [
      `Letzten Freitag ist Frau Yilmaz in unsere Wohnung gezogen. Sie wohnt jetzt über uns und arbeitet in einem Krankenhaus. Ich habe sie im Hausflur getroffen und ihr einen Kuchen gegeben.`,
      `Sie hat mich am Samstag zum Kaffee eingeladen. Wir haben über die Stadt gesprochen und ich habe ihr den Weg zum Markt gezeigt. Am Sonntag hat sie mir geholfen, mein Regal aufzubauen. Ich finde es schön, dass wir uns gut verstehen.`,
    ],
    translation: [
      `Last Friday Mrs Yilmaz moved into our building. She now lives above us and works in a hospital. I met her in the hallway and gave her a cake.`,
      `She invited me for coffee on Saturday. We talked about the city and I showed her the way to the market. On Sunday she helped me put up my shelf. I am glad that we get on well.`,
    ],
    glossary: [
      ['einziehen', 'to move in'],
      ['der Hausflur', 'the hallway'],
      ['einladen', 'to invite'],
      ['das Regal', 'the shelf'],
      ['sich gut verstehen', 'to get on well'],
    ],
    focus: 'Finding who did what and when',
    questions: [
      ['When did Mrs Yilmaz move in?', ['On Sunday', 'On Saturday', 'Last Friday', 'Two weeks ago'], 2, 'The first sentence says: „Letzten Freitag ist Frau Yilmaz … gezogen.“', 'Time expressions'],
      ['What did the writer give her?', ['A book', 'A cake', 'A shelf', 'Coffee'], 1, '„Ich habe sie im Hausflur getroffen und ihr einen Kuchen gegeben.“', 'Detail recognition'],
      ['What did they do on Sunday?', ['They visited the market', 'They drank coffee', 'They built a shelf', 'They went to the hospital'], 2, 'The second paragraph says Mrs Yilmaz helped to put up the shelf on Sunday.', 'Sequence'],
    ],
  }),
  readTask({
    id: 'read-a2-2',
    level: 'a2',
    title: 'Unser Wochenendplan',
    topic: 'Plans and travel',
    minutes: 5,
    lines: [
      `Am Samstagmorgen fahren wir mit dem Bus zum See. Der Bus fährt um halb neun ab und wir sind um zehn dort. Wir nehmen Brot, Obst und Wasser mit, weil das Restaurant am See erst um zwölf öffnet.`,
      `Nach dem Mittagessen möchte ich eine Stunde schwimmen. Jonas hat keine Lust dazu; er liest lieber ein Buch am Ufer. Um sechs treffen wir uns am Parkplatz und fahren zurück. Wenn es regnet, bleiben wir zu Hause und spielen ein Brettspiel.`,
    ],
    translation: [
      `On Saturday morning we are taking the bus to the lake. The bus leaves at half past eight and we will be there at ten. We are taking bread, fruit and water because the restaurant by the lake only opens at twelve.`,
      `After lunch I would like to swim for an hour. Jonas does not feel like it; he would rather read a book on the bank. At six we meet in the car park and drive back. If it rains, we stay at home and play a board game.`,
    ],
    glossary: [
      ['der See', 'the lake'],
      ['abfahren', 'to depart'],
      ['das Ufer', 'the bank / shore'],
      ['der Parkplatz', 'the car park'],
      ['ein Brettspiel spielen', 'to play a board game'],
    ],
    focus: 'Understanding plans, alternatives and reasons',
    questions: [
      ['Why do they take food with them?', ['They are not hungry', 'The restaurant opens at twelve', 'The bus is late', 'Jonas likes cooking'], 1, 'The text gives the reason with „weil das Restaurant … erst um zwölf öffnet“.', 'Reasons'],
      ['What would Jonas rather do?', ['Swim', 'Eat in the restaurant', 'Read a book', 'Play a board game'], 2, '„er liest lieber ein Buch am Ufer“ expresses his preference.', 'Preferences'],
      ['What happens if it rains?', ['They stay at home', 'They take the bus', 'They swim', 'They leave at six'], 0, 'The last sentence describes the rainy-day alternative.', 'Conditions'],
    ],
  }),

  /* ---------------------------------------------------------------- B1 ---- */
  readTask({
    id: 'read-b1-1',
    level: 'b1',
    title: 'Ein Brief an die Stadtverwaltung',
    topic: 'Civic life and formal writing',
    minutes: 7,
    lines: [
      `Sehr geehrte Damen und Herren, seit drei Monaten wohne ich in der Lindenstraße 12. Vor meinem Fenster steht seit dem Frühjahr eine alte Bank, die niemand mehr benutzt. Abends sitzen dort junge Leute und werfen leere Flaschen in den Garten.`,
      `Ich habe die Bank schon zweimal fotografiert und die Adresse an das Ordnungsamt geschickt. Bis jetzt hat sich niemand gemeldet. Ich bitte Sie deshalb höflich, die Bank entfernen zu lassen oder einen neuen Standort zu prüfen. Für eine kurze Antwort wäre ich dankbar. Mit freundlichen Grüßen, Anna Berg`,
    ],
    translation: [
      `Dear Sir or Madam, I have been living at Lindenstraße 12 for three months. In front of my window there has been an old bench since spring that nobody uses any more. In the evenings young people sit there and throw empty bottles into the garden.`,
      `I have already photographed the bench twice and sent the address to the local authority. So far nobody has replied. I therefore politely ask you to have the bench removed or to consider a new location. I would be grateful for a short reply. Kind regards, Anna Berg`,
    ],
    glossary: [
      ['die Stadtverwaltung', 'the city administration'],
      ['benutzen', 'to use'],
      ['das Ordnungsamt', 'the local order office'],
      ['sich melden', 'to get in touch / respond'],
      ['entfernen lassen', 'to have something removed'],
    ],
    focus: 'Identifying a complaint, evidence and a polite request',
    questions: [
      ['What is the main problem?', ['The garden is too small', 'An old bench causes trouble', 'The writer has no photo', 'The bus is late'], 1, 'The bench is unused and is being used for drinking, which leads to bottles in the garden.', 'Main idea'],
      ['What has the writer already done?', ['Called the police', 'Painted the bench', 'Sent photos and the address', 'Moved house'], 2, '„Ich habe die Bank schon zweimal fotografiert und die Adresse … geschickt.“', 'Evidence'],
      ['What does the writer ask for?', ['A new bench in the garden', 'A short reply and action', 'A visit from neighbours', 'A fine for young people'], 1, 'The closing sentences request removal or relocation and a short reply.', 'Purpose'],
    ],
  }),
  readTask({
    id: 'read-b1-2',
    level: 'b1',
    title: 'Warum ich Rad fahre',
    topic: 'Opinions and everyday mobility',
    minutes: 6,
    lines: [
      `Früher bin ich fast immer mit dem Auto gefahren. Das war bequem, aber ich habe die Stadt kaum gesehen. Seit einem Jahr fahre ich mit dem Fahrrad zur Arbeit. Der Weg dauert zwar zehn Minuten länger, dafür komme ich mit frischer Luft und gutem Gefühl an.`,
      `Natürlich ist Radfahren nicht immer einfach. Im Winter sind die Wege glatt, und bei Regen brauche ich weitere Kleidung. Trotzdem würde ich nicht zurückwechseln. Auf dem Rad habe ich gelernt, wie lebendig die Nachbarschaft ist: Ich kenne jetzt die Bäckerin, den Zeitungsboten und die Leute im Park.`,
    ],
    translation: [
      `In the past I almost always drove by car. It was convenient, but I hardly saw the city. For a year now I have been cycling to work. The journey takes ten minutes longer, but I arrive with fresh air and a good feeling.`,
      `Of course cycling is not always easy. In winter the paths are slippery and in the rain I need extra clothing. Even so I would not switch back. On the bike I learned how lively the neighbourhood is: now I know the baker, the newspaper deliverer and the people in the park.`,
    ],
    glossary: [
      ['zwar … dafür', 'admittedly … but / in return'],
      ['glatt', 'slippery'],
      ['trotzdem', 'even so / nevertheless'],
      ['die Nachbarschaft', 'the neighbourhood'],
      ['zurückwechseln', 'to switch back'],
    ],
    focus: 'Following contrast and opinion markers',
    questions: [
      ['What does the writer admit?', ['Cycling is faster', 'The car was convenient', 'Winter is pleasant', 'The bakery is closed'], 1, '„Das war bequem“ refers to driving by car.', 'Contrast'],
      ['Which disadvantage is mentioned?', ['Traffic jams', 'Higher costs', 'Slippery winter paths', 'Longer lunch breaks'], 2, 'The second paragraph mentions glatte Wege im Winter.', 'Detail recognition'],
      ['Why would the writer not switch back?', ['The car is newer', 'Cycling helped them know the neighbourhood', 'The bus is expensive', 'The office is closer'], 1, 'The final sentence explains the social benefit of cycling.', 'Inference'],
    ],
  }),

  /* ---------------------------------------------------------------- B2 ---- */
  readTask({
    id: 'read-b2-1',
    level: 'b2',
    title: 'Stadt oder Land?',
    topic: 'Urban and rural life',
    minutes: 8,
    lines: [
      `Die Debatte um Stadt oder Land wird oft geführt, als müsste man sich für eine Seite entscheiden. Wer in der Stadt wohnt, genießt kurze Wege, viele Angebote und ein dichtes Netz an Kultur. Gleichzeitig bedeuten Lärm, hohe Mieten und wenig Platz einen ständigen Kompromiss.`,
      `Auf dem Land ist der Alltag langsamer, aber nicht automatisch einfacher. Junge Menschen finden dort weniger Ausbildungsplätze, und Ältere haben manchmal lange Wege zum Arzt. Die qualitative Frage ist deshalb nicht, wo das Leben „besser“ ist, sondern welche Bedürfnisse ein Mensch gerade hat. Eine kluge Politik sollte beide Räume stärken statt sie gegeneinander auszuspielen.`,
    ],
    translation: [
      `The debate about city or countryside is often conducted as if one had to choose a side. People in the city enjoy short distances, many services and a dense cultural network. At the same time noise, high rents and limited space mean constant compromise.`,
      `In the countryside everyday life is slower, but not automatically easier. Young people find fewer training places there, and older people sometimes have long journeys to the doctor. The real question is therefore not where life is “better”, but which needs a person has at the moment. Sensible politics should strengthen both spaces instead of playing them off against each other.`,
    ],
    glossary: [
      ['das Angebot', 'the range / offer'],
      ['der Kompromiss', 'the compromise'],
      ['die Ausbildung', 'vocational training'],
      ['gegenseitig', 'mutual / each other'],
      ['ausspielen', 'to play off against'],
    ],
    focus: 'Recognising balanced argument structure and stance',
    questions: [
      ['What is the writers central claim?', ['City life is always better', 'The choice depends on needs', 'Rural life has no problems', 'Politics should build more cities'], 1, 'The text asks which needs a person has and rejects a simple winner.', 'Main idea'],
      ['Which benefit of city life is mentioned?', ['Low rents', 'Quiet streets', 'A dense cultural network', 'Short waits at the doctor'], 2, 'The first paragraph lists kurze Wege, viele Angebote and ein dichtes Netz an Kultur.', 'Detail recognition'],
      ['What does „ausspielen“ mean in the last sentence?', ['To support equally', 'To compare honestly', 'To use one against the other', 'To build quickly'], 2, 'The phrase „statt sie gegeneinander auszuspielen“ contrasts with strengthening both.', 'Vocabulary in context'],
    ],
  }),
  readTask({
    id: 'read-b2-2',
    level: 'b2',
    title: 'Bericht über den Wochenmarkt',
    topic: 'Report writing and local economy',
    minutes: 8,
    lines: [
      `Am Samstagvormittag habe ich den Wochenmarkt am Rathausplatz besucht. Zwischen neun und elf Uhr waren etwa vierzig Stände geöffnet. Neben Obst und Gemüse gab es Käse, Brot, Blumen und zwei Stände mit handwerklichem Schmuck. Die Preise waren teilweise höher als im Supermarkt, aber die Händler konnten Herkunft und Anbau ausführlich erklären.`,
      `Besonders auffällig war die Atmosphäre: Viele Besucher blieben länger als geplant und sprachen mit den Verkäufern. Eine Standbesitzerin erzählte, dass die Nachfrage nach regionalen Produkten stark gestiegen ist, seit der Markt vor zwei Jahren wieder täglich stattfindet. Für den Stadtteil ist der Markt damit nicht nur ein Einkaufsort, sondern auch ein Treffpunkt.`,
    ],
    translation: [
      `On Saturday morning I visited the weekly market at the town hall square. Between nine and eleven around forty stalls were open. Alongside fruit and vegetables there was cheese, bread, flowers and two stalls with handmade jewellery. Prices were sometimes higher than in the supermarket, but the traders could explain origin and cultivation in detail.`,
      `What stood out in particular was the atmosphere: many visitors stayed longer than planned and talked to the sellers. One stallholder said that since the market started taking place daily again two years ago, demand for regional products has risen sharply. For the district the market is therefore not just a place to shop, but also a meeting point.`,
    ],
    glossary: [
      ['der Stand', 'the stall'],
      ['die Herkunft', 'the origin'],
      ['auffällig', 'striking / noticeable'],
      ['die Nachfrage', 'the demand'],
      ['der Treffpunkt', 'the meeting point'],
    ],
    focus: 'Extracting facts from a short report',
    questions: [
      ['How many stalls were open?', ['About fourteen', 'About forty', 'About four', 'About one hundred'], 1, 'The report says „etwa vierzig Stände“.', 'Numbers'],
      ['What was notable about the atmosphere?', ['Visitors left quickly', 'People talked and stayed longer', 'Music was too loud', 'Few people came'], 1, 'The second paragraph describes visitors staying longer and speaking with sellers.', 'Detail recognition'],
      ['What changed two years ago?', ['The market became daily', 'Prices were cut', 'The square was closed', 'Only jewellery was sold'], 0, 'The stallholder links rising demand to the market taking place daily again.', 'Cause and effect'],
    ],
  }),

  /* ---------------------------------------------------------------- C1 ---- */
  readTask({
    id: 'read-c1-1',
    level: 'c1',
    title: 'Die Kunst des Zuhörens',
    topic: 'Reflection and communication',
    minutes: 10,
    lines: [
      `Zuhören gilt als passiv, dabei ist es eine anspruchsvolle Form der Aufmerksamkeit. Wer nur auf das nächste eigene Wort wartet, nimmt kaum wahr, was im Raum tatsächlich entsteht. Erst wenn Pausen zugelassen werden, können Zweifel, Nachfragen und unerwartete Perspektiven sichtbar werden.`,
      `In Gesprächen über politische oder persönliche Konflikte wird dieses Recht auf Pause häufig unterschätzt. Schnelle Zustimmung wirkt höflich, kann aber ein Zufall sein; Widerspruch wirkt deutlich, beendet jedoch oft die Neugier. Ein gutes Gespräch braucht deshalb keine perfekte Harmonie, sondern die Bereitschaft, das Gesagte zunächst stehen zu lassen und es dann gemeinsam zu prüfen.`,
    ],
    translation: [
      `Listening is considered passive, yet it is a demanding form of attention. Anyone who is merely waiting for their own next word barely notices what actually emerges in the room. Only when pauses are allowed can doubts, questions and unexpected perspectives become visible.`,
      `In conversations about political or personal conflicts this right to pause is often underestimated. Quick agreement seems polite but can be a coincidence; disagreement is clear but often ends curiosity. A good conversation therefore needs no perfect harmony, but the willingness to let what was said stand first and then examine it together.`,
    ],
    glossary: [
      ['die Aufmerksamkeit', 'attention'],
      ['die Pause zulassen', 'to allow a pause'],
      ['unterschätzen', 'to underestimate'],
      ['die Zustimmung', 'agreement / assent'],
      ['stehen lassen', 'to let something stand'],
    ],
    focus: 'Tracing an abstract argument and its implications',
    questions: [
      ['Why is listening not passive according to the text?', ['It requires active attention', 'It avoids all questions', 'It replaces speaking entirely', 'It is a legal duty'], 0, 'The first sentence calls listening „eine anspruchsvolle Form der Aufmerksamkeit“.', 'Argument'],
      ['What can a pause make possible?', ['Faster replies', 'Perfect harmony', 'Doubts and new perspectives', 'Silence as a final answer'], 2, 'Pauses allow „Zweifel, Nachfragen und unerwartete Perspektiven“ to become visible.', 'Detail recognition'],
      ['What does the author recommend for difficult conversations?', ['Avoid any disagreement', 'Agree immediately', 'Examine what was said together', 'End the conversation quickly'], 2, 'The conclusion asks us to let statements stand and then examine them jointly.', 'Stance'],
    ],
  }),
  readTask({
    id: 'read-c1-2',
    level: 'c1',
    title: 'Sprache und Erinnerung',
    topic: 'Language, memory and identity',
    minutes: 10,
    lines: [
      `Wörter speichern nicht nur Bedeutungen, sondern auch Situationen. Ein bestimmter Geruch, ein Satz am Küchentisch oder der Klang eines Bahnhofs kann eine Erinnerung zurückbringen, die wir längst für verloren hielten. In der zweiten Sprache sind solche Verbindungen oft schwächer, weil sie nicht mit den ersten Jahren des Lebens verwoben sind.`,
      `Das bedeutet nicht, dass Übersetzung unmöglich wäre. Sie verschiebt nur die Gewichte: Was in einer Sprache knapp und bildhaft ist, braucht in der anderen manchmal einen ganzen Nebensatz. Wer diese Verschiebung ernst nimmt, hört auf, Wörter wie Koffer zu behandeln, die man einfach von einem Ort zum anderen trägt. Übersetzen heißt dann, eine Situation neu zu erzählen.`,
    ],
    translation: [
      `Words store not only meanings but also situations. A certain smell, a sentence at the kitchen table or the sound of a station can bring back a memory we long thought lost. In a second language such connections are often weaker because they are not woven into the first years of life.`,
      `That does not mean translation is impossible. It only shifts the weights: what is brief and vivid in one language sometimes needs a whole subordinate clause in another. Anyone who takes this shift seriously stops treating words like suitcases that can simply be carried from one place to another. Translating then means telling a situation anew.`,
    ],
    glossary: [
      ['verweben', 'to weave together'],
      ['die Gewichte verschieben', 'to shift the balance'],
      ['bildhaft', 'vivid / figurative'],
      ['der Nebensatz', 'the subordinate clause'],
      ['neu erzählen', 'to retell'],
    ],
    focus: 'Interpreting metaphor and nuanced claims',
    questions: [
      ['Why can second-language memories feel weaker?', ['The words are shorter', 'The links are less woven into early life', 'The brain refuses new words', 'Stations are quieter'], 1, 'The text connects weaker links to the first years of life.', 'Inference'],
      ['What does the suitcase metaphor criticise?', ['Travelling too often', 'Treating words as fixed containers', 'Learning grammar', 'Using subordinate clauses'], 1, 'The author rejects the idea that words can simply be carried unchanged.', 'Metaphor'],
      ['What is the final definition of translating?', ['Replacing every word exactly', 'Telling a situation anew', 'Forgetting the source language', 'Avoiding long sentences'], 1, 'The last sentence states: „Übersetzen heißt dann, eine Situation neu zu erzählen.“', 'Conclusion'],
    ],
  }),

  /* ---------------------------------------------------------------- C2 ---- */
  readTask({
    id: 'read-c2-1',
    level: 'c2',
    title: 'Über die Grenzen der Übersetzung',
    topic: 'Translation studies and cultural nuance',
    minutes: 12,
    lines: [
      `Übersetzung wird häufig als ein Vorgang der Äquivalenz beschrieben, als könnte man Bedeutungen verlustfrei von einer Sprache in die andere übertragen. Diese Vorstellung ist verlockend, weil sie ein messbares Ergebnis verspricht. Doch selbst technische Begriffe verändern ihren Wert, sobald sie in ein anderes rechtliches, historisches oder soziales Feld eintreten.`,
      `Ein Begriff wie „Heimat“ lässt sich weder mit „home“ noch mit „homeland“ vollständig decken, ohne dass etwas verloren oder hinzugefügt wird. Die Aufgabe des Übersetzens besteht deshalb nicht darin, eine vorhandene Bedeutung zu transportieren, sondern eine Wirkung annähernd wiederherzustellen. Diese Annäherung ist kein Scheitern; sie ist die eigentliche Leistung einer Sprache, die sich bewusst bleibt, dass sie niemals ganz bei sich selbst ankommt.`,
    ],
    translation: [
      `Translation is often described as a process of equivalence, as if meanings could be transferred from one language to another without loss. This idea is attractive because it promises a measurable result. Yet even technical terms change their value as soon as they enter a different legal, historical or social field.`,
      `A term such as “Heimat” cannot be fully covered by “home” or “homeland” without something being lost or added. The task of translation is therefore not to transport an existing meaning but to approximate an effect. This approximation is not a failure; it is the real achievement of a language that remains aware it never fully arrives at itself.`,
    ],
    glossary: [
      ['die Äquivalenz', 'equivalence'],
      ['verlustfrei', 'without loss'],
      ['das rechtliche Feld', 'the legal field'],
      ['die Annäherung', 'approximation'],
      ['sich bewusst bleiben', 'to remain aware'],
    ],
    focus: 'Evaluating a theoretical position and its terminology',
    questions: [
      ['What view does the author oppose?', ['Translation is always approximate', 'Meaning can be transferred without loss', 'Language has social context', 'Heimat is hard to translate'], 1, 'The first paragraph criticises the idea of verlustfreier Übertragung.', 'Argument'],
      ['Why is „Heimat“ a useful example?', ['It has no meaning', 'It is only used in law', 'It carries cultural and historical resonance', 'It is easy to spell'], 2, 'The term shows that no single English equivalent covers all associations.', 'Example'],
      ['How does the author evaluate approximation?', ['As a failure', 'As the real achievement', 'As unnecessary', 'As a technical error'], 1, 'The final sentence calls approximation „die eigentliche Leistung“.', 'Stance'],
    ],
  }),
  readTask({
    id: 'read-c2-2',
    level: 'c2',
    title: 'Stadtplanung zwischen Tradition und Zukunft',
    topic: 'Urban planning and public debate',
    minutes: 12,
    lines: [
      `Städte sind keine leeren Flächen, auf die Planung ihre Muster zeichnet. Sie sind Sedimente vieler Entscheidungen, und jede neue Straße, jeder Neubau und jeder erhaltene Platz verhandelt die Frage, welche Vergangenheit in der Zukunft noch einen Platz haben soll. Wie diese Frage gestellt wird, entscheidet darüber, wer gehört wird und wer aus dem Bild verschwindet.`,
      `Ein denkmalgeschütztes Viertel kann ein wertvoller Erinnerungsraum sein; es kann aber auch Ausgrenzung fortschreiben, wenn die Kosten der Sanierung die ursprünglichen Bewohner verdrängen. Umgekehrt kann ein modernes Quartier funktional und ungerecht wirken, wenn es keine Orte für zufällige Begegnung lässt. Die anspruchsvolle Aufgabe liegt deshalb weniger im Entweder-oder als in der Fähigkeit, widersprüchliche Ansprüche sichtbar zu machen und vorläufig zu ordnen.`,
    ],
    translation: [
      `Cities are not blank surfaces on which planning draws its patterns. They are sediments of many decisions, and every new street, every new building and every preserved square negotiates the question of which past should still have a place in the future. How this question is asked determines who is heard and who disappears from the picture.`,
      `A listed district can be a valuable space of memory; it can also continue exclusion if renovation costs displace the original residents. Conversely, a modern quarter can look functional yet unjust if it leaves no places for chance encounters. The demanding task therefore lies less in either-or than in the ability to make conflicting claims visible and to order them provisionally.`,
    ],
    glossary: [
      ['das Sediment', 'the sediment / layer'],
      ['verhandeln', 'to negotiate'],
      ['die Ausgrenzung', 'exclusion'],
      ['die Sanierung', 'renovation / restoration'],
      ['vorläufig', 'provisional'],
    ],
    focus: 'Analysing competing public interests in an argumentative essay',
    questions: [
      ['What metaphor shapes the first paragraph?', ['Cities as machines', 'Cities as layers of decisions', 'Cities as empty paper', 'Cities as private homes'], 1, 'The text calls cities „Sedimente vieler Entscheidungen“.', 'Metaphor'],
      ['When can heritage protection become problematic?', ['When it preserves too many squares', 'When renovation displaces residents', 'When buildings are modern', 'When planners ask questions'], 1, 'The second paragraph links restoration costs to displacement.', 'Nuance'],
      ['What does the author propose?', ['Choose either tradition or modernity', 'Stop building new quarters', 'Make conflicting claims visible', 'Preserve only wealthy districts'], 2, 'The conclusion favours visibility and provisional ordering over an either-or choice.', 'Stance'],
    ],
  }),

  /* ------------------------------------------------------------- A1 list -- */
  listenTask({
    id: 'listen-a1-1',
    level: 'a1',
    title: 'Am Bahnhof',
    topic: 'Travel announcements',
    minutes: 4,
    lines: [
      `Guten Tag. Der Zug nach Berlin fährt um zehn Uhr von Gleis vier ab.`,
      `Bitte stehen Sie hinter der gelben Linie. Der nächste Zug kommt in fünf Minuten.`,
      `Entschuldigung, wo ist der Bahnsteig drei? — Da drüben, neben dem Kiosk.`,
      `Ich habe eine Fahrkarte nach Hamburg. — Gut, dann fahren Sie bitte mit dem Zug um elf Uhr.`,
    ],
    translation: [
      `Good afternoon. The train to Berlin leaves at ten o'clock from platform four.`,
      `Please stand behind the yellow line. The next train arrives in five minutes.`,
      `Excuse me, where is platform three? — Over there, next to the kiosk.`,
      `I have a ticket to Hamburg. — Good, then please take the eleven o'clock train.`,
    ],
    glossary: [
      ['der Zug', 'the train'],
      ['das Gleis', 'the track / platform'],
      ['der Bahnsteig', 'the platform'],
      ['die Fahrkarte', 'the ticket'],
    ],
    focus: 'Listening for times, platforms and destinations',
    dictation: [
      `Der Zug nach Berlin fährt um zehn Uhr von Gleis vier ab.`,
      `Bitte stehen Sie hinter der gelben Linie.`,
    ],
    questions: [
      ['Which train leaves at ten?', ['To Hamburg', 'To Berlin', 'To Köln', 'To München'], 1, 'The first line names Berlin as the destination.', 'Destination'],
      ['Where should passengers stand?', ['On the yellow line', 'Behind the yellow line', 'At the kiosk', 'On platform three'], 1, '„Bitte stehen Sie hinter der gelben Linie.“', 'Instruction'],
      ['Which train should the Hamburg passenger take?', ['At nine', 'At ten', 'At eleven', 'At twelve'], 2, 'The final line says: „mit dem Zug um elf Uhr“.', 'Time'],
    ],
  }),
  listenTask({
    id: 'listen-a1-2',
    level: 'a1',
    title: 'Im Café',
    topic: 'Ordering food',
    minutes: 4,
    lines: [
      `Guten Morgen! Ich möchte einen Kaffee und ein Brötchen bitte.`,
      `Möchten Sie den Kaffee mit Milch? — Ja, mit Milch, danke.`,
      `Das macht zusammen vier Euro fünfzig.`,
      `Hier ist Ihr Kaffee. Guten Appetit! — Danke schön.`,
    ],
    translation: [
      `Good morning! I would like a coffee and a bread roll, please.`,
      `Would you like milk in the coffee? — Yes, with milk, thank you.`,
      `That comes to four euros fifty altogether.`,
      `Here is your coffee. Enjoy your meal! — Thank you.`,
    ],
    glossary: [
      ['bestellen', 'to order'],
      ['das Brötchen', 'the bread roll'],
      ['zusammen', 'altogether'],
      ['der Appetit', 'appetite'],
    ],
    focus: 'Listening for an order and a price',
    dictation: [
      `Ich möchte einen Kaffee und ein Brötchen bitte.`,
      `Das macht zusammen vier Euro fünfzig.`,
    ],
    questions: [
      ['What does the guest order?', ['Tea and cake', 'Coffee and a bread roll', 'Water and an apple', 'Juice and cheese'], 1, 'The first line contains the complete order.', 'Details'],
      ['How does the guest want the coffee?', ['Black', 'With sugar', 'With milk', 'With ice'], 2, '„Ja, mit Milch, danke.“', 'Preference'],
      ['How much is the order?', ['€4.05', '€4.15', '€4.50', '€5.40'], 2, '„vier Euro fünfzig“ means 4.50.', 'Price'],
    ],
  }),

  /* ------------------------------------------------------------- A2 list -- */
  listenTask({
    id: 'listen-a2-1',
    level: 'a2',
    title: 'Ein Telefonanruf',
    topic: 'Making arrangements',
    minutes: 5,
    lines: [
      `Hallo Tim, hier ist Sara. Ich habe morgen einen Arzttermin um Viertel nach neun.`,
      `Kannst du bis halb zehn auf meinen Hund aufpassen? Ich muss vorher noch zur Apotheke.`,
      `Klar, ich komme um neun Uhr. Wo ist der Schlüssel?`,
      `Er liegt wie immer unter dem Blumentopf. Danke dir! Ich bringe dir Kuchen mit.`,
    ],
    translation: [
      `Hello Tim, it's Sara. I have a doctor's appointment tomorrow at a quarter past nine.`,
      `Can you look after my dog until half past nine? I still have to go to the pharmacy first.`,
      `Sure, I'll come at nine. Where is the key?`,
      `It's under the flowerpot as usual. Thanks! I'll bring you some cake.`,
    ],
    glossary: [
      ['der Arzttermin', 'the doctor’s appointment'],
      ['aufpassen', 'to look after'],
      ['die Apotheke', 'the pharmacy'],
      ['der Blumentopf', 'the flowerpot'],
    ],
    focus: 'Listening for times, tasks and locations',
    dictation: [
      `Ich habe morgen einen Arzttermin um Viertel nach neun.`,
      `Wo ist der Schlüssel?`,
    ],
    questions: [
      ['When is the appointment?', ['At 9:00', 'At 9:15', 'At 9:30', 'At 10:15'], 1, '„Viertel nach neun“ is 9:15.', 'Time'],
      ['What should Tim do?', ['Call the doctor', 'Look after the dog', 'Buy medicine', 'Water the plants'], 1, 'Sara asks: „Kannst du … auf meinen Hund aufpassen?“', 'Task'],
      ['Where is the key?', ['With the neighbour', 'In the pharmacy', 'Under the flowerpot', 'In the cake box'], 2, 'The last lines give the location.', 'Place'],
    ],
  }),
  listenTask({
    id: 'listen-a2-2',
    level: 'a2',
    title: 'Wetter und Ausflug',
    topic: 'Weather and weekend plans',
    minutes: 5,
    lines: [
      `Heute Morgen ist es bewölkt, aber am Nachmittag wird die Sonne wieder scheinen.`,
      `Die Temperaturen liegen zwischen acht und vierzehn Grad. Bitte nehmen Sie eine Jacke mit.`,
      `Für morgen ist Regen angekündigt, deshalb verschieben wir den Ausflug auf Sonntag.`,
      `Wir treffen uns um halb elf am Eingang des Parks und laufen dann zum See.`,
    ],
    translation: [
      `This morning it is cloudy, but in the afternoon the sun will shine again.`,
      `Temperatures are between eight and fourteen degrees. Please take a jacket with you.`,
      `Rain is forecast for tomorrow, so we are moving the trip to Sunday.`,
      `We are meeting at half past ten at the park entrance and then walking to the lake.`,
    ],
    glossary: [
      ['bewölkt', 'cloudy'],
      ['scheinen', 'to shine'],
      ['die Temperatur', 'the temperature'],
      ['verschieben', 'to postpone / move'],
    ],
    focus: 'Listening for weather details and a changed plan',
    dictation: [
      `Heute Morgen ist es bewölkt, aber am Nachmittag wird die Sonne wieder scheinen.`,
      `Wir treffen uns um halb elf am Eingang des Parks und laufen dann zum See.`,
    ],
    questions: [
      ['What is the weather like in the afternoon?', ['Rainy', 'Cloudy all day', 'Sunny', 'Snowy'], 2, '„am Nachmittag wird die Sonne wieder scheinen“.', 'Weather'],
      ['Why is the trip moved?', ['The lake is closed', 'Rain is forecast', 'The bus is full', 'Someone is ill'], 1, 'The third line gives rain as the reason.', 'Reason'],
      ['Where do they meet?', ['At the lake', 'At the station', 'At the park entrance', 'At the café'], 2, 'The meeting point is „am Eingang des Parks“.', 'Place'],
    ],
  }),

  /* ------------------------------------------------------------- B1 list -- */
  listenTask({
    id: 'listen-b1-1',
    level: 'b1',
    title: 'Ein Arzttermin',
    topic: 'Health and appointments',
    minutes: 6,
    lines: [
      `Guten Tag, ich hätte gern einen Termin bei Dr. Weber. Seit drei Tagen habe ich Halsschmerzen und leichtes Fieber.`,
      `Haben Sie schon Medikamente genommen? — Ja, aber die Schmerzen sind nicht besser geworden.`,
      `Der nächste freie Termin ist morgen um acht Uhr. Bringen Sie bitte Ihre Versichertenkarte mit.`,
      `Vielen Dank. Kann ich vorher noch etwas Warmes trinken? — Ja, Tee ist in Ordnung, aber kein Kaffee.`,
    ],
    translation: [
      `Good day, I would like an appointment with Dr Weber. For three days I have had a sore throat and a slight fever.`,
      `Have you taken any medication yet? — Yes, but the pain has not improved.`,
      `The next available appointment is tomorrow at eight. Please bring your health insurance card.`,
      `Thank you. Can I drink something warm beforehand? — Yes, tea is fine, but no coffee.`,
    ],
    glossary: [
      ['die Halsschmerzen', 'a sore throat'],
      ['das Fieber', 'the fever'],
      ['die Versichertenkarte', 'the health insurance card'],
      ['leicht', 'slight'],
    ],
    focus: 'Listening for symptoms, instructions and an appointment',
    dictation: [
      `Seit drei Tagen habe ich Halsschmerzen und leichtes Fieber.`,
      `Bringen Sie bitte Ihre Versichertenkarte mit.`,
    ],
    questions: [
      ['How long has the caller been ill?', ['One day', 'Three days', 'A week', 'Since yesterday'], 1, '„Seit drei Tagen“ answers the duration question.', 'Duration'],
      ['What should the caller bring?', ['Medicine', 'A coffee', 'The insurance card', 'A thermometer'], 2, 'The receptionist asks for the Versichertenkarte.', 'Instruction'],
      ['What drink is allowed before the appointment?', ['Coffee', 'Tea', 'Cold water', 'Juice'], 1, '„Tee ist in Ordnung, aber kein Kaffee.“', 'Detail'],
    ],
  }),
  listenTask({
    id: 'listen-b1-2',
    level: 'b1',
    title: 'Die Wohnungsbesichtigung',
    topic: 'Housing and decision making',
    minutes: 6,
    lines: [
      `Die Wohnung ist hell und ruhig, obwohl sie direkt an der Hauptstraße liegt. Die Fenster zeigen zum Innenhof.`,
      `Die Miete beträgt 780 Euro warm, dazu kommt eine Kaution von zwei Monatsmieten.`,
      `Der Vermieter sagt, dass die Heizung im nächsten Monat erneuert wird. Das hat mich überzeugt.`,
      `Ich muss bis Freitag entscheiden. Wenn ich zu lange warte, bekommt jemand anderes die Wohnung.`,
    ],
    translation: [
      `The flat is bright and quiet even though it is right on the main road. The windows face the inner courtyard.`,
      `The rent is 780 euros including utilities, plus a deposit of two months' rent.`,
      `The landlord says the heating will be replaced next month. That convinced me.`,
      `I have to decide by Friday. If I wait too long, someone else will get the flat.`,
    ],
    glossary: [
      ['die Miete', 'the rent'],
      ['die Kaution', 'the deposit'],
      ['der Innenhof', 'the inner courtyard'],
      ['erneuern', 'to renew / replace'],
    ],
    focus: 'Listening for conditions and a speakers evaluation',
    dictation: [
      `Die Miete beträgt 780 Euro warm, dazu kommt eine Kaution von zwei Monatsmieten.`,
      `Ich muss bis Freitag entscheiden.`,
    ],
    questions: [
      ['Why is the flat quiet?', ['It is on a side street', 'The windows face the courtyard', 'There are no neighbours', 'It is in the countryside'], 1, 'The windows showing to the Innenhof explain the quietness.', 'Reason'],
      ['What extra payment is mentioned?', ['A deposit', 'A parking fee', 'A cleaning service', 'A phone bill'], 0, '„dazu kommt eine Kaution von zwei Monatsmieten“.', 'Detail'],
      ['What convinced the speaker?', ['The low rent', 'The large kitchen', 'The heating replacement', 'The short contract'], 2, 'The heating being renewed next month is the deciding point.', 'Evaluation'],
    ],
  }),

  /* ------------------------------------------------------------- B2 list -- */
  listenTask({
    id: 'listen-b2-1',
    level: 'b2',
    title: 'Ein Vortrag über Energie',
    topic: 'Science and public policy',
    minutes: 8,
    lines: [
      `Guten Abend. In den letzten zehn Jahren sind die Kosten für Solarstrom deutlich gesunken. In manchen Regionen ist er heute günstiger als Strom aus Kohle.`,
      `Das Problem ist jedoch nicht mehr nur die Erzeugung, sondern die Speicherung. Ohne gute Batterien und Netze bleibt viel Energie zu Zeiten ungenutzt, in denen niemand sie braucht.`,
      `Die Politik sollte deshalb nicht nur neue Anlagen fördern, sondern auch Innovationen bei Verbrauch und Speicherung. Bürgerinnen und Bürger können durch kleine Entscheidungen selbst etwas beitragen.`,
    ],
    translation: [
      `Good evening. In the last ten years the cost of solar power has fallen noticeably. In some regions it is now cheaper than coal-fired electricity.`,
      `The problem, however, is no longer only generation but storage. Without good batteries and grids much energy remains unused at times when nobody needs it.`,
      `Politics should therefore support not only new plants but also innovation in consumption and storage. Citizens can contribute through small decisions themselves.`,
    ],
    glossary: [
      ['die Erzeugung', 'generation / production'],
      ['die Speicherung', 'storage'],
      ['das Netz', 'the grid'],
      ['fördern', 'to support / promote'],
    ],
    focus: 'Following a short lecture and its recommendation',
    dictation: [
      `Das Problem ist jedoch nicht mehr nur die Erzeugung, sondern die Speicherung.`,
      `Ohne gute Batterien und Netze bleibt viel Energie zu Zeiten ungenutzt, in denen niemand sie braucht.`,
    ],
    questions: [
      ['What has changed in the last ten years?', ['Coal became cheaper', 'Solar costs fell', 'Batteries disappeared', 'Grids were closed'], 1, 'The opening line states that solar costs have fallen noticeably.', 'Main point'],
      ['What is the current challenge?', ['Public interest', 'Storage and grids', 'Building more coal plants', 'Higher prices'], 1, 'The speaker shifts the problem from generation to storage.', 'Problem'],
      ['What recommendation is made?', ['Only support new plants', 'Stop using batteries', 'Support consumption and storage innovation', 'Ignore citizen choices'], 2, 'The final paragraph explicitly names consumption and storage innovation.', 'Recommendation'],
    ],
  }),
  listenTask({
    id: 'listen-b2-2',
    level: 'b2',
    title: 'Interview mit einer Autorin',
    topic: 'Literature and creative work',
    minutes: 8,
    lines: [
      `Frau Novak, Ihr neuer Roman spielt in einer kleinen Stadt. Warum haben Sie diesen Ort gewählt? — Weil dort Gerüchte schneller wandern als Nachrichten. Das hat mich interessiert.`,
      `Viele Leser sagen, das Buch sei sehr still. Wollen Sie damit etwas über Schweigen sagen? — Schweigen ist oft keine Pause, sondern eine Entscheidung. Darum geht es mir.`,
      `Haben Sie beim Schreiben ein festes Ziel? — Nein. Ich lasse die Figuren manchmal dorthin laufen, wo ich es nicht geplant habe. Das ist anstrengend, aber ehrlich.`,
    ],
    translation: [
      `Ms Novak, your new novel is set in a small town. Why did you choose that place? — Because rumours travel faster there than news. That interested me.`,
      `Many readers say the book is very quiet. Do you want to say something about silence with it? — Silence is often not a pause but a decision. That is what I mean.`,
      `Do you have a fixed goal when writing? — No. Sometimes I let the characters walk where I did not plan. That is demanding but honest.`,
    ],
    glossary: [
      ['das Gerücht', 'the rumour'],
      ['das Schweigen', 'silence'],
      ['die Figur', 'the character (in a story)'],
      ['anstrengend', 'demanding / tiring'],
    ],
    focus: 'Inferring an authors intentions from an interview',
    dictation: [
      `Weil dort Gerüchte schneller wandern als Nachrichten.`,
      `Schweigen ist oft keine Pause, sondern eine Entscheidung.`,
    ],
    questions: [
      ['Why did the author choose a small town?', ['It is modern', 'Rumours spread faster there', 'She was born there', 'It has a famous library'], 1, 'The first answer explicitly mentions rumours travelling faster than news.', 'Reason'],
      ['What does silence mean to her?', ['A lack of ideas', 'A decision', 'A printing error', 'A short chapter'], 1, '„Schweigen ist oft keine Pause, sondern eine Entscheidung.“', 'Inference'],
      ['How does she describe her writing process?', ['Strictly planned', 'Flexible and sometimes surprising', 'Completely random', 'Only based on research'], 1, 'She lets characters go where she did not plan, which is controlled but flexible.', 'Attitude'],
    ],
  }),

  /* ------------------------------------------------------------- C1 list -- */
  listenTask({
    id: 'listen-c1-1',
    level: 'c1',
    title: 'Ein Gespräch über Migration',
    topic: 'Society and integration',
    minutes: 10,
    lines: [
      `Wenn wir über Integration sprechen, sprechen wir oft zuerst über Anpassung. Aber Anpassung setzt voraus, dass es einen unveränderten Kern gibt, an den sich jemand anpasst.`,
      `In Wahrheit verändert sich die ganze Stadt. Ein Stadtteil, in dem viele Sprachen gehört werden, ist nicht einfach ein alter Stadtteil plus neue Menschen. Er ist ein anderer Stadtteil mit anderen Regeln der Begegnung.`,
      `Die interessante Frage ist deshalb nicht, wer sich anpasst, sondern wer die Bedingungen des Zusammenlebens gemeinsam formuliert. Das kostet Zeit, aber es verhindert, dass Zuständigkeit nur den Zugewanderten zugeschrieben wird.`,
    ],
    translation: [
      `When we talk about integration, we often talk first about adaptation. But adaptation presupposes an unchanged core to which someone adapts.`,
      `In reality the whole city changes. A district where many languages are heard is not simply an old district plus new people. It is a different district with different rules of encounter.`,
      `The interesting question is therefore not who adapts, but who formulates the conditions of living together jointly. That takes time, but it prevents responsibility from being assigned only to newcomers.`,
    ],
    glossary: [
      ['die Anpassung', 'adaptation'],
      ['die Begegnung', 'encounter / meeting'],
      ['die Zuständigkeit', 'responsibility / competence'],
      ['zuschreiben', 'to attribute / assign'],
    ],
    focus: 'Evaluating an argument about social change',
    dictation: [
      `Aber Anpassung setzt voraus, dass es einen unveränderten Kern gibt, an den sich jemand anpasst.`,
      `Die interessante Frage ist deshalb nicht, wer sich anpasst, sondern wer die Bedingungen des Zusammenlebens gemeinsam formuliert.`,
    ],
    questions: [
      ['What does the speaker question?', ['The need for language classes', 'The idea of an unchanged core', 'The cost of housing', 'The number of migrants'], 1, 'The first line challenges the premise of adaptation.', 'Argument'],
      ['How is a multilingual district described?', ['As an old district with small changes', 'As a completely separate city', 'As a different district with new rules', 'As a temporary camp'], 2, 'The second paragraph says it is „ein anderer Stadtteil mit anderen Regeln“.', 'Detail'],
      ['What is the proposed shift?', ['More adaptation by newcomers', 'Shared responsibility for coexistence', 'Fewer public meetings', 'A return to old rules'], 1, 'The conclusion asks who jointly formulates the conditions of living together.', 'Stance'],
    ],
  }),
  listenTask({
    id: 'listen-c1-2',
    level: 'c1',
    title: 'Ein Feature über Schlaf',
    topic: 'Health, work and research',
    minutes: 10,
    lines: [
      `Schlaf gilt oft als Privatangelegenheit, dabei ist er auch ein soziales Thema. Wer nachts arbeitet oder lange Wege zur Arbeit zurücklegt, schläft anders als jemand mit festen Tageszeiten.`,
      `Studien zeigen, dass chronischer Schlafmangel nicht nur die Stimmung verändert, sondern auch Risikoeinschätzungen schwächt. Menschen unterschätzen dann Kosten und überschätzen ihre eigene Reaktionsfähigkeit.`,
      `Deshalb ist die Frage nicht nur, wie viel Individualismus wir uns im Alltag leisten, sondern welche Arbeitsformen wir für zumutbar halten. Schlaf ist keine Schwäche, sondern eine Voraussetzung für verantwortliches Handeln.`,
    ],
    translation: [
      `Sleep is often treated as a private matter, but it is also a social issue. Anyone who works at night or commutes a long way sleeps differently from someone with fixed daytime hours.`,
      `Studies show that chronic sleep deprivation not only changes mood but also weakens risk assessment. People then underestimate costs and overestimate their own ability to react.`,
      `Therefore the question is not only how much individualism we can afford in everyday life, but which forms of work we consider reasonable. Sleep is not a weakness but a condition for responsible action.`,
    ],
    glossary: [
      ['die Privatangelegenheit', 'a private matter'],
      ['der Schlafmangel', 'sleep deprivation'],
      ['die Risikoeinschätzung', 'risk assessment'],
      ['zumutbar', 'reasonable / acceptable to expect'],
    ],
    focus: 'Connecting scientific details to a broader claim',
    dictation: [
      `Schlaf gilt oft als Privatangelegenheit, dabei ist er auch ein soziales Thema.`,
      `Schlaf ist keine Schwäche, sondern eine Voraussetzung für verantwortliches Handeln.`,
    ],
    questions: [
      ['Why is sleep called a social issue?', ['It depends on work and travel conditions', 'It is studied only in labs', 'It is a personal hobby', 'It affects only children'], 0, 'Working hours and commutes shape how people sleep.', 'Main idea'],
      ['What does chronic sleep deprivation affect?', ['Only mood', 'Only memory', 'Mood and risk assessment', 'Only physical strength'], 2, 'The second paragraph names both mood and risk assessment.', 'Detail'],
      ['What conclusion does the speaker draw?', ['Sleep is a weakness', 'Work should ignore sleep', 'Sleep enables responsible action', 'Night work is always best'], 2, 'The final sentence states the positive conclusion.', 'Conclusion'],
    ],
  }),

  /* ------------------------------------------------------------- C2 list -- */
  listenTask({
    id: 'listen-c2-1',
    level: 'c2',
    title: 'Podiumsdiskussion über KI',
    topic: 'Technology and responsibility',
    minutes: 12,
    lines: [
      `Wir sprechen hier über Künstliche Intelligenz, als wäre sie ein Wetterereignis: Sie kommt, und wir müssen uns darauf einstellen. Aber Systeme werden von Menschen entworfen, finanziert und in bestimmte Institutionen eingebettet.`,
      `Der eigentliche Streit ist doch nicht, ob Modelle Texte erzeugen dürfen, sondern wer die Folgen trägt, wenn diese Texte Entscheidungen beeinflussen. Verantwortung lässt sich nicht auf ein Modell abschieben, nur weil es komplex erscheint.`,
      `Wenn wir Transparenz fordern, müssen wir auch sagen, für wen. Ein Bericht, der nur Fachleute erreicht, schützt die Betroffenen kaum. Offenheit bedeutet hier auch, die Sprache der Nutzerinnen und Nutzer zu finden.`,
    ],
    translation: [
      `We talk about artificial intelligence as if it were a weather event: it is coming and we must adapt. But systems are designed, funded and embedded in particular institutions by people.`,
      `The real dispute is not whether models may generate texts, but who bears the consequences when those texts influence decisions. Responsibility cannot be shifted onto a model merely because it appears complex.`,
      `When we demand transparency, we must also say for whom. A report that reaches only experts hardly protects those affected. Openness here also means finding the language of users.`,
    ],
    glossary: [
      ['einbetten', 'to embed'],
      ['die Folge', 'the consequence'],
      ['abschieben', 'to shift / push away'],
      ['die Betroffenen', 'those affected'],
    ],
    focus: 'Distinguishing technical description from normative responsibility',
    dictation: [
      `Der eigentliche Streit ist doch nicht, ob Modelle Texte erzeugen dürfen, sondern wer die Folgen trägt, wenn diese Texte Entscheidungen beeinflussen.`,
      `Verantwortung lässt sich nicht auf ein Modell abschieben, nur weil es komplex erscheint.`,
    ],
    questions: [
      ['What metaphor is criticised in the first line?', ['AI as a machine', 'AI as weather', 'AI as a library', 'AI as a person'], 1, 'The speaker rejects describing AI as an unstoppable weather event.', 'Rhetoric'],
      ['Where does the speaker locate responsibility?', ['In the model alone', 'With people and institutions', 'In the weather', 'In users only'], 1, 'Systems are designed and embedded by people; responsibility cannot be shifted away.', 'Argument'],
      ['What does transparency need according to the third line?', ['More technical reports only', 'A language users understand', 'Fewer users', 'Longer contracts'], 1, 'Openness must reach those affected, not just experts.', 'Nuance'],
    ],
  }),
  listenTask({
    id: 'listen-c2-2',
    level: 'c2',
    title: 'Vortrag über Stadtarchitektur',
    topic: 'Architecture and collective memory',
    minutes: 12,
    lines: [
      `Gebäude sind keine bloßen Kulissen. Sie speichern Arbeitsverhältnisse, Migration und Machtverteilung, oft deutlicher als Akten, weil sie benutzt werden müssen und nicht nur gelesen.`,
      `Wenn wir ein Gebäude abbrechen, entscheiden wir nicht nur über Grundfläche und Investition. Wir entscheiden auch, welche Spuren sichtbar bleiben und welche Erinnerung wir als unbrauchbar erklären.`,
      `Eine Darstellung von Geschichte, die nur harmonische Fassaden zeigt, ist deshalb keine Neutralität, sondern eine Auswahl. Die Aufgabe einer zeitgenössischen Architektur besteht darin, diese Auswahl offenzulegen und den Widerspruch im Stadtraum erträglich zu machen.`,
    ],
    translation: [
      `Buildings are not mere backdrops. They store working conditions, migration and the distribution of power, often more clearly than archives because they must be used and are not merely read.`,
      `When we demolish a building, we decide not only about floor space and investment. We also decide which traces remain visible and which memory we declare unusable.`,
      `A representation of history that shows only harmonious façades is therefore not neutrality but selection. The task of contemporary architecture is to reveal this selection and make contradiction in urban space bearable.`,
    ],
    glossary: [
      ['die Kulisse', 'the backdrop'],
      ['die Spur', 'the trace'],
      ['die Fassade', 'the façade'],
      ['offenlegen', 'to reveal / disclose'],
    ],
    focus: 'Interpreting architecture as a cultural argument',
    dictation: [
      `Gebäude sind keine bloßen Kulissen.`,
      `Eine Darstellung von Geschichte, die nur harmonische Fassaden zeigt, ist deshalb keine Neutralität, sondern eine Auswahl.`,
    ],
    questions: [
      ['Why can buildings be clearer than archives?', ['They are cheaper', 'They are used, not only read', 'They are always new', 'They have no history'], 1, 'The first paragraph contrasts being used with merely being read.', 'Reason'],
      ['What does demolition decide according to the speaker?', ['Only the rent', 'Which memories remain visible', 'Only the architecture style', 'Who owns the city'], 1, 'The second paragraph names visible traces and declared memories.', 'Implication'],
      ['What is the task of contemporary architecture?', ['Hide all contradictions', 'Reveal selection and make contradiction bearable', 'Copy old façades', 'Avoid any public debate'], 1, 'The conclusion states this task explicitly.', 'Stance'],
    ],
  }),

  /* ------------------------------------------------------------ A1 write -- */
  writeTask({
    id: 'write-a1-1',
    level: 'a1',
    title: 'Eine Nachricht an einen Freund',
    topic: 'Introducing yourself',
    minutes: 8,
    prompt: `Schreibe eine kurze Nachricht an einen neuen Freund. Sag deinen Namen, woher du kommst und was du gern machst.`,
    promptEn: `Write a short message to a new friend. Say your name, where you are from and what you like doing.`,
    situation: 'You met someone at a language exchange and want to introduce yourself.',
    register: 'informal',
    targetWords: { min: 25, max: 55 },
    requiredPoints: ['name', 'city', 'hobby'],
    checklist: ['I wrote my name.', 'I said where I am from.', 'I named a hobby.', 'I used at least three sentences.'],
    keyPhrases: [['Ich heiße …', 'My name is …'], ['Ich komme aus …', 'I come from …'], ['Ich mache gern …', 'I like doing …']],
    rules: [
      { type: 'includes', value: 'ich heiße', label: 'Use the phrase for saying your name.' },
      { type: 'keywords', values: ['aus', 'gern'], min: 2, label: 'Include where you are from and what you like.' },
      { type: 'sentences', min: 3, label: 'Write at least three sentences.' },
    ],
    modelAnswer: [
      `Hallo! Ich heiße Anna und ich komme aus Berlin. Ich lerne seit einem Jahr Deutsch. Ich mache gern Sport und lese gern Bücher. Schön, dich zu treffen!`,
    ],
    modelNotes: 'Short, friendly sentences with the three required details.',
  }),
  writeTask({
    id: 'write-a1-2',
    level: 'a1',
    title: 'Eine Postkarte aus dem Urlaub',
    topic: 'Travel and postcards',
    minutes: 8,
    prompt: `Schreibe eine Postkarte. Sag, wo du bist, wie das Wetter ist und was du heute machst.`,
    promptEn: `Write a postcard. Say where you are, what the weather is like and what you are doing today.`,
    situation: 'You are on holiday and want to send a quick card to your family.',
    register: 'informal',
    targetWords: { min: 25, max: 55 },
    requiredPoints: ['place', 'weather', 'activity'],
    checklist: ['I said where I am.', 'I described the weather.', 'I said what I am doing.', 'I wrote a greeting or goodbye.'],
    keyPhrases: [['Liebe Grüße aus …', 'Greetings from …'], ['Das Wetter ist …', 'The weather is …'], ['Heute besuche ich …', 'Today I am visiting …']],
    rules: [
      { type: 'includes', value: 'aus', label: 'Say which place you are writing from.' },
      { type: 'keywords', values: ['wetter', 'heute'], min: 2, label: 'Include the weather and today’s activity.' },
      { type: 'sentences', min: 3, label: 'Write at least three sentences.' },
    ],
    modelAnswer: [
      `Liebe Grüße aus München! Das Wetter ist heute sonnig und warm. Heute besuche ich das Schloss und spaziere ich im Park. Morgen fahre ich nach Salzburg. Bis bald!`,
    ],
    modelNotes: 'The model uses simple present tense and mentions all three required points.',
  }),

  /* ------------------------------------------------------------ A2 write -- */
  writeTask({
    id: 'write-a2-1',
    level: 'a2',
    title: 'Eine E-Mail an den Vermieter',
    topic: 'Housing and formal requests',
    minutes: 10,
    prompt: `Deine Heizung funktioniert nicht. Schreibe eine kurze E-Mail an deinen Vermieter. Erkläre das Problem und bitte um einen Termin.`,
    promptEn: `Your heating is not working. Write a short email to your landlord. Explain the problem and ask for an appointment.`,
    situation: 'You need a repair and want to be polite and clear.',
    register: 'formal',
    targetWords: { min: 45, max: 90 },
    requiredPoints: ['heating problem', 'since when', 'appointment request'],
    checklist: ['I used a formal greeting.', 'I explained the problem.', 'I said when it started.', 'I asked for an appointment.'],
    keyPhrases: [['Sehr geehrter Herr …', 'Dear Mr …'], ['Seit … funktioniert … nicht.', 'Since … … has not been working.'], ['Könnten wir einen Termin vereinbaren?', 'Could we arrange an appointment?']],
    rules: [
      { type: 'includes', value: 'sehr geehr', label: 'Start with a formal greeting (Sehr geehrte/geehrter …).' },
      { type: 'keywords', values: ['heizung', 'seit', 'termin'], min: 3, label: 'Mention the heating, the start date and an appointment.' },
      { type: 'sentences', min: 4, label: 'Write at least four sentences.' },
    ],
    modelAnswer: [
      `Sehr geehrter Herr Meyer, seit Montag funktioniert die Heizung in meiner Wohnung nicht mehr. Die Wohnung ist morgens sehr kalt. Ich habe schon den Hausmeister angerufen, aber niemand hat sich gemeldet. Könnten wir einen Termin für die Reparatur vereinbaren? Ich bin jeden Nachmittag zu Hause. Mit freundlichen Grüßen, Sara Klein`,
    ],
    modelNotes: 'The model stays formal and gives a reason, a time and a clear request.',
  }),
  writeTask({
    id: 'write-a2-2',
    level: 'a2',
    title: 'Ein Urlaubsbericht',
    topic: 'Past experiences',
    minutes: 10,
    prompt: `Erzähle von deinem letzten Urlaub. Wo warst du, was hast du gemacht und was hat dir gefallen?`,
    promptEn: `Write about your last holiday. Where did you go, what did you do and what did you enjoy?`,
    situation: 'A colleague asks about your trip before the next team meeting.',
    register: 'neutral',
    targetWords: { min: 50, max: 95 },
    requiredPoints: ['destination', 'activities', 'opinion'],
    checklist: ['I named the place.', 'I described at least two activities.', 'I gave my opinion.', 'I used past tense forms.'],
    keyPhrases: [['Ich war in …', 'I was in …'], ['Wir haben … besucht.', 'We visited …'], ['Mir hat … besonders gefallen.', 'I especially liked …']],
    rules: [
      { type: 'includes', value: 'ich war', label: 'Say where you went.' },
      { type: 'keywords', values: ['haben', 'gefallen'], min: 2, label: 'Include activities and your opinion.' },
      { type: 'sentences', min: 4, label: 'Write at least four sentences.' },
    ],
    modelAnswer: [
      `Ich war im Sommer eine Woche in Italien. Wir haben in einem kleinen Hotel am Meer gewohnt. Jeden Morgen sind wir schwimmen gegangen und am Nachmittag haben wir einen Markt besucht. Mir hat das Essen besonders gefallen, vor allem der frische Fisch. Die Stadt war schön, aber oft sehr voll. Nächsten Urlaub möchte ich wieder dorthin fahren.`,
    ],
    modelNotes: 'Past tense, two activities and a balanced opinion.',
  }),

  /* ------------------------------------------------------------ B1 write -- */
  writeTask({
    id: 'write-b1-1',
    level: 'b1',
    title: 'Bewerbung um ein Praktikum',
    topic: 'Work and applications',
    minutes: 14,
    prompt: `Schreibe eine kurze Bewerbung für ein Praktikum in einem Büro. Erkläre, warum du dich bewirbst, was du kannst und wann du verfügbar bist.`,
    promptEn: `Write a short application for an office internship. Explain why you are applying, what you can do and when you are available.`,
    situation: 'You saw an advertisement and want to convince the team.',
    register: 'formal',
    targetWords: { min: 80, max: 140 },
    requiredPoints: ['motivation', 'skills', 'availability'],
    checklist: ['I used a formal greeting.', 'I explained my motivation.', 'I named two skills.', 'I said when I can start.'],
    keyPhrases: [['mit großem Interesse', 'with great interest'], ['Ich verfüge über …', 'I have … at my disposal'], ['Ab dem … stehe ich zur Verfügung.', 'From … I am available.']],
    rules: [
      { type: 'includes', value: 'sehr geehrte', label: 'Use a formal salutation.' },
      { type: 'keywords', values: ['interesse', 'computer', 'verfügung'], min: 3, label: 'Include motivation, a concrete skill and availability.' },
      { type: 'sentences', min: 5, label: 'Write at least five sentences.' },
    ],
    modelAnswer: [
      `Sehr geehrte Damen und Herren, ich habe Ihre Ausschreibung für ein Praktikum mit großem Interesse gelesen. Ich möchte gerne praktische Erfahrung in einem Büro sammeln und dabei meine Deutschkenntnisse verbessern. Ich verfüge über sichere Computerkenntnisse und arbeite sorgfältig auch bei hohen Anforderungen. Am Computer arbeite ich schnell und sicher. In der Schule habe ich schon ein Projekt mit Excel organisiert. Bei der Arbeit im Team übernehme ich gern Aufgaben im Büro und halte Fristen zuverlässig ein. Ab dem ersten September stehe ich für drei Monate zur Verfügung. Über ein Vorstellungsgespräch würde ich mich freuen. Mit freundlichen Grüßen, Jonas Weber`,
    ],
    modelNotes: 'Motivation, two concrete skills and a clear availability statement.',
  }),
  writeTask({
    id: 'write-b1-2',
    level: 'b1',
    title: 'Mein Lieblingsort',
    topic: 'Personal description and opinion',
    minutes: 12,
    prompt: `Beschreibe einen Ort, den du gern besuchst. Erkläre, was dort besonders ist und warum du ihn magst.`,
    promptEn: `Describe a place you like to visit. Explain what is special there and why you like it.`,
    situation: 'Your language class is sharing short portraits of favourite places.',
    register: 'neutral',
    targetWords: { min: 80, max: 140 },
    requiredPoints: ['description', 'special feature', 'personal reason'],
    checklist: ['I described the place.', 'I named something special.', 'I explained my feeling.', 'I gave an example from my own experience.'],
    keyPhrases: [['Mein Lieblingsort ist …', 'My favourite place is …'], ['Besonders ist dort …', 'What is special there is …'], ['Ich mag ihn, weil …', 'I like it because …']],
    rules: [
      { type: 'includes', value: 'lieblingsort', label: 'Name your favourite place.' },
      { type: 'keywords', values: ['besonders', 'weil'], min: 2, label: 'Include a special feature and a reason.' },
      { type: 'sentences', min: 5, label: 'Write at least five sentences.' },
    ],
    modelAnswer: [
      `Mein Lieblingsort ist ein kleiner Park nahe meinem Haus. Besonders ist dort ein alter Brunnen, an dem im Sommer viele Kinder spielen. Ich mag ihn, weil es dort auch an warmen Tagen angenehm kühl ist. Im Frühling riechen die Bäume nach Blüten, und am Wochenende sitzen dort oft Familien mit Kindern. Letztes Wochenende habe ich dort zwei Stunden gelesen und mit einer Nachbarin gesprochen. Der Park ist nicht groß, aber er macht die Nachbarschaft lebendig. Deshalb gehe ich fast jeden Tag hin.`,
    ],
    modelNotes: 'Description, special detail, reason and a personal example.',
  }),

  /* ------------------------------------------------------------ B2 write -- */
  writeTask({
    id: 'write-b2-1',
    level: 'b2',
    title: 'Ein Leserbrief zur Mobilität',
    topic: 'Public opinion and argumentation',
    minutes: 16,
    prompt: `Deine Stadt möchte eine neue Straße durch einen Park bauen. Schreibe einen Leserbrief: Nenne deine Meinung, zwei Argumente und eine Alternative.`,
    promptEn: `Your city wants to build a new road through a park. Write a letter to the editor: state your opinion, give two arguments and suggest an alternative.`,
    situation: 'You want to influence a public debate in the local newspaper.',
    register: 'formal',
    targetWords: { min: 120, max: 190 },
    requiredPoints: ['opinion', 'two arguments', 'alternative'],
    checklist: ['I stated my position clearly.', 'I gave two different arguments.', 'I suggested an alternative.', 'I addressed the readers politely.'],
    keyPhrases: [['Ich bin der Meinung, dass …', 'I am of the opinion that …'], ['Einerseits … andererseits …', 'On the one hand … on the other hand …'], ['Eine Alternative wäre …', 'An alternative would be …']],
    rules: [
      { type: 'includes', value: 'meinung', label: 'State your opinion explicitly.' },
      { type: 'keywords', values: ['einerseits', 'andererseits', 'alternative'], min: 3, label: 'Use a two-sided argument and name an alternative.' },
      { type: 'sentences', min: 6, label: 'Write at least six sentences.' },
    ],
    modelAnswer: [
      `Sehr geehrte Redaktion, ich bin der Meinung, dass die geplante Straße durch den Park keine gute Lösung ist. Einerseits würde der Park einen wichtigen Ort für Erholung verlieren, den besonders Familien und ältere Menschen nutzen. Andererseits ist nicht bewiesen, dass die neue Straße den Verkehr dauerhaft entspannt; erfahrene Autofahrer wählen oft andere Wege, sobald diese frei sind. Eine Alternative wäre es, die bestehenden Straßen besser zu koordinieren und den Radverkehr auszubauen. Außerdem könnten Lieferzeiten in die Randstunden verlegt werden. So entsteht mehr Platz, ohne dass Grünfläche verschwindet. Auch die Anwohnerinnen und Anwohner sollten frühzeitig gehört werden, damit die Planung nicht wie ein fertiges Ergebnis wirkt. Diese Maßnahmen wären langfristig günstiger als ein Bau, der nur wenige Minuten spart und zugleich die Lebensqualität mindert. Ich bitte den Stadtrat, diese Optionen öffentlich zu prüfen. Mit freundlichen Grüßen, Lea Fischer`,
    ],
    modelNotes: 'Clear stance, two connected arguments, a concrete alternative and a polite close.',
  }),
  writeTask({
    id: 'write-b2-2',
    level: 'b2',
    title: 'Ein Reisebericht für einen Blog',
    topic: 'Narrative and reflection',
    minutes: 16,
    prompt: `Schreibe einen Reisebericht über eine Stadt, die du kennst. Beschreibe einen besonderen Moment und ziehe ein Fazit.`,
    promptEn: `Write a travel report about a city you know. Describe one special moment and draw a conclusion.`,
    situation: 'Your travel blog expects a vivid but honest report of about 150 words.',
    register: 'neutral',
    targetWords: { min: 120, max: 190 },
    requiredPoints: ['city', 'special moment', 'conclusion'],
    checklist: ['I introduced the city.', 'I described one moment in detail.', 'I used sensory or concrete details.', 'I ended with a conclusion.'],
    keyPhrases: [['Als ich … ankam, …', 'When I arrived …'], ['Besonders deutlich wurde …', 'What became especially clear was …'], ['Unterm Strich …', 'All in all …']],
    rules: [
      { type: 'includes', value: 'als ich', label: 'Begin a scene with a time clause.' },
      { type: 'keywords', values: ['besonders', 'fazit'], min: 2, label: 'Include a highlighted detail and a conclusion.' },
      { type: 'sentences', min: 6, label: 'Write at least six sentences.' },
    ],
    modelAnswer: [
      `Als ich letztes Frühjahr in Porto ankam, war der Hafen noch im Nebel. Ich ging die Treppe zum Aussichtspunkt hinauf und hörte schon von weitem die Möwen. Dann öffnete sich die Sonne zwischen den Dächern, und die Höfe unter mir wurden golden. In einer kleinen Bäckerei kaufte ich ein pastel de nata, das noch warm war. Besonders deutlich wurde mir an diesem Morgen, wie sehr eine Stadt vom Licht abhängt. Die Menschen auf der Straße wirkten plötzlich langsamer und freundlicher. Als Fazit bleibt dieser ungeplante Morgen stärker als jeder Reiseführer. Am Nachmittag fuhr ich mit dem Zug weiter und sah, wie sich das Licht auf den Feldern veränderte. Erst beim Abendessen verstand ich, warum dieser Nebel so wertvoll war. Ich würde jederzeit wieder früh am Hafen stehen.`,
    ],
    modelNotes: 'A concrete scene, sensory detail and a reflective conclusion.',
  }),

  /* ------------------------------------------------------------ C1 write -- */
  writeTask({
    id: 'write-c1-1',
    level: 'c1',
    title: 'Ein Essay über Sprachlernen',
    topic: 'Education and reflection',
    minutes: 20,
    prompt: `Diskutiere die These: „Eine zweite Sprache verändert die Art, wie wir die erste sehen.“ Nimm Stellung und begründe deine Ansicht.`,
    promptEn: `Discuss the claim: “A second language changes the way we see the first.” State your position and justify it.`,
    situation: 'A language magazine asks for a thoughtful essay of around 200 words.',
    register: 'formal',
    targetWords: { min: 170, max: 260 },
    requiredPoints: ['thesis', 'argument', 'counterargument', 'position'],
    checklist: ['I stated the thesis.', 'I gave at least two reasons.', 'I considered a counterargument.', 'I concluded with a clear position.'],
    keyPhrases: [['Die These lautet, dass …', 'The thesis is that …'], ['Einwenden könnte man, dass …', 'One could object that …'], ['Unterm Strich …', 'All in all …']],
    rules: [
      { type: 'includes', value: 'these', label: 'Name and engage with the thesis.' },
      { type: 'keywords', values: ['einwenden', 'andererseits', 'fazit'], min: 3, label: 'Include an objection, a contrast and a conclusion.' },
      { type: 'sentences', min: 8, label: 'Write at least eight sentences.' },
    ],
    modelAnswer: [
      `Die These lautet, dass eine zweite Sprache verändert, wie wir die erste sehen. Diese Behauptung ist überzeugend, weil wir Strukturen erst bemerken, wenn wir sie mit anderen Systemen vergleichen. Wer etwa zum ersten Mal zwei Artikel für dieselbe Kategorie lernt, sieht plötzlich, wie willkürlich die eigene Grammatik wirkt. Andererseits könnte man einwenden, dass die Muttersprache zu fest verankert ist, um sich wirklich zu verschieben. Tatsächlich bleiben viele intuitiv getroffene Entscheidungen stabil. Doch genau die Reflexion über diese Entscheidungen verändert den Blick. Wir hören auf, Selbstverständliches als natürlich zu bezeichnen, und beginnen, es als eine unter mehreren Möglichkeiten zu verstehen. Diese Beobachtung gilt nicht nur für Grammatik, sondern auch für Höflichkeit und Humor. Ein Scherz, der in einer Sprache leicht wirkt, kann in der anderen nachdrücklich oder sogar verletzend klingen. Wer solche Unterschiede bemerkt, entwickelt ein feines Gespür für die Grenzen des eigenen Ausdrucks. Gleichzeitig lernt er, dass die eigene Muttersprache ebenfalls nur eine von vielen möglichen Ordnungen ist. Dieses Fazit gilt nicht nur für Grammatik, sondern für jede Sprache. Das macht die erste Sprache nicht weniger vertraut, aber deutlicher konturiert. Unterm Strich verändert eine zweite Sprache weniger den Wortschatz als die Haltung zur eigenen Sprache.`,
    ],
    modelNotes: 'Thesis, two reasons, an objection and a nuanced conclusion.',
  }),
  writeTask({
    id: 'write-c1-2',
    level: 'c1',
    title: 'Stellungnahme zum Homeoffice',
    topic: 'Work, autonomy and social contact',
    minutes: 20,
    prompt: `Ein Unternehmen möchte Homeoffice auf zwei Tage pro Woche begrenzen. Nimm Stellung: Welche Gründe sprechen dafür und dagegen, und was wäre eine ausgewogene Regelung?`,
    promptEn: `A company wants to limit home office to two days per week. State your view: what speaks for and against it, and what would be a balanced rule?`,
    situation: 'You are writing an internal opinion piece for staff and management.',
    register: 'formal',
    targetWords: { min: 170, max: 260 },
    requiredPoints: ['benefits', 'drawbacks', 'balanced rule'],
    checklist: ['I named benefits.', 'I named drawbacks.', 'I proposed a concrete rule.', 'I addressed both sides fairly.'],
    keyPhrases: [['Befürworter verweisen auf …', 'Supporters point to …'], ['Kritiker befürchten jedoch …', 'Critics fear, however …'], ['Ein vernünftiger Kompromiss wäre …', 'A sensible compromise would be …']],
    rules: [
      { type: 'includes', value: 'befürworter', label: 'Present the supporters’ side.' },
      { type: 'keywords', values: ['kritiker', 'kompromiss', 'team'], min: 3, label: 'Include criticism, a compromise and team impact.' },
      { type: 'sentences', min: 8, label: 'Write at least eight sentences.' },
    ],
    modelAnswer: [
      `Befürworter verweisen auf die höhere Konzentration und die eingesparte Fahrtzeit. Tatsächlich können viele Aufgaben zu Hause ruhiger erledigt werden, besonders wenn das Büro laut ist. Kritiker befürchten jedoch, dass regelmäßige Treffen verloren gehen und neue Kolleginnen schwerer Anschluss finden. Diese Sorge ist berechtigt, weil informelles Lernen oft nebenbei geschieht. Ein vernünftiger Kompromiss wäre eine Kernzeit von drei Tagen im Büro, die für alle verbindlich ist. Die übrigen Tage könnten je nach Aufgabe flexibel gewählt werden. Wichtig wäre außerdem, dass Team-Tage nicht nur für Verwaltung, sondern für echte Zusammenarbeit genutzt werden. So entsteht Planungssicherheit, ohne die Vorteile des Homeoffice aufzugeben. Für die Beschäftigten wäre entscheidend, dass die Regelung nicht wie ein Privileg einzelner Abteilungen wirkt. Wer Homeoffice nur denjenigen zugesteht, die besonders laut verhandeln, beschädigt das Vertrauen im ganzen Unternehmen. Gleichzeitig brauchen Projekte Phasen, in denen alle am selben Ort sitzen und schwierige Fragen direkt klären können. Solche Phasen sollten rechtzeitig angekündigt werden, damit auch Pendlerinnen und Pendler ihre Familien organisieren können. Ein vernünftiger Kompromiss regelt deshalb sowohl die Zahl der Bürotage als auch die Qualität der Zusammenarbeit. Langfristig zählt weniger die genaue Zahl der Tage als die Qualität der Absprachen.`,
    ],
    modelNotes: 'Balanced pros and cons with a concrete, workable compromise.',
  }),

  /* ------------------------------------------------------------ C2 write -- */
  writeTask({
    id: 'write-c2-1',
    level: 'c2',
    title: 'Ein Editorial über kulturelle Identität',
    topic: 'Culture, identity and public discourse',
    minutes: 24,
    prompt: `Verfasse ein Editorial zur Frage, ob kulturelle Identität eher bewahrt oder ständig neu verhandelt werden sollte. Begründe differenziert.`,
    promptEn: `Write an editorial on whether cultural identity should be preserved or continually renegotiated. Give a differentiated argument.`,
    situation: 'A quality newspaper asks for a nuanced lead essay of about 250 words.',
    register: 'formal',
    targetWords: { min: 220, max: 320 },
    requiredPoints: ['definition', 'preservation', 'change', 'position'],
    checklist: ['I defined the term.', 'I presented the case for preservation.', 'I presented the case for change.', 'I ended with a nuanced position.'],
    keyPhrases: [['Unter kultureller Identität verstehe ich …', 'By cultural identity I mean …'], ['Einerseits …', 'On the one hand …'], ['Doch diese Sicht greift zu kurz, weil …', 'However, this view falls short because …']],
    rules: [
      { type: 'includes', value: 'identität', label: 'Engage with the concept of identity.' },
      { type: 'keywords', values: ['einerseits', 'doch', 'position'], min: 3, label: 'Use a two-sided structure and state your position.' },
      { type: 'sentences', min: 10, label: 'Write at least ten sentences.' },
    ],
    modelAnswer: [
      `Unter kultureller Identität verstehe ich keinen festen Besitz, sondern ein Geflecht aus Erinnerungen, Praktiken und Zugehörigkeiten, das im Alltag immer wieder bestätigt oder verändert wird. Einerseits ist das Bedürfnis nach Bewahrung verständlich: Sprachen, Feste und Handwerk tradieren Erfahrungen, die sich nicht beliebig ersetzen lassen. Wenn solche Formen verschwinden, verliert eine Gemeinschaft auch ein Stück ihrer Fähigkeit, sich selbst zu erzählen. Doch diese Sicht greift zu kurz, weil Bewahrung leicht zur Aufsicht über die eigenen Grenzen wird. Was einmal als authentisch galt, war häufig das Ergebnis früherer Auseinandersetzungen und Auswahlentscheidungen. Kulturelle Identität ist deshalb nicht ein Museum, sondern ein Gespräch, an dem neue Stimmen teilnehmen müssen, damit es nicht zur Belehrung erstarrt. Entscheidend ist nicht, ob Tradition oder Veränderung siegt, sondern wer über die Deutungshoheit verfügt. Eine offene Identität bewahrt ihre Texte, indem sie neue Kommentare zulässt. Sie verändert die Form, ohne die Erinnerung zu tilgen. Wer jede Abweichung als Verlust behandelt, verwechselt Sorge mit Kontrolle und übersieht, dass Tradition selbst einmal neu war. Das gilt insbesondere für Einwanderungsgeschichten, die erst sichtbar werden, wenn wir aufhören, sie als Abweichung von einer angenommenen Norm zu lesen. Ein solcher Blick verändert auch den Umgang mit Sprache: Wer mehrere Sprachen als selbstverständlich erfährt, bemerkt leichter, wie viel Bedeutung im Ton und im Rhythmus liegt. Meine Position ist daher, dass wir Traditionen aktiv weitergeben, aber ihre Autorität nicht gegen spätere Generationen verteidigen sollten. Nur so bleibt Identität eine Ressource statt eines Zauns.`,
    ],
    modelNotes: 'Definition, balanced arguments, critique of essentialism and a clear final position.',
  }),
  writeTask({
    id: 'write-c2-2',
    level: 'c2',
    title: 'Analyse eines Stadtraums',
    topic: 'Urban space and social inequality',
    minutes: 24,
    prompt: `Analysiere einen öffentlichen Ort in deiner Stadt im Hinblick auf Zugänglichkeit und soziale Wirkung. Formuliere eine begründete Empfehlung.`,
    promptEn: `Analyse a public space in your city in terms of accessibility and social impact. Formulate a reasoned recommendation.`,
    situation: 'A planning committee asks for a concise expert statement before a redesign.',
    register: 'formal',
    targetWords: { min: 220, max: 320 },
    requiredPoints: ['space', 'accessibility', 'social impact', 'recommendation'],
    checklist: ['I described the space.', 'I analysed accessibility.', 'I discussed social effects.', 'I gave a concrete recommendation.'],
    keyPhrases: [['Der untersuchte Ort ist …', 'The space examined is …'], ['Zugänglichkeit bedeutet hier …', 'Accessibility here means …'], ['Ich empfehle daher …', 'I therefore recommend …']],
    rules: [
      { type: 'includes', value: 'zugänglichkeit', label: 'Name the accessibility criterion.' },
      { type: 'keywords', values: ['wirkung', 'empfehle', 'öffentlich'], min: 3, label: 'Include social impact, a recommendation and the public dimension.' },
      { type: 'sentences', min: 10, label: 'Write at least ten sentences.' },
    ],
    modelAnswer: [
      `Der untersuchte Ort ist der Platz vor dem Hauptbahnhof, der täglich von Pendlerinnen, Touristen und Menschen ohne festen Wohnsitz genutzt wird. Zugänglichkeit bedeutet hier nicht nur fehlende Stufen, sondern auch die Möglichkeit, sich ohne Konsumzwang aufzuhalten. Der Platz ist gut an Bahn und Bus angebunden, jedoch sind viele Sitzgelegenheiten in Cafés integriert, die eine Bestellung erwarten. Dadurch entsteht eine Wirkung, die bestimmte Gruppen subtil ausschließt. Gleichzeitig bietet die offene Mitte Raum für spontane Gespräche und informelle Musikdarbietungen, die den Ort beleben. Die Spannung liegt darin, dass genau diese Nutzung von Passanten als Störung empfunden wird, obwohl sie zum öffentlichen Charakter gehört. Ich empfehle daher, mehrere freie Sitzbänke mit Rückenlehnen zu installieren und einen kleinen, wettergeschützten Bereich ohne Konsumpflicht zu schaffen. Wichtig ist außerdem, dass die Beleuchtung gleichmäßig ist, damit der Platz am Abend nicht nur für einige Gruppen angenehm wirkt. Bei einer Neugestaltung sollte außerdem geprüft werden, wie viele Menschen den Platz tatsächlich erreichen: nicht nur mit dem Auto, sondern zu Fuß, mit dem Rad und mit öffentlichen Verkehrsmitteln. Breite Gehwege, klare Querungen und ein schattiger Aufenthaltsbereich würden die Bewegung lenken, ohne einzelne Gruppen zu vertreiben. Auch die Sichtachsen zum Bahnhof und zu den umliegenden Geschäften sollten erhalten bleiben, damit sich Besucher schnell orientieren. Eine begleitete Nutzung durch lokale Initiativen könnte Konflikte moderieren, statt sie zu verdrängen. Entscheidend ist am Ende, dass die Verbesserung nicht nur für gut sichtbare Nutzer gedacht ist, sondern für alle, die den öffentlichen Raum täglich brauchen. So bleibt der Ort öffentlich, ohne seine soziale Wirkung dem Zufall zu überlassen.`,
    ],
    modelNotes: 'Clear object of analysis, accessibility criterion, social impact and specific measures.',
  }),
];

function cleanText(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function cleanTask(task) {
  const cleanValue = (value) => {
    if (typeof value === 'string') return cleanText(value);
    if (Array.isArray(value)) return value.map(cleanValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanValue(item)]));
    }
    return value;
  };
  return cleanValue(task);
}

const cleaned = tasks.map(cleanTask);
const counts = {
  bySkill: { reading: 0, listening: 0, writing: 0 },
  byLevel: Object.fromEntries(LEVELS.map((level) => [level, 0])),
};
for (const task of cleaned) {
  counts.bySkill[task.skill] += 1;
  counts.byLevel[task.level] += 1;
}

const document = {
  schemaVersion: 1,
  title: 'Graded reading, listening and writing practice',
  levels: LEVELS,
  counts,
  tasks: cleaned,
};

const output = path.join(ROOT, 'content', 'skill-practice.json');
fs.writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`Wrote ${output} — ${cleaned.length} tasks (${counts.bySkill.reading} reading, ${counts.bySkill.listening} listening, ${counts.bySkill.writing} writing).`);
