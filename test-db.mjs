const url = "https://xvrndwkghxkqsvxxtqym.supabase.co/rest/v1/songs?select=id,original_key,lyrics_chords&limit=1";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cm5kd2tnaHhrcXN2eHh0cXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3ODgwODUsImV4cCI6MjA5ODM2NDA4NX0.FRtfjvyDSjG65w6soAsGOWlc9lRVhZghp1jNBgN4K40";

fetch(url, {
  headers: {
    "apikey": key,
    "Authorization": `Bearer ${key}`
  }
})
.then(r => r.text())
.then(console.log)
.catch(console.error);
