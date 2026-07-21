const cheerio = require("cheerio");

async function testCorsProxy() {
  const targetUrl = "https://worshipchords.com/praise-elevation-worship-chords/";
  const url = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html"
      }
    });
    const html = await response.text();
    
    const $ = cheerio.load(html);
    
    let chordsText = "";
    $("pre").each((i, el) => {
      chordsText += $(el).text() + "\n\n";
    });
    
    console.log("Pre length: ", $("pre").length);
    console.log("Title: ", $("title").text());

  } catch(e) {
    console.error(e);
  }
}

testCorsProxy();
