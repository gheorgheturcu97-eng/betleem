// Bible books and references ("Ioan 3:16-18", "1 Cor 13", "Ps 23 1", "John 3:16"), used by the hub and the browser.

// [Romanian name, English name, extra short forms]
export const BOOKS = [
  ['Geneza', 'Genesis', 'gen gn ge facerea'], ['Exodul', 'Exodus', 'ex exod iesirea'], ['Leviticul', 'Leviticus', 'lev lv'],
  ['Numeri', 'Numbers', 'num nm'], ['Deuteronomul', 'Deuteronomy', 'deut dt deu'], ['Iosua', 'Joshua', 'ios josh'],
  ['Judecători', 'Judges', 'jud judg jdg'], ['Rut', 'Ruth', 'rt'], ['1 Samuel', '1 Samuel', '1sam 1sa 1sm'], ['2 Samuel', '2 Samuel', '2sam 2sa 2sm'],
  ['1 Împărați', '1 Kings', '1imp 1kgs 1ki 1regi'], ['2 Împărați', '2 Kings', '2imp 2kgs 2ki 2regi'], ['1 Cronici', '1 Chronicles', '1cron 1cr 1chr'],
  ['2 Cronici', '2 Chronicles', '2cron 2cr 2chr'], ['Ezra', 'Ezra', 'ezr'], ['Neemia', 'Nehemiah', 'neem ne neh'], ['Estera', 'Esther', 'est esth'],
  ['Iov', 'Job', 'jb'], ['Psalmii', 'Psalms', 'ps psa psalm psalmi psalmul psalmul psalms'], ['Proverbe', 'Proverbs', 'prov pr pv proverbele'],
  ['Eclesiastul', 'Ecclesiastes', 'ecl eccl ec qoh'], ['Cântarea cântărilor', 'Song of Solomon', 'cant cc song sng sos'],
  ['Isaia', 'Isaiah', 'is isa'], ['Ieremia', 'Jeremiah', 'ier jer'], ['Plângerile lui Ieremia', 'Lamentations', 'plang pl lam plangeri'],
  ['Ezechiel', 'Ezekiel', 'ezec ez ezek'], ['Daniel', 'Daniel', 'dan dn'], ['Osea', 'Hosea', 'os hos'], ['Ioel', 'Joel', 'ioel jl'],
  ['Amos', 'Amos', 'am'], ['Obadia', 'Obadiah', 'obad ob'], ['Iona', 'Jonah', 'jon'], ['Mica', 'Micah', 'mic mi'], ['Naum', 'Nahum', 'na nah'],
  ['Habacuc', 'Habakkuk', 'hab'], ['Țefania', 'Zephaniah', 'tef zeph zep'], ['Hagai', 'Haggai', 'hag'], ['Zaharia', 'Zechariah', 'zah zech zec'],
  ['Maleahi', 'Malachi', 'mal'], ['Matei', 'Matthew', 'mat mt matt'], ['Marcu', 'Mark', 'mar mc mk mr'], ['Luca', 'Luke', 'lc lk luc'],
  ['Ioan', 'John', 'in jn ioa'], ['Faptele apostolilor', 'Acts', 'fapte fap fa act'], ['Romani', 'Romans', 'rom ro rm'],
  ['1 Corinteni', '1 Corinthians', '1cor 1co'], ['2 Corinteni', '2 Corinthians', '2cor 2co'], ['Galateni', 'Galatians', 'gal ga'],
  ['Efeseni', 'Ephesians', 'ef eph'], ['Filipeni', 'Philippians', 'fil flp phil php'], ['Coloseni', 'Colossians', 'col'],
  ['1 Tesaloniceni', '1 Thessalonians', '1tes 1ts 1th 1thess'], ['2 Tesaloniceni', '2 Thessalonians', '2tes 2ts 2th 2thess'],
  ['1 Timotei', '1 Timothy', '1tim 1ti 1tm'], ['2 Timotei', '2 Timothy', '2tim 2ti 2tm'], ['Tit', 'Titus', 'tt'], ['Filimon', 'Philemon', 'filim flm phlm'],
  ['Evrei', 'Hebrews', 'evr heb ev'], ['Iacov', 'James', 'iac jas jac'], ['1 Petru', '1 Peter', '1pet 1pt 1pe'], ['2 Petru', '2 Peter', '2pet 2pt 2pe'],
  ['1 Ioan', '1 John', '1in 1jn 1ioan'], ['2 Ioan', '2 John', '2in 2jn 2ioan'], ['3 Ioan', '3 John', '3in 3jn 3ioan'], ['Iuda', 'Jude', 'iud jd'],
  ['Apocalipsa', 'Revelation', 'apoc ap ap rev rv apocalipsa'],
];

export const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const ALIAS = new Map();
BOOKS.forEach(([ro, en, more], i) => { for (const a of [ro, en, ...more.split(' ')]) if (!ALIAS.has(fold(a))) ALIAS.set(fold(a), i); });

export const bookName = (i, lang = 'ro') => BOOKS[i]?.[lang === 'en' ? 1 : 0] || '';

/** The book a person means: exact name or short form first, then the first book whose name starts with it. */
export function findBook(text) {
  const f = fold(text); if (!f) return -1;
  if (ALIAS.has(f)) return ALIAS.get(f);
  const i = BOOKS.findIndex(([ro, en]) => fold(ro).startsWith(f) || fold(en).startsWith(f));
  return i;
}

/** "Ioan 3:16-18" → { book: 42, chapter: 3, from: 16, to: 18 }; "Ps 23" → whole chapter (from/to 0). Null if it is not a reference. */
export function parseRef(text) {
  const m = String(text).trim().match(/^(\d?\s*\.?\s*[^\d:.,]+?)\s*(\d+)?(?:\s*[:., ]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/);
  if (!m) return null;
  const book = findBook(m[1]); if (book < 0) return null;
  const chapter = Number(m[2]) || 1, from = Number(m[3]) || 0, to = Number(m[4]) || from;
  return { book, chapter, from, to: Math.max(from, to) };
}

export function formatRef(r, lang = 'ro') {
  if (!r) return '';
  const v = r.from ? ':' + r.from + (r.to && r.to !== r.from ? '-' + r.to : '') : '';
  return `${bookName(r.book, lang)} ${r.chapter}${v}`;
}
