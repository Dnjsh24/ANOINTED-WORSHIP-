const url = "https://xvrndwkghxkqsvxxtqym.supabase.co/rest/v1/setlists?select=*,events(type),leader:team_members(id,profile_id,profiles(id,full_name)),setlist_songs(id,assigned_key,song_order,song:songs(id,title,bpm))&limit=1";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cm5kd2tnaHhrcXN2eHh0cXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3ODgwODUsImV4cCI6MjA5ODM2NDA4NX0.FRtfjvyDSjG65w6soAsGOWlc9lRVhZghp1jNBgN4K40";

fetch(url, {
  method: 'POST',
  headers: {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    query: `
      ALTER TABLE setlists DROP CONSTRAINT IF EXISTS fk_setlists_event_id;
      ALTER TABLE setlists DROP CONSTRAINT IF EXISTS fk_setlists_leader_member_id;
      ALTER TABLE setlist_songs DROP CONSTRAINT IF EXISTS fk_setlist_songs_setlist_id;
      ALTER TABLE setlist_songs DROP CONSTRAINT IF EXISTS fk_setlist_songs_song_id;
      ALTER TABLE setlist_songs DROP CONSTRAINT IF EXISTS fk_setlist_songs_lead_member_id;
    `
  })
});
