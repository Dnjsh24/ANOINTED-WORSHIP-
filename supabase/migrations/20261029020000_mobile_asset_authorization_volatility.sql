-- Follow the VOLATILE record reader; preserve function identity, grants and body.
begin;
set local lock_timeout='5s';
alter function private.mobile_asset_authorized(uuid,public.mobile_download_assets) volatile;
commit;
