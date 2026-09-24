import webpush from 'web-push';

function env(){return {url:(process.env.SUPABASE_URL||'').replace(/\/$/,''),key:process.env.SUPABASE_SERVICE_ROLE_KEY||''}}
async function userFrom(req){const {url,key}=env(),token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');if(!url||!key||!token)return null;const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`}});return r.ok?await r.json():null}
async function isAdmin(uid){const {url,key}=env();const r=await fetch(`${url}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(uid)}&select=user_id`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});const a=await r.json().catch(()=>[]);return r.ok&&a?.length>0}

export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const u=await userFrom(req);if(!u||!(await isAdmin(u.id)))return res.status(403).json({error:'Admin access required.'});
  const pub=process.env.VAPID_PUBLIC_KEY,priv=process.env.VAPID_PRIVATE_KEY,subject=process.env.VAPID_SUBJECT;
  if(!pub||!priv||!subject)return res.status(503).json({error:'VAPID configuration is incomplete.'});
  webpush.setVapidDetails(subject,pub,priv);
  const {url,key}=env(),h={apikey:key,Authorization:`Bearer ${key}`};
  const [sr,setr]=await Promise.all([
   fetch(`${url}/rest/v1/push_subscriptions?user_id=eq.${u.id}&select=*`,{headers:h}),
   fetch(`${url}/rest/v1/admin_notification_settings?user_id=eq.${u.id}&select=*`,{headers:h})
  ]);
  const subs=await sr.json().catch(()=>[]),set=(await setr.json().catch(()=>[]))?.[0]||{};
  if(!Array.isArray(subs)||!subs.length)return res.status(200).json({ok:true,push_sent:0,registered_devices:0,reason:'No registered devices found for this admin.'});
  if(set.push_enabled===false)return res.status(200).json({ok:true,push_sent:0,registered_devices:subs.length,reason:'Push is disabled in Notification Settings.'});
  let sent=0,failed=0,last_error=null;
  for(const x of subs){
   try{
    await webpush.sendNotification({endpoint:x.endpoint,keys:{p256dh:x.p256dh,auth:x.auth}},JSON.stringify({title:'🔔 Nexus Test Notification',body:'Push notifications are working on this device.',url:'/portal.html'}),{TTL:86400,urgency:'high'});
    sent++;
   }catch(e){
    failed++;last_error=`${e.statusCode||''} ${e.body||e.message||'Push provider rejected notification.'}`.trim();
    if(e.statusCode===404||e.statusCode===410)await fetch(`${url}/rest/v1/push_subscriptions?id=eq.${x.id}`,{method:'DELETE',headers:h});
   }
  }
  return res.status(200).json({ok:true,push_sent:sent,push_failed:failed,registered_devices:subs.length,last_error});
 }catch(e){console.error('test push:',e);return res.status(500).json({error:e.message||'Test push failed.'})}
}
