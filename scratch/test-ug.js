const cheerio = require("cheerio");

async function testUG() {
  const url = "https://tabs.ultimate-guitar.com/tab/2548239";
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      }
    });
    const text = await response.text();
    console.log("HTML length:", text.length);
    const $ = cheerio.load(text);
    console.log("Title:", $("title").text());
  } catch (err) {
    console.log("Error:", err);
  }
}
testUG();
