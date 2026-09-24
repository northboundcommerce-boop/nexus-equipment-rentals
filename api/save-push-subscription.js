
function env(){return {url:(process.env.SUPABASE_URL||'').replace(/\/$/,''),key:process.env.SUPABASE_SERVICE_ROLE_KEY||''}}
async function getUser(req){
 const {url,key}=env(); const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
 if(!url||!key)throw new Error('Supabase server environment is missing.');
 if(!token)return null;
 const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`}});
 return r.ok?await r.json():null;
}
async function admin(uid){
 const {url,key}=env();
 const r=await fetch(`${url}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(uid)}&select=user_id`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
 const a=await r.json().catch(()=>[]);
 return r.ok&&Array.isArray(a)&&a.length>0;
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const u=await getUser(req); if(!u)return res.status(401).json({error:'Your login session expired. Sign in again.'});
  if(!(await admin(u.id)))return res.status(403).json({error:'This account is not listed as a Nexus admin.'});
  const s=req.body||{}, endpoint=s.endpoint, p256dh=s.keys?.p256dh, auth=s.keys?.auth;
  if(!endpoint||!p256dh||!auth)return res.status(400).json({error:'The browser did not return a complete push subscription.'});
  const {url,key}=env(), headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'};
  const row={user_id:u.id,endpoint,p256dh,auth,user_agent:req.headers['user-agent']||null,updated_at:new Date().toISOString()};
  const save=await fetch(`${url}/rest/v1/push_subscriptions?on_conflict=endpoint`,{method:'POST',headers,body:JSON.stringify(row)});
  const saved=await save.json().catch(()=>null);
  if(!save.ok)return res.status(500).json({error:saved?.message||saved?.hint||`Supabase save failed (${save.status}).`});
  const verify=await fetch(`${url}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${encodeURIComponent(u.id)}&select=id,user_id`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  const found=await verify.json().catch(()=>[]);
  if(!verify.ok||!Array.isArray(found)||!found.length)return res.status(500).json({error:'Nexus attempted to register this device, but the saved subscription could not be verified.'});
  return res.status(200).json({ok:true,registered:true,subscription_id:found[0].id});
 }catch(e){console.error('push registration:',e);return res.status(500).json({error:e?.message||'Could not register this device.'})}
}
