const url = "https://xvrndwkghxkqsvxxtqym.supabase.co/rest/v1/profiles?select=full_name,email,avatar_url,birthday,team_members!inner(role,ministries,created_at,team_anniversary)&id=eq.7f23a31c-ddcd-498c-8501-8b2b95c32fa1&team_members.team_id=eq.b8b0e8b2-b13c-41c4-ad58-0051e2ff3302&limit=1";
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
