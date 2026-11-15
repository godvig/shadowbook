// Writes the crawlable match-hub pages, one per language, from the texts below:
//   /world-chess-championship-2026/          (en, also x-default)
//   /sv/schack-vm-2026/                      (sv)
//   /uz/shaxmat-jahon-chempionati-2026/      (uz)
//   /hi/vishwa-shatranj-championship-2026/   (hi)
// Each page carries its own title, description, hreflang links, Open Graph tags and structured data,
// and the app mounts on top of it. The sitemap is written from the same list. Run `npm run match-pages` after changing a text; a test fails if the
// committed pages no longer match this file. Paths and titles must also match src/live/routes.ts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://shadowbook.godvig.com';
const REPO = 'https://github.com/godvig/shadowbook';
/** Date of the last change to the page texts, for the sitemap. */
const LASTMOD = '2026-11-15';

const REACTIONS = '<code>!!</code> <code>!</code> <code>?</code> <code>??</code> <code>½</code>';

/** @type {import('./match-pages.d.mts').MatchPage[]} */
export const PAGES = [
  {
    lang: 'en',
    label: 'English',
    path: '/world-chess-championship-2026/',
    ogLocale: 'en_US',
    title: 'Gukesh vs Sindarov: World Chess Championship 2026 predictions and live chat | Shadowbook',
    description:
      'Predict every game of the 2026 World Chess Championship between Gukesh and Sindarov in Geneva, follow the moves live, chat move by move and spar the openings. Free, no ads.',
    ogTitle: 'Gukesh vs Sindarov: call every game on Shadowbook',
    ogImageAlt: 'A dark pawn in a spotlight between the names Gukesh and Sindarov.',
    eventName: 'FIDE World Chess Championship 2026: Gukesh vs Sindarov',
    heading: 'Gukesh vs Sindarov: World Chess Championship 2026 predictions and live chat',
    intro: [
      'The 2026 World Chess Championship is a 14-game match in Geneva between the defending champion, Gukesh Dommaraju of India, and the challenger, Javokhir Sindarov of Uzbekistan. Game 1 is on 24 November 2026; the first player to 7½ points wins the title.',
      'Shadowbook Live is a free companion for the match. Call the result of every game, climb the leaderboard, follow the moves and the clocks live, and talk about the game in a chat where every message is pinned to the move it was written at. When a game is over, spar its opening yourself against a bot that plays like a human.',
    ],
    howHeading: 'How it works',
    how: [
      ['Predict every game', ': Gukesh, draw or Sindarov. Calls lock at the first move. Upsets that fewer than a third saw coming score double.'],
      ['Pick the match winner', ' before game 1 for 3 extra points.'],
      ['Live board', ': moves, clocks and results from the official Lichess broadcast, updated every 30 seconds.'],
      ['Chat pinned to moves', `: click a message's move tag to see the position at that moment. React with ${REACTIONS}.`],
      ['Match stats', ': openings played, how often the crowd was right, and your own record.'],
    ],
    faqHeading: 'Questions',
    faq: [
      [
        'When is the 2026 World Chess Championship?',
        'The match between Gukesh and Javokhir Sindarov is played in Geneva. Game 1 is on 24 November 2026, the classical games run until 11 December at the latest, and tiebreaks, if needed, are on 12 December.',
      ],
      [
        'How do predictions work on Shadowbook?',
        'Before each game you call Gukesh, a draw or Sindarov. Calls lock when the game starts. A correct call is worth 1 point, or 2 points if fewer than a third of predictors agreed with you. Picking the match winner before game 1 is worth 3 more.',
      ],
      [
        'Do I need an account?',
        'No account is needed to follow the score, the board and the chat. To predict and post, log in with your Lichess account. Shadowbook never sees your password or e-mail address.',
      ],
      ['Is it free?', 'Yes. No ads and no money involved, only points. Visits are counted anonymously, without cookies. The code is open source.'],
      ['Is this an official FIDE site?', 'No. Shadowbook is an independent fan project and is not affiliated with FIDE.'],
    ],
    homeLink: "Spar against anyone's openings",
    sourceLink: 'Source on GitHub',
  },
  {
    lang: 'sv',
    label: 'Svenska',
    path: '/sv/schack-vm-2026/',
    ogLocale: 'sv_SE',
    title: 'Schack-VM 2026: Gukesh mot Sindarov – tippa varje parti och chatta live | Shadowbook',
    description:
      'Tippa varje parti i schack-VM 2026 mellan Gukesh och Sindarov i Genève, följ dragen live, chatta drag för drag och spela öppningarna själv. Gratis och utan reklam.',
    ogTitle: 'Schack-VM 2026: tippa varje parti på Shadowbook',
    ogImageAlt: 'En mörk bonde i strålkastarljus mellan namnen Gukesh och Sindarov.',
    eventName: 'Schack-VM 2026: Gukesh mot Sindarov',
    heading: 'Schack-VM 2026: Gukesh mot Sindarov – tippa varje parti och chatta live',
    intro: [
      'Världsmästerskapet i schack 2026 är en titelmatch över 14 partier i Genève mellan den regerande världsmästaren Gukesh Dommaraju från Indien och utmanaren Javokhir Sindarov från Uzbekistan. Parti 1 spelas den 24 november 2026, och den som först når 7½ poäng blir världsmästare.',
      'Shadowbook Live är en gratis följeslagare till matchen. Tippa varje parti, klättra på topplistan, följ dragen och klockorna live och prata om partiet i en chatt där varje meddelande är knutet till draget det skrevs vid. När partiet är slut kan du spela öppningen själv mot en bot som spelar som en människa. Själva sajten är på engelska.',
    ],
    howHeading: 'Så fungerar det',
    how: [
      ['Tippa varje parti', ': Gukesh, remi eller Sindarov. Tipset låses vid första draget. Skrällar som färre än en tredjedel såg komma ger dubbla poäng.'],
      ['Tippa matchvinnaren', ' före parti 1 för 3 extra poäng.'],
      ['Livebräde', ': drag, klockor och resultat från Lichess officiella sändning, uppdaterat var 30:e sekund.'],
      ['Chatt knuten till dragen', `: klicka på ett meddelandes dragmärke för att se ställningen just då. Reagera med ${REACTIONS}.`],
      ['Matchstatistik', ': spelade öppningar, hur ofta folket hade rätt och ditt eget facit.'],
    ],
    faqHeading: 'Frågor och svar',
    faq: [
      [
        'När spelas schack-VM 2026?',
        'Titelmatchen mellan Gukesh och Javokhir Sindarov spelas i Genève. Parti 1 spelas den 24 november 2026, de klassiska partierna pågår som längst till den 11 december, och eventuellt särspel avgörs den 12 december.',
      ],
      [
        'Hur fungerar tipsen?',
        'Före varje parti tippar du Gukesh, remi eller Sindarov. Tipset låses när partiet startar. Rätt tips ger 1 poäng, eller 2 poäng om färre än en tredjedel tippade samma sak. Rätt matchvinnare, tippad före parti 1, ger 3 poäng till.',
      ],
      [
        'Behöver jag ett konto?',
        'Nej, för att följa ställningen, brädet och chatten behövs inget konto. För att tippa och skriva loggar du in med ditt Lichess-konto. Shadowbook ser aldrig ditt lösenord eller din e-postadress.',
      ],
      ['Kostar det något?', 'Nej. Ingen reklam och inga pengar, bara poäng. Besöken räknas anonymt, utan kakor. Koden är öppen källkod.'],
      ['Är det här FIDE:s officiella sida?', 'Nej. Shadowbook är ett fristående fanprojekt utan koppling till FIDE.'],
    ],
    homeLink: 'Spela mot vem som helst',
    sourceLink: 'Källkod på GitHub',
  },
  {
    // Uzbek, Latin script. The challenger is "Javohir Sindorov" in Uzbek; the international spelling is given once.
    lang: 'uz',
    label: 'O‘zbekcha',
    path: '/uz/shaxmat-jahon-chempionati-2026/',
    ogLocale: 'uz_UZ',
    title: 'Sindorov – Gukesh: shaxmat bo‘yicha jahon chempionati 2026 – bashorat va jonli chat | Shadowbook',
    description:
      'Sindorov – Gukesh: shaxmat bo‘yicha jahon chempionati 2026, Jeneva. Har bir partiya natijasini bashorat qiling, yurishlarni jonli kuzating, chatda muhokama qiling va debyutlarni o‘zingiz o‘ynab ko‘ring. Bepul, reklamasiz.',
    ogTitle: 'Sindorov – Gukesh: har bir partiyani Shadowbook’da bashorat qiling',
    ogImageAlt: 'Projektor nuri ostidagi qora piyoda, ikki yonida Gukesh va Sindarov ismlari.',
    eventName: 'Shaxmat bo‘yicha jahon chempionati 2026: Gukesh – Sindorov',
    challengerAlias: 'Javohir Sindorov',
    heading: 'Sindorov – Gukesh: shaxmat bo‘yicha jahon chempionati 2026 – bashorat va jonli chat',
    intro: [
      'Shaxmat bo‘yicha 2026-yilgi jahon chempionati – Jenevada o‘tadigan, 14 ta klassik partiyadan iborat bahs. Unda amaldagi jahon chempioni, hindistonlik Gukesh Dommaraju va da’vogar, o‘zbekistonlik Javohir Sindorov (xalqaro yozilishi – Javokhir Sindarov) kuch sinashadi. 1-partiya 2026-yil 24-noyabrda o‘ynaladi; birinchi bo‘lib 7,5 ochko to‘plagan shaxmatchi jahon chempioni bo‘ladi.',
      'Shadowbook Live – bahsni kuzatib borish uchun bepul sayt. Har bir partiya natijasini bashorat qiling, reyting jadvalida yuqoriga ko‘tariling, yurishlar va soatlarni jonli kuzating hamda har bir xabar o‘zi yozilgan yurishga bog‘lanadigan chatda partiyani muhokama qiling. Partiya tugagach, uning debyutini odamdek o‘ynaydigan botga qarshi o‘zingiz o‘ynab ko‘ring. Sayt interfeysi ingliz tilida.',
    ],
    howHeading: 'Bu qanday ishlaydi',
    how: [
      ['Har bir partiyani bashorat qiling', ': Gukesh, durang yoki Sindorov. Birinchi yurish qilinishi bilan bashoratlar yopiladi. Ishtirokchilarning uchdan biridan kami to‘g‘ri topgan kutilmagan natija uchun ikki baravar ochko beriladi.'],
      ['Bahs g‘olibini tanlang', ': 1-partiyadan oldin to‘g‘ri topsangiz, qo‘shimcha 3 ochko olasiz.'],
      ['Jonli doska', ': yurishlar, soatlar va natijalar Lichess’ning rasmiy translyatsiyasidan olinadi va har 30 soniyada yangilanadi.'],
      ['Yurishlarga bog‘langan chat', `: xabardagi yurish belgisini bossangiz, o‘sha paytdagi pozitsiyani ko‘rasiz. ${REACTIONS} belgilari bilan munosabat bildiring.`],
      ['Bahs statistikasi', ': o‘ynalgan debyutlar, ko‘pchilik necha marta haq bo‘lib chiqqani va o‘zingizning natijalaringiz.'],
    ],
    faqHeading: 'Savol-javoblar',
    faq: [
      [
        'Shaxmat bo‘yicha jahon chempionati 2026 qachon o‘tadi?',
        'Gukesh va Javohir Sindorov o‘rtasidagi bahs Jenevada o‘tadi. 1-partiya 2026-yil 24-noyabrda o‘ynaladi, klassik partiyalar uzog‘i bilan 11-dekabrgacha davom etadi, zarurat bo‘lsa, tay-breyk 12-dekabrda o‘tkaziladi.',
      ],
      [
        'Shadowbook’da bashoratlar qanday ishlaydi?',
        'Har bir partiyadan oldin Gukesh, durang yoki Sindorovdan birini tanlaysiz. Partiya boshlanishi bilan bashoratlar yopiladi. To‘g‘ri bashorat uchun 1 ochko, agar ishtirokchilarning uchdan biridan kami siz bilan bir xil tanlagan bo‘lsa, 2 ochko beriladi. 1-partiyadan oldin bahs g‘olibini to‘g‘ri topsangiz, yana 3 ochko olasiz.',
      ],
      [
        'Akkaunt kerakmi?',
        'Hisobni, doskani va chatni kuzatish uchun akkaunt kerak emas. Bashorat qilish va chatda yozish uchun Lichess akkauntingiz orqali kiring. Shadowbook parolingizni ham, elektron pochta manzilingizni ham hech qachon ko‘rmaydi.',
      ],
      ['Bu bepulmi?', 'Ha. Reklama yo‘q, pul tikilmaydi – faqat ochkolar. Tashriflar soni anonim tarzda, cookie fayllarisiz hisoblanadi. Loyiha ochiq kodli.'],
      ['Bu FIDE’ning rasmiy saytimi?', 'Yo‘q. Shadowbook – mustaqil muxlislar loyihasi, FIDE bilan bog‘liq emas.'],
    ],
    homeLink: 'Istalgan raqibning debyutlariga qarshi o‘ynang',
    sourceLink: 'Manba kodi GitHub’da',
  },
  {
    // Hindi, written without the optional nuqta (बाजी, मुफ्त), the way most Hindi news sites and searchers spell it.
    lang: 'hi',
    label: 'हिन्दी',
    path: '/hi/vishwa-shatranj-championship-2026/',
    ogLocale: 'hi_IN',
    title: 'गुकेश बनाम सिंदारोव: विश्व शतरंज चैंपियनशिप 2026 – भविष्यवाणी और लाइव चैट | Shadowbook',
    description:
      'गुकेश बनाम सिंदारोव: जिनेवा में विश्व शतरंज चैंपियनशिप 2026 की हर बाजी के नतीजे की भविष्यवाणी करें, चालें लाइव देखें, चाल-दर-चाल चैट करें और ओपनिंग खुद खेलकर देखें। मुफ्त, बिना विज्ञापन।',
    ogTitle: 'गुकेश बनाम सिंदारोव: Shadowbook पर हर बाजी की भविष्यवाणी करें',
    ogImageAlt: 'स्पॉटलाइट में एक काला प्यादा, दोनों ओर गुकेश और सिंदारोव के नाम।',
    eventName: 'विश्व शतरंज चैंपियनशिप 2026: गुकेश बनाम सिंदारोव',
    heading: 'गुकेश बनाम सिंदारोव: विश्व शतरंज चैंपियनशिप 2026 – भविष्यवाणी और लाइव चैट',
    intro: [
      'विश्व शतरंज चैंपियनशिप 2026 (FIDE World Chess Championship 2026) जिनेवा में खेला जाने वाला 14 बाजियों का मुकाबला है। इसमें मौजूदा विश्व चैंपियन, भारत के डी गुकेश (गुकेश डोम्माराजू) और चैलेंजर, उज्बेकिस्तान के जावोखिर सिंदारोव आमने-सामने होंगे। पहली बाजी 24 नवंबर 2026 को खेली जाएगी; जो खिलाड़ी पहले 7.5 अंक तक पहुंचेगा, वही विश्व चैंपियन बनेगा।',
      'Shadowbook Live इस मुकाबले को फॉलो करने के लिए एक मुफ्त साइट है। हर बाजी के नतीजे की भविष्यवाणी (प्रेडिक्शन) करें, लीडरबोर्ड में ऊपर चढ़ें, चालें और घड़ियां लाइव देखें, और ऐसी चैट में बाजी पर चर्चा करें जहां हर संदेश उसी चाल से जुड़ा रहता है जिस पर वह लिखा गया था। बाजी खत्म होने के बाद उसकी ओपनिंग खुद खेलकर देखें – ऐसे बॉट के खिलाफ जो इंसान की तरह खेलता है। साइट का इंटरफेस अंग्रेजी में है।',
    ],
    howHeading: 'यह कैसे काम करता है',
    how: [
      ['हर बाजी की भविष्यवाणी करें', ': गुकेश, ड्रॉ या सिंदारोव। पहली चाल चलते ही भविष्यवाणी लॉक हो जाती है। जिस उलटफेर का अंदाजा एक-तिहाई से कम लोगों ने लगाया हो, उस पर दोगुने अंक मिलते हैं।'],
      ['मैच का विजेता चुनें', ': पहली बाजी से पहले सही विजेता चुनने पर 3 अतिरिक्त अंक मिलते हैं।'],
      ['लाइव बोर्ड', ': चालें, घड़ियां और नतीजे Lichess के आधिकारिक ब्रॉडकास्ट से आते हैं और हर 30 सेकंड में अपडेट होते हैं।'],
      ['चालों से जुड़ी चैट', `: किसी संदेश के चाल-टैग पर क्लिक करके उस समय की पोजीशन देखें। ${REACTIONS} से प्रतिक्रिया दें।`],
      ['मैच के आंकड़े', ': खेली गई ओपनिंग, ज्यादातर लोगों का अनुमान कितनी बार सही निकला, और आपका अपना रिकॉर्ड।'],
    ],
    faqHeading: 'सवाल-जवाब',
    faq: [
      [
        'विश्व शतरंज चैंपियनशिप 2026 कब है?',
        'गुकेश और जावोखिर सिंदारोव के बीच यह मुकाबला जिनेवा में खेला जाएगा। पहली बाजी 24 नवंबर 2026 को है, क्लासिकल बाजियां ज्यादा से ज्यादा 11 दिसंबर तक चलेंगी, और जरूरत पड़ने पर टाईब्रेक 12 दिसंबर को होगा।',
      ],
      [
        'Shadowbook पर भविष्यवाणी कैसे काम करती है?',
        'हर बाजी से पहले आप गुकेश, ड्रॉ या सिंदारोव में से एक चुनते हैं। बाजी शुरू होते ही भविष्यवाणी लॉक हो जाती है। सही भविष्यवाणी पर 1 अंक मिलता है, और अगर एक-तिहाई से कम लोगों ने वही चुना था जो आपने चुना, तो 2 अंक मिलते हैं। पहली बाजी से पहले मैच का सही विजेता चुनने पर 3 अंक और मिलते हैं।',
      ],
      [
        'क्या अकाउंट जरूरी है?',
        'स्कोर, बोर्ड और चैट देखने के लिए अकाउंट की जरूरत नहीं है। भविष्यवाणी करने और चैट में लिखने के लिए अपने Lichess अकाउंट से लॉग इन करें। Shadowbook को आपका पासवर्ड या ईमेल पता कभी नहीं दिखता।',
      ],
      ['क्या यह मुफ्त है?', 'हां। न विज्ञापन, न पैसों का कोई लेन-देन – सिर्फ अंक। विजिट की गिनती गुमनाम रूप से, बिना कुकीज के होती है। कोड ओपन सोर्स है।'],
      ['क्या यह FIDE की आधिकारिक साइट है?', 'नहीं। Shadowbook एक स्वतंत्र फैन प्रोजेक्ट है और इसका FIDE से कोई संबंध नहीं है।'],
    ],
    homeLink: 'किसी भी खिलाड़ी की ओपनिंग के खिलाफ खेलें',
    sourceLink: 'GitHub पर सोर्स कोड',
  },
];

const X_DEFAULT = PAGES[0];
const url = (page) => `${SITE}${page.path}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');

function structuredData(page) {
  const challenger = { '@type': 'Person', name: 'Javokhir Sindarov' };
  if (page.challengerAlias) challenger.alternateName = page.challengerAlias;
  const players = [{ '@type': 'Person', name: 'Gukesh Dommaraju' }, challenger];
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: page.eventName,
      sport: 'Chess',
      inLanguage: page.lang,
      startDate: '2026-11-24',
      endDate: '2026-12-12',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: 'Fondation Martin Bodmer',
        address: { '@type': 'PostalAddress', addressLocality: 'Cologny, Geneva', addressCountry: 'CH' },
      },
      organizer: { '@type': 'Organization', name: 'FIDE', url: 'https://www.fide.com/' },
      competitor: players,
      // Google's event report reads `performer`; schema.org's SportsEvent uses `competitor`. Same two people.
      performer: players,
      image: `${SITE}/og.png`,
      url: url(page),
      description: page.description,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: page.lang,
      mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ];
}

/** The full HTML document for one language. */
export function renderPage(page) {
  const others = PAGES.filter((p) => p !== page);
  const hreflang = [...PAGES.map((p) => [p.lang, p]), ['x-default', X_DEFAULT]]
    .map(([code, p]) => `    <link rel="alternate" hreflang="${code}" href="${url(p)}" />`)
    .join('\n');
  const localeAlternates = others.map((p) => `    <meta property="og:locale:alternate" content="${p.ogLocale}" />`).join('\n');
  const how = page.how.map(([strong, rest]) => `        <li><strong>${esc(strong)}</strong>${rest}</li>`).join('\n');
  const faq = page.faq.map(([q, a]) => `      <h4>${esc(q)}</h4>\n      <p>${esc(a)}</p>`).join('\n');
  const langLinks = others.map((p) => `<a href="${p.path}" hreflang="${p.lang}" lang="${p.lang}">${esc(p.label)}</a>`).join(' · ');
  // The app itself is in English, so on the other pages its container says so.
  const root = page.lang === 'en' ? '<div id="root"></div>' : '<div id="root" lang="en"></div>';

  return `<!doctype html>
<html lang="${page.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(page.title)}</title>
    <meta name="description" content="${attr(page.description)}" />
    <link rel="canonical" href="${url(page)}" />
${hreflang}
    <meta name="theme-color" content="#121418" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Shadowbook" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Shadowbook" />
    <meta property="og:locale" content="${page.ogLocale}" />
${localeAlternates}
    <meta property="og:url" content="${url(page)}" />
    <meta property="og:title" content="${attr(page.ogTitle)}" />
    <meta property="og:description" content="${attr(page.description)}" />
    <meta property="og:image" content="${SITE}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${attr(page.ogImageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">
${JSON.stringify(structuredData(page), null, 2).replace(/</g, '\\u003c')}
    </script>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='12' cy='16' r='9' fill='none' stroke='%23F2B544' stroke-width='2.5'/%3E%3Ccircle cx='20' cy='16' r='9' fill='none' stroke='%236CB4F5' stroke-width='2.5'/%3E%3C/svg%3E" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
  </head>
  <body data-view="match">
    ${root}
    <section class="seo-content" aria-labelledby="seo-h">
      <h2 id="seo-h">${esc(page.heading)}</h2>
${page.intro.map((p) => `      <p>${esc(p)}</p>`).join('\n')}
      <h3>${esc(page.howHeading)}</h3>
      <ul>
${how}
      </ul>
      <h3>${esc(page.faqHeading)}</h3>
${faq}
      <p>${langLinks}</p>
      <p><a href="/">${esc(page.homeLink)}</a> · <a href="${REPO}">${esc(page.sourceLink)}</a></p>
    </section>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

/** public/sitemap.xml: every match page with links to its translations, then the start page. */
export function renderSitemap() {
  const alternates = [...PAGES.map((p) => [p.lang, p]), ['x-default', X_DEFAULT]]
    .map(([code, p]) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${url(p)}" />`)
    .join('\n');
  const entries = PAGES.map(
    (page) => `  <url>
    <loc>${url(page)}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>${page === X_DEFAULT ? '1.0' : '0.9'}</priority>
${alternates}
  </url>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>
`;
}

/** Where a page's index.html lives, relative to the repository root. */
export const fileFor = (page) => `${page.path.slice(1)}index.html`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  for (const page of PAGES) {
    const file = resolve(root, fileFor(page));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, renderPage(page));
    console.log(`wrote ${fileFor(page)}`);
  }
  writeFileSync(resolve(root, 'public/sitemap.xml'), renderSitemap());
  console.log('wrote public/sitemap.xml');
}
