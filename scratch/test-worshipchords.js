const cheerio = require("cheerio");

async function testWorshipChords() {
  const url = "https://worshipchords.com/praise-elevation-worship-chords/";
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html"
      }
    });

    const text = await response.text();
    const $ = cheerio.load(text);
    
    let chordsText = "";
    let title = "";

    // 1. Try WorshipChords.com
    if (url.includes("worshipchords.com")) {
      $(".worship-chords-container").each((i, el) => {
        chordsText += $(el).text() + "\n";
      });
      title = $("h1.entry-title").text().replace("Chords", "").trim();
    }
    
    // 2. Generic fallback (find <pre> tags or code blocks)
    if (!chordsText) {
      $("pre").each((i, el) => {
        chordsText += $(el).text() + "\n\n";
      });
    }

    // Try to get title from title tag if not found
    if (!title) {
      title = $("title").text().split("|")[0].replace("Chords", "").replace("Tab", "").trim();
    }

    console.log("Final Title:", title);
    console.log("Final ChordsText Length:", chordsText.trim().length);
    console.log("Chords First 50 chars:", chordsText.trim().substring(0, 50));

  } catch(e) {
    console.error(e);
  }
}

testWorshipChords();
