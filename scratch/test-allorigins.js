const cheerio = require("cheerio");

async function testAllOrigins() {
  const targetUrl = "https://worshipchords.com/praise-elevation-worship-chords/";
  const url = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    const html = data.contents;
    
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

testAllOrigins();
