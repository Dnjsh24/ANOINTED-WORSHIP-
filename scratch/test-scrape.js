const cheerio = require("cheerio");

async function testSearch() {
  const query = "Way Maker Sinach";
  const url = `https://worshipchords.com/?s=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html"
      }
    });
    const text = await response.text();
    const $ = cheerio.load(text);
    
    // Check search results
    const results = [];
    $("article").each((i, el) => {
      const title = $(el).find("h2.entry-title a").text().trim();
      const link = $(el).find("h2.entry-title a").attr("href");
      if (title && link) {
        results.push({ title, link });
      }
    });
    console.log("Search Results:", results);
  } catch (err) {
    console.log("Error:", err);
  }
}

testSearch();
